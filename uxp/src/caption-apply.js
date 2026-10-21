/* Non-destructive caption overlay creation for Premiere 25.6.2.
 * Existing native caption text is NOT exposed through documented UXP APIs;
 * user selects the matching original SRT. Movie uses alpha and is inserted on
 * an otherwise empty NEW top video track. The original SRT remains untouched.
 */
const uxp=require('uxp');
const fs=uxp.storage.localFileSystem;
const STORAGE_KEY='editflow.pairingFolder.v1';
const $=id=>document.getElementById(id);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let source=null, captionTrackCount=null,sequenceGuid='',sequenceName='',rendering=false;
const basename=p=>String(p).replace(/\\/g,'/').split('/').pop();
const report=s=>{$('studioRenderStatus').textContent=s;};

async function getWorkFolder(){
 const saved=localStorage.getItem(STORAGE_KEY);
 if(saved){try{const folder=await fs.getEntryForPersistentToken(saved);if(folder&&folder.isFolder)return folder;}catch(_){}}
 const folder=await fs.getFolder();
 if(!folder)throw Error('Choose %LOCALAPPDATA%\\EditFlowPro to enable the local caption renderer.');
 if(!/[/\\]AppData[/\\]Local[/\\]EditFlowPro[/\\]?$/i.test(folder.nativePath))throw Error('Choose %LOCALAPPDATA%\\EditFlowPro (not the project folder).');
 localStorage.setItem(STORAGE_KEY,await fs.createPersistentToken(folder));
 return folder;
}
async function readJSON(folder,name){try{const f=await folder.getEntry(name);return JSON.parse(await f.read());}catch(_){return null;}}
async function getActive(){
 const pp=require('premierepro');const project=await pp.Project.getActiveProject();
 if(!project)throw Error('Open your Premiere project first.');
 const seq=await project.getActiveSequence();if(!seq)throw Error('Open the sequence containing your SRT captions.');
 return {pp,project,seq};
}
function parseSrtPreview(contents){
 const re=/(?:^|\n)\s*\d*\s*\n?\s*(\d\d:\d\d:\d\d[,.]\d{3})\s*-->\s*(\d\d:\d\d:\d\d[,.]\d{3})/g;
 let count=0,m;while((m=re.exec(contents))!==null&&count<10001)count++;
 return count;
}
function currentSettings(){return {
 preset:$('studioPresetPicker').value,words:$('studioWords').value,motion:$('studioMotion').value,
 textColor:$('studioTextColor').value,accent:$('studioAccent').value,size:$('studioSize').value,
 position:$('studioPosition').value,background:$('studioBg').value,outline:$('studioOutline').value
};}
async function inspectCaptions(){
 const {seq}=await getActive();captionTrackCount=await seq.getCaptionTrackCount();
 sequenceGuid=seq.guid;sequenceName=seq.name;
 const names=[];
 for(let i=0;i<captionTrackCount;i++){
   const c=await seq.getCaptionTrack(i);
   names.push(c.name||'Caption '+(i+1));
 }
 $('studioTimelineStatus').textContent='Active sequence: '+seq.name+' | Caption tracks: '+captionTrackCount+' '+names.join(', ')+'\nNote: Premiere UXP 25.6 cannot read complete native caption text with the documented API. Choose its matching original SRT file to generate graphics aligned to the same timecodes.';
 if(!captionTrackCount)throw Error('No native caption track detected. Import an SRT onto your sequence first, or use an active sequence and original SRT file.');
 return captionTrackCount;
}
async function chooseSrt(){
 const f=await fs.getFileForOpening({types:['srt'],allowMultiple:false});
 if(!f){$('studioSrtStatus').textContent='File selection cancelled; no SRT changed.';return;}
 if(!f.isFile||!/\.srt$/i.test(f.name))throw Error('Choose a .srt file, not a .prproj or .mov');
 const text=await f.read();if(typeof text!=='string')throw Error('SRT could not be read as text.');if(text.length>5_000_000)throw Error('SRT file exceeds 5 MB.');
 const cues=parseSrtPreview(text);if(!cues)throw Error('No SRT timestamps found.');
 if(!f.nativePath)throw Error('UXP selected an SRT without a native path. Please select a local .srt.');
 source={path:f.nativePath,name:f.name,cues};
 $('studioSrtStatus').textContent='Selected: '+f.name+'\n'+cues+' subtitle cues. No re-transcription is needed.';
}
async function pollRender(folder,id){
 let notSeen=0;
 for(let i=0;i<3600;i++){
   const data=await readJSON(folder,'caption-studio-result.json');
   if(data && data.id===id){
     notSeen=0;
     if(data.state==='complete')return data;
     if(data.state==='failed')throw Error('Renderer failed: '+String(data.message).slice(0,650));
     const pc=(data.total>0&&Number.isFinite(data.done))?Math.round(data.done/data.total*100):null;
     report(data.message+(pc!==null?' ('+pc+'%)':'')+'\nKeep this panel open; FFmpeg is rendering a transparent movie.');
   }else if(++notSeen>18)throw Error('Caption renderer did not start. Check %LOCALAPPDATA%\\EditFlowPro\\caption-render.log.');
   await pause(1200);
 }
 throw Error('Render timeout. Inspect caption-render.log.');
}
async function findImported(bin,ids,filename){
 const a=await bin.getItems();const fresh=[];
 for(const item of a){try{if(!ids.has(await item.getId()))fresh.push(item);}catch(_){}}
 return fresh.find(i=>i.name===filename)||fresh.find(i=>i.name&&i.name.indexOf('EditFlow-Animated-Captions')!==-1)||(fresh.length===1?fresh[0]:null);
}
async function importOverlay({pp,project,seq},rendered,originalVideoTracks,originalCaptionCount){
 if(seq.guid!==sequenceGuid)throw Error('Active sequence changed since caption inspection.');
 const target=originalVideoTracks+1; // Premiere 25.6 documented: index > current track COUNT creates a new track.
 const bin=await project.getRootItem(); // Guaranteed FolderItem so getItems() is supported.
 const before=await bin.getItems();const ids=new Set(await Promise.all(before.map(i=>i.getId())));
 const ok=await project.importFiles([rendered.mov],true,bin,false);
 if(!ok)throw Error('Premiere refused to import the alpha MOV. File remains on disk: '+rendered.mov);
 const item=await findImported(bin,ids,basename(rendered.mov));
 if(!item)throw Error('Movie imported to project but item could not be located. Manually drag '+basename(rendered.mov)+' onto an empty top track.');
 if(await seq.getVideoTrackCount()!==originalVideoTracks)throw Error('Video track count changed while rendering. No overlay placed; imported media remains in Project Panel.');
 if(await seq.getCaptionTrackCount()!==originalCaptionCount)throw Error('Caption tracks changed while rendering. No overlay placed; imported media remains in Project Panel.');
 const editor=pp.SequenceEditor.getEditor(seq);
 const action=editor.createInsertProjectItemAction(item,pp.TickTime.createWithSeconds(0),target,0,true);
 let done=false;
 project.lockedAccess(()=>{done=project.executeTransaction(compound=>{compound.addAction(action);},'EditFlow - Animated SRT overlay');});
 if(!done)throw Error('Premiere refused the timeline insert action. Movie is in Project Panel: '+basename(rendered.mov));
 const newCount=await seq.getVideoTrackCount();
 if(newCount<=originalVideoTracks)throw Error('Import was attempted but no new top video track could be verified. Inspect Premiere before retrying.');
 let verifiedIndex=-1;
 for(let i=originalVideoTracks;i<newCount;i++){
   const track=await seq.getVideoTrack(i);const clips=await track.getTrackItems(1,false);
   for(const clip of clips||[]){try{
     const p=await clip.getProjectItem();
     if((await p.getId())===(await item.getId()))verifiedIndex=i;
   }catch(_){}}
 }
 if(verifiedIndex<0)throw Error('Timeline insert requested, but imported overlay clip could not be verified. Inspect Premiere before retrying.');
 let msg='APPLIED & VERIFIED: '+basename(rendered.mov)+' on V'+(verifiedIndex+1)+' · original caption track untouched.\nThe transparent overlay is a MOV, not individually editable Premiere text graphics.';
 if($('studioMuteOriginal').checked){
   if(originalCaptionCount!==1)msg+='\nOriginal captions NOT muted: more than one caption track exists.';
   else{
     const cap=await seq.getCaptionTrack(0);
     try{
       const muted=await cap.setMute(true);
       const verified=await cap.isMuted();
       msg+=(muted&&verified?'\nOriginal native caption track muted after verification.':'\nWarning: original caption mute not verified; manually hide it to avoid duplicates.');
     }catch(e){msg+='\nCaption muting was unavailable: '+String(e&&e.message||e).slice(0,160)+'; manually hide the original caption track.';}
   }
 }else msg+='\nHide/mute the original caption track manually if you see duplicate captions.';
 return msg;
}
async function apply(){
 if(rendering)return;
 if(!source)throw Error('Choose the matching original SRT first.');
 if(!$('studioConfirmOverlay').checked)throw Error('Confirm creation of a new transparent overlay track.');
 rendering=true;
 $('studioApplyOverlay').disabled=true;
 try{
   await inspectCaptions();
   const ctx=await getActive();const {seq}=ctx;
   const frame=await seq.getFrameSize();
   const width=Math.round(frame.width||frame.right||1920),height=Math.round(frame.height||frame.bottom||1080);
   const videoCount=await seq.getVideoTrackCount();
   const ccount=captionTrackCount;
   report('Preparing '+width+'×'+height+' transparent animation. Existing SRT remains unchanged.');
   const fps=25; // ProRes overlay preserves SRT seconds; Premiere converts frames at insertion.
   const folder=await getWorkFolder();
   const id=Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
   const task={id,srt:source.path,settings:currentSettings(),width,height,fps};
   const f=await folder.createFile('caption-studio-job.json',{overwrite:true});
   await f.write(JSON.stringify(task));
   report('Launching local FFmpeg renderer. Captions remain untouched until movie is rendered and verified.');
   const plugin=await fs.getPluginFolder();
   const runner=await plugin.getEntry('renderer/Run-Caption-Studio.cmd');
   await uxp.shell.openPath(runner.nativePath,'Run local EditFlow Caption Studio renderer');
   const result=await pollRender(folder,id);
   report('Rendered '+result.cues+' animated groups from '+result.source_cues+' SRT cues. Importing transparent movie into Premiere…');
   const current=await getActive();
   if(current.seq.guid!==sequenceGuid)throw Error('Sequence changed during rendering. Movie ready: '+result.mov);
   report(await importOverlay(current,result,videoCount,ccount));
 }finally{rendering=false;$('studioApplyOverlay').disabled=false;}
}
function setupCaptionApply(){
 $('studioInspectCaptions').addEventListener('click',async()=>{try{await inspectCaptions();}catch(e){report('ERROR · '+String(e.message||e));}});
 $('studioChooseSrt').addEventListener('click',async()=>{try{await chooseSrt();}catch(e){report('ERROR · '+String(e.message||e));}});
 $('studioApplyOverlay').addEventListener('click',async()=>{try{await apply();}catch(e){report('ERROR · '+String(e.message||e));}});
}
module.exports={setupCaptionApply,parseSrtPreview};

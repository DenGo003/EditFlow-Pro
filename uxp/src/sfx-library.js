'use strict';
// Original synthesized WAVs bundled alongside the panel; no remote catalog.
const SOUNDS=[
 {id:'air-sweep',name:'Air Sweep',category:'Transition',seconds:.56},
 {id:'deep-hit',name:'Deep Hit',category:'Sports',seconds:.72},
 {id:'bright-pop',name:'Bright Pop',category:'Social',seconds:.25},
 {id:'soft-click',name:'Soft Click',category:'UI',seconds:.15},
 {id:'rise',name:'Rise',category:'Transition',seconds:1.25},
 {id:'bass-pulse',name:'Bass Pulse',category:'Sports',seconds:.45},
 {id:'signal-tone',name:'Signal Tone',category:'UI',seconds:.52},
 {id:'shutter',name:'Shutter',category:'Social',seconds:.32},
];
function getSound(id){const s=SOUNDS.find(x=>x.id===id);if(!s)throw Error('Choose an EditFlow sound.');return s;}
async function soundFile(fs,id){const s=getSound(id),folder=await fs.getPluginFolder(),file=await folder.getEntry('assets/sfx/'+s.id+'.wav');if(!file||!file.nativePath)throw Error('Bundled sound file is missing. Reinstall the full 0.9.6 package.');return {sound:s,path:file.nativePath};}
async function preview(ppro,fs,id){const {sound,path}=await soundFile(fs,id);const opened=await ppro.SourceMonitor.openFilePath(path);if(!opened)throw Error('Premiere could not open '+sound.name+' in Source Monitor.');const played=await ppro.SourceMonitor.play(1);if(!played)throw Error('Sound opened in Source Monitor, but playback was rejected. Press Play there.');return sound.name;}
const normalized = p => String(p).replace(/\//g,'\\').toLowerCase();
async function findImported(ppro,root,path){
 for(const item of await root.getItems())try{
  const clip=ppro.ClipProjectItem.cast(item);
  if(clip&&typeof clip.getMediaFilePath==='function'&&normalized(await clip.getMediaFilePath())===normalized(path))return item;
 }catch(_){}
 return null;
}
async function importSound(ppro,project,root,path){
 let item=await findImported(ppro,root,path);if(item)return item;
 if(!(await project.importFiles([path],true,root,false)))throw Error('Premiere rejected the sound import.');
 item=await findImported(ppro,root,path);
 if(!item)throw Error('Sound imported but could not be identified in Project. Check Project panel before retrying.');
 return item;
}
async function addAtPlayhead(ppro,fs,id){
 const {sound,path}=await soundFile(fs,id),project=await ppro.Project.getActiveProject();
 if(!project)throw Error('Open a Premiere project.');
 const seq=await project.getActiveSequence();if(!seq)throw Error('Open an active sequence.');
 const identity=String(seq.guid),head=await seq.getPlayerPosition(),at=Number(head.seconds);
 if(!Number.isFinite(at)||at<0)throw Error('Move the playhead to a valid sequence time.');
 const audioCount=await seq.getAudioTrackCount(),root=await project.getRootItem();
 const item=await importSound(ppro,project,root,path);
 const current=await project.getActiveSequence();
 if(!current||String(current.guid)!==identity||await seq.getAudioTrackCount()!==audioCount||Math.abs(Number((await seq.getPlayerPosition()).seconds)-at)>.05)throw Error('Timeline changed during import; sound is in Project but was not placed.');
 const editor=ppro.SequenceEditor.getEditor(seq);
 let accepted=false;
 project.lockedAccess(()=>{accepted=project.executeTransaction(group=>{
  group.addAction(editor.createInsertProjectItemAction(item,head,0,audioCount+1,true));
 },'EditFlow Sound: '+sound.name);});
 if(accepted!==true)throw Error('Premiere rejected the sound insert. The WAV remains available in Project.');
 const newCount=await seq.getAudioTrackCount();
 if(newCount<=audioCount)throw Error('Insert was accepted but no new audio track appeared. Inspect Premiere before retrying.');
 const soundId=await item.getId();let onTrack=-1;
 for(let i=audioCount;i<newCount;i++){
  const track=await seq.getAudioTrack(i);
  for(const clip of await track.getTrackItems(1,false))try{
   const source=await clip.getProjectItem(),start=Number((await clip.getStartTime()).seconds);
   if(await source.getId()===soundId&&Math.abs(start-at)<.07)onTrack=i;
  }catch(_){}
 }
 if(onTrack<0)throw Error('Timeline insert could not be verified. Inspect the new audio track before retrying.');
 return {sound:sound.name,track:'A'+(onTrack+1),at,verified:true};
}
function setup({ppro,fs,document,status}){
 const $=id=>document.getElementById(id);let running=false;
 for(const s of SOUNDS){const b=document.createElement('button');b.type='button';b.className='sfx-card';b.textContent=s.name+' · '+s.category+' · '+s.seconds.toFixed(2)+'s';b.setAttribute('data-sfx',s.id);b.addEventListener('click',()=>{$('sfxChoice').value=s.id;$('sfxResult').textContent='Selected '+s.name+'. Preview in Source Monitor or add at playhead.';});$('sfxCards').appendChild(b);}
 $('sfxPreview').addEventListener('click',async()=>{if(running)return;running=true;try{
  const name=await preview(ppro,fs,$('sfxChoice').value);$('sfxResult').textContent='Playing '+name+' in Premiere Source Monitor. Timeline unchanged.';status('SFX preview · timeline unchanged');
 }catch(e){$('sfxResult').textContent='Preview: '+String(e.message||e);status('SFX preview unavailable');}finally{running=false;}});
 $('sfxAdd').addEventListener('click',async()=>{if(running)return;running=true;$('sfxAdd').disabled=true;try{
  const result=await addAtPlayhead(ppro,fs,$('sfxChoice').value);$('sfxResult').textContent='ADDED & VERIFIED: '+result.sound+' at '+result.at.toFixed(2)+'s on '+result.track+'. The original sound WAV is in Project.';status('SFX added · '+result.track);
 }catch(e){$('sfxResult').textContent='Add: '+String(e.message||e);status('SFX placement needs inspection');}finally{running=false;$('sfxAdd').disabled=false;}});
}
module.exports={SOUNDS,getSound,soundFile,preview,findImported,importSound,addAtPlayhead,setup};

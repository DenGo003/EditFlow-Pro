const {BackendClient}=require('./src/client.js');
const {inspectTimeline,readTimelineSources,syncSourceFromTrack,separateMicCutSnapshot}=require('./src/premiere.js');
const {AutoConnector}=require('./src/autoconnect.js');
const Visual=require('./src/visual-tools.js');
const ColorGrade=require('./src/color-grade.js');
const SpeechZoom=require('./src/speech-zoom.js');
const SearchMarkers=require('./src/search-markers.js');
const {flattenCaptionTrack}=require('./src/nested-captions.js');
const {CAPTION_PRESETS}=require('./src/caption-presets.js');
const uxp=require('uxp'),fs=uxp.storage.localFileSystem;
const PAIRING_FOLDER='editflow.pairingFolder.v1';
const client=new BackendClient((url,opts)=>fetch(url,opts));
const $=id=>document.getElementById(id);
let activeJob='',busy=false,polling=false,lastAnalysis='',syncSnapshot=null,cutSnapshot=null,captionSnapshot=null,lastSrtPath='',lastCaptionSequence='';
const diagnosticEvents=[];
function status(s){$('status').textContent=s;diagnosticEvents.push({time:new Date().toISOString(),message:String(s)});if(diagnosticEvents.length>80)diagnosticEvents.shift();}
function setBusy(v){busy=v;['connect','autoConnect','resetPairing','analyze','export','transcribe','sync','readSyncTracks','readCutTracks','readCaptionTracks','watch','inspect','importSrt','updateApply','updateSaveChannel','updateReadStatus'].forEach(id=>$(id).disabled=v);if(!v){$('export').disabled=!lastAnalysis;$('importSrt').disabled=!lastSrtPath;}}
async function action(fn){if(busy)return;setBusy(true);try{await fn();}catch(e){status('ERROR · '+(e&&e.message||e));}finally{setBusy(false);}}
function pause(ms){return new Promise(r=>setTimeout(r,ms));}
function summary(j){const res=j.result||{};return JSON.stringify({state:j.state,message:j.message,...(j.state==='complete'?{result:res}:{})},null,2);}
async function monitor(id){client.checkId(id);activeJob=id;$('jobId').value=id;polling=true;try{for(;;){const j=await client.job(id);status(j.state+' · '+j.message);if(Number.isFinite(j.done)&&Number.isFinite(j.total)&&j.total>0)$('progress').value=Math.max(0,Math.min(100,100*j.done/j.total));else $('progress').removeAttribute('value');if(['complete','failed','cancelled'].includes(j.state)){$('result').textContent=summary(j);if(j.state==='complete')$('progress').value=100;else $('progress').value=0;if(j.state!=='complete')throw Error(j.message);return j;}await pause(900);}}finally{polling=false;activeJob='';}}
async function run(kind,data){if(polling)throw Error('Another job is being monitored.');const health=await client.health();if(health.version!=='0.9.6')throw Error('Backend/panel version mismatch: '+health.version+'. Run Install-Update.cmd and restart backend.');const id=await client.start(kind,data);return monitor(id);}
async function pairingFolder(){const saved=localStorage.getItem(PAIRING_FOLDER);if(saved)try{return await fs.getEntryForPersistentToken(saved);}catch(_){localStorage.removeItem(PAIRING_FOLDER);}status('Choose %LOCALAPPDATA%\\EditFlowPro.');const folder=await fs.getFolder();if(!folder)throw Error('Folder selection cancelled.');if(!/[/\\]AppData[/\\]Local[/\\]EditFlowPro[/\\]?$/i.test(folder.nativePath))throw Error('Choose %LOCALAPPDATA%\\EditFlowPro folder.');localStorage.setItem(PAIRING_FOLDER,await fs.createPersistentToken(folder));return folder;}
$('autoConnect').addEventListener('click',()=>action(async()=>{const folder=await pairingFolder();const old=client.timeout;client.timeout=8000;try{const connector=new AutoConnector({client,readToken:async()=>{const f=await folder.getEntry('pairing-token.txt');return f.read();},launch:async()=>{const plugin=await fs.getPluginFolder(),launcher=await plugin.getEntry('launcher/Start-EditFlow-Backend.cmd');return uxp.shell.openPath(launcher.nativePath,'Start EditFlow local backend');},wait:pause,report:status});const h=await connector.connect();$('token').value='';$('health').textContent=JSON.stringify(h,null,2);status('Backend authenticated · '+h.version);}finally{client.timeout=old;}}));
$('resetPairing').addEventListener('click',()=>action(async()=>{client.token='';localStorage.removeItem(PAIRING_FOLDER);$('health').textContent='Not connected';status('Pairing folder forgotten.');}));
$('connect').addEventListener('click',()=>action(async()=>{if($('token').value.trim())client.pair($('token').value);$('token').value='';const h=await client.health();$('health').textContent=JSON.stringify(h,null,2);status('Backend authenticated · '+h.version);}));
$('inspect').addEventListener('click',()=>action(async()=>{const info=await inspectTimeline(require('premierepro'));$('timeline').textContent=JSON.stringify(info,null,2);status('Timeline inspected · 0 changes');}));
function populateTrackSelect(id, tracks, prefix, preferred) {
  const select=$(id);while(select.firstChild)select.removeChild(select.firstChild);
  for(const t of tracks){const o=document.createElement('option');o.value=String(t.index);o.textContent=prefix+(t.index+1)+' — '+t.name+' ('+t.clips.length+' clips)';select.appendChild(o);}
  if(tracks.some(t=>t.index===preferred))select.value=String(preferred);
}
$('readSyncTracks').addEventListener('click',()=>action(async()=>{
  syncSnapshot=null;
  const snap=await readTimelineSources(require('premierepro'));
  populateTrackSelect('syncVideo',snap.videoTracks,'V',0);
  populateTrackSelect('syncCamera',snap.audioTracks,'A',0);
  populateTrackSelect('syncMic',snap.audioTracks,'A',Math.min(1,snap.audioTracks.length-1));
  syncSnapshot=snap;
  $('syncTracksStatus').textContent=snap.sequence+' · '+snap.videoTracks.length+' video tracks · '+snap.audioTracks.length+' audio tracks. Choose separate camera and mic tracks. Analysis does not move clips.';
  status('Timeline tracks loaded · 0 changes');
}));
$('sync').addEventListener('click',()=>action(async()=>{
  if(!syncSnapshot)throw Error('Press Read Active Timeline first.');
  const cameraIdx=Number($('syncCamera').value), micIdx=Number($('syncMic').value);
  if($('syncCamera').value===''||$('syncMic').value===''||cameraIdx===micIdx)throw Error('Choose two different camera and microphone audio tracks.');
  if($('syncVideo').value==='')throw Error('Select a video track.');
  const current=await readTimelineSources(require('premierepro'));
  if(current.sequence!==syncSnapshot.sequence ||current.project!==syncSnapshot.project ||JSON.stringify(current.audioTracks)!==JSON.stringify(syncSnapshot.audioTracks))throw Error('Timeline changed. Press Read Active Timeline again.');
  const camera=syncSourceFromTrack(current,cameraIdx,'audio'),mic=syncSourceFromTrack(current,micIdx,'audio');
  if(camera===mic)throw Error('Camera and microphone tracks resolve to the same source file. Select separate recordings.');
  const j=await run('sync',{camera_path:camera,mic_path:mic,camera_in:0,mic_in:0});
  $('syncResult').textContent=JSON.stringify({cameraTrack:'A'+(cameraIdx+1),microphoneTrack:'A'+(micIdx+1),videoTrack:'V'+(Number($('syncVideo').value)+1),result:j.result},null,2)+'\nPREVIEW ONLY: clips have NOT moved. Track clip offsets and trimmed in-points are not yet accounted for.';
}));
function sameTimeline(a,b){return a && b && a.project===b.project && a.sequence===b.sequence && JSON.stringify(a.videoTracks)===JSON.stringify(b.videoTracks) && JSON.stringify(a.audioTracks)===JSON.stringify(b.audioTracks);}
async function currentChecked(snapshot){const now=await readTimelineSources(require('premierepro'));if(!sameTimeline(snapshot,now))throw Error('Timeline clips or tracks changed. Press Read Active Timeline again.');return now;}
function sourceFor(snapshot,selectId,kind){const raw=$(selectId).value;if(raw==='')throw Error('Select a '+kind+' track first.');return syncSourceFromTrack(snapshot,Number(raw),kind);}
$('readCutTracks').addEventListener('click',()=>action(async()=>{
  cutSnapshot=null;lastAnalysis='';$('export').disabled=true;
  const snap=await readTimelineSources(require('premierepro'));
  populateTrackSelect('cutVideo',snap.videoTracks,'V',0);
  populateTrackSelect('cutAudio',snap.audioTracks,'A',0);
  cutSnapshot=snap;
  $('cutTracksStatus').textContent=snap.sequence+' · Choose camera video (V1) and separately recorded microphone (A2). Builds NEW XML; never edits active timeline.';
  status('Auto Cut tracks loaded · 0 changes');
}));
$('readCaptionTracks').addEventListener('click',()=>action(async()=>{
  captionSnapshot=null;
  const snap=await readTimelineSources(require('premierepro'));
  populateTrackSelect('captionAudio',snap.audioTracks,'A',Math.min(1,snap.audioTracks.length-1));
  $('captionTracksStatus').textContent=snap.sequence+' · Supports direct and nested audio. Audio will be aligned to the ACTIVE sequence timeline before Whisper.';
  captionSnapshot=snap;
  status('Subtitle audio tracks loaded · 0 changes');
}));
$('analyze').addEventListener('click',()=>action(async()=>{
  lastAnalysis='';$('export').disabled=true;
  if(!cutSnapshot)throw Error('Press Read Active Timeline in Auto Cut first.');
  const snap=await currentChecked(cutSnapshot);
  const cutSnapshotPayload=separateMicCutSnapshot(snap,Number($('cutVideo').value),Number($('cutAudio').value));
  const settings={threshold:Number($('threshold').value),minimum:Number($('minimum').value),before:0.08,after:0.12};
  if(!Number.isFinite(settings.threshold)||!Number.isFinite(settings.minimum))throw Error('Invalid silence settings.');
  const j=await run('timeline_cut',{snapshot:cutSnapshotPayload,settings});lastAnalysis=j.id;
  const r=j.result;
  $('cutResult').textContent=JSON.stringify({videoTrack:'V'+(Number($('cutVideo').value)+1),microphoneTrack:'A'+(Number($('cutAudio').value)+1),kept_seconds:r.kept_seconds,original_seconds:r.original_seconds,cuts:r.cuts,xml:r.xml,plan:r.plan,note:'Microphone-driven AutoCut XML generated successfully. Import XML into Premiere manually; original timeline unchanged.'},null,2);
  $('export').disabled=true;
}));
$('export').addEventListener('click',()=>action(async()=>{
  if(!lastAnalysis)throw Error('Analyze first.');await currentChecked(cutSnapshot);
  $('cutResult').textContent+='\nXML is already generated by Analyze; import that XML with Premiere File > Import. Original timeline unchanged.';
}));
const presetSelect=$('captionPreset');
for(const preset of CAPTION_PRESETS){const opt=document.createElement('option');opt.value=preset.id;opt.textContent=preset.name;presetSelect.appendChild(opt);}
function showPreset(){const v=CAPTION_PRESETS.find(p=>p.id===presetSelect.value)||CAPTION_PRESETS[0];const sample=$('presetPreview');sample.textContent=v.sample;sample.style.color=v.color;sample.style.background=v.background;sample.style.fontSize=v.fontSize+'px';sample.style.fontWeight=v.weight;sample.style.textShadow=v.shadow||'none';sample.style.border=v.border||'0';$('presetNote').textContent=v.description+' · Preview only; SRT does not carry animations or typography.';}
presetSelect.addEventListener('change',showPreset);showPreset();
$('importSrt').addEventListener('click',()=>action(async()=>{
 if(!lastSrtPath)throw Error('Generate captions first.');
 const premiere=require('premierepro');const project=await premiere.Project.getActiveProject();if(!project)throw Error('No active project.');
 const seq=await project.getActiveSequence();if(!seq||String(seq.guid)!==lastCaptionSequence)throw Error('Active sequence changed since transcription. Select original sequence before importing.');
 const prior=await seq.getCaptionTrackCount();
 const ok=await project.importFiles([lastSrtPath],true,await project.getInsertionBin(),false);
 if(!ok)throw Error('Premiere refused the SRT import.');
 const after=await seq.getCaptionTrackCount();
 $('captionImportStatus').textContent='SRT imported to Project Panel: '+lastSrtPath+'\nNative caption tracks before: '+prior+'; after: '+after+'\n'+(after>prior?'Caption track verified.':'NOT yet on the timeline. Drag the SRT from Project Panel to time 00:00:00:00, or use Premiere caption import.');
 status(after>prior?'Caption track added and verified':'SRT imported to Project Panel · manual timeline placement still needed');
}));
$('transcribe').addEventListener('click',()=>action(async()=>{
  if(!captionSnapshot)throw Error('Press Read Active Timeline in Subtitles first.');
  const snap=await currentChecked(captionSnapshot);
  if($('captionAudio').value==='')throw Error('Select a caption audio track.');
  const bound=await SearchMarkers.active(require('premierepro'));
  status('Reading original audio sources inside selected track / nest…');
  const mapped=await flattenCaptionTrack(require('premierepro'),Number($('captionAudio').value));
  $('captionResult').textContent='Building selected A'+(Number($('captionAudio').value)+1)+' timeline audio from '+mapped.info.sourceClips+' clips…';
  const j=await run('sequence_caption',{snapshot:mapped.snapshot,language:$('language').value,word_mode:false});
  const r=j.result;
  if(!SearchMarkers.same(bound,await SearchMarkers.active(require('premierepro'))))throw Error('Active sequence changed during transcription. Reopen the original sequence and load its SRT.');
  lastSrtPath=r.srt;lastCaptionSequence=bound.sequenceId;$('importSrt').disabled=false;
  await markerTool.loadGenerated(r,bound);
  $('captionResult').textContent='Timeline audio track: '+mapped.info.track+'\nOriginal media clips: '+mapped.info.sourceClips+'\nSRT ready: '+r.srt+'\nCues: '+r.cues+'\nSRT aligned to the ACTIVE Premiere sequence. Click Import SRT to Premiere Project; native caption-track placement still requires verification.\n\n'+String(r.text||'').slice(0,1400);
}));
$('watch').addEventListener('click',()=>action(async()=>{const id=$('jobId').value.trim();const j=await monitor(id);$('result').textContent=summary(j);}));
$('cancel').addEventListener('click',async()=>{try{const id=activeJob||$('jobId').value.trim();if(!id)throw Error('No job to cancel.');await client.cancel(id);status('Cancellation requested · wait for worker to stop.');}catch(e){status(e.message);}});
require('uxp').entrypoints.setup({panels:{editflow:{show(){},hide(){},destroy(){client.token='';}}}});

require('./src/workspace.js').setupWorkspace();
async function updateConnect(){
 if(client.token){try{return await client.health();}catch(_){} }
 const folder=await pairingFolder();
 const connector=new AutoConnector({client,
  readToken:async()=>{const f=await folder.getEntry('pairing-token.txt');return f.read();},
  launch:async()=>{const plugin=await fs.getPluginFolder(),launcher=await plugin.getEntry('launcher/Start-EditFlow-Backend.cmd');return uxp.shell.openPath(launcher.nativePath,'Start EditFlow backend for updates');},
  wait:pause,report:status});
 const health=await connector.connect();$('health').textContent=JSON.stringify(health,null,2);return health;
}
$('updateApply').addEventListener('click',()=>action(async()=>{
 const h=await updateConnect();if(h.version!=='0.9.6')throw Error('Update panel/backend mismatch. Restart the matching installed version.');
 $('updateResult').textContent='Checking GitHub Releases and Downloads, then verifying the selected ZIP…';
 const result=await client.request('/update/apply',{},300000);
 if(result.state==='current'){$('updateResult').textContent='You have '+result.version+'. No newer compatible release found on GitHub or in Downloads.';status('EditFlow is up to date');return;}
 $('updateResult').textContent='Update '+result.version+' is ready. Save your project and close Premiere. Installation will finish automatically; then reopen Premiere. Reload the plugin in UXP Developer Tools if its manifest changed.';
 status('Update staged · close Premiere after saving');
}));
$('updateSaveChannel').addEventListener('click',()=>action(async()=>{
 await updateConnect();const result=await client.request('/update/channel',{url:$('updateChannel').value.trim()});
 $('updateResult').textContent=result.mode==='GitHub Releases'?'Using this project’s GitHub Releases by default. Downloads remains available.':'Custom HTTPS update feed saved. Downloads remains available.';
 status('Update source: '+result.mode);
}));
$('updateReadStatus').addEventListener('click',()=>action(async()=>{
 await updateConnect();const [channel,result]=await Promise.all([client.request('/update/channel'),client.request('/update/status')]);
 $('updateChannel').value=channel.url||'';$('updateResult').textContent=JSON.stringify(result,null,2);status('Update status loaded');
}));
require('./src/motion-library.js').setup({ppro:require('premierepro'),document,status});
require('./src/sfx-library.js').setup({ppro:require('premierepro'),fs,document,status});
require('./src/caption-apply.js').setupCaptionApply();
const markerTool=SearchMarkers.setup({ppro:require('premierepro'),fs,document,action,status});

// M2.4: visual AI is available in the existing Python 0.8.2 engine.
let zoomRead=null,zoomAnalysis=null,zoomPlan=[],zoomCues=null,colorRead=null,colorAnalysis=null,colorGrade=null;
function getZoomPlan(){if(!zoomAnalysis)return [];const options={strength:Number($('zoomStrength').value),spacing:Number($('zoomSpacing').value)};if($('zoomTiming').value==='speech'){if(!zoomCues)throw Error('Choose the matching SRT first, or select Visual only.');options.accept=p=>SpeechZoom.filterSpeech([p],zoomCues).length>0;}return Visual.planZoom(zoomAnalysis.result,options);}
function refreshZoomPreview(){if(!zoomAnalysis)return;zoomPlan=getZoomPlan();$('zoomApply').disabled=!zoomPlan.length;$('zoomResult').textContent=JSON.stringify({proposed:zoomPlan.length,mode:$('zoomTiming').value,strength:$('zoomStrength').value,minimumSpacingSeconds:$('zoomSpacing').value,examples:zoomPlan.slice(0,15).map(x=>({at:x.at,percent:x.amount,source:x.node})),note:zoomPlan.length?'Review inside-nest adjustments. No edit applied yet.':'No safe punch-ins found; leaving footage unchanged is intentional.'},null,2);}
function visualSelect(id,tracks){populateTrackSelect(id,tracks,'V',0);}
async function visualRead(kind){
 const panel=kind==='zoom'?'zoom':'color';
 const snap=await readTimelineSources(require('premierepro'));visualSelect(panel+'Track',snap.videoTracks);
 if(kind==='zoom'){zoomRead=snap;zoomAnalysis=null;zoomPlan=[];$('zoomApply').disabled=true;$('zoomResult').textContent='Read '+snap.videoTracks.length+' video tracks. Choose the nest track then Analyze.';}
 else {colorRead=snap;colorAnalysis=null;colorGrade=null;$('colorApply').disabled=true;$('colorResult').textContent='Read '+snap.videoTracks.length+' video tracks. Choose your video content track.';}
 status('Video tracks loaded · no changes.');
}
$('zoomRead').addEventListener('click',()=>action(()=>visualRead('zoom')));
$('colorRead').addEventListener('click',()=>action(()=>visualRead('color')));
async function visualAnalysis(kind){
 const prefix=kind==='zoom'?'zoom':'color',old=kind==='zoom'?zoomRead:colorRead;
 if(!old)throw Error('Click Read Active Timeline first.');
 await currentChecked(old);
 const selected=Number($(prefix+'Track').value);if(!Number.isInteger(selected))throw Error('Choose a video track.');
 const visual=await Visual.readVisualSnapshot(require('premierepro'),selected);
 const job=await run('visual_ai',{snapshot:visual.snapshot});
 if(kind==='zoom'){
  zoomAnalysis={...visual,result:job.result};
  zoomPlan=getZoomPlan();
  $('zoomApply').disabled=!zoomPlan.length;
  $('zoomResult').textContent=JSON.stringify({sequence:visual.snapshot.sequence,nestedClips:visual.counts.inner,proposedPunchedClips:zoomPlan.length,examples:zoomPlan.slice(0,12).map(p=>({at:p.at,zoom:'+'+p.amount+'%',insideNest:p.nested,why:p.reason})),warnings:visual.issues.slice(0,6),note:'Only approved inside-nest clips are eligible to change. No keyframes were added yet.'},null,2);
 }else{
  colorAnalysis={...visual,result:job.result};
  const grade=Visual.planColor(job.result);if(!grade)throw Error('No video source frames could be analyzed; check the job errors.');
  const adjustment=ColorGrade.gradeFromAnalysis(grade.color,$('colorLook').value,Number($('colorStrength').value));
  colorGrade={color:adjustment,analyzed:grade.analyzed};$('colorApply').disabled=false;
  const check=await Visual.inspectColorParamsOnTop(require('premierepro'));
  $('colorResult').textContent=JSON.stringify({analyzedClips:grade.analyzed,proposedLumetriChanges:adjustment,topTrack:check.highest,adjustmentLayersOnTop:check.adjustments,lumetriComponents:check.layers,skippedFrames:visual.issues.slice(0,4),note:'Preview only until Apply. Existing manual Lumetri values will not be overwritten.'},null,2);
 }
}
$('zoomAnalyze').addEventListener('click',()=>action(()=>visualAnalysis('zoom')));
$('colorAnalyze').addEventListener('click',()=>action(()=>visualAnalysis('color')));
for(const id of ['zoomStrength','zoomSpacing','zoomTiming'])$(id).addEventListener('change',()=>{
 try{refreshZoomPreview();}catch(e){$('zoomApply').disabled=true;zoomPlan=[];$('zoomResult').textContent='ERROR · '+e.message;}
});
$('zoomChooseSrt').addEventListener('click',()=>action(async()=>{
 const entry=await fs.getFileForOpening({types:['srt'],allowMultiple:false});if(!entry)return;
 const contents=await entry.read(),cues=SpeechZoom.parseSrt(contents);zoomCues=cues;
 $('zoomSpeechStatus').textContent='Loaded '+cues.length+' SRT cues ('+cues.filter(c=>c.emphasis).length+' emphasis candidates). Timestamps must match ACTIVE sequence.';
 if(zoomAnalysis)refreshZoomPreview();
 status('SRT loaded as optional zoom guide · no changes');
}));
for(const id of ['colorStrength','colorLook'])$(id).addEventListener('change',()=>{colorGrade=null;$('colorApply').disabled=true;$('colorResult').textContent='Look or strength changed: click Analyze again before Apply.';});
$('colorInspect').addEventListener('click',()=>action(async()=>{$('colorResult').textContent=JSON.stringify(await Visual.inspectColorParamsOnTop(require('premierepro')),null,2);status('Top adjustment inspection · 0 changes');}));
$('zoomApply').addEventListener('click',()=>action(async()=>{
 if(!zoomAnalysis||!zoomPlan.length)throw Error('Analyze first.');if(!$('zoomConsent').checked)throw Error('Confirm nested-sequence edit safety first.');
 await currentChecked(zoomRead);
 const r=await Visual.applyZoomPlan(require('premierepro'),zoomAnalysis.identity,zoomAnalysis.result,zoomPlan,true,zoomAnalysis.snapshot);
 $('zoomApplyResult').textContent=JSON.stringify(r,null,2);zoomAnalysis=null;$('zoomApply').disabled=true;
 status(r.applied?'Zoom APPLIED '+r.applied+' · skipped '+r.skipped+' · failed '+r.failed+'. Confirm in Program Monitor.':'Zoom: NO changes applied · skipped '+r.skipped+' · failed '+r.failed+'. See details.');
}));

// Keep Setup visibly unavailable until the user approves editing the Adjustment Layer.
$('colorConsent').addEventListener('change',()=>{
 $('colorPrepare').disabled=!$('colorConsent').checked;
});
$('colorPrepare').addEventListener('click',()=>action(async()=>{
 if(!$('colorConsent').checked)throw Error('Check the adjustment-layer consent box before adding Lumetri.');
 const host=require('premierepro');
 const layer=await Visual.ensureTopAdjustmentLayer(host);
 const r=await Visual.prepareLumetriOnTop(host);
 $('colorApplyResult').textContent='Layer setup: '+JSON.stringify({layer,lumetri:r},null,2);
 status('Color layer ready on '+layer.track+' · analyze or apply grade next');
}));
$('colorApply').addEventListener('click',()=>action(async()=>{
 if(!colorGrade||!colorAnalysis)throw Error('Analyze the latest selected footage first.');if(!$('colorConsent').checked)throw Error('Confirm Adjustment Layer color safety first.');
 await currentChecked(colorRead);
 const host=require('premierepro');
 const layer=await Visual.ensureTopAdjustmentLayer(host,colorAnalysis.identity.guid);
 const lumetri=await Visual.prepareLumetriOnTop(host);
 const r=await Visual.applyColorToTop(host,colorAnalysis.identity,colorGrade,{replaceExisting:$('colorReplaceExisting').checked});
 $('colorApplyResult').textContent=JSON.stringify({layer,lumetri,...r},null,2);colorGrade=null;$('colorApply').disabled=true;
 const cause=(r.notes||[]).find(x=>!/^No color values changed\./.test(x))||'';
 const summary=r.applied.length
  ? 'Color values verified '+r.applied.length+' controls · already '+r.already.length+' · skipped '+r.skipped+'. Visual result pending: toggle Lumetri FX.'
  : r.already.length===r.total&&r.skipped===0
    ? 'Color: Grade already matches all '+r.total+' controls. No update needed.'
    : 'Color: NO changes · '+r.skipped+' skipped. '+(cause||'Open the Apply result below for diagnostics.');
 status(summary.slice(0,420));
}));

$('exportDiagnostics').addEventListener('click',()=>action(async()=>{
 const D=require('./src/diagnostics.js');
 const panes={};for(const id of ['status','health','colorResult','colorApplyResult','studioRenderStatus','syncResult','cutResult','captionResult','zoomApplyResult','markerSourceStatus','markerCount','motionResult','sfxResult','updateResult'])panes[id]=$(id).textContent;
 const report=await D.collect({uxp,client,visual:Visual,ppro:require('premierepro'),panes,events:diagnosticEvents.slice()});
 try{
  const saved=localStorage.getItem(PAIRING_FOLDER);
  if(saved){const folder=await fs.getEntryForPersistentToken(saved);report.launcher={};
   for(const name of ['launcher-status.json','backend-startup.log']){
    try{const entry=await folder.getEntry(name);report.launcher[name]=D.sanitize(String(await entry.read()).slice(-16000),client.token);}
    catch(e){report.launcher[name]='Unavailable: '+String(e.message||e);}
   }
  }else report.launcher={note:'Pairing folder has not been selected.'};
 }catch(e){report.launcher={error:String(e.message||e)};}
 const file=await fs.getFileForSaving('EditFlow-0.9.6-diagnostics.json',{types:['json']});
 if(!file){$('diagnosticStatus').textContent='Export cancelled.';return;}
 await file.write(JSON.stringify(D.sanitize(report,client.token),null,2));
 $('diagnosticStatus').textContent='Saved diagnostic report: '+file.nativePath;
}));

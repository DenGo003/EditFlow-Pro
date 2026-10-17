/* Adobe host API calls are isolated in importToProject; all processing is local. */
// CEP-specific adapter, keeping original backend API and UI workflow.
function chooseMedia(multiple) {
  if (!window.cep || !window.cep.fs || !window.cep.fs.showOpenDialogEx)
    throw Error('CEP file picker is unavailable. Check that this panel loaded as CEP.');
  const result=window.cep.fs.showOpenDialogEx(!!multiple,false,'Select audio or video');
  if (!result || result.err !== 0) throw Error('Unable to open file dialog');
  return result.data || [];
}
function hostImport(path) {
  return new Promise((resolve,reject)=>{
    if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript)
      return reject(Error('Premiere CEP scripting bridge unavailable'));
    // JSON.stringify protects file paths with quotes and special characters.
    window.__adobe_cep__.evalScript('editflowImport(' + JSON.stringify(path) + ')', result=>{
      if(result === 'OK') resolve();
      else reject(Error(result && result.indexOf('ERROR:')===0 ? result.substring(6) :
        'Premiere import bridge returned: '+result));
    });
  });
}
const $ = id => document.getElementById(id);
const BASE = 'http://127.0.0.1:8765';
let token='', files=[], analysis=null, cut=null, captionPath='', captionJob=null, savedSrt='', activeJob=null, busy=false;
function view(id){document.querySelectorAll('.view').forEach(e=>e.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('selected',e.getAttribute('data-view')===id));}
function status(text){$('status').textContent=text;}
function error(e){$('error').textContent=e.message||String(e);}
async function api(path,data){
 if(!token)throw Error('Open Connection and pair with Start-Backend.cmd first.');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
 try { const response=await fetch(BASE+path,{signal:controller.signal,method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Backend request failed');return result;
 } finally {clearTimeout(timeout);}
}
// CEP Node.js bridge: start local backend only when the panel opens.
// Gracefully retain manual pairing when CEP does not expose Node.js.
function nodeBridge(){
 try { if(typeof require==='function') return {fs:require('fs'),path:require('path'),cp:require('child_process'),os:require('os')}; }
 catch(e){} return null;
}
async function autoConnect(){
 const n=nodeBridge(); if(!n){status('Manual connection required: CEP Node.js bridge unavailable');return;}
 try {
  const local=process.env.LOCALAPPDATA;
  if(!local)throw Error('LOCALAPPDATA unavailable');
  const appDir=n.path.join(local,'EditFlowPro');
  const settings=JSON.parse(n.fs.readFileSync(n.path.join(appDir,'cep-launcher.json'),'utf8'));
  const root=settings.backendRoot;
  if(!n.fs.existsSync(settings.workRoot||'G:\\'))throw Error('Work drive G: unavailable');
  const python=settings.backendPython || n.path.join(root,'.venv','Scripts','python.exe');
  if(!n.fs.existsSync(python))throw Error('Install.cmd required in original backend folder');
  const tokenPath=n.path.join(appDir,'pairing-token.txt');
  async function tryHealth(){
   if(!n.fs.existsSync(tokenPath))return null;
   token=n.fs.readFileSync(tokenPath,'utf8').trim();
   try{return await api('/health');}catch(e){return null;}
  }
  let h=await tryHealth();
  if(!h){
   status('Starting local engine…');
   const env=Object.assign({},process.env,{HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',EDITFLOW_WORK_ROOT:settings.workRoot||'G:\\EditFlowPro',PATH:n.path.join(root,'tools','ffmpeg','bin')+n.path.delimiter+process.env.PATH});
   const child=n.cp.spawn(python,['-m','backend.server'],{cwd:root,env:env,detached:true,windowsHide:true,stdio:'ignore'});
   child.unref();
   for(let attempt=0;attempt<25;attempt++){
    await new Promise(resolve=>setTimeout(resolve,300));
    h=await tryHealth(); if(h)break;
   }
  }
  if(!h)throw Error('Backend did not respond. Another instance may be using port 8765. Check Start-Backend.cmd.');
  $('token').value='';
  $('health').textContent='Connected • '+h.version+' • Model '+(h.model_ready?'ready':'not downloaded')+'\nOutputs: '+h.output_root;
  status('Local engine ready'); view('cut');
 } catch(e){status('Automatic startup unavailable — manual connection is still supported');error(e);}
}
function bind(id,fn){$(id).addEventListener('click',async()=>{if(busy)return;busy=true;$('error').textContent='';try{await fn();}catch(e){error(e);}finally{busy=false;}});}
function invalidate(){analysis=null;cut=null;$('review').classList.add('hidden');$('cut-result').classList.add('hidden');}
async function job(data){
 const started=await api('/jobs',data);activeJob=started.id;$('cancel').disabled=false;$('progress').classList.remove('hidden');
 try{while(true){
   const j=await api('/jobs/'+activeJob);status(j.message);
   if(j.total>0){$('progress').value=Math.min(100,100*j.done/j.total);}else{$('progress').removeAttribute('value');}
   if(j.state==='complete')return j;
   if(j.state==='failed'||j.state==='cancelled')throw Error(j.message);
   await new Promise(r=>setTimeout(r,700));
 }}finally{activeJob=null;$('cancel').disabled=true;$('progress').classList.add('hidden');}
}
async function importToProject(path){
 if(!path)throw Error('Export or save first.');
 await hostImport(path);
 status('Import requested. Check the Project panel; if Offline, use Link Media to the original source.');
}

document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>view(b.getAttribute('data-view'))));
bind('connect',async()=>{token=$('token').value.trim();const h=await api('/health');$('health').textContent='Connected • '+h.version+' • Model '+(h.model_ready?'ready':'not downloaded')+'\nOutputs: '+h.output_root;if(!h.ffmpeg||!h.ffprobe)throw Error('FFmpeg/ffprobe missing. See installation guide.');status('Local engine ready');view('cut');});
bind('choose',async()=>{const picked=chooseMedia(true);if(!picked.length)return;for(const path of picked)files.push(path);invalidate();$('files').textContent=files.map((p,i)=>(i+1)+'. '+p).join('\n');});
bind('clear',async()=>{files=[];invalidate();$('files').textContent='';});
['threshold','minimum','before','after'].forEach(id=>$(id).addEventListener('change',invalidate));
bind('analyze',async()=>{invalidate();if(!files.length)throw Error('Add media files first.');const settings={};['threshold','minimum','before','after'].forEach(k=>settings[k]=Number($(k).value));const j=await job({kind:'analyze',paths:files,settings});analysis=j.id;const r=j.result;const source=r.clips.reduce((t,m)=>t+m.duration,0);$('summary').textContent=r.kept_seconds.toFixed(2)+'s kept / '+(source-r.kept_seconds).toFixed(2)+'s removed';$('ranges').textContent=r.clips.map(m=>{const parts=m.rate.split('/');const fps=Number(parts[0])/(Number(parts[1])||1);return m.path+'\n'+m.keep.map(p=>(p[0]/fps).toFixed(3)+' → '+(p[1]/fps).toFixed(3)+' sec').join('\n');}).join('\n\n');$('review').classList.remove('hidden');});
bind('auto-cut',async()=>{
 invalidate();if(!files.length)throw Error('Add media files first.');
 const settings={};['threshold','minimum','before','after'].forEach(k=>settings[k]=Number($(k).value));
 status('Step 1/3: scanning audio…');
 const j=await job({kind:'analyze',paths:files,settings});analysis=j.id;
 const r=j.result;const kept=r.kept_seconds;
 $('summary').textContent=kept.toFixed(2)+'s kept';$('review').classList.remove('hidden');
 status('Step 2/3: creating XML…');
 const exported=await job({kind:'export',analysis_id:analysis,render:false});cut=exported.result;
 $('cut-path').textContent=cut.xml;$('import-preview').disabled=true;$('caption-cut').disabled=true;$('cut-result').classList.remove('hidden');
 status('Step 3/3: importing into Premiere…');
 await importToProject(cut.xml);
});
bind('export',async()=>{if(!analysis)throw Error('Analyze first.');const j=await job({kind:'export',analysis_id:analysis,render:$('render').checked});cut=j.result;$('cut-path').textContent=cut.xml+(cut.preview?'\n'+cut.preview:'');$('import-preview').disabled=!cut.preview;$('caption-cut').disabled=!cut.preview;$('cut-result').classList.remove('hidden');status('XML generated. Importing into Premiere…');await importToProject(cut.xml);});
bind('import-xml',()=>importToProject(cut&&cut.xml));bind('import-preview',()=>importToProject(cut&&cut.preview));
function setCaptionSource(path){captionPath=path;captionJob=null;savedSrt='';$('caption-source').textContent=path;$('editor').classList.add('hidden');view('captions');}
bind('caption-cut',async()=>setCaptionSource(cut.preview));
bind('caption-file',async()=>{const e=chooseMedia(false);if(e.length)setCaptionSource(e[0]);});
bind('transcribe',async()=>{if(!captionPath)throw Error('Choose an audio or video source first.');captionJob=null;savedSrt='';$('editor').classList.add('hidden');const j=await job({kind:'transcribe',path:captionPath,language:$('language').value,word_mode:$('words').checked});captionJob=j.id;savedSrt=j.result.srt;$('srt').value=j.result.text;$('srt-path').textContent=savedSrt;$('editor').classList.remove('hidden');});
bind('save-srt',async()=>{const r=await api('/save-srt',{id:captionJob,text:$('srt').value});savedSrt=r.srt;$('srt-path').textContent=savedSrt;status('Edited SRT saved as a new file.');});
$('srt').addEventListener('input',()=>{savedSrt='';$('srt-path').textContent='Unsaved edits — save before importing.';});
bind('import-srt',()=>importToProject(savedSrt));
$('cancel').addEventListener('click',async()=>{if(activeJob)try{await api('/cancel',{id:activeJob});status('Cancellation requested. Whisper finishes its current segment first.');}catch(e){error(e);}});
view('connection');
autoConnect();

// Audio synchronization preview: read only the two user-selected tracks from Premiere.
let syncSnapshot=null,syncEstimate=null;
function hostEval(command){return new Promise((resolve,reject)=>{
  if(!window.__adobe_cep__ || !window.__adobe_cep__.evalScript)return reject(Error('Premiere scripting bridge unavailable'));
  window.__adobe_cep__.evalScript(command,result=>{
    if(!result || result.startsWith('ERROR:')) reject(Error(result||'No response from Premiere'));
    else resolve(result);
  });
});}
function resetSync(){syncSnapshot=null;syncEstimate=null;$('sync-result').classList.add('hidden');$('sync-apply').disabled=true;}
['sync-camera','sync-mic','sync-mute'].forEach(id=>$(id).addEventListener('change',resetSync));
bind('sync-analyze',async()=>{
 resetSync();
 const ca=Number($('sync-camera').value),mi=Number($('sync-mic').value);
 if(ca===mi) throw Error('Choose different tracks for camera and microphone.');
 status('Reading the active Premiere timeline…');
 const raw=await hostEval('editflowTrackInfo('+[ca-1,mi-1].join(',')+')');
 const info=JSON.parse(raw);
 status('Matching camera audio with external microphone…');
 const j=await job({kind:'sync',camera_path:info.cameraPath,mic_path:info.micPath,camera_in:info.cameraIn,mic_in:info.micIn});
 const estimate=j.result;
 syncSnapshot=info;syncEstimate=estimate;
 $('sync-data').textContent='Sequence: '+info.sequence+'\nCamera A'+ca+' → microphone A'+mi+
   '\nMic offset relative to camera: '+estimate.shift_seconds+' seconds'+
   '\nCorrelation: '+estimate.correlation+'; next-best: '+estimate.alternative_correlation+
   '\nConfidence: '+estimate.confidence;
 $('sync-result').classList.remove('hidden');
 $('sync-apply').disabled=estimate.confidence!=='high';
 status(estimate.confidence==='high'?'Alignment ready. Review before applying.':'Low confidence: no changes made. Record a clap or use matching camera audio.');
});
bind('sync-apply',async()=>{
 if(!syncSnapshot || !syncEstimate || syncEstimate.confidence!=='high')throw Error('Run a successful synchronization analysis first.');
 const x=syncSnapshot;const a=Number($('sync-camera').value)-1,b=Number($('sync-mic').value)-1;
 if(a+1!==x.cameraTrack || b+1!==x.micTrack)throw Error('Track selection changed. Analyze again.');
 const result=await hostEval('editflowApplySync('+[
   a,b,JSON.stringify(x.cameraNode),JSON.stringify(x.micNode),x.cameraStart,x.micStart,
   syncEstimate.shift_seconds,$('sync-mute').checked?'true':'false'].join(',')+')');
 resetSync();status(result);
});

// 0.5.0 experiment: construct a cut microphone WAV using an existing AutoCut plan.
let afterWav='';
bind('after-check',async()=>{
 const n=nodeBridge();if(!n)throw Error('CEP Node.js required to browse saved plans');
 const config=JSON.parse(n.fs.readFileSync(n.path.join(process.env.LOCALAPPDATA,'EditFlowPro','cep-launcher.json'),'utf8').replace(/^\uFEFF/,''));
 const outputs=n.path.join(config.workRoot||'G:\\EditFlowPro','Outputs');
 if(!n.fs.existsSync(outputs))throw Error('Outputs folder not found: '+outputs);
 const plans=[];
 for(const name of n.fs.readdirSync(outputs)){
  const p=n.path.join(outputs,name,'cut-plan.json');if(!n.fs.existsSync(p))continue;
  try{const data=JSON.parse(n.fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
   if(data.clips && data.clips.length===1){plans.push({path:p,source:data.clips[0].path,seconds:data.kept_seconds,mtime:n.fs.statSync(p).mtimeMs});}}
  catch(e){}
 }
 plans.sort((a,b)=>b.mtime-a.mtime);
 const select=$('after-plan');select.textContent='';
 for(const x of plans.slice(0,30)){
  const opt=document.createElement('option');opt.value=x.path;
  opt.textContent=n.path.basename(x.source)+' — '+x.seconds.toFixed(1)+'s — '+n.path.basename(n.path.dirname(x.path));select.appendChild(opt);
 }
 if(!plans.length)throw Error('No single-camera AutoCut plans found');
 status(plans.length+' saved plans found. Select the plan for the open sequence.');
});
bind('after-run',async()=>{
 const plan=$('after-plan').value;if(!plan)throw Error('Press Find AutoCut plans first');
 const mic=Number($('after-mic').value)-1;
 const info=JSON.parse(await hostEval('editflowMicTrackInfo('+mic+')'));
 status('Aligning original microphone to original camera, then applying saved cuts…');
 const result=await job({kind:'sync_after_cut',plan:plan,mic:info.micPath});
 afterWav=result.result.wav;
 $('after-path').textContent=afterWav+'\n'+result.result.message;
 $('after-result').classList.remove('hidden');
 status('Aligned WAV ready; import into a duplicated sequence for review.');
});
bind('after-import',async()=>{if(!afterWav)throw Error('Run Smart Sync After AutoCut first');await importToProject(afterWav);});

// v0.6 read-only timeline snapshot (feature preview, not an edit operation).
function tlOptions(id,prefix,trackCount,defaultIndex){
 const e=$(id);e.textContent='';
 for(let i=1;i<=trackCount;i++){const o=document.createElement('option');o.value=String(i);o.textContent=prefix+i;if(i===defaultIndex)o.selected=true;e.appendChild(o);}
}
let timelineSnapshot=null;
bind('tl-inspect',async()=>{
 const snapshot=JSON.parse(await hostEval('editflowTimelineInspect()'));
 timelineSnapshot=snapshot;
 const vs=snapshot.tracks.video,as=snapshot.tracks.audio;
 const current={video:$('tl-video').value,camera:$('tl-camera').value,mic:$('tl-mic').value};
 tlOptions('tl-video','V',vs.length,Number(current.video)||1);
 tlOptions('tl-camera','A',as.length,Number(current.camera)||1);
 tlOptions('tl-mic','A',as.length,Number(current.mic)||2);
 tlOptions('caption-track','A',as.length,Number($('caption-track').value)||Number(current.mic)||2);
 const v=vs[Number($('tl-video').value)-1],c=as[Number($('tl-camera').value)-1],m=as[Number($('tl-mic').value)-1];
 const checks=[];
 if(!v||!c||!m)checks.push('Missing selected track.');
 if($('tl-camera').value===$('tl-mic').value)checks.push('Camera and microphone must be different tracks.');
 if(v&&v.clipCount!==1)checks.push('V1 has '+v.clipCount+' clips; multi-clip editing is not implemented.');
 if(c&&c.clipCount!==1)checks.push('Camera track has '+c.clipCount+' clips; normal sync requires one source.');
 if(m&&m.clipCount!==1)checks.push('Mic track has '+m.clipCount+' clips; normal sync requires one source.');
 if(c&&c.clips.length&&c.clips[0].nested)checks.push('Camera audio is a nested sequence; regular sync cannot analyze its source directly.');
 if(m&&m.clips.length&&m.clips[0].nested)checks.push('Microphone is a nested sequence.');
 $('tl-report').textContent='Sequence: '+snapshot.sequence+'\nVideo tracks: '+vs.length+' | Audio tracks: '+as.length+'\n'+
 'V'+(v?v.track:'?')+': '+(v?v.clipCount:0)+' clips\nA'+(c?c.track:'?')+' camera: '+(c?c.clipCount:0)+' clips\nA'+(m?m.track:'?')+' microphone: '+(m?m.clipCount:0)+' clips\n'+
 (checks.length?'Warnings:\n• '+checks.join('\n• '):'Read-only inspection passed. Ready to try Auto Sync on a duplicate project.');
 status('Timeline inspected (read-only). No clips changed.');
});
['tl-video','tl-camera','tl-mic'].forEach(id=>$(id).addEventListener('change',()=>{$('tl-report').textContent='Track selection changed. Inspect again.';}));
$('tl-to-sync').addEventListener('click',()=>{if($('tl-camera').value)$('sync-camera').value=$('tl-camera').value;if($('tl-mic').value)$('sync-mic').value=$('tl-mic').value;view('sync');});
tlOptions('tl-video','V',8,1);tlOptions('tl-camera','A',8,1);tlOptions('tl-mic','A',8,2);tlOptions('caption-track','A',8,2);

// Timeline AutoCut: visibly report each stage and reject stale backend versions.
let latestTimelinePlan=null;
bind('tl-run-cut',async()=>{
 latestTimelinePlan=null;
 const report=$('tl-cut-result');
 const say=t=>{report.textContent=t;status(t);};
 try {
  say('Checking Timeline AutoCut engine…');
  const h=await api('/health');
  if(!String(h.version||'').includes('timeline-cut'))
    throw Error('Old backend is still running ('+(h.version||'unknown')+'). Close Premiere and restart EditFlow backend after updating.');
  const video=Number($('tl-video').value)-1,mic=Number($('tl-mic').value)-1;
  if(video<0||mic<0)throw Error('Select video V1 and microphone A2.');
  say('Reading synced video V'+(video+1)+' and microphone A'+(mic+1)+'…');
  const raw=await hostEval('editflowTimelineCutSnapshot('+video+','+mic+')');
  const snapshot=JSON.parse(raw);
  const settings={};['threshold','minimum','before','after'].forEach(k=>settings[k]=Number($(k).value));
  say('Analyzing microphone silence without video render…');
  const task=await job({kind:'timeline_cut',snapshot,settings});
  const result=task.result;
  latestTimelinePlan=result.plan;
  say('Kept '+result.kept_seconds.toFixed(2)+'s of '+result.original_seconds.toFixed(2)+'s; '+result.cuts+' cuts.\nXML: '+result.xml+'\nImporting new sequence…');
  await importToProject(result.xml);
  say('New AutoCut sequence imported. Check Project panel, media links, and beginning/end sync.');
 }catch(e){say('Auto Cut failed: '+(e.message||e));throw e;}
});

// Captions from any active Premiere sequence, whether or not AutoCut ran earlier.
bind('tl-captions',async()=>{
 const out=$('tl-captions-result');
 try {
  const a=Number($('caption-track').value)-1;
  if(a<0)throw Error('Choose the caption audio track first.');
  out.textContent='Reading active Premiere sequence audio track A'+(a+1)+'…';
  const snapshot=JSON.parse(await hostEval('editflowCaptionSnapshot('+a+')'));
  if(snapshot.clips.some(c=>!c.path))throw Error('Nested audio could not be resolved to a source file. Nothing was transcribed.');
  out.textContent='Building audio from '+snapshot.clips.length+' timeline clips on A'+(a+1)+' (no video export)…';
  const payload={kind:'sequence_caption',snapshot,language:$('tl-caption-language').value,word_mode:$('tl-caption-words').checked};
  const task=await job(payload);
  const result=task.result;
  out.textContent='SRT ready: '+result.srt+'\nImporting SRT into the Premiere Project panel…';
  await importToProject(result.srt);
  out.textContent='SRT imported: '+result.srt+'\nDrag the SRT onto the active sequence caption track at 00:00. Check spelling and timing. Audio effects/retiming are not replicated.';
 }catch(e){out.textContent='Timeline captions failed: '+(e.message||e);throw e;}
});

// GitHub release updater. Download files via CEP Node, verify pinned release SHA-256,
// then launch a detached Windows updater that waits until Premiere exits.
let latestReleaseURL='',latestPackage=null;
function parseVersion(x){const m=String(x||'').match(/^(?:v)?(\d+)\.(\d+)\.(\d+)$/);return m?m.slice(1).map(Number):null;}
function newerVersion(a,b){const x=parseVersion(a),y=parseVersion(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function getNodeBody(url,limit=0){
 return new Promise((resolve,reject)=>{
  if(limit>4)return reject(Error('Too many redirects'));
  if(!/^https:\/\/(github\.com|api\.github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//i.test(url))return reject(Error('Unexpected download host'));
  const n=nodeBridge();if(!n)return reject(Error('CEP Node.js is required for installation'));
  const req=require('https').get(url,{headers:{'User-Agent':'EditFlowPro-Updater/0.7.8','Accept':'application/octet-stream'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){const next=new URL(res.headers.location,url).toString();res.resume();getNodeBody(next,limit+1).then(resolve,reject);return;}
   if(res.statusCode!==200){res.resume();reject(Error('HTTP '+res.statusCode));return;}
   const parts=[];let size=0;res.on('data',b=>{size+=b.length;if(size>40*1024*1024){req.destroy(Error('Package too large'));return;}parts.push(b);});res.on('end',()=>resolve(Buffer.concat(parts)));res.on('error',reject);
  });req.on('error',reject);req.setTimeout(30000,()=>req.destroy(Error('Download timed out')));
 });
}
bind('check-updates',async()=>{
 const r=$('update-result');r.textContent='Checking GitHub Releases…';latestReleaseURL='';latestPackage=null;$('open-release').disabled=true;$('install-release').disabled=true;
 const ctl=new AbortController(), timeout=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetch('https://api.github.com/repos/DenGo003/EditFlow-Pro/releases/latest',{signal:ctl.signal,headers:{'Accept':'application/vnd.github+json'}});
  if(res.status===404){r.textContent='No update published yet. The updater is ready; publish a release with the ZIP and SHA-256 checksum.';return;}
  if(!res.ok)throw Error('GitHub replied HTTP '+res.status);
  const data=await res.json();if(!data.html_url||!data.tag_name||!Array.isArray(data.assets)||data.draft||data.prerelease)throw Error('No stable signed-off update available');
  latestReleaseURL=data.html_url;$('open-release').disabled=false;
  if(!newerVersion(data.tag_name,'0.7.7')){r.textContent='Installed: v0.7.7\nLatest published: '+data.tag_name+'\nNo newer version.';return;}
  const zip=data.assets.find(a=>a.name==='EditFlow-Pro-Update.zip');
  const sha=data.assets.find(a=>a.name==='EditFlow-Pro-Update.zip.sha256');
  if(!zip||!sha||!zip.browser_download_url||!sha.browser_download_url){r.textContent='Release '+data.tag_name+' exists but lacks the required reviewed ZIP and SHA-256 asset.';return;}
  if(!/^https:\/\/github\.com\/DenGo003\/EditFlow-Pro\/releases\/download\//.test(zip.browser_download_url)||!/^https:\/\/github\.com\/DenGo003\/EditFlow-Pro\/releases\/download\//.test(sha.browser_download_url))throw Error('Unexpected release asset URL');
  latestPackage={zip:zip.browser_download_url,sha:sha.browser_download_url,tag:data.tag_name};$('install-release').disabled=false;
  r.textContent='New update: '+data.tag_name+'\nReady for Download & Install. Save work before clicking.';
 }finally{clearTimeout(timeout);}
});
bind('install-release',async()=>{
 if(!latestPackage)throw Error('Check for updates first.');
 const n=nodeBridge();if(!n)throw Error('CEP Node.js is required for updates.');
 const r=$('update-result');r.textContent='Downloading update + checksum…';
 const [zip,sha]=await Promise.all([getNodeBody(latestPackage.zip),getNodeBody(latestPackage.sha)]);
 const expected=sha.toString('utf8').trim().match(/^([a-fA-F0-9]{64})(?:\s+\*?EditFlow-Pro-Update\.zip)?\s*$/);
 if(!expected)throw Error('Invalid checksum file. Update rejected.');
 const actual=require('crypto').createHash('sha256').update(zip).digest('hex');
 if(actual.toLowerCase()!==expected[1].toLowerCase())throw Error('SHA-256 mismatch. Update rejected.');
 const stage=n.path.join(process.env.LOCALAPPDATA,'EditFlowPro','UpdateStaging',latestPackage.tag.replace(/[^\w.\-]/g,''));
 n.fs.mkdirSync(stage,{recursive:true});
 const file=n.path.join(stage,'EditFlow-Pro-Update.zip');n.fs.writeFileSync(file,zip);
 const worker=n.path.join(n.path.dirname(decodeURIComponent(location.pathname.replace(/^\//,'')).replace(/\//g,'\\')),'Run-Online-Update.ps1');
 if(!n.fs.existsSync(worker))throw Error('Updater worker missing. Reinstall this update once.');
 // Premiere/CEP can terminate its child processes on exit. Windows Task Scheduler
 // owns the installer process independently, so Premiere can safely close.
 const systemRoot=process.env.SystemRoot||process.env.WINDIR||'C:\\Windows';
 const ps=n.path.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const schtasks=n.path.join(systemRoot,'System32','schtasks.exe');
 if(!n.fs.existsSync(ps))throw Error('Windows PowerShell is missing.');
 const logPath=n.path.join(process.env.LOCALAPPDATA,'EditFlowPro','online-update-launch.log');
 n.fs.appendFileSync(logPath,'\nRequest '+latestPackage.tag+' at '+new Date().toISOString()+'\n');
 const taskName='EditFlowPro-Update-'+latestPackage.tag.replace(/[^0-9A-Za-z_-]/g,'_');
 let scheduled=false, schedulerError='';
 try{
  if(!n.fs.existsSync(schtasks))throw Error('Task Scheduler unavailable');
  const command='"'+ps+'" -NoProfile -ExecutionPolicy Bypass -File "'+worker+'" -Archive "'+file+'" -Tag "'+latestPackage.tag+'"';
  n.cp.execFileSync(schtasks,['/Create','/F','/SC','ONCE','/ST','23:59','/TN',taskName,'/TR',command],{windowsHide:true,timeout:15000});
  n.cp.execFileSync(schtasks,['/Run','/TN',taskName],{windowsHide:true,timeout:15000});
  n.fs.appendFileSync(logPath,'Task Scheduler started '+taskName+'\n');
  scheduled=true;
 }catch(e){schedulerError=String(e.message||e);n.fs.appendFileSync(logPath,'Task Scheduler failed: '+schedulerError+'\n');}
 if(scheduled){
  r.textContent='Verified '+latestPackage.tag+'\nInstaller launched outside Premiere via Windows Task Scheduler. SAVE and CLOSE all Premiere windows, then check online-update.log for SUCCESS/FAILED before reopening.';
 }else{
  // Fallback still provides a real PID, but may be terminated by Adobe on exit.
  const fd=n.fs.openSync(logPath,'a');let child;
  try{child=n.cp.spawn(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',worker,'-Archive',file,'-Tag',latestPackage.tag],{detached:true,windowsHide:true,stdio:['ignore',fd,fd]});}
  finally{n.fs.closeSync(fd);}
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();
  r.textContent='Verified '+latestPackage.tag+'\nFallback installer PID '+child.pid+'. CLOSE Premiere and verify online-update.log. Task Scheduler failed: '+schedulerError;
 }

});
bind('open-release',async()=>{
 if(!latestReleaseURL||!/^https:\/\/github\.com\/DenGo003\/EditFlow-Pro\/releases\//.test(latestReleaseURL))throw Error('No verified release URL.');
 if(window.cep&&window.cep.util&&window.cep.util.openURLInDefaultBrowser)window.cep.util.openURLInDefaultBrowser(latestReleaseURL);
 else throw Error('Open '+latestReleaseURL+' manually in your browser.');
});


// Premiere 2025/2026 non-destructive look controls; inspect before writing.
async function lookCall(functionName,args){
 const result=await hostEval(functionName+'('+args.map(x=>JSON.stringify(x)).join(',')+')');
 if(result && result.indexOf('ERROR:')===0)throw Error(result.substring(6));
 try{return JSON.parse(result);}catch(e){throw Error('Premiere returned unexpected look response: '+result);}
}
bind('look-zoom-preview',async()=>{$('look-zoom-result').textContent=JSON.stringify(await lookCall('editflowLookInspect',[Number($('look-zoom-track').value)]),null,2);});
bind('look-color-preview',async()=>{$('look-color-result').textContent=JSON.stringify(await lookCall('editflowLookInspect',[Number($('look-color-track').value)]),null,2);});
bind('look-zoom-apply',async()=>{
 if(!confirm('Apply Motion Scale keyframes to eligible clips on the active VIDEO track? Duplicate your sequence first.'))return;
 const z={subtle:4,medium:8,bold:12}[$('look-zoom-style').value];
 $('look-zoom-result').textContent=JSON.stringify(await lookCall('editflowAutoZoom',[Number($('look-zoom-track').value),z]),null,2);
});
bind('look-color-apply',async()=>{
 if(!confirm('Modify Basic Correction settings on EXISTING Lumetri effects? Duplicate your sequence first.'))return;
 $('look-color-result').textContent=JSON.stringify(await lookCall('editflowAutoColor',[Number($('look-color-track').value),$('look-grade').value,Number($('look-intensity').value)/100]),null,2);
});

// Frame-content aware visual suggestions. Analyze before applying to a duplicate sequence.
let lastVisualPlans={};
async function analyzeVisual(kind){
 const track=Number($(kind==='zoom'?'look-zoom-track':'look-color-track').value);
 const output=$(kind==='zoom'?'look-zoom-result':'look-color-result');
 output.textContent='Reading current video clips and analyzing real frames…';
 const snap=await lookCall('editflowVisualSnapshot',[track]);
 const task=await job({kind:'visual_ai',snapshot:snap});
 lastVisualPlans[kind]={track:track,plan:task.result};
 const clips=task.result.clips;
 output.textContent=clips.map(c=>'Clip '+(c.index+1)+(c.nested_sequence?' [Nest: '+c.nested_sequence+', '+c.children.length+' inner clips]':'')+': '+(c.error||('Light '+c.metrics.luma+' | zoom suggestions '+(c.children?c.children.filter(x=>x.zoom_percent>0).length:c.zoom_percent+'%')+' | exposure '+c.color.exposure_offset))).join('\n')+'\n'+task.result.method+'\n'+task.result.warning;
}
bind('look-ai-zoom',async()=>await analyzeVisual('zoom'));
bind('look-ai-color',async()=>await analyzeVisual('color'));
async function applyVisual(kind){
 const info=lastVisualPlans[kind];if(!info)throw Error('Run AI analysis first and review its suggestions.');
 const containsNests=info.plan.clips.some(c=>c.nested_id);
 const msg=kind==='zoom' && containsNests
  ?'CAUTION: Zoom edits ORIGINAL clips inside nested sequences; duplicating the OUTER sequence is NOT enough. Duplicate each INNER nest in Premiere and replace its outer instance first. Confirm the nests are safe to modify?'
  :'Apply reviewed '+kind+' suggestions? Duplicate the sequence FIRST. Existing animation is skipped.';
 if(!confirm(msg))return;
 if(kind==='zoom' && containsNests){
   for(const c of info.plan.clips)if(c.nested_id)c.allow_shared_nested_edit=true;
 }
 const out=await lookCall('editflowApplyVisualPlan',[info.track,info.plan.sequence,info.plan.clips,kind]);
 $(kind==='zoom'?'look-zoom-result':'look-color-result').textContent+='\nAPPLIED: '+JSON.stringify(out);
}
bind('look-ai-zoom-apply',async()=>await applyVisual('zoom'));
bind('look-ai-color-apply',async()=>await applyVisual('color'));

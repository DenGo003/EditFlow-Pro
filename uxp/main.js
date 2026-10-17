const {BackendClient}=require('./src/client.js');
const {inspectTimeline}=require('./src/premiere.js');
const client=new BackendClient((url,opts)=>fetch(url,opts));
const $=id=>document.getElementById(id);
let timer=null, generation=0, activeJob='', busy=false;
const terminal=s=>['complete','failed','cancelled'].includes(s);
function status(text) { $('status').textContent=text; }
function stopWatch() { generation++; clearTimeout(timer); timer=null; }
function setBusy(value) { busy=value; ['connect','analyze','transcribe','sync','watch'].forEach(id=>$(id).disabled=value); }
async function action(fn) { if(busy)return; setBusy(true); try { await fn(); } catch(e) { status(e.message); } finally { setBusy(false); } }
async function watch(id) {
  client.checkId(id); stopWatch(); activeJob=id; $('jobId').value=id; const epoch=generation;
  async function poll() {
    try {
      const j=await client.job(id); if(epoch!==generation)return;
      status(j.state+' · '+j.message);
      if(Number.isFinite(j.done)&&Number.isFinite(j.total)&&j.total>0) $('progress').value=Math.max(0,Math.min(100,100*j.done/j.total));
      else $('progress').removeAttribute('value');
      if(terminal(j.state)) {
        $('progress').value=j.state==='complete'?100:0;
        $('result').textContent=JSON.stringify(j.result||{state:j.state,message:j.message},null,2);
        activeJob=''; return;
      }
      timer=setTimeout(poll,1000);
    } catch(e) { if(epoch===generation) { status(e.message+' Monitoring stopped; job may still be running.'); $('progress').value=0; } }
  }
  await poll();
}
async function submit(kind,data) {
  if(activeJob) { const old=await client.job(activeJob); if(!terminal(old.state))throw Error('Wait for the active job or cancel it.'); }
  $('result').textContent='Awaiting backend result';
  await watch(await client.start(kind,data));
}
$('connect').addEventListener('click',()=>action(async()=>{
  stopWatch(); activeJob=''; client.pair($('token').value); $('token').value='';
  $('health').textContent='Checking…';
  try { const h=await client.health(); $('health').textContent=JSON.stringify(h,null,2); status('Backend authenticated · '+h.version); }
  catch(e) { $('health').textContent='Not connected'; throw e; }
}));
$('inspect').addEventListener('click',()=>action(async()=>{ $('timeline').textContent='Reading…'; try { $('timeline').textContent=JSON.stringify(await inspectTimeline(require('premierepro')),null,2); status('Timeline read complete · 0 changes'); } catch(e) { $('timeline').textContent='Read failed'; throw e; } }));
$('analyze').addEventListener('click',()=>action(()=>submit('analyze',{paths:[$('media').value.trim()],settings:{threshold:-35,minimum:0.45,before:0.08,after:0.12}})));
$('transcribe').addEventListener('click',()=>action(()=>submit('transcribe',{path:$('media').value.trim(),language:'ar',word_mode:false})));
$('sync').addEventListener('click',()=>action(()=>submit('sync',{camera_path:$('camera').value.trim(),mic_path:$('mic').value.trim(),camera_in:0,mic_in:0})));
$('watch').addEventListener('click',()=>action(()=>watch($('jobId').value.trim())));
$('cancel').addEventListener('click',()=>action(async()=>{ const id=activeJob||$('jobId').value.trim(); await client.cancel(id); status('Cancellation requested · waiting for worker'); await watch(id); }));
require('uxp').entrypoints.setup({panels:{editflow:{hide(){stopWatch();},show(){if(activeJob)watch(activeJob);},destroy(){stopWatch();client.token='';}}}});

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {BackendClient}=require('../uxp/src/client');
const {inspectTimeline}=require('../uxp/src/premiere');
let server, connection;
before(async()=>{
 server=spawn(process.env.PYTHON||'python',['-m','tests.server_fixture'],{cwd:require('node:path').resolve(__dirname,'..')});
 connection=await new Promise((resolve,reject)=>{
  let buffer='',errors=''; const timeout=setTimeout(()=>reject(Error('Server startup timeout '+errors)),10000);
  server.stderr.on('data',x=>errors+=x);
  server.once('error',reject);server.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code+' '+errors));});
  server.stdout.on('data',x=>{buffer+=x;if(buffer.includes('\n')){clearTimeout(timeout);resolve(JSON.parse(buffer.split('\n')[0]));}});
 });
});
after(()=>server&&server.kill());
function realClient(token=connection.token){const c=new BackendClient((url,options)=>fetch(url.replace(':8765',':'+connection.port),options));c.pair(token);return c;}
test('real restored backend authenticates and exposes health',async()=>{const h=await realClient().health();assert.match(h.version,/0\.8\.2/);assert.equal(h.model_ready,false);});
test('wrong token is rejected by real backend',async()=>{await assert.rejects(realClient('wrong').health(),/Pairing expired/);});
test('real job failure is observable, never reported complete',async()=>{
 const c=realClient();const id=await c.start('transcribe',{path:'/missing/editflow.wav',language:'ar'});
 let job;for(let i=0;i<40;i++){job=await c.job(id);if(!['queued','running'].includes(job.state))break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(job.state,'failed');assert.equal(job.result,undefined);
});
test('unknown job and invalid IDs reject',async()=>{const c=realClient();await assert.rejects(c.job('..'),/Invalid job/);await assert.rejects(c.job('0'.repeat(32)),/HTTP 400/);});
test('cancellation acknowledgement reaches real API',async()=>{const c=realClient();const id=await c.start('transcribe',{path:'/missing/editflow.wav'});assert.equal((await c.cancel(id)).ok,true);});
test('timeout settles; no auto retry of submitted jobs',async()=>{let n=0;const c=new BackendClient(()=>{n++;return new Promise(()=>{});},10);c.pair('test');await assert.rejects(c.health(),/timed out/);assert.equal(n,1);});
test('unexpected health payload rejected',async()=>{const c=new BackendClient(async()=>({ok:true,json:async()=>({version:'other'})}));c.pair('test');await assert.rejects(c.health(),/Unexpected/);});
test('timeline adapter handles missing project',async()=>assert.deepEqual(await inspectTimeline({Project:{getActiveProject:async()=>null}}),{message:'No project open'}));
test('timeline adapter awaits async reads and retains actual indexes',async()=>{
 const seq={name:'Nested test',getVideoTrackCount:async()=>2,getAudioTrackCount:async()=>1,getVideoTrack:async i=>({name:'V'+(i+1),getIndex:async()=>i,getTrackItems:(type,empty)=>{assert.equal(type,1);assert.equal(empty,false);return Array(i?203:0);}})};
 const result=await inspectTimeline({Project:{getActiveProject:async()=>({name:'Test',getActiveSequence:async()=>seq})}});
 assert.deepEqual(result.videoTracks.map(t=>t.clips),[0,203]);assert.equal(result.timelineChanges,0);
});
test('real FFmpeg silence job completes with measured cuts',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ef-media-')),media=path.join(dir,'sample.mp4');
 try {
  await new Promise((resolve,reject)=>{
   const p=spawn('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=25:d=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-af',"volume=0:enable='between(t,1,3)'",'-c:v','mpeg4','-c:a','aac','-shortest','-y',media]);
   let error='';p.stderr.on('data',x=>error+=x);p.on('error',reject);p.on('exit',code=>code?reject(Error(error)):resolve());
  });
  const c=realClient(),id=await c.start('analyze',{paths:[media],settings:{threshold:-35,minimum:.45,before:.08,after:.12}});
  let j;for(let i=0;i<150;i++){j=await c.job(id);if(['complete','failed','cancelled'].includes(j.state))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(j.state,'complete',j.message);assert.equal(j.result.clips.length,1);
  assert.ok(j.result.kept_seconds>1.8&&j.result.kept_seconds<2.5);
  assert.equal(j.result.clips[0].keep.length,2);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

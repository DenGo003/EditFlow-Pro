'use strict';
const assert=require('node:assert/strict');
const M=require('../uxp/src/search-markers.js');

function host({reject=false}={}){
 let locked=false,transactions=0,playhead=-1;
 const list=[];
 const seq={guid:{toString:()=> 'sequence-1'},name:'Interview',getEndTime:async()=>({seconds:120}),
  setPlayerPosition:async t=>{playhead=t.seconds;return true;}};
 const project={guid:{toString:()=> 'project-1'},getActiveSequence:async()=>seq,
  lockedAccess:cb=>{locked=true;try{cb();}finally{locked=false;}},
  executeTransaction:(cb,name)=>{assert(locked);assert.match(name,/Mark transcript/);transactions++;const actions=[];
   cb({addAction:a=>{actions.push(a);return true;}});if(reject)return false;for(const a of actions)a.run();return true;}};
 const markers={getMarkers:async()=>list.slice(),createAddMarkerAction:(name,type,time,duration,comments)=>{
  assert(locked);assert.equal(type,'Comment');assert.equal(duration.seconds,0);assert.match(comments,/timestamp/);
  return {run:()=>list.push({getName:async()=>name,getStart:async()=>time})};
 }};
 const ppro={Project:{getActiveProject:async()=>project},Markers:{getMarkers:async owner=>{assert.equal(owner,seq);return markers;}},TickTime:{createWithSeconds:s=>({seconds:s})}};
 return {ppro,seq,project,list,playhead:()=>playhead,transactions:()=>transactions};
}
(async()=>{
 assert.equal(M.normalized('إِستَاد مَانْشِسْتَر'), 'استاد مانشستر');
 const srt='\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\nمانشستر يونايتد\r\n\r\n2\r\n00:00:09,000 --> 00:00:10,200\r\nالقرار المهم\r\n';
 const cues=M.parseSrt(srt);assert.equal(cues.length,2);
 assert.equal(cues[1].start,9);
 assert.throws(()=>M.parseSrt('1\n00:00:06,000 --> 00:00:05,000\nX'),/Invalid/);
 const cueSource={cues,words:[]};
 assert.deepEqual(M.findMatches(cueSource,'قرار').matches.map(x=>x.start),[],'cue search matches complete words');
 assert.equal(M.findMatches(cueSource,'القرار').matches[0].start,9);
 const words=M.validWords([{start:1.15,end:1.4,text:'مَانْشِسْتَر'},{start:1.41,end:1.7,text:'يونايتد'},
  {start:8,end:8.4,text:'قرار'},{start:15,end:15.4,text:'مانشستر'}]);
 assert.equal(words.length,4);
 const source={cues,words};
 const match=M.findMatches(source,'مانشستر').matches;
 assert.deepEqual(match.map(x=>x.start),[1.15,15]);
 assert.deepEqual(M.findMatches(source,'مانشستر يونايتد').matches.map(x=>x.start),[1.15]);
 assert(M.findMatches(source,'مانشستر',1).truncated);
 const h=host(),bound=await M.active(h.ppro);Object.assign(source,bound);
 await M.jump(h.ppro,source,match[0]);assert.equal(h.playhead(),1.15);
 let r=await M.addMarkers(h.ppro,source,match);assert.deepEqual(r,{created:2,skipped:0,verified:true});assert.equal(h.transactions(),1);
 r=await M.addMarkers(h.ppro,source,match);assert.deepEqual(r,{created:0,skipped:2,verified:true});assert.equal(h.transactions(),1);
 await assert.rejects(M.addMarkers(h.ppro,source,[{start:200,text:'bad',precision:'word'}]),/not aligned/);
 h.seq.guid={toString:()=> 'sequence-2'};
 await assert.rejects(M.jump(h.ppro,source,match[0]),/Active sequence changed/);
 const other=host({reject:true}),source2={...await M.active(other.ppro),words,cues};
 await assert.rejects(M.addMarkers(other.ppro,source2,match),/rejected/);assert.equal(other.list.length,0);
 console.log('PASS 0.9.3: Arabic phrase search, SRT cue timing, exact word timing, Premiere playhead, one undo step, duplicate/stale/rejected marker guards');
})().catch(e=>{console.error(e);process.exitCode=1});

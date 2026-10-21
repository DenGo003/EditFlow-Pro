'use strict';
const assert=require('node:assert/strict');
const Motion=require('../uxp/src/motion-library.js');
const SFX=require('../uxp/src/sfx-library.js');
const tick=seconds=>({seconds});

function motionHost(){
 const values=new Map(),state={enabled:false,transactions:[],reject:false,old:100},source={name:'Interview Clip',getId:async()=> 'media-1'};
 const param={displayName:'Scale',isTimeVarying:()=>state.enabled,areKeyframesSupported:async()=>true,
  getStartValue:async()=>({value:{value:state.old}}),createSetTimeVaryingAction:v=>({run:()=>{state.enabled=v}}),
  createKeyframe:v=>({value:v}),createAddKeyframeAction:k=>({run:()=>values.set(k.position.seconds,k.value)}),
  getKeyframeListAsTickTimes:async()=>[...values.keys()].map(tick),getValueAtTime:async t=>values.get(t.seconds)};
 const component={getDisplayName:async()=> 'Motion',getMatchName:async()=> 'PR.Motion',getParamCount:()=>1,getParam:()=>param};
 const item={isAdjustmentLayer:async()=>false,getComponentChain:async()=>({getComponentCount:()=>1,getComponentAtIndex:()=>component}),
  getProjectItem:async()=>source,getStartTime:async()=>tick(10),getEndTime:async()=>tick(14),getInPoint:async()=>tick(0),getOutPoint:async()=>tick(4),getSpeed:async()=>1,isSpeedReversed:async()=>false,getTrackIndex:async()=>0,getName:async()=> 'Interview Clip'};
 const seq={guid:'seq-1',getSelection:async()=>({getTrackItems:async()=>[item]})};
 let locked=false;
 const project={guid:'proj-1',getActiveSequence:async()=>seq,lockedAccess:fn=>{locked=true;try{fn();}finally{locked=false;}},executeTransaction:(fn,name)=>{
  assert(locked,'Actions should be made under project lock');const actions=[];fn({addAction:a=>actions.push(a)});state.transactions.push(name);
  if(state.reject&&name.includes('Punch'))return false;
  for(const a of actions)a.run();return true;
 }};
 return {ppro:{Project:{getActiveProject:async()=>project},ClipProjectItem:{cast:()=>({isSequence:async()=>false})},TickTime:{createWithSeconds:tick}},state,values,source,item,seq,param};
}
function sfxHost(){
 const state={opened:'',played:false,imports:0,existing:[],tracks:[[],[]],head:22.5,seq:'seq-a',rejected:false};
 const soundPath='/plugin/assets/sfx/deep-hit.wav',file={nativePath:soundPath};
 const fs={getPluginFolder:async()=>({getEntry:async path=>{assert.equal(path,'assets/sfx/deep-hit.wav');return file;}})};
 const item={name:'deep-hit.wav',getId:async()=> 'sound-item',getMediaFilePath:async()=>soundPath};
 const root={getItems:async()=>state.existing.slice()};
 const seq={get guid(){return state.seq},getPlayerPosition:async()=>tick(state.head),getAudioTrackCount:async()=>state.tracks.length,
  getAudioTrack:async idx=>({getTrackItems:async()=>state.tracks[idx]})};
 let locked=false;
 const project={getActiveSequence:async()=>seq,getRootItem:async()=>root,importFiles:async paths=>{
  assert.deepEqual(paths,[soundPath]);state.imports++;state.existing.push(item);return true;},
  lockedAccess:fn=>{locked=true;try{fn();}finally{locked=false;}},
  executeTransaction:(fn,name)=>{assert(locked);assert.match(name,/EditFlow Sound/);const acts=[];fn({addAction:a=>acts.push(a)});if(state.rejected)return false;acts.forEach(a=>a.run());return true;}};
 const ppro={Project:{getActiveProject:async()=>project},ClipProjectItem:{cast:i=>i===item?item:null},
  SourceMonitor:{openFilePath:async p=>{state.opened=p;return true;},play:async n=>{assert.equal(n,1);state.played=true;return true;}},
  TickTime:{createWithSeconds:tick},SequenceEditor:{getEditor:()=>({createInsertProjectItemAction:(pi,time,video,audio,limit)=>{
   assert.equal(pi,item);assert.equal(time.seconds,state.head);assert.equal(video,0);assert.equal(audio,state.tracks.length+1);assert.equal(limit,true);
   return {run:()=>{state.tracks.push([]);state.tracks.push([{getProjectItem:async()=>item,getStartTime:async()=>tick(state.head)}]);}};
  }})}};
 return {ppro,fs,state};
}
(async()=>{
 assert.equal(Motion.PRESETS.length,6);assert.equal(SFX.SOUNDS.length,8);
 assert.deepEqual(Motion.plan('soft-push',4,100,1).map(x=>x.value),[100,107]);
 assert.throws(()=>Motion.plan('soft-push',.5,100,1),/between 1 second/);
 const h=motionHost(),preview=await Motion.preview(h.ppro,'punch-settle',1);
 assert.equal(preview.frames.length,4);assert.equal(h.state.transactions.length,0);
 const result=await Motion.apply(h.ppro,preview,'punch-settle',1);
 assert.equal(result.verified,true);assert.equal(h.values.size,4);assert.equal(h.state.transactions.length,2);
 await assert.rejects(Motion.apply(h.ppro,preview,'punch-settle',1),/animated Scale/);
 const changed=motionHost(),p2=await Motion.preview(changed.ppro,'soft-push',1);changed.source.getId=async()=> 'different';
 await assert.rejects(Motion.apply(changed.ppro,p2,'soft-push',1),/Selection or clip settings changed/);assert.equal(changed.state.transactions.length,0);
 const fail=motionHost(),p3=await Motion.preview(fail.ppro,'punch-settle',1);fail.state.reject=true;
 await assert.rejects(Motion.apply(fail.ppro,p3,'punch-settle',1),/rejected keyframe transaction/);assert.equal(fail.values.size,0);
 const s=sfxHost();assert.equal(await SFX.preview(s.ppro,s.fs,'deep-hit'),'Deep Hit');assert(s.state.played);assert.equal(s.state.imports,0);
 const added=await SFX.addAtPlayhead(s.ppro,s.fs,'deep-hit');assert.equal(added.track,'A4');assert.equal(s.state.imports,1);
 await SFX.addAtPlayhead(s.ppro,s.fs,'deep-hit');assert.equal(s.state.imports,1,'repeat import reuses project item');
 const moved=sfxHost();moved.state.rejected=true;
 await assert.rejects(SFX.addAtPlayhead(moved.ppro,moved.fs,'deep-hit'),/rejected the sound insert/);assert.equal(moved.state.tracks.length,2);
 console.log('PASS 0.9.4: native motion plans, keyframe transactions/readback, stale/animated protection, Source Monitor playback, sound import/track placement, duplicate/rejected guards');
})().catch(e=>{console.error(e);process.exitCode=1});

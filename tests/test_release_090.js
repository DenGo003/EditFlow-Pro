'use strict';
const assert=require('node:assert/strict'),V=require('../uxp/src/visual-tools'),D=require('../uxp/src/diagnostics');
function host(mode='normal',initial=0,animated=false){
 let value=initial,epoch=0,locked=false,writes=0;
 const layer={isAdjustmentLayer:async()=>true,isDisabled:async()=>false,getComponentChain:async()=>{
  const captured=epoch;
  const p={displayName:'Contrast',isTimeVarying:()=>animated,getStartValue:async()=>({value}),createKeyframe:v=>({v}),createSetValueAction:k=>{
   assert(locked);assert.equal(captured,epoch,'stale parameter wrapper used');
   return {run:()=>{writes++;epoch++;if(mode!=='silent')value=k.v;}};
  }};
  const fx={getMatchName:async()=> 'AE.ADBE Lumetri',getDisplayName:async()=> 'Lumetri Color',getParamCount:()=>2,getParam:i=>i? p:{displayName:'Basic Correction',getStartValue:async()=>null}};
  return {getComponentCount:()=>1,getComponentAtIndex:()=>fx};
 }};
 const seq={guid:'one',getVideoTrackCount:async()=>1,getVideoTrack:async()=>({getTrackItems:async()=>[layer]})};
 const project={getActiveSequence:async()=>seq,lockedAccess:f=>{locked=true;try{f();}finally{locked=false;}},executeTransaction:f=>{const a=[];f({addAction:x=>a.push(x)});if(mode==='reject')return false;a.forEach(x=>x.run());return true;}};
 return {ppro:{Project:{getActiveProject:async()=>project}},writes:()=>writes};
}
(async()=>{
 const plan={color:{contrast_offset:18,exposure_offset:0,temperature_offset:0,saturation:100}};
 for(const mode of ['normal','silent','reject']){
  const h=host(mode),r=await V.applyColorToTop(h.ppro,{guid:'one'},plan);
  const c=r.outcomes.find(x=>x.name==='contrast');
  assert.equal(c.before,0);assert.equal(c.requested,18);assert.equal(c.after,mode==='normal'?18:0);
  assert.equal(c.state,mode==='normal'?'applied':'failed');assert.equal(r.applied.length,mode==='normal'?1:0);
  assert.equal(r.visualVerification,'pending-user-fx-toggle');
 }
 const protectedHost=host('normal',8);let r=await V.applyColorToTop(protectedHost.ppro,{guid:'one'},plan);
 assert.equal(protectedHost.writes(),0);assert(r.outcomes.some(x=>/protected/.test(x.reason||'')));
 r=await V.applyColorToTop(protectedHost.ppro,{guid:'one'},plan,{replaceExisting:true});assert.equal(r.applied.length,1);
 const tiny=host('normal',.01);await V.applyColorToTop(tiny.ppro,{guid:'one'},plan);assert.equal(tiny.writes(),0,'even small existing manual values require Re-grade');
 const animated=host('normal',0,true);r=await V.applyColorToTop(animated.ppro,{guid:'one'},plan,{replaceExisting:true});assert.equal(animated.writes(),0);
 await assert.rejects(V.applyColorToTop(host().ppro,{guid:'other'},plan),/sequence changed/);
 const secret='x'.repeat(43);const clean=D.sanitize({token:secret,error:'Bearer '+secret,path:'C:\\Users\\Name\\secret.mp4',events:[secret]},secret);
 assert(!JSON.stringify(clean).includes(secret));assert(!JSON.stringify(clean).includes('Name'));assert.equal(clean.token,'[REDACTED]');
 const report=await D.collect({uxp:{host:{version:'25.6.2'}},client:{token:secret,health:async()=>{throw Error('offline');}},visual:V,ppro:host().ppro,panes:{},events:[]});
 assert.equal(report.host.version,'25.6.2');assert.equal(report.backend.error,'offline');assert(report.colorInspection);
 console.log('PASS 0.9.2: refreshed readback, silent write/rejection, Re-grade protection, animation protection, stale identity, offline diagnostics, secret/path redaction');
})().catch(e=>{console.error(e);process.exitCode=1});

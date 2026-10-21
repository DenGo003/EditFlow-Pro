'use strict';
const assert=require('node:assert/strict');
const Visual=require('../uxp/src/visual-tools');
function makeHost(names){
  let components=[], inserts=0;
  const layer={isAdjustmentLayer:async()=>true,getComponentChain:async()=>({getComponentCount:()=>components.length,getComponentAtIndex:i=>components[i],createAppendComponentAction:c=>({run:()=>{components.push(c);inserts++}})})};
  const seq={getVideoTrackCount:async()=>2,getVideoTrack:async i=>({getTrackItems:async()=>i===1?[layer]:[]})};
  const project={getActiveSequence:async()=>seq,lockedAccess:fn=>fn(),executeTransaction:fn=>{const actions=[];fn({addAction:a=>actions.push(a)});for(const a of actions)a.run();return true}};
  const calls=[];
  const ppro={Project:{getActiveProject:async()=>project},VideoFilterFactory:{getMatchNames:async()=>names,createComponent:async n=>{calls.push(n);return {getMatchName:async()=>n,getDisplayName:async()=>n}}}};
  return {ppro,calls,getInserts:()=>inserts};
}
(async()=>{
  // Canonical AE.ADBE Lumetri Color wins over other Lumetri-related variants.
  const h=makeHost(['AE.ADBE Lumetri','PR.ADBE Lumetri']);
  const out=await Visual.prepareLumetriOnTop(h.ppro);
  assert.equal(out.state,'added-and-verified');
  assert.equal(out.matchName,'AE.ADBE Lumetri');
  assert.deepEqual(h.calls,['AE.ADBE Lumetri']);
  assert.equal(h.getInserts(),1);
  const repeat=await Visual.prepareLumetriOnTop(h.ppro);
  assert.equal(repeat.state,'already-present');assert.equal(h.getInserts(),1);
  // An alternate exact match is selected if canonical AE ID is not available.
  const alternate=makeHost(['PR.ADBE Lumetri', 'PR.ADBE Lumetri Other']);
  assert.equal((await Visual.prepareLumetriOnTop(alternate.ppro)).matchName,'PR.ADBE Lumetri');
  // 0.9.2 intentionally refuses unknown variants even if only one matches.
  const only=makeHost(['PR.ADBE Blur','PR.ADBE Lumetri Pro']);
  await assert.rejects(Visual.prepareLumetriOnTop(only.ppro),/Cannot safely select/);assert.equal(only.getInserts(),0);
  // Two unknown matches: do not alter the timeline, but show identifiers for diagnosis.
  const unknown=makeHost(['AE.Lumetri V1','AE.Lumetri V2']);
  await assert.rejects(Visual.prepareLumetriOnTop(unknown.ppro),e=>/AE.Lumetri V1/.test(e.message)&&/AE.Lumetri V2/.test(e.message));
  assert.equal(unknown.getInserts(),0);assert.equal(unknown.calls.length,0);
  const missing=makeHost(['PR.ADBE Blur']);
  await assert.rejects(Visual.prepareLumetriOnTop(missing.ppro),/Available matchNames: \(none\)/);
  assert.equal(missing.getInserts(),0);
  console.log('PASS: two candidates prefer canonical Lumetri Color, verify insertion and idempotence, refuse ambiguous/missing variants');
})().catch(err=>{console.error(err);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict');
const V=require('../uxp/src/visual-tools'),S=require('../uxp/src/speech-zoom');
const srt=`1\n00:00:05,000 --> 00:00:07,000\nالمهم نركز هنا!\n\n2\n00:00:17,000 --> 00:00:19,000\nلكن حصلت مشكلة\n\n3\n00:00:25,000 --> 00:00:27,000\nالفريق بيلعب كويس\n`;
const cues=S.parseSrt(srt);assert.equal(cues.length,3);assert.equal(cues.filter(x=>x.emphasis).length,2);
const r={clips:[{node:'n',children:[0,5,10,16,20,25].map((at,i)=>({node:'k'+i,track:0,segment_start:at,segment_end:at+4,start:at,end:at+4,zoom_percent:3,scene_change:.02}))}]};
const p=V.planZoom(r,{strength:2,spacing:10,accept:x=>S.filterSpeech([x],cues).length>0});assert.deepEqual(p.map(x=>x.at),[5,16]);
function ts(seconds){return {seconds};}
function param(name,value=0){const p={displayName:name,isTimeVarying:()=>false,val:value,getStartValue:async()=>({value:{value:p.val}}),createKeyframe:v=>({value:v}),createSetValueAction:k=>({run:()=>{p.val=k.value}})};return p;}
function component(name,params){return {getDisplayName:async()=>name,getMatchName:async()=>name==='Lumetri Color'?'PR.ADBE Lumetri':name,getParamCount:()=>params.length,getParam:i=>params[i]};}
(async()=>{
 const params=[param('Exposure'),param('Contrast'),param('Temperature')],components=[],adjust={isAdjustmentLayer:async()=>true,getComponentChain:async()=>({getComponentCount:()=>components.length,getComponentAtIndex:i=>components[i],createAppendComponentAction:c=>({run:()=>components.push(c)})})};
 const sequence={guid:'test',getVideoTrackCount:async()=>3,getVideoTrack:async i=>({getTrackItems:async()=>i===2?[adjust]:[]})};
 let locked=false;const project={getActiveSequence:async()=>sequence,lockedAccess:f=>{locked=true;try{return f()}finally{locked=false}},executeTransaction:f=>{assert(locked,'Action must be inside lockedAccess');const actions=[];f({addAction:a=>{assert(locked);actions.push(a)}});actions.forEach(a=>a.run());return true}};
 const ppro={Project:{getActiveProject:async()=>project},VideoFilterFactory:{getMatchNames:async()=>['PR.ADBE Lumetri','PR.ADBE Noise'],createComponent:async()=>component('Lumetri Color',params)}};
 const pre=await V.prepareLumetriOnTop(ppro);assert.equal(pre.state,'added-and-verified');assert.equal(components.length,1);
 const again=await V.prepareLumetriOnTop(ppro);assert.equal(again.state,'already-present');assert.equal(components.length,1);
 const applied=await V.applyColorToTop(ppro,{guid:'test'}, {color:{exposure_offset:.1,contrast_offset:4,temperature_offset:-2}});assert.equal(applied.applied.length,3);
 const second=await V.applyColorToTop(ppro,{guid:'test'}, {color:{exposure_offset:.1,contrast_offset:4,temperature_offset:-2}});assert.equal(second.applied.length,0);
 console.log('PASS: SRT guided sparse zoom, UXP locked action creation, Lumetri insertion + verification, no duplicate effect/grade');
})().catch(e=>{console.error(e);process.exitCode=1});

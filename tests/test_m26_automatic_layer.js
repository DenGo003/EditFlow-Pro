'use strict';
const assert=require('node:assert/strict');
const V=require('../uxp/src/visual-tools.js');
const time=s=>({seconds:s});
const makeP=(name,v=0)=>{const o={val:v,displayName:name,isTimeVarying:()=>false,getStartValue:async()=>({value:{value:o.val}}),createKeyframe:v=>({value:v}),createSetValueAction:k=>({run:()=>{o.val=k.value}})};return o;};
const comp=(name,params)=>({getDisplayName:async()=>name,getMatchName:async()=>name==='Lumetri Color'?'PR.ADBE Lumetri':name,getParamCount:()=>params.length,getParam:i=>params[i]});
(async()=>{
 const source={name:'EditFlow - AI Color Template'};
 const pExp=makeP('Exposure'),pContrast=makeP('Contrast'),pTemp=makeP('Temperature');
 function adjust(){let start=0,end=10,components=[];const item={isAdjustmentLayer:async()=>true,getProjectItem:async()=>source,getStartTime:async()=>time(start),getEndTime:async()=>time(end),createSetStartAction:t=>({run:()=>{start=t.seconds}}),createSetEndAction:t=>({run:()=>{end=t.seconds}}),getComponentChain:async()=>({getComponentCount:()=>components.length,getComponentAtIndex:i=>components[i],createAppendComponentAction:c=>({run:()=>components.push(c)})})};return item;}
 const donor=adjust();let layers=[[]],touched=0;
 const active={guid:'active-1',name:'Timeline',getEndTime:async()=>time(125),getVideoTrackCount:async()=>layers.length,getVideoTrack:async i=>({getTrackItems:async()=>layers[i]})};
 layers[0]=[{isAdjustmentLayer:async()=>false}];
 const other={guid:'template-seq',name:'Template',getVideoTrackCount:async()=>1,getVideoTrack:async()=>({getTrackItems:async()=>[donor]})};
 const p={getActiveSequence:async()=>active,getSequences:async()=>[other],lockedAccess:f=>f(),executeTransaction:f=>{const acts=[];f({addAction:a=>acts.push(a)});acts.forEach(a=>a.run());return true}};
 const ppro={Project:{getActiveProject:async()=>p},TickTime:{createWithSeconds:s=>time(s)},SequenceEditor:{getEditor:()=>({createInsertProjectItemAction:(item,tm,vi,ai,shift)=>({run:()=>{assert.equal(item,source);assert.equal(vi,layers.length);assert.equal(tm.seconds,0);layers.push([adjust()]);touched++}})})},VideoFilterFactory:{getMatchNames:async()=>['PR.ADBE Lumetri'],createComponent:async()=>comp('Lumetri Color',[pExp,pContrast,pTemp])}};
 const placed=await V.ensureTopAdjustmentLayer(ppro,'active-1');assert.equal(placed.track,'V2');assert.equal(placed.duration,125);assert.equal(layers.length,2);assert.equal(touched,1);assert.equal((await layers[1][0].getEndTime()).seconds,125);
 const effect=await V.prepareLumetriOnTop(ppro);assert.equal(effect.state,'added-and-verified');
 const grade=await V.applyColorToTop(ppro,{guid:'active-1'},{color:{exposure_offset:.16,contrast_offset:5,temperature_offset:2}});assert.equal(grade.applied.length,3);assert.equal(pExp.val,.16);
 const again=await V.ensureTopAdjustmentLayer(ppro,'active-1');assert.equal(touched,1);assert.equal(again.track,'V2');
 const r={clips:[{node:'outer',children:[0,6,12,19,27,39].map((at,i)=>({node:'clip'+i,track:0,segment_start:at,start:at,end:at+3,zoom_percent:2.5,scene_change:.02}))}]};
 const old=V.planZoom(r,{strength:2,spacing:12}),nw=V.planZoom(r,{strength:5,spacing:12});
 assert.deepEqual(old.map(x=>x.at),nw.map(x=>x.at));assert.ok(nw.every(x=>x.amount>old[0].amount));assert.deepEqual(nw.map(x=>x.at),[0,12,27,39]);
 console.log('PASS: real donor->new highest track, duration resize, Lumetri insert, 3 corrections, no duplicate; zoom timing unchanged at 5%');
})().catch(e=>{console.error(e);process.exitCode=1});

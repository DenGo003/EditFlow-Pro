const assert=require('assert');const T=require('../uxp/src/visual-tools.js');
function num(seconds){return {seconds};}
function media(id,path){return {getId:()=>String(id),name:path,getMediaFilePath:async()=>path};}
const videoSource=media(11,'/media/video.mp4'),nestItem=media(22,'Nested Sequence'),adjustProject=media(33,'Adjustment');
function param(label,value=0){return {displayName:label,val:value,isTimeVarying:()=>false,getStartValue:async function(){return {value:{value:this.val}}},createKeyframe:v=>({value:v}),createSetValueAction:k=>({run:()=>{this.param=0;}})};}
function makeParam(label,value){const p={displayName:label,val:value,isTimeVarying:()=>false,getStartValue:async()=>({value:{value:p.val}}),createKeyframe:x=>({value:x}),createSetValueAction:k=>({run:()=>{p.val=k.value;}})};return p;}
function comp(name,params){return {getDisplayName:async()=>name,getMatchName:async()=>name==='Lumetri Color'?'AE.ADBE Lumetri':name,getParamCount:()=>params.length,getParam:i=>params[i]};}
function chain(components){return {getComponentCount:()=>components.length,getComponentAtIndex:i=>components[i]};}
function clip(st,en,si,source,components=[]){return {getStartTime:async()=>num(st),getEndTime:async()=>num(en),getInPoint:async()=>num(si),getOutPoint:async()=>num(si+en-st),getSpeed:async()=>1,isSpeedReversed:async()=>false,getProjectItem:async()=>source,getComponentChain:async()=>chain(components),isAdjustmentLayer:async()=>false};}
(async()=>{
 const pScale=makeParam('Scale',100),inner=clip(0,5,10,videoSource,[comp('Motion',[pScale])]);
 const outer=clip(0,5,0,nestItem);const pExposure=makeParam('Exposure',0),pContrast=makeParam('Contrast',0),pTemp=makeParam('Temperature',0);
 const adj=clip(0,5,0,adjustProject,[comp('Lumetri Color',[pExposure,pContrast,pTemp])]);adj.isAdjustmentLayer=async()=>true;
 const nestSeq={name:'Inside',getProjectItem:async()=>nestItem,getVideoTrackCount:async()=>1,getVideoTrack:async()=>({getTrackItems:async()=>[inner]})};
 const active={guid:'guid',name:'main',getVideoTrackCount:async()=>2,getVideoTrack:async i=>({getTrackItems:async()=>i===0?[outer]:[adj]})};
 const project={getSequences:async()=>[nestSeq],getActiveSequence:async()=>active,lockedAccess:fn=>fn(),executeTransaction:fn=>{fn({addAction:a=>a.run()});return true;}};
 const ppro={Project:{getActiveProject:async()=>project},ClipProjectItem:{cast:async i=>i===videoSource?{getMediaFilePath:async()=>i.getMediaFilePath()}:i===nestItem?{isSequence:async()=>true,getSequence:async()=>nestSeq}:null}};
 const original=await T.readVisualSnapshot(ppro,0),c=original.snapshot.clips[0],kid=c.children[0];
 const result={clips:[{node:c.node,nested_id:c.nested_id,children:[{node:kid.node,track:0,start:0,end:5,segment_start:0,zoom_percent:3,scene_change:.03,reason:'steady'}]}]};
 const zoomPlan=T.planZoom(result,{strength:2});const zoom=await T.applyZoomPlan(ppro,original.identity,result,zoomPlan,true,original.snapshot);assert.equal(zoom.applied,1);assert.equal(pScale.val,102);
 const color=await T.applyColorToTop(ppro,original.identity,{color:{exposure_offset:-.1,contrast_offset:5,temperature_offset:2}});assert.equal(color.applied.length,3);assert.equal(pExposure.val,-.1);assert.equal(pContrast.val,5);assert.equal(pTemp.val,2);
 const repeat=await T.applyColorToTop(ppro,original.identity,{color:{exposure_offset:-.1,contrast_offset:5,temperature_offset:2}});assert.equal(repeat.applied.length,0);assert.equal(repeat.skipped,0);assert.equal(repeat.already.length,3);
 console.log('PASS: verified transaction paths for inside-nest Motion and top-track Lumetri, previous values protected');
})().catch(e=>{console.error(e);process.exitCode=1});

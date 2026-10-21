const assert=require('assert');
const v=require('../uxp/src/visual-tools.js');
function stamp(seconds){return {seconds};}
function makeClip(st,en,si,projectItem){return {getStartTime:async()=>stamp(st),getEndTime:async()=>stamp(en),getInPoint:async()=>stamp(si),getOutPoint:async()=>stamp(si+en-st),getSpeed:async()=>1,isSpeedReversed:async()=>false,getProjectItem:async()=>projectItem};}
(async()=>{
 const clipProject={getId:()=>22,name:'Camera',getMediaFilePath:async()=>'/tmp/camera.mp4'};
 const nestProject={getId:()=>9,name:'AutoCut Nest'};
 const videoItem1=makeClip(0,4,10,clipProject),videoItem2=makeClip(4,9,14,clipProject);
 const nested={name:'AutoCut Nest',getProjectItem:async()=>nestProject,getVideoTrackCount:async()=>1,getVideoTrack:async()=>({getTrackItems:async()=>[videoItem1,videoItem2]})};
 const sequence={guid:'guid1',name:'Active',getVideoTrackCount:async()=>2,getVideoTrack:async i=>i===0?{getTrackItems:async()=>[makeClip(0,9,0,nestProject)]}:{getTrackItems:async()=>[]}};
 const project={getActiveSequence:async()=>sequence,getSequences:async()=>[nested]};
 const ppro={Project:{getActiveProject:async()=>project},ClipProjectItem:{cast:async x=>x===clipProject?{getMediaFilePath:async()=>'/tmp/camera.mp4'}:{isSequence:async()=>true,getSequence:async()=>nested}}};
 const out=await v.readVisualSnapshot(ppro,0);assert.equal(out.snapshot.clips[0].children.length,2);assert.equal(out.snapshot.clips[0].nested_sequence,'AutoCut Nest');
 const c=out.snapshot.clips[0].children;assert.deepEqual(c.map(x=>x.source_in),[10,14]);assert.deepEqual(c.map(x=>x.segment_start),[0,4]);
 const result={clips:[{node:out.snapshot.clips[0].node,children:c.map((x,i)=>({node:x.node,track:0,start:x.start,end:x.end,segment_start:x.segment_start,scene_change:0.04,zoom_percent:i?5:3,reason:'quiet',color:{exposure_offset:.2,contrast_offset:6,temperature_offset:-3}}))}]};
 let plan=v.planZoom(result,{strength:2,spacing:12});assert.equal(plan.length,1);assert.equal(plan[0].amount,2);assert.equal(plan[0].nested,true);
 let grade=v.planColor(result);assert.equal(grade.analyzed,2);assert.equal(grade.color.exposure_offset,.2);
 const top=await v.findAdjustmentsOnHighestTrack(ppro);assert.equal(top.highest,'V2');assert.equal(top.layers.length,0);
 try{await v.applyColorToTop(ppro,out.identity,grade);throw Error('should reject missing adjustment')}catch(e){assert.ok(/Adjustment Layer/.test(e.message));}
 console.log('PASS: nested source snapshot, spacing, restrained zoom, weighted color, safe top-layer refusal');
})().catch(e=>{console.error(e);process.exitCode=1});

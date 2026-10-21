'use strict';
const assert=require('node:assert/strict');
const V=require('../uxp/src/visual-tools');
function param(label,n){return {displayName:label,n,isTimeVarying:()=>false,getStartValue:async function(){return {value:{value:this.n}};},createKeyframe:v=>({v}),createSetValueAction:function(k){return {run:()=>{this.n=k.v}};}};}
function host(labels){
 const ps=labels.map(([name,n])=>param(name,n));
 const fx={getMatchName:async()=> 'AE.ADBE Lumetri',getDisplayName:async()=> 'Lumetri Color',getParamCount:()=>ps.length,getParam:i=>ps[i]};
 const item={isAdjustmentLayer:async()=>true,isDisabled:async()=>false,getComponentChain:async()=>({getComponentCount:()=>1,getComponentAtIndex:()=>fx})};
 const seq={guid:'M265',getVideoTrackCount:async()=>4,getVideoTrack:async i=>({getTrackItems:async()=>i===3?[item]:[]})};
 const project={getActiveSequence:async()=>seq,lockedAccess:fn=>fn(),executeTransaction:fn=>{const actions=[];fn({addAction:a=>actions.push(a)});actions.forEach(a=>a.run());return true}};
 return {ppro:{Project:{getActiveProject:async()=>project}},ps};
}
const actual=host([
 ['Blob',NaN],['',NaN],['Basic Correction',NaN],['',NaN],['Input LUT',NaN],['Input LUT',NaN],['HDR White',NaN],['',NaN],
 ['Intensity',100],['Color',NaN],['White Balance',NaN],['Temperature',0],['Tint',0],['Saturation',100],['Light',NaN],
 ['Exposure',-.19],['Contrast',0],['Highlights',0],['Shadows',0],['Whites',0],['Blacks',0],['HDR Specular',0],
 ['Creative',NaN],['Look',NaN],['Color Space',NaN],['Intensity',100],['Adjustments',NaN],['Faded Film',0],
 ['Sharpen',0],['Vibrance',0],['Saturation',100],['Tint Balance',0],['Curves',NaN],['RGB Curves',NaN],
 ['Hue Saturation Curves',NaN],['Contrast',7],['Temperature',4],['Color Wheels & Match',NaN]
]);
(async()=>{
 const before=await V.inspectColorParamsOnTop(actual.ppro);
 const entry=before.layers[0];
 assert.equal(entry.basicCorrectionFound,true);
 assert.deepEqual(Object.keys(entry.recognized).sort(),['blacks','contrast','exposure','highlights','saturation','shadows','temperature','whites']);
 assert.deepEqual(entry.ambiguous,[]);
 assert.equal(entry.resolvedBy.contrast,'Basic Correction section');
 const grade={color:{exposure_offset:-.19,contrast_offset:16,temperature_offset:-3,saturation:96}};
 const result=await V.applyColorToTop(actual.ppro,{guid:'M265'},grade,{replaceExisting:true});
 assert.equal(result.applied.length,3);
 assert.equal(result.already.length,1);
 assert.equal(result.skipped,0);
 assert.equal(result.verifiedValues,true);
 assert.equal(actual.ps.find(x=>x.displayName==='Exposure').n,-.19);
 assert.equal(actual.ps[11].n,-3);assert.equal(actual.ps[13].n,96);assert.equal(actual.ps[16].n,16);
 // Ensure matching names in OTHER sections weren't touched.
 assert.equal(actual.ps[30].n,100);assert.equal(actual.ps[35].n,7);assert.equal(actual.ps[36].n,4);
 const unmatched=host([['Basic Correction',NaN],['Exposure',0],['Contrast',0],['Creative',NaN],['Saturation',100]]);
 const inspected=await V.inspectColorParamsOnTop(unmatched.ppro);
 assert(!('saturation' in inspected.layers[0].recognized),'Never select Creative saturation when missing in Basic Correction');
 const ambiguous=host([['Contrast',0],['Contrast',8],['Exposure',0],['Temperature',0],['Saturation',100]]);
 const amb=await V.inspectColorParamsOnTop(ambiguous.ppro);
 assert(amb.layers[0].ambiguous.includes('contrast'),'Unscoped repeated label must stay ambiguous');
 console.log('PASS M2.6.5: Basic Correction group resolves repeated Lumetri labels; alternative sections protected; safe fallback');
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// Original Scale-only motion recipes. Uses the native Motion component in Premiere 25.6.
const PRESETS = [
 {id:'soft-push',name:'Soft Push',description:'تقدم هادي على طول اللقطة',points:[[0,0],[1,7]]},
 {id:'pull-back',name:'Pull Back',description:'رجوع تدريجي للصورة الأصلية',points:[[0,8],[1,0]]},
 {id:'punch-settle',name:'Punch & Settle',description:'دخلة سريعة ثم تثبيت',points:[[0,0],[.12,14],[.38,8],[1,8]]},
 {id:'beat-pop',name:'Beat Pop',description:'نبضة قصيرة وترجع',points:[[0,0],[.12,12],[.28,0],[1,0]]},
 {id:'double-tap',name:'Double Tap',description:'نبضتان للمحتوى السريع',points:[[0,0],[.11,9],[.24,0],[.43,9],[.56,0],[1,0]]},
 {id:'quiet-hold',name:'Quiet Hold',description:'تقدم صغير في منتصف اللقطة',points:[[0,0],[.3,0],[.72,5],[1,5]]},
];
const num = t => Number(t && t.seconds !== undefined ? t.seconds : t);
const scalar = k => typeof k === 'number' ? k : k && typeof k.value === 'number' ? k.value : k && k.value && typeof k.value.value === 'number' ? k.value.value : NaN;

function plan(id,duration,base,strength=1){
 const preset=PRESETS.find(p=>p.id===id);
 if(!preset)throw Error('Unknown EditFlow motion preset.');
 if(!Number.isFinite(duration)||duration<1||duration>3600)throw Error('Select a video clip between 1 second and 1 hour.');
 if(!Number.isFinite(base)||base<25||base>115)throw Error('Existing Scale is outside the protected 25–115% range.');
 if(![.5,1,1.5].includes(strength))throw Error('Unknown strength.');
 const end=duration-.05;
 return preset.points.map(([fraction,delta])=>({at:Number((fraction*end).toFixed(3)),value:Number((base+delta*strength).toFixed(3))}));
}
function commit(project,description,actions){
 let accepted=false;
 project.lockedAccess(()=>{accepted=project.executeTransaction(group=>actions(group),description);});
 return accepted===true;
}
async function selected(ppro){
 const project=await ppro.Project.getActiveProject();if(!project)throw Error('Open a Premiere project.');
 const sequence=await project.getActiveSequence();if(!sequence)throw Error('Open a sequence.');
 const selection=await sequence.getSelection(),items=await selection.getTrackItems();
 if(items.length!==1||typeof items[0].getComponentChain!=='function'||typeof items[0].isAdjustmentLayer!=='function'||typeof items[0].getTrackIndex!=='function')throw Error('Select exactly one video clip on the active timeline.');
 const item=items[0];
 if(await item.isAdjustmentLayer())throw Error('Select a video clip, not an adjustment layer.');
 const projectItem=await item.getProjectItem(),clip=ppro.ClipProjectItem.cast(projectItem);
 if(!clip||await clip.isSequence())throw Error('Select a direct video clip, not a nested sequence.');
 const [start,end,inPoint,outPoint,speed,reversed,track]=await Promise.all([item.getStartTime(),item.getEndTime(),item.getInPoint(),item.getOutPoint(),item.getSpeed(),item.isSpeedReversed(),item.getTrackIndex()]);
 const duration=num(end)-num(start);
 if(Math.abs(Number(speed)-1)>.005||reversed||Math.abs(duration-(num(outPoint)-num(inPoint)))>.1)throw Error('Retimed or reversed clips are not supported for these presets.');
 const chain=await item.getComponentChain(),found=[];
 for(let i=0,n=chain.getComponentCount();i<n;i++){
  const component=chain.getComponentAtIndex(i);
  const name=String(await component.getDisplayName())+' '+String(await component.getMatchName());
  if(!/motion|حرك|pr\.motion|adbe motion/i.test(name))continue;
  for(let j=0,m=component.getParamCount();j<m;j++){
   const p=component.getParam(j);
   if(/^(scale|uniform scale|حجم|المقياس)$/i.test(String(p.displayName||'').trim()))found.push(p);
  }
 }
 if(found.length!==1)throw Error('Could not uniquely identify native Motion > Scale. No edit made.');
 const param=found[0];
 if(param.isTimeVarying())throw Error('This clip already has animated Scale. Its existing keyframes are protected.');
 if(!(await param.areKeyframesSupported()))throw Error('This clip does not support Scale keyframes.');
 const base=scalar(await param.getStartValue());
 if(!Number.isFinite(base))throw Error('Cannot read Scale from this clip.');
 return {project,sequence,item,param,base,duration,name:await item.getName(),fingerprint:[String(project.guid),String(sequence.guid),String(await projectItem.getId()),num(start),num(end),num(inPoint),num(outPoint),Number(track),base]};
}
function same(a,b){return a.length===b.length&&a.every((x,i)=>typeof x==='number'?Math.abs(x-b[i])<.001:x===b[i]);}
async function preview(ppro,id,strength){
 const clip=await selected(ppro),frames=plan(id,clip.duration,clip.base,strength);
 return {identity:clip.fingerprint,name:clip.name,duration:clip.duration,frames,preset:PRESETS.find(p=>p.id===id).name};
}
async function apply(ppro,previous,id,strength){
 if(!previous||!Array.isArray(previous.identity))throw Error('Preview the selected clip first.');
 const clip=await selected(ppro);
 if(!same(previous.identity,clip.fingerprint))throw Error('Selection or clip settings changed. Preview again; no edit made.');
 const frames=plan(id,clip.duration,clip.base,strength);
 if(JSON.stringify(frames)!==JSON.stringify(previous.frames))throw Error('Preset or strength changed. Preview again; no edit made.');
 const {project,param}=clip;
 if(!commit(project,'EditFlow Motion: Enable Scale animation',group=>group.addAction(param.createSetTimeVaryingAction(true))))throw Error('Premiere rejected Scale animation. No keyframes written.');
 try{
  if(!param.isTimeVarying())throw Error('Premiere did not enable Scale animation.');
  const ok=commit(project,'EditFlow Motion: '+previous.preset,group=>{
   for(const f of frames){const key=param.createKeyframe(f.value);key.position=ppro.TickTime.createWithSeconds(f.at);group.addAction(param.createAddKeyframeAction(key));}
  });
  if(!ok)throw Error('Premiere rejected keyframe transaction.');
  const times=await param.getKeyframeListAsTickTimes();
  for(const f of frames){
   if(!times.some(t=>Math.abs(num(t)-f.at)<.065))throw Error('Keyframe at '+f.at+'s could not be verified.');
   const actual=scalar(await param.getValueAtTime(ppro.TickTime.createWithSeconds(f.at)));
   if(!Number.isFinite(actual)||Math.abs(actual-f.value)>.12)throw Error('Scale readback at '+f.at+'s did not match.');
  }
  return {preset:previous.preset,clip:clip.name,keyframes:frames.length,verified:true};
 }catch(e){throw Error(String(e.message||e)+' Check Effect Controls before retrying. Premiere Undo twice restores the clip if needed.');}
}
function setup({ppro,document,status}){
 const $=id=>document.getElementById(id);let prepared=null,running=false;
 const cards=$('motionCards');
 for(const p of PRESETS){const button=document.createElement('button');button.type='button';button.className='motion-card';button.textContent=p.name+' · '+p.description;button.setAttribute('data-motion',p.id);button.addEventListener('click',()=>{$('motionPreset').value=p.id;prepared=null;$('motionApply').disabled=true;$('motionResult').textContent='Preset changed. Press Preview selected clip.';});cards.appendChild(button);}
 $('motionPreset').addEventListener('change',()=>{prepared=null;$('motionApply').disabled=true;});
 $('motionStrength').addEventListener('change',()=>{prepared=null;$('motionApply').disabled=true;});
 $('motionPreview').addEventListener('click',async()=>{
  if(running)return;running=true;
  try{prepared=await preview(ppro,$('motionPreset').value,Number($('motionStrength').value));
   $('motionResult').textContent=prepared.name+' · '+prepared.duration.toFixed(2)+'s · '+prepared.preset+'\nNative Scale: '+prepared.frames.map(f=>f.at.toFixed(2)+'s = '+f.value+'%').join(' → ')+'\nReview and press Apply. Existing animation is protected.';
   $('motionApply').disabled=false;status('Motion preview · no timeline change');
  }catch(e){prepared=null;$('motionApply').disabled=true;$('motionResult').textContent='Preview: '+String(e.message||e);status('Motion preview unavailable');}finally{running=false;}
 });
 $('motionApply').addEventListener('click',async()=>{
  if(running||!prepared)return;running=true;$('motionApply').disabled=true;
  try{const result=await apply(ppro,prepared,$('motionPreset').value,Number($('motionStrength').value));$('motionResult').textContent='APPLIED & VERIFIED: '+result.preset+' · '+result.keyframes+' Scale keyframes on '+result.clip+'. Use Premiere Undo to restore.';status('Motion verified · '+result.keyframes+' keyframes');}
  catch(e){$('motionResult').textContent='Apply: '+String(e.message||e);status('Motion apply needs inspection');}
  finally{prepared=null;running=false;}
 });
}
module.exports={PRESETS,plan,selected,preview,apply,setup};

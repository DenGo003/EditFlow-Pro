'use strict';
// UXP 25.6 visual-analysis bridge. No changes are made by snapshot/preview methods.
const {sequenceLookup,mediaOrSequence}=require('./nested-captions.js');
const EPS=.045;
function numeric(x,what){const v=Number(x&&x.seconds!==undefined?x.seconds:x);if(!Number.isFinite(v))throw Error('Invalid '+what);return v;}
async function bounds(item){
 const [st,en,si,so,speed,rev]=await Promise.all([item.getStartTime(),item.getEndTime(),item.getInPoint(),item.getOutPoint(),item.getSpeed(),item.isSpeedReversed()]);
 const t={start:numeric(st,'start'),end:numeric(en,'end'),source_in:numeric(si,'source in'),source_out:numeric(so,'source out'),speed:Number(speed),reversed:Boolean(rev)};
 if(t.end<=t.start||t.source_in<0||t.source_out<=t.source_in||Math.abs(t.speed-1)>.005||t.reversed||Math.abs(t.end-t.start-(t.source_out-t.source_in))>.1)throw Error('Retimed/reversed/invalid clip bounds; visual analysis is disabled for safety.');
 return t;
}
async function readVisualSnapshot(ppro,trackIndex){
 const project=await ppro.Project.getActiveProject();if(!project)throw Error('Open a Premiere project.');
 const sequence=await project.getActiveSequence();if(!sequence)throw Error('Open a sequence.');
 const lookup=await sequenceLookup(project), count=await sequence.getVideoTrackCount();
 const idx=Number(trackIndex);if(!Number.isInteger(idx)||idx<0||idx>=count)throw Error('Choose a valid video track.');
 const vt=await sequence.getVideoTrack(idx), clips=await vt.getTrackItems(1,false),output=[],issues=[];
 if(!clips.length)throw Error('Selected video track has no clips.');
 if(clips.length>250)throw Error('Too many video clips (250 maximum).');
 for(let i=0;i<clips.length;i++){
  const item=clips[i];let t;
  try{t=await bounds(item);}catch(e){issues.push('Clip '+(i+1)+': '+e.message);continue;}
  const node=`${idx}:${i}:${t.start.toFixed(5)}:${t.end.toFixed(5)}`;
  let source;
  try{source=await mediaOrSequence(ppro,await item.getProjectItem(),lookup);}catch(e){issues.push('Clip '+(i+1)+': '+e.message);continue;}
  const row={node,start:t.start,end:t.end};
  if(source.sequence){
   row.nested=true;row.nested_id=source.id;row.nested_sequence=source.sequence.name;row.children=[];
   for(let j=0,n=await source.sequence.getVideoTrackCount();j<n;j++){
    const track=await source.sequence.getVideoTrack(j), inner=await track.getTrackItems(1,false);
    for(let k=0;k<inner.length;k++){
     const child=inner[k];let b;
     try{b=await bounds(child);}catch(e){issues.push('Inner V'+(j+1)+' clip '+(k+1)+': '+e.message);continue;}
     const from=Math.max(t.source_in,b.start),to=Math.min(t.source_out,b.end);
     if(to-from<.25)continue;
     let original;
     try{original=await mediaOrSequence(ppro,await child.getProjectItem(),lookup);}catch(e){issues.push('Inner clip '+(k+1)+': '+e.message);continue;}
     if(!original.path){issues.push('Inner V'+(j+1)+' clip '+(k+1)+' is another nest; deeper visual analysis is skipped.');continue;}
     row.children.push({node:`${j}:${k}:${b.start.toFixed(5)}:${b.end.toFixed(5)}`,track:j,start:b.start,end:b.end,segment_start:t.start+from-t.source_in,segment_end:t.start+to-t.source_in,path:original.path,source_in:b.source_in+from-b.start,duration:to-from});
    }
   }
   if(!row.children.length){issues.push('Nest '+source.sequence.name+': no eligible direct video sources.');continue;}
  } else {
   row.path=source.path;row.source_in=t.source_in;row.duration=t.end-t.start;
  }
  output.push(row);
 }
 if(!output.length)throw Error('No direct video sources available for analysis. '+issues.slice(0,2).join(' '));
 return {snapshot:{sequence:sequence.name,track:idx,clips:output},identity:{guid:String(sequence.guid),track:idx},issues,counts:{outer:output.length,inner:output.reduce((n,c)=>n+(c.children?c.children.length:1),0)},project,sequence};
}
function planZoom(result,opts={}){
 const strength=Math.max(1,Math.min(7,Number(opts.strength)||5)),spacing=Math.max(10,Number(opts.spacing)||12);
 const items=[];let last=-Infinity;
 for(const entry of result.clips||[]){for(const c of entry.children||[entry]){
   const t=Number(c.segment_start===undefined?c.start:c.segment_start),duration=Number(c.end)-Number(c.start);
   if(!Number.isFinite(t)||!Number.isFinite(duration)||c.error||!(c.zoom_percent>0)||!(duration>=.8))continue;
   if(Number(c.scene_change)>.2||t-last<spacing)continue;
   if(typeof opts.accept==='function' && !opts.accept({at:t,entry,c}))continue;
   items.push({outer:entry.node,node:c.node,track:c.track===undefined?null:c.track,start:c.start,end:c.end,at:t,amount:Number(Math.min(strength,Math.max(1,Number(c.zoom_percent)*strength/2)).toFixed(2)),nested:Boolean(entry.children),reason:c.reason||'Low visual movement'});last=t;
 }}
 // Professional pacing: never make dozens of punch-ins on a long podcast.
 // Keep suggestions spread across the whole edit instead of just first N clips.
 if(items.length>24){const selected=[];for(let i=0;i<24;i++)selected.push(items[Math.floor(i*(items.length-1)/23)]);return selected;}
 return items;
}
function planColor(result){
 const weighted=[];
 for(const entry of result.clips||[]){const children=entry.children||[entry];for(const c of children){
   if(c.color&&!c.error){let seconds=Number(c.segment_end)-Number(c.segment_start);if(!(seconds>0))seconds=Number(c.end)-Number(c.start);weighted.push({color:c.color,weight:Number.isFinite(seconds)&&seconds>0?seconds:1});}
 }}
 if(!weighted.length)return null;const total=weighted.reduce((n,x)=>n+x.weight,0),color={};
 for(const k of ['exposure_offset','contrast_offset','temperature_offset'])color[k]=Number((weighted.reduce((n,x)=>n+x.weight*(Number(x.color[k])||0),0)/total).toFixed(2));
 color.exposure_offset=Math.max(-.25,Math.min(.25,color.exposure_offset));color.contrast_offset=Math.max(-7,Math.min(9,color.contrast_offset));color.temperature_offset=Math.max(-4,Math.min(4,color.temperature_offset));
 return {color,analyzed:weighted.length};
}
async function assertSameSequence(ppro,identity){
 const project=await ppro.Project.getActiveProject(),seq=project&&await project.getActiveSequence();if(!seq||String(seq.guid)!==identity.guid)throw Error('Active sequence changed. Analyze again before applying.');return {project,seq};
}
async function findAdjustmentsOnHighestTrack(ppro){
 const project=await ppro.Project.getActiveProject(),seq=project&&await project.getActiveSequence();if(!seq)throw Error('Open active sequence.');
 const count=await seq.getVideoTrackCount(),high=await seq.getVideoTrack(count-1),items=await high.getTrackItems(1,false),layers=[];
 for(const item of items)if(typeof item.isAdjustmentLayer==='function'&&await item.isAdjustmentLayer())layers.push(item);
 return {seq,project,highest:'V'+count,count,items:items.length,layers};
}
function scalar(k){if(typeof k==='number')return k;if(k&&typeof k.value==='number')return k.value;if(k&&k.value&&typeof k.value.value==='number')return k.value.value;return NaN;}
async function findParamOn(item,componentMatch,paramNames){
 const chain=await item.getComponentChain();
 for(let i=0,n=chain.getComponentCount();i<n;i++){
  const c=chain.getComponentAtIndex(i),name=(String(await c.getDisplayName())+' '+String(await c.getMatchName())).toLowerCase();
  if(!componentMatch.test(name))continue;
  for(let j=0,m=c.getParamCount();j<m;j++){
   const p=c.getParam(j),label=String(p.displayName||'').toLowerCase();
   if(paramNames.some(rx=>rx.test(label)))return {param:p,label,component:name};
  }
 }
 return null;
}
function transaction(project,makeAction,description){
 // Adobe 25.6 Action objects must be constructed INSIDE both lock and transaction.
 let ok=false;
 project.lockedAccess(()=>{ok=project.executeTransaction(compound=>{compound.addAction(makeAction());},description);});
 return ok===true;
}
async function applyOneScale(ppro,project,item,percent){
 const found=await findParamOn(item,/motion|حرك|pr\.motion|adbe motion/i,[/^scale$|^uniform scale$|^حجم$|^المقياس$/i]);
 if(!found)return {state:'skipped',reason:'Motion Scale parameter not identified safely'};
 const p=found.param;if(p.isTimeVarying())return {state:'skipped',reason:'Existing animated Scale is protected'};
 const old=scalar(await p.getStartValue());if(!Number.isFinite(old)||old<.25||old>500)return {state:'skipped',reason:'Unsupported Scale value'};
 if(old>110) return {state:'skipped',reason:'Existing strong crop protected (Scale above 110%)'};
 const next=Number((old*(1+percent/100)).toFixed(4));
 if(!transaction(project,()=>p.createSetValueAction(p.createKeyframe(next),true),'EditFlow Smart Zoom'))return {state:'failed',reason:'Premiere rejected Scale action'};
 const actual=scalar(await p.getStartValue());return Math.abs(actual-next)<=Math.max(.001,next*.001)?{state:'applied',old,next}:{state:'failed',reason:'Scale verification failed'};
}
async function applyZoomPlan(ppro,identity,result,plan,allowShared,originalSnapshot){
 const {project,seq}=await assertSameSequence(ppro,identity);
 if(!allowShared)throw Error('A nested sequence may be shared. Confirm permission before applying inside it.');
 if(plan.length>30)throw Error('Safety limit: at most 30 zoom changes per run.');
 const lookup=await sequenceLookup(project),track=await seq.getVideoTrack(identity.track),outer=await track.getTrackItems(1,false);
 const indexed=new Map();for(let i=0;i<outer.length;i++){const t=await bounds(outer[i]);indexed.set(`${identity.track}:${i}:${t.start.toFixed(5)}:${t.end.toFixed(5)}`,outer[i]);}
 let applied=0,skipped=0,failed=0;const notes=[],edited=new Set();
 for(const z of plan){
  if(!z.nested){skipped++;notes.push('Direct clip zoom skipped: inside-nest mode only.');continue;}
  const original=indexed.get(z.outer);if(!original){skipped++;notes.push('Timeline changed: outer clip not found.');continue;}
  const t=await bounds(original),pi=await original.getProjectItem(),source=await mediaOrSequence(ppro,pi,lookup);
  if(!source.sequence){skipped++;notes.push('Nest no longer resolves.');continue;}
  const relevant=(result.clips||[]).find(x=>x.node===z.outer);
  if(!relevant||String(relevant.nested_id)!==String(source.id)){skipped++;notes.push('Nest identity changed.');continue;}
  const editKey=String(source.id)+'|'+String(z.node);
  if(edited.has(editKey)){skipped++;notes.push('Shared inner clip appears more than once: zoom not applied twice.');continue;}
  const ref=originalSnapshot&&originalSnapshot.clips.find(c=>c.node===z.outer);
  const originalChild=ref&&ref.children&&ref.children.find(c=>c.node===z.node);
  if(!originalChild){skipped++;notes.push('Original analyzed source missing.');continue;}
  const tr=await source.sequence.getVideoTrack(z.track);
  if(!tr){skipped++;continue;}
  const inner=await tr.getTrackItems(1,false);let target=null;
  for(let i=0;i<inner.length;i++){const b=await bounds(inner[i]);if(`${z.track}:${i}:${b.start.toFixed(5)}:${b.end.toFixed(5)}`===z.node){target=inner[i];break;}}
  if(!target){skipped++;notes.push('Inner clip changed.');continue;}
  const media=await mediaOrSequence(ppro,await target.getProjectItem(),lookup);
  if(!media.path||String(media.path).toLowerCase()!==String(originalChild.path).toLowerCase()){skipped++;notes.push('Inner source file changed since analysis.');continue;}
  try{const out=await applyOneScale(ppro,project,target,z.amount);if(out.state==='applied'){applied++;edited.add(editKey);}else if(out.state==='failed'){failed++;notes.push(out.reason);}else {skipped++;notes.push(out.reason);}}
  catch(e){failed++;notes.push(String(e.message||e).slice(0,130));}
 }
 return {applied,skipped,failed,notes:notes.slice(0,6),warning:'Changes to inner clips can affect ALL uses of a shared nested sequence.'};
}
// M2.6: use a genuine Premiere Adjustment Layer as a reusable source.
// 25.6 UXP exposes no documented createAdjustmentLayer() factory. Never substitute
// transparent video or a sequence. Find a real donor or an explicitly named template.
async function findAdjustmentSource(ppro,project,activeSequence){
 const sequences=await project.getSequences();
 for(const seq of [activeSequence,...sequences.filter(s=>String(s.guid)!==String(activeSequence.guid))]){
  for(let j=0,n=await seq.getVideoTrackCount();j<n;j++){
   const track=await seq.getVideoTrack(j),items=await track.getTrackItems(1,false);
   for(const item of items){
    if(typeof item.isAdjustmentLayer==='function'&&await item.isAdjustmentLayer()){
     const p=await item.getProjectItem();if(p)return {projectItem:p,from:'V'+(j+1)+' in '+seq.name,verified:true};
    }
   }
  }
 }
 // A standalone project template can also be used, named explicitly by the editor.
 // A post-insertion isAdjustmentLayer() check is mandatory.
 const root=await project.getRootItem();const queue=[root],visited=new Set();
 while(queue.length&&visited.size<200){
  const folder=queue.shift();if(!folder||visited.has(folder))continue;visited.add(folder);
  if(typeof folder.getItems!=='function')continue;
  for(const item of await folder.getItems()){
   if(String(item.name).trim().toLowerCase()==='editflow - ai color template')return {projectItem:item,from:'project template bin',verified:false};
   if(typeof item.getItems==='function')queue.push(item);
  }
 }
 throw Error('No reusable Adjustment Layer found. ONE-TIME SETUP: File > New > Adjustment Layer in Premiere, rename its Project Panel item to "EditFlow - AI Color Template". Then click Apply again. Do not add a layer manually every video.');
}
async function ensureTopAdjustmentLayer(ppro,expectedGuid){
 const x=await findAdjustmentsOnHighestTrack(ppro);
 if(expectedGuid && String(x.seq.guid)!==String(expectedGuid))throw Error('Active sequence changed; analyze again.');
 const seq=x.seq,project=x.project,end=numeric(await seq.getEndTime(),'sequence end');
 if(!(end>0))throw Error('Sequence has no content; no color layer inserted.');
 let item;
 if(x.layers.length===1&&x.items===1){item=x.layers[0];}
 else {
  const source=await findAdjustmentSource(ppro,project,seq);
  if(!ppro.SequenceEditor||!ppro.TickTime)throw Error('UXP SequenceEditor/TickTime unavailable.');
  const editor=ppro.SequenceEditor.getEditor(seq),zero=ppro.TickTime.createWithSeconds(0);
  const before=x.count;
  // When index is equal to videoTrackCount, Premiere creates a NEW highest track.
  const success=transaction(project,()=>editor.createInsertProjectItemAction(source.projectItem,zero,before,0,true),'EditFlow Insert AI Color Adjustment Layer');
  if(!success)throw Error('Premiere rejected creation of top track with the Adjustment Layer. No color changes applied.');
  const after=await seq.getVideoTrackCount();
  if(after!==before+1)throw Error('Insertion did not create a verified new top track. Inspect Premiere and undo the last insert if needed.');
  const track=await seq.getVideoTrack(after-1),all=await track.getTrackItems(1,false);
  const layers=[];for(const it of all)if(await it.isAdjustmentLayer())layers.push(it);
  if(all.length!==1||layers.length!==1)throw Error('Top track insertion was not a genuine Adjustment Layer. Undo the last insert in Premiere; no color applied.');
  item=layers[0];
 }
 // Extend/crop to existing sequence content; verify the resulting timeline range.
 const inT=numeric(await item.getStartTime(),'adjustment start'),outT=numeric(await item.getEndTime(),'adjustment end');
 if(Math.abs(inT)>.08||Math.abs(outT-end)>.08){
  if(typeof item.createSetStartAction!=='function'||typeof item.createSetEndAction!=='function')throw Error('Adjustment layer exists but cannot be resized with this UXP host.');
  const ok=transaction(project,()=>item.createSetStartAction(ppro.TickTime.createWithSeconds(0)),'EditFlow Color Layer Start');
  const ok2=transaction(project,()=>item.createSetEndAction(ppro.TickTime.createWithSeconds(end)),'EditFlow Color Layer Duration');
  if(!ok||!ok2)throw Error('Could not size Adjustment Layer to sequence duration; color not applied.');
 }
 const actualStart=numeric(await item.getStartTime(),'adjustment start'),actualEnd=numeric(await item.getEndTime(),'adjustment end');
 if(Math.abs(actualStart)>.08||Math.abs(actualEnd-end)>.08)throw Error('Adjustment Layer duration mismatch ('+actualEnd.toFixed(2)+' vs '+end.toFixed(2)+'s). No color applied.');
 return {track:'V'+await seq.getVideoTrackCount(),duration:end,verified:true};
}
async function prepareLumetriOnTop(ppro){
 const x=await findAdjustmentsOnHighestTrack(ppro);
 if(x.layers.length!==1||x.items!==1)throw Error('Create ONE real Adjustment Layer on highest track '+x.highest+' first. Do not add Lumetri manually; this tool can add it.');
 const item=x.layers[0],chain=await item.getComponentChain();
 for(let i=0,n=chain.getComponentCount();i<n;i++){
  const c=chain.getComponentAtIndex(i);
  const existingMatch=String(await c.getMatchName()).trim();
  if(/lumetri/i.test(existingMatch+' '+String(await c.getDisplayName()))){
   if(!/^(AE|PR)\.ADBE Lumetri$/i.test(existingMatch))throw Error('Unsupported existing Lumetri variant: '+existingMatch+'. No effect added or changed.');
   return {state:'already-present',track:x.highest};
  }
 }
 const factory=ppro.VideoFilterFactory;
 if(!factory||typeof factory.getMatchNames!=='function'||typeof factory.createComponent!=='function')throw Error('Premiere 25.6 VideoFilterFactory is unavailable. Add Lumetri manually.');
 // Premiere can expose multiple Lumetri-related filters (e.g. Premiere vs AE).
 // Do not reject the valid Premiere Lumetri just because another name contains "Lumetri".
 // Prefer Adobe's documented Lumetri Color matchName over fuzzy matches; never select an unknown variant.
 const names=await factory.getMatchNames();
 const possible=Array.from(new Set(names.filter(n=>typeof n==='string'&&/lumetri/i.test(n))));
 const lumetriColor=possible.filter(n=>n.trim().toLowerCase()==='ae.adbe lumetri');
 const premiereAlternate=possible.filter(n=>n.trim().toLowerCase()==='pr.adbe lumetri');
 const selected=lumetriColor.length===1?lumetriColor[0]:(premiereAlternate.length===1?premiereAlternate[0]:null);
 if(!selected){
  const choices=possible.length?possible.join(' | '):'(none)';
  throw Error('Cannot safely select Lumetri Color. Available matchNames: '+choices+'. No effect added. Send this message to the developer.');
 }
 const effect=await factory.createComponent(selected);
 if(!effect)throw Error('Premiere could not construct Lumetri Color ('+selected+').');
 const previousCount=chain.getComponentCount();
 if(!transaction(x.project,()=>chain.createAppendComponentAction(effect),'EditFlow Add Lumetri Color'))throw Error('Premiere rejected Lumetri effect insertion.');
 const refreshed=await item.getComponentChain(),afterCount=refreshed.getComponentCount();
 if(afterCount!==previousCount+1)throw Error('Effect transaction ran, but component count did not increase by one. Inspect Effect Controls before retrying.');
 // Check only the newly appended component, not any older effects.
 const added=refreshed.getComponentAtIndex(afterCount-1);
 const actualMatch=String(await added.getMatchName()),actualDisplay=String(await added.getDisplayName());
 const verified=actualMatch.trim().toLowerCase()===selected.trim().toLowerCase();
 if(!verified)throw Error('Appended effect could not be verified as Lumetri Color. Found '+actualMatch+'. Inspect Effect Controls before retrying.');
 return {state:'added-and-verified',track:x.highest,matchName:selected};
}
// Resolve only recognisable, unambiguous Lumetri Basic Correction labels.
// Premiere may decorate a parameter label (e.g. "Basic Correction > Contrast").
function colorParamType(label){
 const t=String(label||'').trim().toLowerCase().replace(/\s+/g,' ');
 const rules={
  exposure:[/^exposure$|^التعريض$/,/(?:^|[ >:—-])exposure$/],
  contrast:[/^contrast$|^التباين$/,/(?:^|[ >:—-])contrast$/],
  temperature:[/^temperature$|^temp$|^درجة الحرارة$/,/(?:^|[ >:—-])temperature$/],
  saturation:[/^saturation$|^التشبع$/,/(?:^|[ >:—-])saturation$/],
  highlights:[/^highlights$/,/(?:^|[ >:—-])highlights$/],
  shadows:[/^shadows$/,/(?:^|[ >:—-])shadows$/],
  whites:[/^whites$/,/(?:^|[ >:—-])whites$/],
  blacks:[/^blacks$/,/(?:^|[ >:—-])blacks$/]
 };
 for(const [key,regex] of Object.entries(rules))if(regex.some(r=>r.test(t)))return key;
 return null;
}
// Premiere UXP flattens Lumetri into a single ordered list of parameters.
// "Temperature", "Contrast" and "Saturation" appear in more than one Lumetri section.
// The ordering exposes "Basic Correction" and "Creative" headings (as reported in
// the actual Premiere 25.6.2 parameter dump).  Pick parameters *inside* Basic
// Correction instead of treating names repeated elsewhere as ambiguous.
function lumetriSectionHeader(label){
 const t=String(label||'').trim().toLowerCase().replace(/\s+/g,' ');
 if(t==='basic correction'||t==='basic corrections'||t==='التصحيح الأساسي')return 'basic';
 if(['creative','curves','color wheels & match','hsl secondary','vignette',
     'hsl','color wheels','hdr range'].includes(t))return 'other';
 return null;
}
function explicitBasicCorrectionLabel(label){
 return /^basic correction\s*[>:—-]/i.test(String(label||'').trim());
}
async function inspectLumetri(layer){
 const chain=await layer.getComponentChain(),inventory=[],controls={},repeated=new Set(),effects=[];
 let hasBasicHeading=false;
 const candidateMap={};
 for(let i=0,n=chain.getComponentCount();i<n;i++){
  const comp=chain.getComponentAtIndex(i);
  const match=String(await comp.getMatchName()),name=String(await comp.getDisplayName());
  if(!/lumetri/i.test(match+' '+name))continue;
  effects.push({match,name});
  let currentSection='unknown';
  for(let j=0,m=comp.getParamCount();j<m;j++){
   const p=comp.getParam(j),label=String(p.displayName||'');
   const heading=lumetriSectionHeader(label);
   if(heading){currentSection=heading;if(heading==='basic')hasBasicHeading=true;}
   let start=null;try{const value=scalar(await p.getStartValue());if(Number.isFinite(value))start=value;}catch(_){}
   const key=colorParamType(label);
   const section=explicitBasicCorrectionLabel(label)?'basic':(/^(creative|curves|color wheels|hsl|vignette)\s*[>:—-]/i.test(label)?'other':currentSection);
   if(key){
    if(!candidateMap[key])candidateMap[key]=[];
    candidateMap[key].push({param:p,label,start,section,index:j});
   }
   inventory.push({label,value:start,section});
  }
 }
 const resolvedBy={};
 for(const [key,candidates] of Object.entries(candidateMap)){
  // A real Basic Correction header is authoritative.  If the requested
  // control is absent inside it, never fall back to Creative or Curves.
  const basic=candidates.filter(p=>p.section==='basic');
  const eligible=hasBasicHeading?basic:(basic.length?basic:candidates.filter(p=>p.section!=='other'));
  if(eligible.length===1){
   const hit=eligible[0];controls[key]={param:hit.param,label:hit.label,start:hit.start,index:hit.index};
   resolvedBy[key]=hasBasicHeading?'Basic Correction section':(basic.length?'Explicit Basic Correction label':'Unique label');
  } else if(eligible.length>1)repeated.add(key);
 }
 return {effects,controls,ambiguous:[...repeated],inventory,hasBasicHeading,resolvedBy};
}
async function inspectColorParamsOnTop(ppro){
 const found=await findAdjustmentsOnHighestTrack(ppro);const candidates=[];
 for(const layer of found.layers){const data=await inspectLumetri(layer);const disabled=typeof layer.isDisabled==='function'?await layer.isDisabled():null;candidates.push({disabled,lumetri:data.effects,recognized:Object.fromEntries(Object.entries(data.controls).map(([k,v])=>[k,{label:v.label,value:v.start}])),ambiguous:data.ambiguous,parameterNames:data.inventory.map(p=>p.label).filter(Boolean).slice(0,65),basicCorrectionFound:data.hasBasicHeading,resolvedBy:data.resolvedBy});}
 return {highest:found.highest,adjustments:found.layers.length,layers:candidates};
}
async function applyColorToTop(ppro,identity,plan,opts={}){
 await assertSameSequence(ppro,identity);
 const x=await findAdjustmentsOnHighestTrack(ppro);
 if(x.layers.length!==1)throw Error('Place exactly one Adjustment Layer on the HIGHEST video track ('+x.highest+'). Found '+x.layers.length+'.');
 if(x.items!==1)throw Error('Highest track should contain only the color Adjustment Layer.');
 const layer=x.layers[0];
 if(typeof layer.isDisabled==='function'&&await layer.isDisabled())throw Error('The highest Adjustment Layer is DISABLED. Enable its clip in Premiere before applying colors.');
 const data=await inspectLumetri(layer);
 if(data.effects.length!==1)throw Error('Exactly one Lumetri Color effect must be on the top Adjustment Layer. Found '+data.effects.length+'.');
 if(!/^(AE|PR)\.ADBE Lumetri$/i.test(data.effects[0].match.trim()))throw Error('Unsupported existing Lumetri variant: '+data.effects[0].match);
 const c=plan.color||{};
 const wanted={exposure:Number(c.exposure_offset),contrast:Number(c.contrast_offset),temperature:Number(c.temperature_offset),saturation:Number(c.saturation)};
 if(!Number.isFinite(wanted.saturation))delete wanted.saturation;
 for(const key of ['highlights','shadows','whites','blacks'])if(Object.prototype.hasOwnProperty.call(c,key))wanted[key]=Number(c[key]);
 const defaults={exposure:0,contrast:0,temperature:0,saturation:100,highlights:0,shadows:0,whites:0,blacks:0};
 const notes=[],applied=[],already=[],outcomes=[];
 if(data.ambiguous.length)notes.push('Ambiguous Lumetri controls: '+data.ambiguous.join(', '));
 const limits={exposure:[-5,5],contrast:[-100,100],temperature:[-100,100],saturation:[0,200],highlights:[-100,100],shadows:[-100,100],whites:[-100,100],blacks:[-100,100]};
 for(const [name,next] of Object.entries(wanted)){
  const row={name,requested:next,before:null,after:null,state:'skipped',writeAttempted:false};outcomes.push(row);
  const skip=reason=>{row.reason=reason;notes.push(name+': '+reason);};
  try{
   if(!Number.isFinite(next)||next<limits[name][0]||next>limits[name][1]){skip('invalid/out-of-range suggested value');continue;}
   // Reacquire native wrappers for each write: previous transactions may invalidate them.
   const fresh=await inspectLumetri(layer),hit=fresh.controls[name];
   if(fresh.effects.length!==1){skip('Lumetri effect count changed');continue;}
   if(!hit){skip('Basic Correction control missing or ambiguous');continue;}
   const p=hit.param,old=hit.start;row.before=old;row.label=hit.label;row.parameterIndex=hit.index;
   if(!Number.isFinite(old)){skip('cannot read current numeric value');continue;}
   if(await p.isTimeVarying()){skip('animated value protected');continue;}
   if(Math.abs(next-old)<.015){row.state='already';row.after=old;already.push({name,value:old});continue;}
   if(!opts.replaceExisting&&Math.abs(old-defaults[name])>1e-6){skip('existing value '+old+' protected (enable Re-grade to replace it)');continue;}
   row.writeAttempted=true;
   const accepted=transaction(x.project,()=>p.createSetValueAction(p.createKeyframe(next),true),'EditFlow Verified AI Color '+name);
   const readback=await inspectLumetri(layer),observed=readback.controls[name];
   row.after=observed?observed.start:null;
   if(!accepted){row.state='failed';skip('Premiere rejected parameter update; inspect after value');continue;}
   if(!observed||observed.index!==hit.index||!Number.isFinite(row.after)||Math.abs(row.after-next)>.02){row.state='failed';skip('write verification failed');continue;}
   row.state='applied';applied.push({name,label:hit.label,before:old,after:row.after});
  }catch(e){row.state='failed';skip(String(e.message||e).slice(0,240));}
 }
 if(applied.length===0){
  if(already.length===Object.keys(wanted).length)notes.unshift('All requested values already match; nothing needed changing.');
  else notes.unshift('No color controls changed. Check specific skip reasons below; Re-grade only overrides non-default existing values, never missing or animated controls.');
 }
 const total=Object.keys(wanted).length;
 return {applied,already,total,outcomes,visualVerification:'pending-user-fx-toggle',failed:outcomes.filter(x=>x.state==='failed').length,skipped:total-applied.length-already.length,
  regradeRequested:!!opts.replaceExisting,notes,track:x.highest,verifiedValues:applied.length>0,
  diagnostics:{effects:data.effects,recognized:Object.keys(data.controls),ambiguous:data.ambiguous,availableLabels:data.inventory.map(p=>p.label).filter(Boolean).slice(0,65),basicCorrectionFound:data.hasBasicHeading,resolvedBy:data.resolvedBy},
  warning:'Verified parameter values are not proof of a visible improvement; toggle Lumetri FX in Program Monitor to compare.'};
}
module.exports={readVisualSnapshot,planZoom,planColor,findAdjustmentsOnHighestTrack,inspectColorParamsOnTop,findAdjustmentSource,ensureTopAdjustmentLayer,prepareLumetriOnTop,applyZoomPlan,applyColorToTop};

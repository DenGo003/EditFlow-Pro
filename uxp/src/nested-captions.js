// Read-only timeline audio flattening for Premiere 25.6 UXP.
// Returns the existing Python backend's sequence_caption snapshot format.
const MEDIA=/\.(wav|mp3|m4a|aac|flac|aiff?|wma|mp4|mov|mkv|mxf|avi|webm)$/i;
const EPS=0.035;
function check(x,label){if(!Number.isFinite(x))throw Error('Invalid '+label);return x;}
async function seconds(fn,label){const x=await fn();return check(Number(x.seconds),label);}
async function timing(item){
  const start=await seconds(()=>item.getStartTime(),'clip start');
  const end=await seconds(()=>item.getEndTime(),'clip end');
  const si=await seconds(()=>item.getInPoint(),'source in');
  const so=await seconds(()=>item.getOutPoint(),'source out');
  const speed=typeof item.getSpeed==='function'?Number(await item.getSpeed()):1;
  const reversed=typeof item.isSpeedReversed==='function'?Boolean(await item.isSpeedReversed()):false;
  if(!Number.isFinite(speed)||Math.abs(speed-1)>0.005||reversed)throw Error('Retimed or reversed audio is not supported for subtitles.');
  if(end<=start||so<=si||Math.abs((end-start)-(so-si))>0.1)throw Error('Invalid or retimed nested audio clip bounds.');
  return {start,end,si,so};
}
async function sequenceLookup(project){
  const map=new Map();
  for(const seq of await project.getSequences()){
    const item=await seq.getProjectItem();
    if(item&&typeof item.getId==='function')map.set(String(item.getId()),seq);
  }
  return map;
}
async function mediaOrSequence(ppro,projectItem,lookup){
  if(!projectItem)throw Error('Clip has no Premiere ProjectItem.');
  const id=typeof projectItem.getId==='function'?String(projectItem.getId()):'';
  if(id&&lookup.has(id))return {sequence:lookup.get(id),id};
  const clip=ppro.ClipProjectItem&&ppro.ClipProjectItem.cast ? await ppro.ClipProjectItem.cast(projectItem):null;
  if(!clip)throw Error('Cannot cast source item to ClipProjectItem.');
  if(typeof clip.isSequence==='function'&&await clip.isSequence()){
    if(typeof clip.getSequence==='function'){
      const sequence=await clip.getSequence();
      if(sequence)return {sequence,id:id||String(sequence.guid)};
    }
    throw Error('Nested sequence cannot be resolved: '+String(projectItem.name||'unknown'));
  }
  const path=typeof clip.getMediaFilePath==='function'?String(await clip.getMediaFilePath()||''):'';
  if(!MEDIA.test(path))throw Error('Audio source is not a supported local media file: '+String(projectItem.name||'unknown'));
  return {path};
}
async function flattenCaptionTrack(ppro,trackIndex){
  const project=await ppro.Project.getActiveProject();
  if(!project)throw Error('Open a project first.');
  const sequence=await project.getActiveSequence();
  if(!sequence)throw Error('Open a sequence first.');
  const lookup=await sequenceLookup(project);
  const track=await sequence.getAudioTrack(Number(trackIndex));
  if(!track)throw Error('Selected A'+(Number(trackIndex)+1)+' does not exist.');
  const outputs=[];
  async function walk(seq,idx,transform,depth,visited){
    if(depth>6)throw Error('Nested sequences deeper than 6 levels are not supported.');
    const currentTrack=await seq.getAudioTrack(idx);
    if(!currentTrack)throw Error('Nested sequence has no audio track A'+(idx+1)+'.');
    const items=await currentTrack.getTrackItems(1,false);
    for(const item of items){
      const t=await timing(item);
      // transform maps source-sequence seconds -> active timeline seconds,
      // and clips the parent's nested source window.
      const from=Math.max(t.start,transform.from),to=Math.min(t.end,transform.to);
      if(to<=from+EPS)continue;
      const pi=await item.getProjectItem();
      const source=await mediaOrSequence(ppro,pi,lookup);
      const parentStart=transform.offset+from;
      const parentEnd=transform.offset+to;
      if(source.sequence){
        if(visited.has(source.id))throw Error('Nested sequence cycle detected.');
        let selected=-1;
        for(let ai=0,n=await source.sequence.getAudioTrackCount();ai<n;ai++){
          const audioTrack=await source.sequence.getAudioTrack(ai);
          const candidates=await audioTrack.getTrackItems(1,false);
          if(candidates.length){
            if(selected!==-1)throw Error('Nest '+source.sequence.name+' contains multiple nonempty audio tracks. Cannot guess which is speech.');
            selected=ai;
          }
        }
        if(selected===-1)throw Error('Nest '+source.sequence.name+' has no audio clips.');
        const next={from:t.si+(from-t.start),to:t.si+(to-t.start),offset:transform.offset+t.start-t.si};
        await walk(source.sequence,selected,next,depth+1,new Set([...visited,source.id]));
      }else{
        const sourceIn=t.si+(from-t.start),sourceOut=t.si+(to-t.start);
        outputs.push({path:source.path,start:parentStart,end:parentEnd,source_in:sourceIn,source_out:sourceOut});
      }
    }
  }
  // Flatten from full active timeline range. Source item timing is relative to each sequence.
  await walk(sequence,Number(trackIndex),{from:0,to:14400,offset:0},0,new Set());
  outputs.sort((a,b)=>a.start-b.start);
  if(!outputs.length)throw Error('No resolvable audio clips found on selected track.');
  if(outputs.length>500)throw Error('More than 500 audio clips. Cannot create subtitle snapshot.');
  for(let i=0;i<outputs.length;i++){
    const c=outputs[i];
    if(c.start<0||c.end<=c.start||c.source_in<0)throw Error('Invalid audio timeline mapping at clip '+(i+1));
  }
  const duration=await seconds(()=>sequence.getEndTime(),'sequence end');
  const end=Math.max(duration,...outputs.map(x=>x.end));
  if(end>14400)throw Error('Sequence exceeds 4-hour caption limit.');
  return {snapshot:{duration:end,clips:outputs},info:{sequence:sequence.name,track:'A'+(Number(trackIndex)+1),sourceClips:outputs.length,nested:true}};
}
module.exports={flattenCaptionTrack,sequenceLookup,mediaOrSequence};

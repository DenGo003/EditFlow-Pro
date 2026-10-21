// Read-only Premiere 25.6+ timeline inspection and source resolution.
async function activeSequence(ppro) {
  if (!ppro.Project || typeof ppro.Project.getActiveProject !== 'function') throw Error('Premiere UXP Project API unavailable.');
  const project = await ppro.Project.getActiveProject();
  if (!project) throw Error('Open a Premiere project first.');
  const sequence = await project.getActiveSequence();
  if (!sequence) throw Error('Open an active sequence in Premiere first.');
  return {project,sequence};
}
async function trackDetails(ppro, track, index, kind) {
  const items = await track.getTrackItems(1,false);
  const clips=[];
  for (const item of items) {
    let name='(Unnamed clip)', path='',reason='';
    try {if(typeof item.getName==='function') name=await item.getName();}catch(_){}
    try {
      const projectItem=await item.getProjectItem();
      const clipItem=ppro.ClipProjectItem && typeof ppro.ClipProjectItem.cast==='function' ? await ppro.ClipProjectItem.cast(projectItem):null;
      if(clipItem && typeof clipItem.getMediaFilePath==='function') path=String(await clipItem.getMediaFilePath()||'');
      if(!path) reason='Nested sequence, generated item, or no directly resolvable local media path';
    } catch(e) {reason='Source resolution unavailable: '+String(e&&e.message||e).slice(0,110);}
    let timing=null;
    try {
      const [start,end,sourceIn,sourceOut,speed,reversed]=await Promise.all([
        item.getStartTime(),item.getEndTime(),item.getInPoint(),item.getOutPoint(),item.getSpeed(),item.isSpeedReversed()
      ]);
      timing={start:Number(start.seconds),end:Number(end.seconds),source_in:Number(sourceIn.seconds),source_out:Number(sourceOut.seconds),speed:Number(speed),reversed:Boolean(reversed)};
      if(!Object.values(timing).every(v=>typeof v==='boolean'||Number.isFinite(v)))timing=null;
    }catch(e){reason=(reason?reason+'; ':'')+'Timeline timing unavailable: '+String(e&&e.message||e).slice(0,100);}
    clips.push({name,path,reason,timing});
  }
  return {index,kind,name:track.name||kind+' '+(index+1),clips};
}
async function readTimelineSources(ppro) {
  const {project,sequence}=await activeSequence(ppro);
  const videoTracks=[],audioTracks=[];
  for(let i=0,n=await sequence.getVideoTrackCount();i<n;i++)videoTracks.push(await trackDetails(ppro,await sequence.getVideoTrack(i),i,'video'));
  for(let i=0,n=await sequence.getAudioTrackCount();i<n;i++)audioTracks.push(await trackDetails(ppro,await sequence.getAudioTrack(i),i,'audio'));
  return {project:project.name,sequence:sequence.name,videoTracks,audioTracks};
}
function syncSourceFromTrack(snapshot,index,kind) {
  if(!snapshot)throw Error('Read Active Timeline first.');
  const tracks=kind==='video'?snapshot.videoTracks:snapshot.audioTracks;
  const track=tracks[Number(index)];
  if(!track)throw Error('Selected '+kind+' track is unavailable; read timeline again.');
  if(track.clips.length!==1)throw Error((kind==='video'?'V':'A')+(track.index+1)+' has '+track.clips.length+' clips. Timeline-based sync needs one direct-source clip per selected audio track; automatic multi-clip/nested sync is not yet implemented.');
  const clip=track.clips[0];
  if(!clip.path || !/\.(wav|mp3|m4a|aac|flac|aiff?|wma|mp4|mov|mkv|mxf|avi|webm)$/i.test(clip.path))throw Error((kind==='video'?'V':'A')+(track.index+1)+' source cannot be resolved as media: '+(clip.reason||clip.name));
  return clip.path;
}
function cutClip(snapshot,index,kind){
  const tracks=kind==='video'?snapshot.videoTracks:snapshot.audioTracks;
  const t=tracks.find(x=>x.index===index);
  if(!t||t.clips.length!==1)throw Error((kind==='video'?'V':'A')+(index+1)+' requires exactly one direct-source clip for this safe AutoCut XML workflow.');
  const c=t.clips[0];
  if(!c.path||!c.timing)throw Error('Could not read media path or timeline timing on '+(kind==='video'?'V':'A')+(index+1)+'. '+(c.reason||''));
  const k=c.timing;
  if(k.reversed||Math.abs(k.speed-1)>0.005)throw Error('Retimed or reversed clips are unsupported; no cut created.');
  if(k.end<=k.start||k.source_out<=k.source_in||Math.abs((k.end-k.start)-(k.source_out-k.source_in))>0.1)
    throw Error('Clip duration or source in/out does not match timeline; no cut created.');
  return {path:c.path,start:k.start,end:k.end,source_in:k.source_in,source_out:k.source_out};
}
function separateMicCutSnapshot(snapshot,videoIdx,micIdx){
  const v=cutClip(snapshot,videoIdx,'video'),m=cutClip(snapshot,micIdx,'audio');
  if(v.path.toLowerCase()===m.path.toLowerCase())throw Error('Choose a separate microphone source rather than embedded camera audio.');
  if(Math.abs(v.start)>0.02||Math.abs(m.start)>0.02)throw Error('This AutoCut backend needs video and mic aligned from timeline 00:00. Please sync first; no changes made.');
  if(m.end+0.15<v.end)throw Error('Microphone does not cover the video end; no cut generated.');
  return {video:v,mic:m,micTrack:micIdx+1};
}
async function inspectTimeline(ppro) {
  const snap=await readTimelineSources(ppro);
  return {project:snap.project,sequence:snap.sequence,videoTracks:snap.videoTracks.map(t=>({index:t.index,name:t.name,clips:t.clips.length})),audioTracks:snap.audioTracks.map(t=>({index:t.index,name:t.name,clips:t.clips.length})),timelineChanges:0};
}
module.exports={inspectTimeline,readTimelineSources,syncSourceFromTrack,separateMicCutSnapshot};

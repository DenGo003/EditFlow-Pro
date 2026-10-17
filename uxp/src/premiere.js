async function inspectTimeline(ppro) {
  if (!ppro.Project || typeof ppro.Project.getActiveProject!=='function') throw Error('Premiere UXP project API unavailable.');
  const project=await ppro.Project.getActiveProject();
  if (!project) return {message:'No project open'};
  const sequence=await project.getActiveSequence();
  if (!sequence) return {project:project.name,message:'No active sequence'};
  const count=await sequence.getVideoTrackCount(), tracks=[];
  for(let i=0;i<count;i++) {
    const track=await sequence.getVideoTrack(i);
    const items=await track.getTrackItems(1,false); // documented Clip enum = 1
    tracks.push({index:await track.getIndex(),name:track.name,clips:items.length});
  }
  // Read-only; no transaction, import, save or keyframe mutation.
  return {project:project.name,sequence:sequence.name,videoTracks:tracks,audioTrackCount:await sequence.getAudioTrackCount(),timelineChanges:0};
}
module.exports={inspectTimeline};

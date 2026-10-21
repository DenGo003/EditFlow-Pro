function editflowImport(path) {
    try {
        if (!app.project) return 'ERROR: Open a Premiere project first.';
        var paths = [path];
        var result = app.project.importFiles(paths, true, app.project.rootItem, false);
        if (result === false) return 'ERROR: Premiere rejected the import: ' + path;
        return 'OK';
    } catch (e) { return 'ERROR: ' + e.toString(); }
}

function editflowTrackInfo(cameraIndex, micIndex) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return 'ERROR: Open a sequence in Premiere first.';
        if (cameraIndex === micIndex) return 'ERROR: Choose two different audio tracks.';
        if (cameraIndex<0 || micIndex<0 || cameraIndex>=seq.audioTracks.numTracks || micIndex>=seq.audioTracks.numTracks) return 'ERROR: Selected audio track does not exist.';
        var ca=seq.audioTracks[cameraIndex], mi=seq.audioTracks[micIndex];
        if (ca.clips.numItems!==1 || mi.clips.numItems!==1) return 'ERROR: Preview safety requires exactly one audio clip on each selected track. No edits were made.';
        var c=ca.clips[0], m=mi.clips[0];
        if (!c.projectItem || !m.projectItem) return 'ERROR: Track has no source media.';
        var cp=c.projectItem.getMediaPath(), mp=m.projectItem.getMediaPath();
        if (!cp || !mp) return 'ERROR: Both clips must point to local source media.';
        return JSON.stringify({sequence:seq.name,cameraTrack:cameraIndex+1,micTrack:micIndex+1,
            cameraPath:cp,micPath:mp,cameraStart:Number(c.start.seconds),micStart:Number(m.start.seconds),
            cameraIn:Number(c.inPoint.seconds),micIn:Number(m.inPoint.seconds),
            cameraNode:String(c.nodeId),micNode:String(m.nodeId),
            cameraDisabled:Boolean(c.disabled),micDisabled:Boolean(m.disabled)});
    } catch(e) { return 'ERROR: '+e.toString(); }
}
function editflowApplySync(cameraIndex,micIndex,cameraNode,micNode,originalCamStart,originalMicStart,shift,muteCamera){
    try {
        var seq=app.project.activeSequence;
        if (!seq) return 'ERROR: No active sequence.';
        if(cameraIndex===micIndex || cameraIndex<0 || micIndex<0 || cameraIndex>=seq.audioTracks.numTracks || micIndex>=seq.audioTracks.numTracks) return 'ERROR: Invalid track selection.';
        var ca=seq.audioTracks[cameraIndex], mi=seq.audioTracks[micIndex];
        if(ca.clips.numItems!==1 || mi.clips.numItems!==1) return 'ERROR: Tracks changed. Analyze again.';
        var c=ca.clips[0],m=mi.clips[0];
        if(String(c.nodeId)!==cameraNode || String(m.nodeId)!==micNode) return 'ERROR: Clips changed. Analyze again.';
        if(Math.abs(Number(c.start.seconds)-originalCamStart)>0.02 || Math.abs(Number(m.start.seconds)-originalMicStart)>0.02) return 'ERROR: Timeline changed. Analyze again.';
        if(!isFinite(shift) || Math.abs(shift)>60) return 'ERROR: Unsafe sync offset.';
        var target=originalCamStart+shift;
        // A mic with a negative start can instead be slipped into its source at timeline zero.
        // Restrict this preview workaround to small negative starts and a single uncut clip.
        if (target < -0.000001) {
            var trim=-target;
            if (trim>0.25 || originalMicStart>0.001 || Math.abs(originalCamStart)>0.001)
                return 'ERROR: Negative offset exceeds safe preview range (0.25s) or clips are not at timeline zero; no changes made.';
            var oldIn=Number(m.inPoint.seconds), oldOut=Number(m.outPoint.seconds);
            var oldStart=Number(m.start.seconds), oldEnd=Number(m.end.seconds);
            if (!isFinite(oldIn)||!isFinite(oldOut)||!isFinite(oldStart)||!isFinite(oldEnd)||oldOut-oldIn<trim+0.02)
                return 'ERROR: Mic has insufficient source range for negative offset; no changes made.';
            var changed=false;
            try {
                // A time-zero clip cannot be moved into negative timeline time.
                // Slipping the SOURCE in-point forward by trim plays what would
                // have appeared at timeline zero after a negative move.
                var newIn=new Time();newIn.seconds=oldIn+trim;
                m.inPoint=newIn;
                changed=true;
                // Trim visible end by the same amount, preventing extension
                // beyond the original source out-point.
                var newEnd=new Time();newEnd.seconds=oldEnd-trim;
                m.end=newEnd;
                var a=Number(m.inPoint.seconds), b=Number(m.start.seconds), e=Number(m.end.seconds);
                if(Math.abs(a-(oldIn+trim))>0.005 || Math.abs(b)>0.005 || Math.abs(e-(oldEnd-trim))>0.005)
                    throw Error('Premiere did not retain expected source in-point/start/end');
                if(muteCamera) c.disabled=true;
                return 'OK: Mic negative sync applied: trimmed '+trim.toFixed(3)+'s from source start; camera clip '+(muteCamera?'disabled':'unchanged')+'. Verify lip sync.';
            } catch(failure) {
                if(changed) {
                    try {var restoreIn=new Time();restoreIn.seconds=oldIn;m.inPoint=restoreIn;}catch(ignored){}
                    try {var restoreEnd=new Time();restoreEnd.seconds=oldEnd;m.end=restoreEnd;}catch(ignored2){}
                }
                return 'ERROR: Negative sync could not be verified. '+failure.toString()+'; check duplicate sequence (rollback attempted).';
            }
        }
        var delta=target-originalMicStart;
        var deltaTime=new Time(); deltaTime.seconds=delta;
        // TrackItem.move takes a delta, not an absolute sequence time.
        var moved=m.move(deltaTime);
        if(moved!==0) return 'ERROR: Premiere did not move the microphone clip: '+moved;
        if(muteCamera) {
            var muted=c.disabled=true;
            // Clip-level disable keeps other clips on A1 untouched.
        }
        return 'OK: Microphone moved by '+delta.toFixed(3)+'s; camera clip '+(muteCamera?'disabled':'unchanged')+'.';
    } catch(e) { return 'ERROR: '+e.toString(); }
}

// Works when A1 is a nested AutoCut sequence; only A2 must have source media.
function editflowMicTrackInfo(micIndex) {
    try {
        var seq=app.project.activeSequence;
        if(!seq)return 'ERROR: Open the AutoCut sequence first.';
        if(micIndex<0 || micIndex>=seq.audioTracks.numTracks)return 'ERROR: Microphone track does not exist.';
        var track=seq.audioTracks[micIndex];
        if(track.clips.numItems!==1)return 'ERROR: Microphone track must have exactly one uncut source clip.';
        var item=track.clips[0];
        if(!item.projectItem)return 'ERROR: Microphone clip has no project item.';
        var path=item.projectItem.getMediaPath();
        if(!path)return 'ERROR: Microphone track is a nested sequence; add the original audio file to A2.';
        return JSON.stringify({sequence:seq.name,micTrack:micIndex+1,micPath:path});
    }catch(e){return 'ERROR: '+e.toString();}
}

// v0.6 safe read-only active-sequence inspection. No timeline mutations.
function editflowTimelineInspect(){
  try {
    if (!app.project || !app.project.activeSequence) return 'ERROR: Open a Premiere sequence first.';
    var q=app.project.activeSequence, tracks={video:[],audio:[]};
    function describe(track,i){
      var clips=[];
      for(var j=0;j<track.clips.numItems;j++){
        var c=track.clips[j], item=c.projectItem, path='';
        if(item){ try{path=item.getMediaPath()||'';}catch(e){} }
        clips.push({name:String(c.name||''),start:Number(c.start.seconds),end:Number(c.end.seconds),source:path,nested:!path});
      }
      return {track:i+1,clipCount:clips.length,clips:clips.slice(0,30),truncated:clips.length>30};
    }
    for(var i=0;i<q.videoTracks.numTracks;i++)tracks.video.push(describe(q.videoTracks[i],i));
    for(var k=0;k<q.audioTracks.numTracks;k++)tracks.audio.push(describe(q.audioTracks[k],k));
    return JSON.stringify({sequence:String(q.name),tracks:tracks});
  } catch(e){return 'ERROR: '+e.toString();}
}

// v0.7: read synced source ranges; never mutate the active sequence.
function editflowTimelineCutSnapshot(videoIndex,micIndex) {
 try {
  var seq=app.project.activeSequence;
  if(!seq)return 'ERROR: Open a sequence first.';
  if(videoIndex<0||videoIndex>=seq.videoTracks.numTracks||micIndex<0||micIndex>=seq.audioTracks.numTracks)return 'ERROR: Invalid tracks.';
  var vTrack=seq.videoTracks[videoIndex],aTrack=seq.audioTracks[micIndex];
  if(vTrack.clips.numItems!==1||aTrack.clips.numItems!==1)return 'ERROR: Use one uncut camera video and one synced microphone clip.';
  var v=vTrack.clips[0],a=aTrack.clips[0];
  if(!v.projectItem||!a.projectItem)return 'ERROR: Source media unavailable.';
  var vp=v.projectItem.getMediaPath(),ap=a.projectItem.getMediaPath();
  if(!vp||!ap)return 'ERROR: Nested sequences are not supported by this safe export. Use original camera and microphone clips.';
  function details(c,path){return {path:path,name:String(c.name||''),start:Number(c.start.seconds),end:Number(c.end.seconds),source_in:Number(c.inPoint.seconds),source_out:Number(c.outPoint.seconds),node:String(c.nodeId)};}
  var duration=Number(seq.end.seconds);
  return JSON.stringify({sequence:String(seq.name),video:details(v,vp),mic:details(a,ap),videoTrack:videoIndex+1,micTrack:micIndex+1,sequenceDuration:duration});
 }catch(e){return 'ERROR: '+e.toString();}
}


// Read-only caption snapshot; separate from AutoCut and valid after reopening Premiere.
function editflowCaptionSnapshot(audioIndex) {
 try {
  var seq=app.project.activeSequence;
  if(!seq)return 'ERROR: Open the sequence you want to caption first.';
  if(audioIndex<0||audioIndex>=seq.audioTracks.numTracks)return 'ERROR: Audio track does not exist.';
  var track=seq.audioTracks[audioIndex];
  if(track.clips.numItems===0)return 'ERROR: Selected track is empty.';
  var sequences=app.project.sequences, index={};
  for(var j=0;j<sequences.numSequences;j++){
   var nestedSeq=sequences[j];
   if(nestedSeq.projectItem)index[String(nestedSeq.projectItem.nodeId)]=nestedSeq;
  }
  var clips=[], LIMIT=500, EPS=0.000001;
  function visit(item, parentStart, visibleFrom, visibleTo, depth, ancestors) {
   if(depth>12)throw Error('Nested audio depth exceeds 12 levels.');
   if(item.disabled)return;
   var start=Number(item.start.seconds), end=Number(item.end.seconds);
   var sourceIn=Number(item.inPoint.seconds), sourceOut=Number(item.outPoint.seconds);
   if(!isFinite(start)||!isFinite(end)||!isFinite(sourceIn)||!isFinite(sourceOut)||end<=start)return;
   // parentStart is the global timeline time at source time 0 of the containing sequence.
   var globalStart=parentStart+start;
   var from=Math.max(globalStart,visibleFrom), to=Math.min(parentStart+end,visibleTo);
   if(!isFinite(from)||!isFinite(to))throw Error('Invalid audio clip timing from Premiere.');
   if(to-from<=EPS)return;
   var media=item.projectItem, path='';
   if(media)try{path=media.getMediaPath()||'';}catch(ignore){}
   if(path) {
    var trimFrom=from-globalStart, trimTo=to-globalStart;
    clips.push({path:path,start:from,end:to,source_in:sourceIn+trimFrom,source_out:sourceIn+trimTo,name:String(item.name||'')});
    if(clips.length>LIMIT)throw Error('More than '+LIMIT+' audio segments; simplify the track first.');
    return;
   }
   var id=media?String(media.nodeId):'', child=index[id];
   if(!child)throw Error('Nested audio item '+String(item.name||'')+' does not resolve to an accessible Premiere sequence.');
   if(ancestors[id])throw Error('Recursive nested sequence detected.');
   if(Math.abs((end-start)-(sourceOut-sourceIn))>0.08)throw Error('Retimed nested audio is not supported.');
   var next={};for(var key in ancestors)if(ancestors.hasOwnProperty(key))next[key]=true;next[id]=true;
   // Nested source t=sourceIn is presented at parent time globalStart.
   var childOrigin=globalStart-sourceIn;
   for(var t=0;t<child.audioTracks.numTracks;t++){
    var audio=child.audioTracks[t];
    if(audio.isMuted && audio.isMuted())continue;
    for(var k=0;k<audio.clips.numItems;k++)visit(audio.clips[k],childOrigin,from,to,depth+1,next);
   }
  }
  if(track.isMuted && track.isMuted())return 'ERROR: Selected audio track is muted.';
  // seq.end.seconds can be unavailable in imported/nested timelines.
  // Never pass NaN into Math.min: JSON would serialize all clip ends as null.
  var audioEnd=0;
  for(var i=0;i<track.clips.numItems;i++){
   var edge=Number(track.clips[i].end.seconds);
   if(!isFinite(edge)||edge<0)throw Error('Invalid clip end on selected audio track, item '+(i+1));
   if(edge>audioEnd)audioEnd=edge;
  }
  if(!(audioEnd>0))throw Error('Selected track has no positive audio duration.');
  for(var i=0;i<track.clips.numItems;i++)visit(track.clips[i],0,0,audioEnd,0,{});
  clips.sort(function(a,b){return a.start-b.start;});
  if(!clips.length)return 'ERROR: No readable source audio in selected track.';
  return JSON.stringify({sequence:String(seq.name),audioTrack:audioIndex+1,duration:audioEnd,clips:clips,clipCount:clips.length});
 }catch(e){return 'ERROR: '+e.toString();}
}


// v0.8.0 video looks: read-only inspection and conservative existing-effect editing.
function editflowLookInspect(trackNo){
 try{
  var seq=app.project.activeSequence;
  if(!seq)return 'ERROR: Open a Premiere sequence first.';
  if(trackNo<0||trackNo>=seq.videoTracks.numTracks)return 'ERROR: Video track does not exist.';
  var t=seq.videoTracks[trackNo], count=0, lumetri=0, motion=0, animated=0;
  for(var i=0;i<t.clips.numItems;i++){
   var c=t.clips[i];if(c.disabled)continue;count++;
   for(var j=0;j<c.components.numItems;j++){
    var component=c.components[j], key=String(component.matchName||''), name=String(component.displayName||'');
    if(/lumetri/i.test(key+' '+name))lumetri++;
    if(/motion/i.test(key+' '+name)){
     motion++;
     for(var k=0;k<component.properties.numItems;k++){
      var prop=component.properties[k];
      if(/scale/i.test(String(prop.displayName||'')) && /uniform/i.test(String(prop.displayName||''))===false){
       try{if(prop.isTimeVarying && prop.isTimeVarying())animated++;}catch(ignore){}
      }
     }
    }
   }
  }
  return JSON.stringify({sequence:String(seq.name),track:trackNo+1,clips:count,motion:motion,lumetri:lumetri,animated: animated});
 }catch(e){return 'ERROR: '+e.toString();}
}
function editflowAutoZoom(trackNo,strength){
 try{
  var seq=app.project.activeSequence;if(!seq)return 'ERROR: Open a sequence first.';
  if(trackNo<0||trackNo>=seq.videoTracks.numTracks)return 'ERROR: Missing V'+(trackNo+1);
  if(!isFinite(strength)||strength<1||strength>12)return 'ERROR: Zoom must be between 1 and 12 percent.';
  var t=seq.videoTracks[trackNo],done=0,skipped=0,failed=0;
  // First clip's source length establishes movement; no silent destructive cuts.
  for(var i=0;i<t.clips.numItems;i++){
   var c=t.clips[i];if(c.disabled){skipped++;continue;}
   var component=null, scale=null;
   for(var j=0;j<c.components.numItems;j++){
    var x=c.components[j];if(!/motion/i.test(String(x.matchName||'')+' '+String(x.displayName||'')))continue;
    component=x;
    for(var k=0;k<x.properties.numItems;k++){
     var y=x.properties[k];if(/scale/i.test(String(y.displayName||'')) && !/uniform|width|height/i.test(String(y.displayName||''))){scale=y;break;}
    }
    if(scale)break;
   }
   if(!scale){skipped++;continue;}
   try{
    if(scale.isTimeVarying && scale.isTimeVarying()){skipped++;continue;}
    var value=Number(scale.getValue());
    var st=Number(c.inPoint.seconds),en=Number(c.outPoint.seconds);
    if(!isFinite(value)||value<1||!isFinite(st)||!isFinite(en)||en-st<0.3){skipped++;continue;}
    if(typeof scale.setTimeVarying!=='function'||typeof scale.addKey!=='function'||typeof scale.setValueAtKey!=='function'){skipped++;continue;}
    var t0=new Time(),t1=new Time();t0.seconds=st;t1.seconds=en;
    scale.setTimeVarying(true);scale.addKey(t0);scale.addKey(t1);
    var factor=1+strength/100;
    var a=i%2===0?value:value*factor,b=i%2===0?value*factor:value;
    scale.setValueAtKey(t0,a,1);scale.setValueAtKey(t1,b,1);done++;
   }catch(e){failed++;}
  }
  return JSON.stringify({applied:done,skipped:skipped,failed:failed,method:'Motion Scale keyframes; existing animation skipped'});
 }catch(e){return 'ERROR: '+e.toString();}
}
function editflowAutoColor(trackNo,preset,intensity){
 try{
  var seq=app.project.activeSequence;if(!seq)return 'ERROR: Open a sequence first.';
  if(trackNo<0||trackNo>=seq.videoTracks.numTracks)return 'ERROR: Missing video track.';
  if(!isFinite(intensity)||intensity<0||intensity>1)return 'ERROR: Invalid intensity.';
  var grades={natural:{contrast:8,saturation:102,highlights:-8,shadows:5,temperature:0},cinematic:{contrast:20,saturation:96,highlights:-20,shadows:-4,temperature:1},warm:{contrast:11,saturation:105,highlights:-13,shadows:3,temperature:8},cool:{contrast:14,saturation:98,highlights:-12,shadows:2,temperature:-7}};
  var grade=grades[preset];if(!grade)return 'ERROR: Unknown grade.';
  var count=0,missing=0,changed=0,failed=0,t=seq.videoTracks[trackNo];
  for(var i=0;i<t.clips.numItems;i++){
   var c=t.clips[i],effect=null;if(c.disabled)continue;
   for(var j=0;j<c.components.numItems;j++){
    var e=c.components[j];if(/lumetri/i.test(String(e.matchName||'')+' '+String(e.displayName||''))){effect=e;break;}
   }
   if(!effect){missing++;continue;}
   count++;
   for(var k=0;k<effect.properties.numItems;k++){
    var prop=effect.properties[k], label=String(prop.displayName||'').toLowerCase().replace(/[^a-z]/g,''), base=null,target=null;
    // Limit changes to exactly named BASIC CORRECTION single-valued properties.
    if(label==='contrast'){base=0;target=grade.contrast;}
    if(label==='saturation'){base=100;target=grade.saturation;}
    if(label==='highlights'){base=0;target=grade.highlights;}
    if(label==='shadows'){base=0;target=grade.shadows;}
    if(label==='temperature'){base=0;target=grade.temperature;}
    if(base===null)continue;
    try{
     if(typeof prop.isTimeVarying==='function'&&prop.isTimeVarying())continue;
     var current=prop.getValue();if(typeof current!=='number'||!isFinite(current))continue;
     // Apply a gentle offset relative to current grade, not reset camera corrections.
     var next=current+(target-base)*intensity;
     prop.setValue(next,1);changed++;
    }catch(e){failed++;}
   }
  }
  return JSON.stringify({lumetriClips:count,withoutLumetri:missing,parametersUpdated:changed,failed:failed,notice:'No automatic exposure or face/skin analysis. Review in Program Monitor.'});
 }catch(e){return 'ERROR: '+e.toString();}
}

// Capture direct child clips in a Premiere nested sequence without rendering/project-file paths.
function editflowVisualSnapshot(trackNo){
 try{
  var outer=app.project.activeSequence;if(!outer)return 'ERROR: Open an active sequence.';
  if(trackNo<0||trackNo>=outer.videoTracks.numTracks)return 'ERROR: Video track unavailable.';
  var sequences={}, seqs=app.project.sequences;
  for(var si=0;si<seqs.numSequences;si++){
   var q=seqs[si];if(q.projectItem)sequences[String(q.projectItem.nodeId)]=q;
  }
  var clips=[],track=outer.videoTracks[trackNo];
  for(var i=0;i<track.clips.numItems;i++){
   var c=track.clips[i];if(c.disabled)continue;
   var path='';try{path=c.projectItem.getMediaPath()||'';}catch(ignore){}
   var clip={node:String(c.nodeId),start:Number(c.start.seconds),end:Number(c.end.seconds),
    duration:Number(c.end.seconds)-Number(c.start.seconds),source_in:Number(c.inPoint.seconds),path:path};
   var id='';try{id=String(c.projectItem.nodeId);}catch(ignore){}
   var child=sequences[id];
   if(child){
    clip.nested=true;clip.nested_id=id;clip.nested_sequence=String(child.name);clip.children=[];
    for(var t=0;t<child.videoTracks.numTracks;t++){
     var vt=child.videoTracks[t];
     for(var j=0;j<vt.clips.numItems;j++){
      var inner=vt.clips[j];if(inner.disabled)continue;
      var innerPath='';try{innerPath=inner.projectItem.getMediaPath()||'';}catch(ignore){}
      var inStart=Number(inner.start.seconds),inEnd=Number(inner.end.seconds);
      // Only source time covered by this parent clip, never unrelated parts of the nest.
      var segmentStart=Math.max(inStart,clip.source_in),segmentEnd=Math.min(inEnd,clip.source_in+clip.duration);
      if(segmentEnd-segmentStart<.15)continue;
      clip.children.push({node:String(inner.nodeId),track:t,start:inStart,end:inEnd,
       duration:segmentEnd-segmentStart,source_in:Number(inner.inPoint.seconds)+(segmentStart-inStart),
       path:innerPath,segment_start:segmentStart,segment_end:segmentEnd});
     }
    }
   }
   clips.push(clip);
  }
  return JSON.stringify({sequence:String(outer.name),track:trackNo+1,clips:clips});
 }catch(e){return 'ERROR: '+e.toString();}
}

// Apply reviewed frame recommendations with per-clip node/timing checks.
// Existing animated Scale/Lumetri properties are skipped; no additional effects inserted.
function editflowApplyVisualPlan(trackNo,sequenceName,items,kind){
 try{
  var seq=app.project.activeSequence;
  if(!seq||String(seq.name)!==sequenceName)return 'ERROR: Active sequence changed. Analyze again.';
  if(trackNo<0||trackNo>=seq.videoTracks.numTracks)return 'ERROR: Video track unavailable.';
  if(kind!=='zoom'&&kind!=='color')return 'ERROR: Invalid effect mode.';
  var track=seq.videoTracks[trackNo], byId={},applied=0,skipped=0,failed=0;
  var seqIndex={};for(var si=0;si<app.project.sequences.numSequences;si++){
   var childSeq=app.project.sequences[si];
   if(childSeq.projectItem)seqIndex[String(childSeq.projectItem.nodeId)]=childSeq;
  }
  for(var x=0;x<items.length;x++)byId[String(items[x].node)]=items[x];
  for(var i=0;i<track.clips.numItems;i++){
   var outerClip=track.clips[i], rec=byId[String(outerClip.nodeId)];
   if(!rec)continue;
   var nestedSequence=null;
   try{nestedSequence=seqIndex[String(outerClip.projectItem.nodeId)];}catch(ignore){}
   // Zoom is applied to original inner clips; color is applied to outer nest.
   if(kind==='zoom' && nestedSequence){
    if(!rec.nested_id || String(outerClip.projectItem.nodeId)!==String(rec.nested_id) || !Array.isArray(rec.children) ||
       Math.abs(Number(outerClip.start.seconds)-Number(rec.start))>.04 || Math.abs(Number(outerClip.end.seconds)-Number(rec.end))>.04){skipped++;continue;}
    // A source nest can be shared by other timeline instances: explicit acknowledgement required.
    if(!rec.allow_shared_nested_edit){skipped++;continue;}
    for(var z=0;z<rec.children.length;z++){
     var childRec=rec.children[z];if(childRec.error || childRec.track<0 || childRec.track>=nestedSequence.videoTracks.numTracks){skipped++;continue;}
     var childTrack=nestedSequence.videoTracks[childRec.track],innerClip=null;
     for(var cidx=0;cidx<childTrack.clips.numItems;cidx++){
      var candidate=childTrack.clips[cidx];
      if(String(candidate.nodeId)===String(childRec.node)){innerClip=candidate;break;}
     }
     if(!innerClip || Math.abs(Number(innerClip.start.seconds)-Number(childRec.start))>.04 ||
        Math.abs(Number(innerClip.end.seconds)-Number(childRec.end))>.04){skipped++;continue;}
     try{
      var comp=null,scale=null;
      for(var cj=0;cj<innerClip.components.numItems;cj++){
       var eff=innerClip.components[cj];if(/motion/i.test(String(eff.matchName||'')+' '+String(eff.displayName||''))){comp=eff;break;}
      }
      if(comp)for(var pk=0;pk<comp.properties.numItems;pk++){
       var pp=comp.properties[pk];if(/scale/i.test(String(pp.displayName||''))&&!/uniform|width|height/i.test(String(pp.displayName||''))){scale=pp;break;}
      }
      var delta=Number(childRec.zoom_percent);
      if(!scale||!(delta>0&&delta<=6)||(scale.isTimeVarying&&scale.isTimeVarying())||
         typeof scale.setTimeVarying!=='function'||typeof scale.addKey!=='function'||typeof scale.setValueAtKey!=='function'){
       skipped++;continue;
      }
      var val=Number(scale.getValue()),t0=new Time(),t1=new Time();
      t0.seconds=Number(innerClip.inPoint.seconds);t1.seconds=Number(innerClip.outPoint.seconds);
      if(!isFinite(val)||val<=0||t1.seconds-t0.seconds<.5){skipped++;continue;}
      scale.setTimeVarying(true);scale.addKey(t0);scale.addKey(t1);
      scale.setValueAtKey(t0,val,1);scale.setValueAtKey(t1,val*(1+delta/100),1);applied++;
     }catch(e){failed++;}
    }
    continue;
   }
   var clip=outerClip;
   if(!rec||rec.error||Math.abs(Number(clip.start.seconds)-Number(rec.start))>.04||Math.abs(Number(clip.end.seconds)-Number(rec.end))>.04){skipped++;continue;}
   try{
    var component=null;
    for(var j=0;j<clip.components.numItems;j++){
     var effect=clip.components[j];
     if(kind==='zoom'?/motion/i.test(String(effect.matchName||'')+' '+String(effect.displayName||'')):/lumetri/i.test(String(effect.matchName||'')+' '+String(effect.displayName||''))){component=effect;break;}
    }
    if(!component){skipped++;continue;}
    if(kind==='zoom'){
     var delta=Number(rec.zoom_percent);if(!delta||delta<0||delta>6){skipped++;continue;}
     var scale=null;
     for(var k=0;k<component.properties.numItems;k++){
      var p=component.properties[k];if(/scale/i.test(String(p.displayName||''))&&!/uniform|width|height/i.test(String(p.displayName||''))){scale=p;break;}
     }
     if(!scale||typeof scale.setTimeVarying!=='function'||typeof scale.setValueAtKey!=='function'||(scale.isTimeVarying&&scale.isTimeVarying())){skipped++;continue;}
     var v=Number(scale.getValue()),t0=new Time(),t1=new Time();
     t0.seconds=Number(clip.inPoint.seconds);t1.seconds=Number(clip.outPoint.seconds);
     if(!isFinite(v)||v<=0||t1.seconds-t0.seconds<.5){skipped++;continue;}
     scale.setTimeVarying(true);scale.addKey(t0);scale.addKey(t1);
     scale.setValueAtKey(t0,v,1);scale.setValueAtKey(t1,v*(1+delta/100),1);applied++;
    }else{
     var correction=rec.color||{},modifications=0;
     for(var k=0;k<component.properties.numItems;k++){
      var prop=component.properties[k],name=String(prop.displayName||'').toLowerCase().replace(/[^a-z]/g,'');
      var add=name==='exposure'?Number(correction.exposure_offset):name==='contrast'?Number(correction.contrast_offset):name==='temperature'?Number(correction.temperature_offset):NaN;
      if(!isFinite(add))continue;
      if(prop.isTimeVarying&&prop.isTimeVarying())continue;
      var old=prop.getValue();if(typeof old!=='number'||!isFinite(old))continue;
      prop.setValue(old+add,1);modifications++;
     }
     if(modifications)applied++;else skipped++;
    }
   }catch(e){failed++;}
  }
  return JSON.stringify({applied:applied,skipped:skipped,failed:failed,mode:kind,notice:'Review edits on duplicate sequence in Program Monitor. No skin/facial identity analysis performed.'});
 }catch(e){return 'ERROR: '+e.toString();}
}

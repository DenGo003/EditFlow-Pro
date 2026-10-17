"""Timeline-source AutoCut: local audio scan and non-destructive multiclip XML export.

The active sequence is NOT modified. Requires single source clips on V1 and selected mic track.
"""
import math
import re
import json
from fractions import Fraction
from pathlib import Path
from . import core


def analyze_and_export(snapshot, settings, folder, update, cancel, ffmpeg='ffmpeg', ffprobe='ffprobe'):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('video'), dict) or not isinstance(snapshot.get('mic'), dict):
        raise ValueError('Invalid Timeline snapshot')
    v, m = snapshot['video'], snapshot['mic']
    vp, mp = core.media_path(v['path']), core.media_path(m['path'])
    vm, mm = core.probe(vp, ffprobe, cancel), core.probe(mp, ffprobe, cancel)
    if not vm['video'] or not mm['audio']:
        raise ValueError('Expected original camera video and microphone audio')
    if vp == mp:
        raise ValueError('Select the separate microphone track, not camera audio')
    def field(c, key):
        return core.number(c[key], 0, 24*3600, key)
    vs, ve, vi = field(v,'start'),field(v,'end'),field(v,'source_in')
    ms, me, mi = field(m,'start'),field(m,'end'),field(m,'source_in')
    if abs(vs)>0.02 or abs(ms)>0.02:
        raise ValueError('Preview requires synced video and mic clips starting at timeline 00:00. Trim lead-in in Premiere or retry Sync.')
    if ve<=0 or me<=0:raise ValueError('Timeline clips have no usable duration')
    duration=min(ve,me,vm['duration']-vi,mm['duration']-mi)
    if duration<=1: raise ValueError('No overlapping synced audio/video')
    if ve-duration>0.15:
        raise ValueError('Microphone ends more than 0.15s before the video. Extend/fix microphone coverage before AutoCut; no partial edits made.')
    if abs(float(v.get('source_out',vi+ve))-vi-ve)>0.1:
        raise ValueError('Camera has time stretch/trim mismatch; not supported safely.')
    if abs(float(m.get('source_out',mi+me))-mi-me)>0.1:
        raise ValueError('Mic has time stretch/trim mismatch; not supported safely.')
    rate_raw=vm['video'].get('avg_frame_rate') or vm['video'].get('r_frame_rate')
    rate=core.normalization_rate(rate_raw)
    fps=float(rate)
    threshold=core.number(settings.get('threshold',-35),-80,-5,'Threshold')
    minimum=core.number(settings.get('minimum',.45),.05,10,'Minimum silence')
    before=core.number(settings.get('before',.08),0,2,'Before padding')
    after=core.number(settings.get('after',.12),0,2,'After padding')
    update('Scanning only microphone audio A'+str(snapshot.get('micTrack',2))+' (no video render)',0,2)
    filt=('atrim=start=%.9f:end=%.9f,asetpts=PTS-STARTPTS,'%(mi,mi+duration)+
          'silencedetect=noise=%.2fdB:d=%.6f'%(threshold,minimum))
    _,log=core.run([ffmpeg,'-hide_banner','-nostdin','-protocol_whitelist','file,pipe',
                    '-i',str(mp),'-map','0:a:0','-af',filt,'-vn','-f','null','-'],cancel)
    silences=[]; start=None
    for line in log.splitlines():
        z=re.search(r'silence_start: ([\d.e+-]+)',line)
        y=re.search(r'silence_end: ([\d.e+-]+)',line)
        if z:start=max(0,float(z.group(1)))
        if y:
            silences.append([0 if start is None else start,min(duration,float(y.group(1)))])
            start=None
    if start is not None:silences.append([start,duration])
    keep=core.keep_ranges(duration,silences,before,after,fps)
    if not keep:raise ValueError('No speech remains; adjust threshold/minimum')
    folder.mkdir(parents=True,exist_ok=True)
    output=folder/'TimelineAutoCut.xml'
    _write_xml(output,vp,mp,vm,mm,rate,vi,mi,keep,int(snapshot.get('micTrack',2)))
    plan={'snapshot':snapshot,'settings':settings,'keep':keep,'silences':silences,'fps':str(rate)}
    (folder/'timeline-cut-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    update('New sequence XML ready for import',2,2)
    return {'xml':str(output),'plan':str(folder/'timeline-cut-plan.json'),
            'kept_seconds':sum(b-a for a,b in keep)/fps,'original_seconds':duration,
            'cuts':max(0,len(keep)-1),'mic_track':int(snapshot.get('micTrack',2))}


def _write_xml(output,vpath,mpath,vm,mm,rate,vin,min_,keep,mic_track):
    # XML v5 (FCP7) is Premiere's import format. Media references remain original, never rendered.
    from xml.etree import ElementTree as ET
    n=core.node; rx=core.rate_xml; fps=float(rate)
    root=ET.Element('xmeml',version='5');seq=n(root,'sequence',id='editflow-timeline-sequence')
    n(seq,'name','EditFlow - Timeline AutoCut A2');total=sum(b-a for a,b in keep)
    n(seq,'duration',total);rx(seq,rate)
    media=n(seq,'media');video=n(media,'video');fmt=n(n(video,'format'),'samplecharacteristics')
    rx(fmt,rate)
    for key,val in [('width',vm['video']['width']),('height',vm['video']['height']),('pixelaspectratio','square'),('fielddominance','none')]:n(fmt,key,val)
    vt=n(video,'track');audio=n(media,'audio');n(audio,'numOutputChannels',2)
    afmt=n(n(audio,'format'),'samplecharacteristics');n(afmt,'depth',16);n(afmt,'samplerate',mm['audio'].get('sample_rate','48000'))
    # A1 is empty: only original microphone is included as A2, muted camera soundtrack omitted.
    for idx in range(max(mic_track,2)):
        at=n(audio,'track')
        if idx==mic_track-1:mic_t=at
    def file_info(ci,path,media_id,meta,has_video):
        f=n(ci,'file',id=media_id)
        n(f,'name',path.name);n(f,'pathurl',path.as_uri());rx(f,rate)
        n(f,'duration',math.floor(meta['duration']*fps))
        fm=n(f,'media')
        if has_video:
            ch=n(n(fm,'video'),'samplecharacteristics');rx(ch,rate)
            for k,x in [('width',meta['video']['width']),('height',meta['video']['height']),('pixelaspectratio','square'),('fielddominance','none')]:n(ch,k,x)
        else:
            au=n(fm,'audio');ch=n(au,'samplecharacteristics');n(ch,'depth',16)
            n(ch,'samplerate',meta['audio'].get('sample_rate','48000'))
            n(au,'channelcount',meta['audio'].get('channels',1))
    pos=0
    for j,(start,end) in enumerate(keep,1):
        d=end-start
        for track,typ,path,meta,source_offset,media_id in [(vt,'video',vpath,vm,vin,'camera-media'),(mic_t,'audio',mpath,mm,min_,'microphone-media')]:
            ci=n(track,'clipitem',id='editflow-%s-%d'%(typ,j))
            n(ci,'name',path.name);n(ci,'duration',math.floor(meta['duration']*fps));rx(ci,rate)
            source_start=round(source_offset*fps)+start
            for k,val in [('start',pos),('end',pos+d),('in',source_start),('out',source_start+d)]:n(ci,k,val)
            file_info(ci,path,media_id,meta,typ=='video')
            src=n(ci,'sourcetrack');n(src,'mediatype',typ);n(src,'trackindex',1)
        pos+=d
    ET.indent(root)
    output.write_bytes(b'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n'+ET.tostring(root,encoding='utf-8'))


def caption_from_plan(plan_path, folder, model_dir, language, word_mode, update, cancel, ffmpeg='ffmpeg', ffprobe='ffprobe'):
    """Generate caption SRT matched to the freshly generated cut sequence (audio-only render)."""
    plan=json.loads(Path(plan_path).read_text(encoding='utf-8'))
    snap=plan['snapshot']; mic=snap['mic']
    source=core.media_path(mic['path'])
    fps=float(Fraction(plan['fps']))
    ranges=plan['keep']
    if not ranges or len(ranges)>3000:
        raise ValueError('Invalid or excessive number of retained cuts')
    source_in=float(mic['source_in'])
    probe=core.probe(source,ffprobe,cancel)
    if not probe.get('audio'):
        raise ValueError('Selected microphone has no audio')
    folder.mkdir(parents=True,exist_ok=True)
    # One decode source; all segments are trimmed and re-joined without rendering any video.
    labels=[]; sections=[]
    for i,(a,b) in enumerate(ranges):
        t0=source_in+a/fps;t1=source_in+b/fps
        if t1<=t0 or t1>probe['duration']+0.07:raise ValueError('Caption source exceeds the microphone recording')
        sections.append('[0:a:0]atrim=start=%.9f:end=%.9f,asetpts=PTS-STARTPTS,aresample=16000,aformat=channel_layouts=mono[c%d]'%(t0,min(t1,probe['duration']),i))
        labels.append('[c%d]'%i)
    sections.append(''.join(labels)+'concat=n=%d:v=0:a=1[out]'%len(ranges))
    filter_script=folder/'captions-filter.txt'
    filter_script.write_text(';\n'.join(sections),encoding='utf-8')
    wav=folder/'timeline-captions-audio.wav'
    update('Building cut microphone audio for captions (no video render)',0,2)
    core.run([ffmpeg,'-y','-hide_banner','-nostdin','-i',str(source),'-/filter_complex',str(filter_script),'-map','[out]','-c:a','pcm_s16le',str(wav)],cancel)
    update('Transcribing cut timeline with local Whisper',1,2)
    result=core.transcribe(str(wav),model_dir,language,word_mode,folder,update,cancel,ffmpeg,ffprobe)
    result['plan']=str(plan_path)
    result['note']='SRT matches the newly imported AutoCut sequence, not the original uncut sequence'
    return result

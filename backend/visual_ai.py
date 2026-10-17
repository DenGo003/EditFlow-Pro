"""Offline, explainable frame-content analysis; no generative model or uploads.

Recommendations are deliberately conservative and advisory. Frames sampled with FFmpeg;
color corrections are relative nudges, not claims of calibrated color science.
"""
import math
import subprocess
from pathlib import Path
from . import core

W,H=96,54

def sample(path, seconds, ffmpeg='ffmpeg', timeout=25):
    if not Path(path).is_file(): raise ValueError('Missing local video source')
    cmd=[ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-ss',str(max(0,seconds)),'-i',str(path),'-frames:v','1','-vf',f'scale={W}:{H}', '-f','rawvideo','-pix_fmt','rgb24','pipe:1']
    result=subprocess.run(cmd,capture_output=True,timeout=timeout)
    if result.returncode or len(result.stdout)!=W*H*3: raise ValueError('Unable to sample this clip')
    return result.stdout

def metrics(frame):
    # avoid treating extreme saturation as natural skin; work on approximate luminance only
    n=len(frame)//3; ys=[]; rs=gs=bs=0; dark=bright=0
    for j in range(0,len(frame),3):
        r,g,b=frame[j],frame[j+1],frame[j+2]
        y=(54*r+183*g+19*b)/256
        ys.append(y);rs+=r;gs+=g;bs+=b
        dark+=y<32;bright+=y>232
    ys.sort()
    return {'luma':round(sum(ys)/n,2), 'p10':round(ys[n//10],2),
            'p90':round(ys[n*9//10],2),'clipped_shadows':round(dark/n,3),
            'clipped_highlights':round(bright/n,3),'warmth':round((rs-bs)/n,2)}

def visual_change(a,b):
    # Approximate motion/shot-change between two downscaled frames.
    return sum(abs(a[j]-b[j]) for j in range(0,len(a),12))/(len(a)/12)/255

def recommend(clip, ffmpeg='ffmpeg'):
    path=core.media_path(clip['path'])
    clip_start=core.number(clip['source_in'],0,1e7,'video in')
    duration=core.number(clip['duration'],0.15,4*3600,'video clip duration')
    a=sample(path,clip_start+min(duration*.2,1.5),ffmpeg)
    b=sample(path,clip_start+max(.05,min(duration*.8,duration-.1)),ffmpeg)
    m=metrics(a);movement=visual_change(a,b)
    # Prefer not to zoom scenes already showing motion or cuts.
    zoom=0 if movement>.26 or duration<.8 else (2 if movement>.12 else (5 if duration>3.5 else 3))
    # Preserve highlights and faces; narrow bounded offsets for manual Lumetri preview.
    exposure=round(max(-.25,min(.25,(112-m['luma'])/160)),2)
    contrast=round(max(-7,min(9,(65-(m['p90']-m['p10']))/9)),1)
    temp=round(max(-4,min(4,-m['warmth']/13)),1)
    if m['clipped_highlights']>.06: exposure=min(0,exposure)
    if m['clipped_shadows']>.18: contrast=min(0,contrast)
    return {'metrics':m,'scene_change':round(movement,3),'zoom_percent':zoom,
            'color':{'exposure_offset':exposure,'contrast_offset':contrast,'temperature_offset':temp},
            'reason':('High image movement; avoid automatic zoom' if not zoom else 'Low/moderate image movement; gentle zoom suggested')}

def analyze(snapshot,update,cancel,ffmpeg='ffmpeg'):
    if not isinstance(snapshot,dict) or not isinstance(snapshot.get('clips'),list):
        raise ValueError('Invalid video snapshot')
    clips=snapshot['clips']
    if not 1<=len(clips)<=250:raise ValueError('Select a video track with 1–250 clips for visual analysis')
    entries=[]
    for c in clips:
        entries.extend(c.get('children',[]) if c.get('nested') else [c])
    if len(entries)>600:raise ValueError('Too many inner clips; select a shorter timeline')
    processed=0;result=[]
    for i,c in enumerate(clips):
        if cancel.is_set():raise core.Cancelled('Cancelled')
        entry={'index':i,'node':str(c.get('node','')),'start':c.get('start'),'end':c.get('end')}
        if c.get('nested'):
            entry.update(nested_id=c.get('nested_id'),nested_sequence=c.get('nested_sequence'),children=[])
            colors=[]
            for child in c.get('children',[]):
                if cancel.is_set():raise core.Cancelled('Cancelled')
                update(f'Analyzing nest frames {processed+1}/{len(entries)}',processed,len(entries))
                item={k:child.get(k) for k in ('node','track','start','end','segment_start','segment_end')}
                try:
                    r=recommend(child,ffmpeg);item.update(r);colors.append((r['color'],child.get('duration',1)))
                except (ValueError,OSError,subprocess.TimeoutExpired) as e:
                    item.update(error=str(e),zoom_percent=0)
                entry['children'].append(item);processed+=1
            if colors:
                weight=sum(w for _,w in colors)
                entry['color']={k:round(sum(p[k]*w for p,w in colors)/weight,2)
                                for k in ('exposure_offset','contrast_offset','temperature_offset')}
                entry['zoom_percent']=0
                entry['metrics']={'luma':round(sum(x['metrics']['luma'] for x in entry['children'] if 'metrics' in x)/len(colors),2)}
                entry['scene_change']=0
            else:entry['error']='No eligible source clips inside this nested sequence'
        else:
            update(f'Analyzing video frames {processed+1}/{len(entries)}',processed,len(entries))
            try:entry.update(recommend(c,ffmpeg))
            except (ValueError,OSError,subprocess.TimeoutExpired) as e:entry.update(error=str(e),zoom_percent=0)
            processed+=1
        result.append(entry)
    update('Visual analysis complete — review suggestions before applying',len(entries),len(entries))
    return {'sequence':snapshot.get('sequence'),'track':snapshot.get('track'),'clips':result,
            'method':'Nested video source-frame measurements via offline FFmpeg; no trained face tracker',
            'warning':'Preview only. Zoom changes original clips INSIDE shared nests if explicitly approved; color edits outer Lumetri only.'}

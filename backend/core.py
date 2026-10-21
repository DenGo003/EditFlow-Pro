"""Media operations. Original media is only ever opened for reading."""
from __future__ import annotations
import hashlib, json, math, os, re, subprocess, tempfile, threading
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree as ET

class Cancelled(Exception): pass

def run(args, cancel=None):
    # File-backed output avoids pipe deadlocks and unbounded FFmpeg stderr memory.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        p = subprocess.Popen(args, stdout=out, stderr=err, stdin=subprocess.DEVNULL,
                             creationflags=0x08000000 if os.name == 'nt' else 0)
        while True:
            try: p.wait(timeout=.25); break
            except subprocess.TimeoutExpired:
                if cancel and cancel.is_set():
                    p.kill(); p.wait(); raise Cancelled('Operation cancelled')
        out.seek(0); err.seek(0)
        stdout, stderr = out.read().decode('utf-8', 'replace'), err.read().decode('utf-8', 'replace')
        if p.returncode: raise ValueError(f'{Path(args[0]).name} failed: {stderr[-4000:]}')
        return stdout, stderr

def media_path(value):
    p = Path(value).expanduser()
    if p.suffix.lower() not in {'.mp4','.mov','.mkv','.avi','.mxf','.mts','.m2ts','.webm','.wav','.mp3','.m4a','.aac','.flac','.ogg','.wma','.aiff','.aif'}: raise ValueError('Unsupported media extension; playlists and project files are not media inputs')
    if not p.is_absolute() or not p.is_file(): raise ValueError('Choose an existing local media file')
    if os.name == 'nt' and str(p).startswith('\\\\'): raise ValueError('Copy network media to a local drive first')
    return p.resolve()

def probe(path, ffprobe='ffprobe', cancel=None):
    raw, _ = run([ffprobe, '-protocol_whitelist', 'file,pipe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], cancel)
    d = json.loads(raw)
    a = next((s for s in d['streams'] if s['codec_type']=='audio'), None)
    v = next((s for s in d['streams'] if s['codec_type']=='video' and not s.get('disposition',{}).get('attached_pic')), None)
    if not a: raise ValueError(f'{path.name}: no audio stream')
    raw_duration = d.get('format', {}).get('duration') or a.get('duration')
    if raw_duration in (None, 'N/A', ''):
        raise ValueError(f'{path.name}: FFprobe could not determine audio duration')
    duration = float(raw_duration)
    if not math.isfinite(duration) or duration <= 0: raise ValueError('Invalid media duration')
    return {'path':str(path), 'duration':duration, 'audio':a, 'video':v}

def number(value, low, high, label):
    if value is None:
        raise ValueError(f'{label} is missing from Premiere timeline data')
    try: n=float(value)
    except (TypeError, ValueError): raise ValueError(f'{label} is not a valid number: {value!r}')
    if not math.isfinite(n) or not low <= n <= high: raise ValueError(f'{label} must be {low} to {high}')
    return n

def keep_ranges(duration, silences, before, after, fps):
    """Frame align kept speech outward; padding can only reduce removed silence."""
    total=math.floor(duration*fps+1e-6)
    cuts=[]
    for start,end in silences:
        # after-speech padding at silence start; before-speech at silence end
        lo=math.ceil((start+after)*fps-1e-6)
        hi=math.floor((end-before)*fps+1e-6)
        lo=max(0,min(total,lo)); hi=max(0,min(total,hi))
        if hi>lo: cuts.append((lo,hi))
    merged=[]
    for a,b in sorted(cuts):
        if merged and a<=merged[-1][1]: merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else: merged.append((a,b))
    keep=[]; pos=0
    for a,b in merged:
        if a>pos: keep.append([pos,a])
        pos=b
    if pos<total: keep.append([pos,total])
    return keep

def supported_rate(raw):
    """Canonicalize normal integer and NTSC rates without silently changing clip timing."""
    try: value = Fraction(raw)
    except (ValueError, ZeroDivisionError, TypeError): raise ValueError('Invalid video frame rate')
    if value <= 0: raise ValueError('Invalid video frame rate')
    standard = ([Fraction(n) for n in (15, 20, 24, 25, 30, 48, 50, 60, 100, 120)] +
                [Fraction(n,1001) for n in (24000, 30000, 60000)])
    for rate in standard:
        if abs(float(value-rate)) / float(rate) < 0.00001:
            return rate
    raise ValueError('Unsupported source frame rate '+str(value)+' ('+format(float(value),'.3f')+' fps). Supported: 15, 20, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 100, 120. Export a CFR master if needed.')

def normalization_rate(raw):
    """Nearest safe edit rate; camera clips near 29.97/30 become 30 CFR."""
    try: current = float(Fraction(raw))
    except (ValueError, ZeroDivisionError, TypeError): raise ValueError('Unknown camera frame rate')
    if not math.isfinite(current) or current <= 0: raise ValueError('Invalid camera frame rate')
    if 29.5 <= current <= 30.5: return Fraction(30)
    choices = [Fraction(24), Fraction(25), Fraction(30), Fraction(50), Fraction(60),
               Fraction(24000,1001), Fraction(30000,1001), Fraction(60000,1001)]
    return min(choices, key=lambda r: abs(float(r)-current))

def normalize_media(source, original, root, target_rate, ffmpeg, ffprobe, cancel, update, index, total):
    """Encode a reusable, separate zero-start CFR intermediate; never modify original."""
    if root is None:
        raise ValueError('Auto normalization needs the backend media cache directory')
    directory = Path(root) / 'normalized'
    directory.mkdir(parents=True, exist_ok=True)
    stamp = original.stat()
    key = hashlib.sha256((str(original)+str(stamp.st_size)+str(stamp.st_mtime_ns)+str(target_rate)).encode('utf-8')).hexdigest()[:24]
    dest = directory / ('cfr-' + key + '.mp4')
    if dest.is_file():
        try:
            existing = probe(dest, ffprobe, cancel)
            if supported_rate(existing['video']['avg_frame_rate']) == target_rate:
                update(f'Using cached CFR clip {index+1}/{total}',index,total)
                return dest
        except (ValueError, OSError, KeyError): pass
    temporary = directory / ('cfr-' + key + '.partial.mp4')
    temporary.unlink(missing_ok=True)
    update(f'Converting camera video to {float(target_rate):.3f} FPS CFR: clip {index+1}/{total} (this can take time)',index,total)
    try:
        run([ffmpeg,'-y','-hide_banner','-nostdin','-protocol_whitelist','file,pipe',
             '-i',str(source),'-map','0:v:0','-map','0:a:0',
             '-vf',f'setpts=PTS-STARTPTS,fps={target_rate},setsar=1,format=yuv420p',
             '-af','aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS',
             '-c:v','libx264','-preset','veryfast','-crf','18','-fps_mode:v','cfr',
             '-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
             '-movflags','+faststart',str(temporary)],cancel)
        converted=probe(temporary,ffprobe,cancel)
        if supported_rate(converted['video']['avg_frame_rate']) != target_rate:
            raise ValueError('CFR conversion produced unexpected FPS')
        temporary.replace(dest)
    finally:
        temporary.unlink(missing_ok=True)
    return dest

def analyze(paths, settings, update, cancel, ffmpeg='ffmpeg', ffprobe='ffprobe', cache_root=None):
    threshold=number(settings.get('threshold',-35),-80,-5,'Threshold')
    minimum=number(settings.get('minimum',.45),.05,10,'Minimum silence')
    before=number(settings.get('before',.08),0,2,'Before padding')
    after=number(settings.get('after',.12),0,2,'After padding')
    if not isinstance(paths,list) or not 1<=len(paths)<=100: raise ValueError('Choose 1 to 100 files')
    result=[]; signature=None
    for i,value in enumerate(paths):
        update(f'Analyzing clip {i+1}/{len(paths)}',i,len(paths))
        p=media_path(value); m=probe(p,ffprobe,cancel); v=m['video']; a=m['audio']
        if not v: raise ValueError('Auto Cut requires video with embedded audio; captions also accept audio-only files')
        # FAST AUDIO PATH: no video decoding or CFR transcode; original media is preserved.
        # Timeline is quantized to a common edit rate, while silence is timestamped in seconds.
        raw_rate = v.get("avg_frame_rate") if v.get("avg_frame_rate") not in (None,"0/0","0/1") else v.get("r_frame_rate")
        rate=normalization_rate(raw_rate)
        fps=float(rate)
        m['fast_vfr_source'] = abs(float(Fraction(raw_rate))-fps) > 0.0001
        update(f'Audio-only silence scan {i+1}/{len(paths)} — original media, no video conversion',i,len(paths))
        if a.get('channels') not in (1,2): raise ValueError('Auto Cut currently supports mono or stereo audio')
        if abs(float(a.get('start_time',0))-float(v.get('start_time',0)))>0.25:
            raise ValueError('Audio/video stream offsets differ by over 250ms; fast mode would risk sync. Use a synchronized source.')
        if v.get('field_order','progressive') not in ('progressive','unknown'):
            raise ValueError('Interlaced footage must be converted to progressive first')
        if v.get('color_transfer') in ('smpte2084','arib-std-b67') or v.get('sample_aspect_ratio','1:1') not in ('1:1','N/A','0:1'):
            raise ValueError('Use SDR square-pixel media for this MVP')
        if any(x.get('rotation',0) for x in v.get('side_data_list',[])):
            raise ValueError('Bake rotation into an intermediate before Auto Cut')
        if 'duration' in v:
            video_duration=float(v['duration'])
            if abs(m['duration']-video_duration)>0.25: raise ValueError('Audio/video durations differ by over 250ms; fast cut disabled to protect sync')
            m['duration']=video_duration
        sig=(str(rate),v['width'],v['height'],a['channels'],a['sample_rate'])
        if signature is not None and sig!=signature:
            raise ValueError('Batch clips must share frame rate, size, channel count and sample rate. Normalize first or run separately.')
        signature=sig
        _,log=run([ffmpeg,'-hide_banner','-nostdin','-protocol_whitelist','file,pipe','-i',str(p),'-map','0:a:0',
                   '-af',f'silencedetect=noise={threshold}dB:d={minimum}', '-vn','-f','null','-'],cancel)
        silences=[]; start=None
        for line in log.splitlines():
            s=re.search(r'silence_start: ([\d.e+-]+)',line)
            e=re.search(r'silence_end: ([\d.e+-]+)',line)
            if s: start=max(0,float(s[1]))
            if e:
                silences.append([0 if start is None else start,min(m['duration'],float(e[1]))]); start=None
        if start is not None: silences.append([start,m['duration']])
        m['rate']=str(rate); m['silences']=silences
        m['keep']=keep_ranges(m['duration'],silences,before,after,fps)
        # Entirely silent files must not leave artificial padding-only snippets.
        if len(silences)==1 and silences[0][0]<1/fps and silences[0][1]>=m['duration']-1/fps: m['keep']=[]
        st=p.stat(); m['fingerprint']=[st.st_size,st.st_mtime_ns]
        result.append(m)
    return {'clips':result,'settings':settings,'kept_seconds':sum(sum(b-a for a,b in m['keep'])/float(Fraction(m['rate'])) for m in result)}

def node(parent,tag,text=None,**attrs):
    e=ET.SubElement(parent,tag,attrs)
    if text is not None: e.text=str(text)
    return e

def rate_xml(parent,rate):
    r=node(parent,'rate'); node(r,'timebase',round(float(rate))); node(r,'ntsc','TRUE' if rate.denominator==1001 else 'FALSE')

def write_xml(plan,output):
    clips=plan['clips']; first=clips[0]; rate=Fraction(first['rate'])
    root=ET.Element('xmeml',version='5'); seq=node(root,'sequence',id='editflow-sequence')
    node(seq,'name','EditFlow Pro - Auto Cut'); total=sum(b-a for m in clips for a,b in m['keep'])
    node(seq,'duration',total); rate_xml(seq,rate)
    media=node(seq,'media'); video=node(media,'video'); fmt=node(node(video,'format'),'samplecharacteristics')
    rate_xml(fmt,rate)
    for k,val in [('width',first['video']['width']),('height',first['video']['height']),('pixelaspectratio','square'),('fielddominance','none')]: node(fmt,k,val)
    vt=node(video,'track'); audio=node(media,'audio'); node(audio,'numOutputChannels',first['audio']['channels'])
    afmt=node(node(audio,'format'),'samplecharacteristics'); node(afmt,'depth',16); node(afmt,'samplerate',first['audio']['sample_rate'])
    ats=[node(audio,'track') for _ in range(first['audio']['channels'])]
    cursor=0; idx=0
    for mi,m in enumerate(clips):
        for start,end in m['keep']:
            idx+=1; length=end-start
            ids=[f'v-{idx}']+[f'a-{idx}-{c+1}' for c in range(len(ats))]
            for track_no,(track,kind) in enumerate([(vt,'video')]+[(t,'audio') for t in ats]):
                ci=node(track,'clipitem',id=ids[track_no]); node(ci,'name',Path(m['path']).name)
                node(ci,'duration',math.floor(m['duration']*float(rate))); rate_xml(ci,rate)
                for k,val in [('start',cursor),('end',cursor+length),('in',start),('out',end)]: node(ci,k,val)
                f=node(ci,'file',id=f'file-{mi}')
                if track_no==0:
                    node(f,'name',Path(m['path']).name); node(f,'pathurl',Path(m['path']).as_uri().replace('file:///', 'file://localhost/', 1)); rate_xml(f,rate)
                    node(f,'duration',math.floor(m['duration']*float(rate)))
                    fm=node(f,'media'); fv=node(node(fm,'video'),'samplecharacteristics'); rate_xml(fv,rate)
                    for k,val in [('width',m['video']['width']),('height',m['video']['height']),('pixelaspectratio','square'),('fielddominance','none')]: node(fv,k,val)
                    fa=node(fm,'audio'); ac=node(fa,'samplecharacteristics'); node(ac,'depth',16); node(ac,'samplerate',m['audio']['sample_rate']); node(fa,'channelcount',m['audio']['channels'])
                source=node(ci,'sourcetrack'); node(source,'mediatype',kind); node(source,'trackindex',max(1,track_no))
                for j,ref in enumerate(ids):
                    link=node(ci,'link'); node(link,'linkclipref',ref); node(link,'mediatype','video' if j==0 else 'audio'); node(link,'trackindex',max(1,j)); node(link,'clipindex',idx)
                    if j: node(link,'groupindex',1)
            cursor+=length
    ET.indent(root)
    output.write_bytes(b'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n'+ET.tostring(root,encoding='utf-8'))

def export_cut(plan,folder,render,update,cancel,ffmpeg='ffmpeg'):
    total=sum(len(m['keep']) for m in plan['clips'])
    if total==0: raise ValueError('No speech remains. Lower the sensitivity or select another file.')
    for m in plan['clips']:
        st=Path(m['path']).stat()
        if [st.st_size,st.st_mtime_ns]!=m['fingerprint']: raise ValueError('Source changed since analysis; analyze again')
    folder.mkdir(parents=True,exist_ok=True)
    xml=folder/'AutoCut.xml'; write_xml(plan,xml)
    result={'xml':str(xml),'plan':str(folder/'cut-plan.json')}
    (folder/'cut-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    if render:
        rate=Fraction(plan['clips'][0]['rate']); fps=float(rate); count=0
        with tempfile.TemporaryDirectory(dir=folder) as td:
            temp=Path(td); parts=[]
            for m in plan['clips']:
                for a,b in m['keep']:
                    update(f'Rendering kept segment {count+1}/{total}',count,total)
                    dest=temp/f'part-{count:06d}.mov'; parts.append(dest)
                    # Shared trim times preserve A/V synchronization. CFR output is frame exact.
                    filt=f'[0:v:0]trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS[v];[0:a:0]atrim=start={a/fps:.9f}:end={b/fps:.9f},asetpts=PTS-STARTPTS,apad,atrim=duration={(b-a)/fps:.9f}[a]'
                    run([ffmpeg,'-y','-hide_banner','-nostdin','-protocol_whitelist','file,pipe','-i',m['path'],'-filter_complex',filt,'-map','[v]','-map','[a]',
                         '-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r',str(rate),
                         '-c:a','pcm_s16le','-ar','48000','-video_track_timescale',str(rate.numerator),str(dest)],cancel)
                    count+=1
            # Only generated ASCII basenames enter the concat list, never user paths.
            listing=temp/'parts.txt'; listing.write_text(''.join(f"file '{p.name}'\n" for p in parts),encoding='utf-8')
            target=folder/'AutoCut-preview.mp4'
            run([ffmpeg,'-y','-hide_banner','-nostdin','-f','concat','-safe','1','-i',str(listing),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',str(target)],cancel)
            result['preview']=str(target)
    return result

def stamp(seconds):
    ms=max(0,round(seconds*1000)); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

def srt(cues):
    return '\n\n'.join(f'{i}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"].strip()}' for i,c in enumerate(cues,1))+'\n'

def validate_srt(text):
    blocks=re.split(r'\n\s*\n',text.replace('\r','').strip()); last=0
    pattern=r'(\d{2,}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2,}):(\d{2}):(\d{2}),(\d{3})'
    for i,block in enumerate(blocks,1):
        lines=block.splitlines()
        if len(lines)<3 or lines[0]!=str(i): raise ValueError(f'Cue {i}: expected sequential number, timing and text')
        m=re.fullmatch(pattern,lines[1])
        if not m: raise ValueError(f'Cue {i}: invalid SRT time format')
        t=list(map(int,m.groups()))
        if any(t[j]>=60 for j in (1,2,5,6)): raise ValueError('Minutes and seconds must be below 60')
        a=t[0]*3600+t[1]*60+t[2]+t[3]/1000; b=t[4]*3600+t[5]*60+t[6]+t[7]/1000
        if a<last or b<=a or not '\n'.join(lines[2:]).strip(): raise ValueError(f'Cue {i}: empty text, overlap or invalid duration')
        last=b
    return text.replace('\r','').strip()+'\n'

def transcribe(path,model_dir,language,word_mode,folder,update,cancel,ffmpeg='ffmpeg',ffprobe='ffprobe'):
    if language not in ('auto','ar','en'): raise ValueError('Language must be auto, ar or en')
    if not (model_dir/'model.bin').is_file(): raise ValueError('Model missing. Run Download-Model.cmd once before transcription.')
    from faster_whisper import WhisperModel
    m=probe(media_path(path),ffprobe,cancel); folder.mkdir(parents=True,exist_ok=True)
    update('Loading local Whisper model (CPU int8)',None,None)
    model=WhisperModel(str(model_dir),device='cpu',compute_type='int8',local_files_only=True,cpu_threads=max(1,min(8,os.cpu_count() or 2)))
    if cancel.is_set(): raise Cancelled('Cancelled after model load')
    update('Extracting audio for local transcription',None,None)
    cues=[]; words=[]
    with tempfile.TemporaryDirectory(dir=folder) as td:
        wav=Path(td)/'speech.wav'
        run([ffmpeg,'-y','-hide_banner','-nostdin','-protocol_whitelist','file,pipe','-i',str(path),'-map','0:a:0','-ac','1','-ar','16000',str(wav)],cancel)
        update('Running local speech detection and recognition',None,None)
        segments,info=model.transcribe(str(wav),language=None if language=='auto' else language,word_timestamps=True,vad_filter=True,beam_size=5)
        for seg in segments:
            if cancel.is_set(): raise Cancelled('Cancelled between transcription segments')
            if seg.text.strip() and seg.end>seg.start: cues.append({'start':seg.start,'end':seg.end,'text':seg.text.strip()})
            for w in seg.words or []:
                if w.word.strip() and w.end>w.start: words.append({'start':w.start,'end':w.end,'text':w.word.strip()})
            update(f'Transcribed through {seg.end:.1f}s of {m["duration"]:.1f}s',min(seg.end,m['duration']),m['duration'])
    selected=words if word_mode else cues
    # Make rounded millisecond timings valid, preserving text and chronology.
    last=0
    for c in selected:
        c['start']=max(last,round(c['start'],3)); c['end']=max(c['start']+.001,round(c['end'],3)); last=c['end']
    if not selected: raise ValueError('No speech detected. Try another file or verify audio levels.')
    text=validate_srt(srt(selected)); target=folder/'captions.srt'; target.write_text(text,encoding='utf-8-sig')
    (folder/'transcript.json').write_text(json.dumps({'language':info.language,'segments':cues,'words':words},ensure_ascii=False,indent=2),encoding='utf-8')
    return {'srt':str(target),'text':text,'language':info.language,'cues':len(selected),'words':words}

"""Extract selected Premiere audio track without rendering video or changing the sequence."""
from pathlib import Path
from . import core


def caption_sequence(snapshot, folder, model_dir, language, word_mode, update, cancel, ffmpeg='ffmpeg', ffprobe='ffprobe'):
    if not isinstance(snapshot,dict) or not isinstance(snapshot.get('clips'),list):
        raise ValueError('Invalid Premiere caption snapshot')
    clips=snapshot['clips']
    if not 1<=len(clips)<=500:raise ValueError('Choose a nonempty audio track with at most 500 clips')
    # Premiere may report an unavailable sequence end as JSON null. In that case
    # derive the audio render end from the selected track, not a hard-coded sequence name.
    raw_duration=snapshot.get('duration')
    if raw_duration is None:
        valid_ends=[float(c['end']) for c in clips if c.get('end') is not None]
        if len(valid_ends)!=len(clips):
            raise ValueError('Premiere returned missing audio clip end time. Reopen the sequence and try again.')
        raw_duration=max(valid_ends)
    duration=core.number(raw_duration,0.1,4*3600,'Sequence duration')
    items=[]
    for i,c in enumerate(clips):
        path=core.media_path(c['path'])
        meta=core.probe(path,ffprobe,cancel)
        st=core.number(c['start'],0,4*3600,'clip start')
        en=core.number(c['end'],0,4*3600,'clip end')
        si=core.number(c['source_in'],0,4*3600,'clip source in')
        so=core.number(c['source_out'],0,4*3600,'clip source out')
        if en<=st or so<=si or en>duration+0.10 or so>meta['duration']+0.10:
            raise ValueError('Invalid audio bounds for clip '+str(i+1))
        if abs((en-st)-(so-si))>.08:
            raise ValueError('Clip '+str(i+1)+' appears retimed; caption extraction does not support retimed audio')
        items.append((path,st,en,si,so,meta['duration']))
    folder.mkdir(parents=True,exist_ok=True)
    # Align each source audio at its original timeline start; fill timeline gaps with silence.
    filters=[];labels=[];args=[ffmpeg,'-y','-hide_banner','-nostdin']
    for i,(path,st,en,si,so,full) in enumerate(items):
        args.extend(['-i',str(path)])
        delay=int(round(st*16000))
        filters.append(f'[{i}:a:0]atrim=start={si:.6f}:end={min(so,full):.6f},asetpts=PTS-STARTPTS,aresample=16000,aformat=channel_layouts=mono,adelay={delay}S:all=1[a{i}]')
        labels.append(f'[a{i}]')
    # amix with duration=longest overlays clips if necessary, rather than concatenating them incorrectly.
    filters.append(''.join(labels)+f'amix=inputs={len(labels)}:duration=longest:normalize=0,atrim=duration={duration:.6f},apad=whole_dur={duration:.6f}[out]') if len(labels)>1 else filters.append(labels[0]+f'atrim=duration={duration:.6f},apad=whole_dur={duration:.6f}[out]')
    filt=folder/'caption-audio-filter.txt';filt.write_text(';\n'.join(filters),encoding='utf-8')
    wav=folder/'active-sequence-audio.wav'
    update('Extracting selected timeline audio (no video render)',0,2)
    core.run(args+['-/filter_complex',str(filt),'-map','[out]','-t',f'{duration:.6f}','-c:a','pcm_s16le',str(wav)],cancel)
    update('Transcribing active sequence using local Whisper',1,2)
    result=core.transcribe(str(wav),model_dir,language,word_mode,folder,update,cancel,ffmpeg,ffprobe)
    result['note']='SRT is timed to the selected active Premiere sequence. Imported SRT still needs placing on a caption track.'
    return result

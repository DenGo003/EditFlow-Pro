"""Experimental microphone matching to the original camera's AutoCut plan.
Outputs only a new WAV; makes no changes in Premiere or original media.
"""
import argparse, json, math, os, subprocess, sys, tempfile, wave, shutil
from pathlib import Path

APP=Path(os.environ.get('EDITFLOW_WORK_ROOT', 'G:/EditFlowPro'))

def cmd(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,errors='replace')
    if p.returncode: raise RuntimeError((p.stderr or 'FFmpeg error')[-1800:])
    return p.stdout

def find_binary(name,root):
    preferred=Path(root)/'tools'/'ffmpeg'/'bin'/(name+'.exe')
    if preferred.exists():return str(preferred)
    found=shutil.which(name)
    if not found:raise FileNotFoundError(name+' missing; FFmpeg required')
    return found

def main():
    pa=argparse.ArgumentParser()
    pa.add_argument('--plan',required=True)
    pa.add_argument('--mic',required=True)
    pa.add_argument('--root',default=str(Path(__file__).resolve().parents[1]))
    pa.add_argument('--output')
    args=pa.parse_args()
    sys.path.insert(0, str(Path(args.root).resolve()))
    from backend.sync import estimate
    from fractions import Fraction
    planfile=Path(args.plan);mic=Path(args.mic)
    if not planfile.is_file() or not mic.is_file():raise FileNotFoundError('Cut plan or microphone WAV is missing')
    plan=json.loads(planfile.read_text(encoding='utf-8-sig'))
    clips=plan.get('clips',[])
    if len(clips)!=1:raise ValueError('Safety preview supports exactly one original camera clip')
    camera=Path(clips[0]['path'])
    if not camera.is_file():raise FileNotFoundError('Camera source not found: '+str(camera))
    fps=float(Fraction(clips[0]['rate']))
    keeps=clips[0]['keep']
    if not keeps:raise ValueError('No retained segments')
    ffmpeg=find_binary('ffmpeg',args.root)
    print('Matching source camera audio with original microphone (before cuts)...',flush=True)
    alignment=estimate(str(camera),str(mic),0,0,ffmpeg)
    print('Match: '+json.dumps(alignment),flush=True)
    if alignment['confidence']!='high':
        raise RuntimeError('Low-confidence alignment. No file created; do not guess timing.')
    # estimate shift_seconds = -lag_seconds for zero source in-points.
    # Corresponding microphone source timestamp = camera timestamp + lag_seconds.
    lag=float(alignment['lag_seconds'])
    # Preserve full mic source in a temp PCM file; process audio only (no video conversion).
    output=Path(args.output) if args.output else APP/'Outputs'/('SmartSyncMic-'+planfile.parent.name+'.wav')
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='editflow-mic-',dir=str(APP/'Temp') if (APP/'Temp').exists() else None) as td:
        raw=Path(td)/'mic.wav'
        print('Decoding microphone audio, no video transcoding...',flush=True)
        cmd([ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-i',str(mic),'-map','0:a:0','-vn','-ac','1','-ar','48000','-c:a','pcm_s16le','-y',str(raw)])
        with wave.open(str(raw),'rb') as inp:
            rate=inp.getframerate();total=inp.getnframes();frame_bytes=inp.getsampwidth()*inp.getnchannels()
            intervals=[]
            for start,end in keeps:
                a=int(round((float(start)/fps+lag)*rate))
                b=int(round((float(end)/fps+lag)*rate))
                if a<0 or b>total or b<=a:
                    raise ValueError('Sync offset puts kept cut outside microphone recording; no output generated. '+str((a,b,total)))
                intervals.append((a,b))
            tmp=output.with_name(output.stem+'.working.wav')
            try:
                with wave.open(str(tmp),'wb') as out:
                    out.setparams(inp.getparams())
                    for i,(a,b) in enumerate(intervals,1):
                        inp.setpos(a)
                        remaining=b-a
                        while remaining:
                            n=min(65536,remaining)
                            chunk=inp.readframes(n)
                            if not chunk:raise RuntimeError('Microphone file ended unexpectedly')
                            out.writeframesraw(chunk)
                            remaining-=len(chunk)//frame_bytes
                        if i%20==0:print('Segments: '+str(i)+'/'+str(len(intervals)),flush=True)
                tmp.replace(output)
            finally:
                if tmp.exists():tmp.unlink()
    print('SUCCESS: '+str(output))
    print('Import the new WAV into Premiere on a DUPLICATE AutoCut sequence; mute camera audio manually.')

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('SAFE STOP: '+str(e),file=sys.stderr)
        sys.exit(1)

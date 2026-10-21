"""EditFlow Caption Studio standalone transparent ProRes overlay renderer.

Reads a locally authored task JSON. Does not need cloud access or alter Premiere projects.
Uses only Python 3 standard library and FFmpeg/FFprobe. SRT text never leaves PC.
"""
from __future__ import annotations
import json, os, re, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'EditFlowPro'
TASK = ROOT / 'caption-studio-job.json'
RESULT = ROOT / 'caption-studio-result.json'

def write_result(d):
    ROOT.mkdir(parents=True, exist_ok=True)
    temp = RESULT.with_suffix('.tmp')
    temp.write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, RESULT)

def parse_time(value):
    m = re.fullmatch(r'(\d{2,3}):(\d\d):(\d\d)[,.](\d\d\d)',value.strip())
    if not m: raise ValueError('Invalid SRT timestamp: ' + value[:32])
    h,mi,s,ms=map(int,m.groups())
    if mi>59 or s>59: raise ValueError('Invalid SRT clock time')
    return h*3600+mi*60+s+ms/1000

def parse_srt(path):
    contents=path.read_text(encoding='utf-8-sig',errors='replace').replace('\r\n','\n').replace('\r','\n').strip()
    out=[]
    for block in re.split(r'\n\s*\n',contents):
        lines=[line.strip() for line in block.split('\n') if line.strip()]
        ts=next((i for i,line in enumerate(lines) if '-->' in line),None)
        if ts is None: continue
        parts=lines[ts].split('-->')
        if len(parts)!=2: continue
        start=parse_time(parts[0]);end=parse_time(parts[1].strip().split(' ')[0])
        txt=' '.join(lines[ts+1:])
        txt=re.sub(r'<[^>]*>','',txt).strip()
        txt=txt.replace('{','').replace('}','').replace('\\','')
        if txt and 0<=start<end: out.append((start,end,txt))
    out.sort(key=lambda x:x[0]);return out

def partition(cues,count):
    result=[]
    for start,end,text in cues:
        words=text.split()
        if not words: continue
        groups=[words[n:n+count] for n in range(0,len(words),count)]
        if len(groups)>300:raise ValueError('SRT cue unusually long')
        widths=[max(1,sum(len(w) for w in g)) for g in groups];total=sum(widths)
        at=start
        for idx,grp in enumerate(groups):
            till=end if idx==len(groups)-1 else start+(end-start)*sum(widths[:idx+1])/total
            if till-at>=0.06:result.append((at,till,' '.join(grp)))
            at=till
    return result

def ass_color(s,alpha='00'):
    if not re.fullmatch('#[0-9a-fA-F]{6}',s):raise ValueError('Invalid hex color')
    r,g,b=s[1:3],s[3:5],s[5:7]
    return f'&H{alpha}{b}{g}{r}'.upper()

def format_ts(sec):
    cs=round(sec*100)
    return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'

def ass_escape(s):
    return s.replace('\\','').replace('{','').replace('}','').replace('\n','\\N')

def make_ass(cues,settings,width,height,dest):
    font='Arial'  # Standard Windows Arabic-capable fallback via libass font substitution
    size=max(24,min(120,round(float(settings.get('size',28))*height/360)))
    bottom=settings.get('position')!='middle'
    alignment=2 if bottom else 5
    margin_v=round(height*(.10 if bottom else .04))
    outline=max(0,min(6,int(settings.get('outline','1'))))*max(1,round(height/600))
    border=3 if settings.get('background') in ('box','pill','word') else 1
    primary=ass_color(settings.get('textColor','#ffffff'))
    accent=ass_color(settings.get('accent','#f24857'))
    background='&H700A0A0A'  # translucent solid background for box styles
    style=f'Default,{font},{size},{primary},{accent},&H98000000,{background},-1,0,0,0,100,100,0,0,{border},{outline},1,{alignment},30,30,{margin_v},1'
    motion=settings.get('motion','pop')
    lines=[
      '[Script Info]','ScriptType: v4.00+','PlayResX: '+str(width),'PlayResY: '+str(height),
      'WrapStyle: 2','ScaledBorderAndShadow: yes','YCbCr Matrix: TV.709','',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: '+style,'','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
    ]
    for st,en,txt in cues:
        duration=round((en-st)*1000)
        if duration<100:continue
        effect='\\fad(80,60)'
        if motion=='pop':effect='\\fscx88\\fscy88\\t(0,160,\\fscx100\\fscy100)\\fad(60,60)'
        elif motion=='bounce':effect='\\fscx92\\fscy92\\t(0,110,\\fscx105\\fscy105)\\t(110,245,\\fscx100\\fscy100)\\fad(55,55)'
        elif motion=='slide':
            x=width//2;y=height-margin_v if bottom else height//2
            effect=f'\\move({x},{y+round(height*.035)},{x},{y},0,170)\\fad(50,60)'
        elif motion=='none':effect=''
        # Deliberately not claiming true word-level karaoke: SRT only timestamps cues.
        logical=ass_escape(txt)
        parts=logical.rsplit(' ',1)
        emphasis='{\\1c&H'+accent[4:]+'&}'
        highlighted=(parts[0]+' '+emphasis+parts[1]) if len(parts)==2 else emphasis+logical
        text='{'+effect+'}'+highlighted if effect else highlighted
        lines.append(f'Dialogue: 0,{format_ts(st)},{format_ts(en)},Default,,0,0,0,,{text}')
    dest.write_text('\n'.join(lines)+'\n',encoding='utf-8-sig')

def main():
    task=json.loads(TASK.read_text(encoding='utf-8'))
    jid=str(task['id'])
    if not re.fullmatch('[a-f0-9]{24,40}',jid):raise ValueError('Invalid task id')
    srt=Path(task['srt']).resolve()
    if srt.suffix.lower()!='.srt' or not srt.is_file() or srt.stat().st_size>5_000_000:
        raise ValueError('Choose an existing SRT smaller than 5 MB')
    settings=task['settings'];w=int(task['width']);h=int(task['height']);fps=float(task.get('fps',25))
    if not (320<=w<=3840 and 240<=h<=2160 and 10<=fps<=60):raise ValueError('Invalid sequence dimensions/fps')
    c=parse_srt(srt)
    if not c:raise ValueError('SRT has no valid cues')
    duration=max(end for st,end,_ in c)
    if duration>14400 or len(c)>10000:raise ValueError('Video too long for this renderer')
    count=int(settings.get('words','2')) if settings.get('words','2')!='auto' else 3
    if not 1<=count<=4:raise ValueError('Words per caption must be 1–4')
    cues=partition(c,count)
    folder=ROOT/'outputs'/'caption-studio'/jid
    folder.mkdir(parents=True,exist_ok=True)
    ass=folder/'captions.ass';mov=folder/'EditFlow-Animated-Captions.mov'
    make_ass(cues,settings,w,h,ass)
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:
        fallback=Path.home()/'AppData'/'Local'/'Microsoft'/'WinGet'/'Links'/'ffmpeg.exe'
        if fallback.is_file():ffmpeg=str(fallback)
    if not ffmpeg:raise ValueError('FFmpeg was not found. Install it or add it to PATH, then retry')
    write_result({'id':jid,'state':'rendering','message':'Rendering transparent caption video','done':0,'total':duration})
    args=[ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i',f'color=c=black@0.0:s={w}x{h}:r={fps:.4f}:d={duration:.3f},format=rgba',
       '-vf','ass=captions.ass:alpha=1,format=argb','-an','-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le',
       '-progress','pipe:1','-nostats',str(mov)]
    proc=subprocess.Popen(args,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',errors='replace')
    progress=0.;lastwrite=0
    for line in proc.stdout:
        line=line.strip()
        if line.startswith('out_time='):
            stamp=line.split('=',1)[1]
            try:
                hrs,mins,secs=stamp.split(':')
                progress=min(duration,max(0,float(hrs)*3600+float(mins)*60+float(secs)))
            except ValueError:pass
        if time.monotonic()-lastwrite>1:
            write_result({'id':jid,'state':'rendering','message':f'Rendering {progress:.1f}/{duration:.1f}s', 'done':progress,'total':duration})
            lastwrite=time.monotonic()
    stderr=proc.stderr.read();code=proc.wait()
    if code or not mov.is_file() or mov.stat().st_size<1000:
        raise RuntimeError('FFmpeg failed: '+stderr[-1100:])
    # Protect user's video from accidentally opaque overlays.
    probe=subprocess.run([ffmpeg,'-v','error','-i',str(mov),'-frames:v','1','-vf','crop=1:1:0:0,format=rgba',
        '-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    if probe.returncode or len(probe.stdout)<4 or probe.stdout[3]>16:
        mov.unlink(missing_ok=True)
        raise RuntimeError('Alpha transparency verification failed; opaque overlay deleted for safety')
    write_result({'id':jid,'state':'complete','mov':str(mov),'ass':str(ass),'cues':len(cues), 'source_cues':len(c),'duration':duration,'message':'Transparent ProRes overlay ready'})

if __name__=='__main__':
    try:main()
    except Exception as e:
        try:
            id_=json.loads(TASK.read_text(encoding='utf-8')).get('id','')
            write_result({'id':id_,'state':'failed','message':str(e)[:1600]})
        except Exception:pass
        print('Render failed:',str(e),file=sys.stderr)
        sys.exit(1)

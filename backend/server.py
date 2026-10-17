"""Authenticated loopback-only JSON API. One media worker, no cloud calls."""
from __future__ import annotations
import argparse, copy, json, os, secrets, shutil, threading, uuid, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from . import core, sync, timeline_cut, timeline_caption, visual_ai

class Service:
    def __init__(self,root,ffmpeg='ffmpeg',ffprobe='ffprobe',token=None):
        self.root=Path(root).resolve(); self.root.mkdir(parents=True,exist_ok=True)
        self.ffmpeg=ffmpeg; self.ffprobe=ffprobe; self.token=token or secrets.token_urlsafe(32)
        self.work_root=Path(os.environ.get('EDITFLOW_WORK_ROOT', str(self.root))).resolve()
        self.work_root.mkdir(parents=True,exist_ok=True)
        self.jobs={}; self.lock=threading.RLock(); self.pool=ThreadPoolExecutor(max_workers=1)
    def status(self,jid):
        with self.lock:
            if jid not in self.jobs: raise ValueError('Unknown job; backend may have restarted')
            return copy.deepcopy({k:v for k,v in self.jobs[jid].items() if k!='cancel'})
    def start(self,kind,data):
        if kind not in ('analyze','export','transcribe','sync','sync_after_cut','timeline_cut','timeline_caption','sequence_caption','visual_ai'): raise ValueError('Unknown operation')
        with self.lock:
            if any(j['state'] in ('queued','running') for j in self.jobs.values()): raise ValueError('A job is already running; wait or cancel it')
            jid=uuid.uuid4().hex; event=threading.Event()
            self.jobs[jid]={'id':jid,'kind':kind,'state':'queued','message':'Queued','done':None,'total':None,'cancel':event}
        def update(message,done=None,total=None):
            with self.lock: self.jobs[jid].update(message=message,done=done,total=total)
        def worker():
            folder=self.work_root/'outputs'/jid
            try:
                with self.lock: self.jobs[jid]['state']='running'
                if kind=='analyze': result=core.analyze(data['paths'],data.get('settings',{}),update,event,self.ffmpeg,self.ffprobe,self.work_root)
                elif kind=='export':
                    src=self.status(data['analysis_id'])
                    if src['kind']!='analyze' or src['state']!='complete': raise ValueError('Analyze successfully before export')
                    result=core.export_cut(src['result'],folder,bool(data.get('render')),update,event,self.ffmpeg)
                elif kind=='sync':
                    update('Comparing A1 and A2 audio waveforms…',0,1)
                    result=sync.estimate(data['camera_path'],data['mic_path'],data['camera_in'],data['mic_in'],self.ffmpeg,event)
                    update('Synchronization analyzed',1,1)
                elif kind=='timeline_cut':
                    result=timeline_cut.analyze_and_export(data['snapshot'],data.get('settings',{}),folder,update,event,self.ffmpeg,self.ffprobe)
                elif kind=='timeline_caption':
                    plan=Path(data['plan']).resolve()
                    base=(self.work_root/'outputs').resolve()
                    if not plan.is_relative_to(base) or plan.name!='timeline-cut-plan.json' or not plan.is_file():
                        raise ValueError('Caption plan must be a previous Timeline AutoCut result in Outputs')
                    result=timeline_cut.caption_from_plan(plan, folder, self.root/'models'/'small',data.get('language','ar'),bool(data.get('word_mode',False)),update,event,self.ffmpeg,self.ffprobe)
                elif kind=='visual_ai':
                    result=visual_ai.analyze(data['snapshot'],update,event,self.ffmpeg)
                elif kind=='sequence_caption':
                    result=timeline_caption.caption_sequence(data['snapshot'],folder,self.root/'models'/'small',data.get('language','ar'),bool(data.get('word_mode',False)),update,event,self.ffmpeg,self.ffprobe)
                elif kind=='sync_after_cut':
                    plan=Path(data['plan']).resolve()
                    mic=Path(data['mic']).resolve()
                    base=(self.work_root/'outputs').resolve()
                    if not plan.is_relative_to(base) or plan.name!='cut-plan.json' or not plan.is_file():
                        raise ValueError('Choose an existing EditFlow cut plan from Outputs')
                    if not mic.is_file() or mic.suffix.lower() not in ('.wav','.mp3','.m4a','.mp4','.mov','.flac'):
                        raise ValueError('Microphone source not found or format not supported')
                    folder.mkdir(parents=True,exist_ok=True)
                    output=folder/'SmartSyncMic.wav'
                    args=[sys.executable,str(Path(__file__).resolve().parents[1]/'scripts'/'smart_sync_after_autocut.py'),
                          '--root',str(Path(__file__).resolve().parents[1]),'--plan',str(plan),
                          '--mic',str(mic),'--output',str(output)]
                    update('Matching original camera and microphone, then applying AutoCut ranges…')
                    env=os.environ.copy();env['EDITFLOW_WORK_ROOT']=str(self.work_root)
                    proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,errors='replace',env=env)
                    try:
                        while proc.poll() is None:
                            if event.wait(0.2):
                                proc.kill();proc.communicate();raise core.Cancelled('Cancelled')
                        stdout,stderr=proc.communicate()
                    finally:
                        if proc.poll() is None:proc.kill()
                    if proc.returncode:raise RuntimeError((stderr or stdout)[-1000:])
                    if not output.is_file():raise RuntimeError('Aligned WAV not created')
                    result={'wav':str(output),'message':'Import into a duplicate AutoCut sequence at 00:00; mute camera audio only after review.'}
                else:
                    result=core.transcribe(data['path'],self.root/'models'/'small',data.get('language','auto'),bool(data.get('word_mode')),folder,update,event,self.ffmpeg,self.ffprobe)
                if event.is_set(): raise core.Cancelled('Cancelled')
                with self.lock: self.jobs[jid].update(state='complete',message='Complete',result=result)
            except Exception as e:
                shutil.rmtree(folder,ignore_errors=True)
                with self.lock: self.jobs[jid].update(state='cancelled' if isinstance(e,core.Cancelled) else 'failed',message=str(e))
        self.pool.submit(worker)
        return {'id':jid}
    def cancel(self,jid):
        with self.lock:
            if jid not in self.jobs: raise ValueError('Unknown job')
            self.jobs[jid]['cancel'].set()
        return {'ok':True}
    def save(self,jid,text):
        j=self.status(jid)
        if j['kind']!='transcribe' or j['state']!='complete': raise ValueError('No completed transcript for this job')
        text=core.validate_srt(text)
        dest=Path(j['result']['srt']).with_name(f'captions-edited-{uuid.uuid4().hex[:8]}.srt')
        dest.write_text(text,encoding='utf-8-sig')
        return {'srt':str(dest),'text':text}

def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass # No media paths/tokens in web logs
        def reply(self,code,data):
            payload=json.dumps(data,ensure_ascii=False,allow_nan=False).encode('utf-8')
            self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(payload))); self.send_header('Cache-Control','no-store')
            # Some UXP runtimes send an opaque Origin. Still require the session token.
            if self.headers.get('Origin') in ('null', 'file://'):
                self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin')); self.send_header('Vary','Origin')
            self.end_headers(); self.wfile.write(payload)
        def authorized(self):
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'):
                self.reply(403,{'error':'Invalid Host'}); return False
            if not secrets.compare_digest(self.headers.get('Authorization',''),f'Bearer {service.token}'):
                self.reply(401,{'error':'Pair the panel again using the token printed by Start Backend'}); return False
            return True
        def do_OPTIONS(self):
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}') or self.headers.get('Origin') not in ('null', 'file://'):
                self.reply(403,{'error':'Origin not allowed'}); return
            self.send_response(204); self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin'))
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type')
            self.send_header('Vary','Origin'); self.send_header('Content-Length','0'); self.end_headers()
        def do_GET(self):
            if not self.authorized(): return
            try:
                if self.path=='/health':
                    self.reply(200,{'version':'0.8.2-nested-visual-scheduled-updates','model_ready':(service.root/'models/small/model.bin').is_file(),
                                    'ffmpeg':bool(shutil.which(service.ffmpeg)),'ffprobe':bool(shutil.which(service.ffprobe)),
                                    'output_root':str(service.work_root/'outputs')})
                elif self.path.startswith('/jobs/'): self.reply(200,service.status(self.path.split('/')[-1]))
                else: self.reply(404,{'error':'Not found'})
            except (ValueError,KeyError) as e: self.reply(400,{'error':str(e)})
        def do_POST(self):
            if not self.authorized(): return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=2_000_000: raise ValueError('Request must be 1 byte to 2 MB')
                if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ValueError('JSON required')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise ValueError('JSON object required')
                if self.path=='/jobs': result=service.start(data['kind'],data)
                elif self.path=='/cancel': result=service.cancel(data['id'])
                elif self.path=='/save-srt': result=service.save(data['id'],data['text'])
                else: self.reply(404,{'error':'Not found'}); return
                self.reply(200,result)
            except (ValueError,KeyError,TypeError,OSError) as e: self.reply(400,{'error':str(e)})
    return Handler

def persistent_token(root):
    """Keep a per-user local pairing secret across restarts; never ship a shared token."""
    p = Path(root) / 'pairing-token.txt'
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        token = p.read_text(encoding='ascii').strip()
        if len(token) < 40:
            raise RuntimeError('Pairing secret invalid; remove pairing-token.txt only after stopping backend')
        return token
    token = secrets.token_urlsafe(32)
    with os.fdopen(fd, 'w', encoding='ascii') as f:
        f.write(token + '\n')
    return token

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--root',default=str(Path(os.getenv('LOCALAPPDATA',str(Path.home()/'.local/share')))/'EditFlowPro'))
    parser.add_argument('--port',type=int,default=8765); parser.add_argument('--ffmpeg',default='ffmpeg'); parser.add_argument('--ffprobe',default='ffprobe')
    os.environ['HF_HUB_OFFLINE']='1'; os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
    args=parser.parse_args(); service=Service(args.root,args.ffmpeg,args.ffprobe, persistent_token(args.root))
    server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(service))
    print(f'EditFlow Pro 0.5.0 Timeline Test | http://127.0.0.1:{args.port}\nPairing token (stable for this Windows user):\n{service.token}\nOutputs: {service.work_root / "outputs"}\nKeep this window open. Ctrl+C stops the backend.',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        for job in list(service.jobs.values()): job['cancel'].set()
        server.server_close(); service.pool.shutdown(wait=True)

if __name__=='__main__': main()

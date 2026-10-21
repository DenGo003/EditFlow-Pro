"""Shared launcher. Direct loopback health + exclusive bind check; never kill a process."""
import json, os, socket, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path
VERSION='0.9.6'

def port_available(port=8765):
 # Do not infer occupancy from Windows timeout/errno shapes. Ask the OS to bind.
 # Server performs its own final bind after this probe, so a race fails safely.
 with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as probe:
  if os.name=='nt' and hasattr(socket,'SO_EXCLUSIVEADDRUSE'):
   probe.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
  try:probe.bind(('127.0.0.1',port))
  except OSError as e:raise RuntimeError('Cannot reserve local port '+str(port)+'; no second backend started. OS error '+str(getattr(e,'winerror',None) or e.errno)) from e
 return True

def inspect_backend(token,port=8765):
 request=urllib.request.Request(f'http://127.0.0.1:{port}/health',headers={'Authorization':'Bearer '+token})
 # Windows system proxies must never receive a local pairing request.
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 try:
  with opener.open(request,timeout=3) as response:health=json.load(response)
 except urllib.error.HTTPError as e:
  raise RuntimeError('Local port answered HTTP '+str(e.code)+'. Close the old backend window before retrying; no new process started.') from e
 except (urllib.error.URLError,TimeoutError,ConnectionError,OSError) as e:
  port_available(port)
  return {'state':'free','probeErrorType':type(e).__name__}
 if not isinstance(health,dict) or health.get('version')!=VERSION:
  raise RuntimeError('A different backend version is running. Close its window, then Start & Connect.')
 return {'state':'running','version':VERSION}

def record(state,stage,**details):
 state.mkdir(parents=True,exist_ok=True)
 report={'release':VERSION,'time':time.strftime('%Y-%m-%dT%H:%M:%S'),'stage':stage,**details}
 target=state/'launcher-status.json';temp=state/'launcher-status.tmp'
 temp.write_text(json.dumps(report,indent=2),encoding='utf-8');os.replace(temp,target)

def main():
 state=Path(os.environ['LOCALAPPDATA'])/'EditFlowPro'
 record(state,'reading-config')
 cfg=json.loads((state/'cep-launcher.json').read_text(encoding='utf-8-sig'))
 root=Path(cfg['backendRoot']);python=Path(cfg['backendPython'])
 if not (root/'release.json').is_file():raise RuntimeError('Run Install-Update.cmd for the unified release first.')
 if not python.is_file():raise RuntimeError('Configured Python environment no longer exists.')
 env=os.environ.copy();env['EDITFLOW_WORK_ROOT']=cfg.get('workRoot') or str(state)
 env['HF_HUB_OFFLINE']='1';env['HF_HUB_DISABLE_TELEMETRY']='1'
 env['PATH']=str(cfg.get('ffmpegBin') or root/'tools/ffmpeg/bin')+os.pathsep+env.get('PATH','')
 if '--caption' in sys.argv:
  with (state/'caption-render.log').open('a',encoding='utf-8') as log:
   return subprocess.call([str(python),str(root/'uxp/renderer/caption-render.py')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 token=(state/'pairing-token.txt').read_text(encoding='ascii').strip()
 result=inspect_backend(token);record(state,'health-probed',result=result)
 if result['state']=='running':print('EditFlow '+VERSION+' already running and authenticated.');return 0
 print('Starting EditFlow '+VERSION+'. Keep this window open. Startup details are included in Export diagnostic report.',flush=True)
 # Fresh log per launch; startup failures are available to the panel even if no HTTP server starts.
 with (state/'backend-startup.log').open('w',encoding='utf-8') as log:
  child=subprocess.Popen([str(python),'-u','-m','backend.server','--root',str(state)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
  record(state,'process-started',pid=child.pid)
  code=child.wait()
 record(state,'process-exited',exitCode=code)
 if code:raise RuntimeError('Backend exited with code '+str(code)+'. Export diagnostic report includes its startup log.')
 return code
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as e:
  try:record(Path(os.environ['LOCALAPPDATA'])/'EditFlowPro','failed',errorType=type(e).__name__,error=str(e))
  except Exception:pass
  print('EditFlow launch failed:',str(e));sys.exit(1)

"""Migrate an existing installation to a versioned source tree; reversible config swap."""
import hashlib, json, os, shutil, socket, sys, tempfile, time
from pathlib import Path
SOURCE=Path(__file__).resolve().parents[1]
def validate(source):
 data=json.loads((source/'package-manifest.json').read_text(encoding='utf-8'))
 required={'backend/server.py','uxp/manifest.json','uxp/main.js','scripts/launch.py','release.json'}
 if not required.issubset(data.get('files',{})):raise ValueError('Incomplete package manifest')
 for name,digest in data['files'].items():
  p=(source/name).resolve()
  if not p.is_relative_to(source.resolve()) or not p.is_file():raise ValueError('Invalid/missing package file: '+name)
  if hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise ValueError('Package checksum mismatch: '+name)
 return data

def install(state,source=SOURCE):
 validate(source)
 config=state/'cep-launcher.json'
 old=config.read_bytes();cfg=json.loads(old.decode('utf-8-sig'))
 python=Path(cfg.get('backendPython') or Path(cfg['backendRoot'])/'.venv/Scripts/python.exe')
 if not python.is_file():raise RuntimeError('Existing Python missing; this update reuses the installed environment.')
 version=json.loads((source/'release.json').read_text())['version']
 releases=state/'releases';releases.mkdir(parents=True,exist_ok=True)
 dest=releases/version
 if dest.exists():raise RuntimeError('This release is already installed. Use its stable UXP manifest; do not install twice.')
 backup=state/'backups'/time.strftime('%Y%m%d-%H%M%S');backup.mkdir(parents=True)
 (backup/'cep-launcher.json').write_bytes(old)
 stable=state/'current'/'uxp';stage=Path(tempfile.mkdtemp(prefix='stage-',dir=releases))
 stable_changed=False
 try:
  shutil.copytree(source,stage,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','.git','*.pyc'))
  validate(stage)
  if stable.exists():shutil.copytree(stable,backup/'uxp')
  stage.rename(dest)
  oldroot=Path(cfg['backendRoot'])
  cfg.update(backendRoot=str(dest),backendPython=str(python),workRoot=cfg.get('workRoot') or str(state),release=version,
   ffmpegBin=cfg.get('ffmpegBin') or str(oldroot/'tools/ffmpeg/bin'))
  stable.parent.mkdir(parents=True,exist_ok=True)
  stable_changed=True
  if stable.exists():shutil.rmtree(stable)
  shutil.copytree(dest/'uxp',stable)
  temp=config.with_suffix('.tmp');temp.write_text(json.dumps(cfg,indent=2),encoding='utf-8');os.replace(temp,config)
  # First bootstrap may not yet have a pairing file; preserve it if it exists.
  import secrets
  token=state/'pairing-token.txt'
  if not token.exists():token.write_text(secrets.token_urlsafe(32)+'\n',encoding='ascii')
 except Exception:
  config.write_bytes(old)
  if stable_changed:
   if stable.exists():shutil.rmtree(stable)
   if (backup/'uxp').exists():shutil.copytree(backup/'uxp',stable)
  if dest.exists():shutil.rmtree(dest)
  raise
 finally:
  if stage.exists():shutil.rmtree(stage)
 print('Installed EditFlow '+version+'\nUXP Developer Tools > Add Plugin:\n'+str(stable/'manifest.json')+'\nRollback backup: '+str(backup))

def main():
 if os.name!='nt':raise RuntimeError('Windows installer; tests call install() with isolated fixtures.')
 with socket.socket() as s:
  s.settimeout(.5)
  if s.connect_ex(('127.0.0.1',8765))==0:raise RuntimeError('Close the backend window before updating. No files changed.')
 import subprocess
 running=subprocess.check_output(['tasklist','/FI','IMAGENAME eq Adobe Premiere Pro.exe','/NH'],text=True,errors='replace')
 if 'Adobe Premiere Pro.exe' in running:raise RuntimeError('Save your project and close Premiere before updating.')
 install(Path(os.environ['LOCALAPPDATA'])/'EditFlowPro')
if __name__=='__main__':
 try:main()
 except Exception as e:print('Update failed:',str(e));sys.exit(1)

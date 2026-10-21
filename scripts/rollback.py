"""Restore the most recent installer backup after closing Premiere/backend."""
import json, os, shutil, socket, subprocess
from pathlib import Path

def main():
 if os.name!='nt':raise RuntimeError('Windows only')
 with socket.socket() as s:
  s.settimeout(.5)
  if s.connect_ex(('127.0.0.1',8765))==0:raise RuntimeError('Close the backend before rollback.')
 if 'Adobe Premiere Pro.exe' in subprocess.check_output(['tasklist','/FI','IMAGENAME eq Adobe Premiere Pro.exe','/NH'],text=True,errors='replace'):
  raise RuntimeError('Close Premiere before rollback.')
 state=Path(os.environ['LOCALAPPDATA'])/'EditFlowPro'
 backups=sorted((state/'backups').glob('*/cep-launcher.json'))
 if not backups:raise RuntimeError('No installation backup found.')
 latest=backups[-1];json.loads(latest.read_text(encoding='utf-8-sig'))
 stable=state/'current/uxp'
 if (latest.parent/'uxp').exists():
  if stable.exists():shutil.rmtree(stable)
  shutil.copytree(latest.parent/'uxp',stable)
 temp=state/'rollback-config.tmp';shutil.copyfile(latest,temp);os.replace(temp,state/'cep-launcher.json')
 print('Backend config restored. For the first migration, load your previous UXP manifest in Developer Tools. No model, media or token changed.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('Rollback failed:',e);raise SystemExit(1)

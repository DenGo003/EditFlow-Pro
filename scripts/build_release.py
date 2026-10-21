"""Build a source-only release with a per-file corruption-check manifest."""
import hashlib, json, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def files():
 for p in sorted(ROOT.rglob('*')):
  relative=p.relative_to(ROOT)
  if relative.parts[0] not in {'backend','plugin','uxp','scripts','docs','tests','README.md','release.json','HANDOFF-SOL.md','Install-Update.cmd','Rollback.cmd'}:continue
  if not p.is_file() or any(x in p.parts for x in ('.git','.venv','__pycache__','models','outputs')):continue
  if p.name in ('package-manifest.json','pairing-token.txt','cep-launcher.json') or p.suffix in ('.pyc','.log','.zip'):continue
  yield p
if __name__=='__main__':
 version=json.loads((ROOT/'release.json').read_text())['version']
 manifest={'version':version,'purpose':'Corruption detection, not a publisher signature','files':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files()}}
 (ROOT/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 output=ROOT.parent/f'EditFlow-Pro-{version}-Unified.zip'
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for p in [*files(),ROOT/'package-manifest.json']:z.write(p,f'EditFlow-Pro-{version}/'+p.relative_to(ROOT).as_posix())
 print(str(output));print('SHA256',hashlib.sha256(output.read_bytes()).hexdigest())

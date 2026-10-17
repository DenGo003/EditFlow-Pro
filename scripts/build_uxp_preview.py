"""Build only the development panel from source; not a CCX installer or release."""
from pathlib import Path
import hashlib, json, zipfile
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'uxp/manifest.json').read_text())
assert manifest['host']['minVersion']=='25.6.2'
out=root/'artifacts';out.mkdir(exist_ok=True)
archive=out/'EditFlow-Pro-UXP-M1.1-AutoConnect.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((root/'uxp').rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(root))
 z.write(root/'docs/UXP-MIGRATION.md','UXP-MIGRATION.md')
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
print(archive.name,digest)

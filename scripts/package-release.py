from pathlib import Path
import json, subprocess, zipfile, hashlib
root=Path(__file__).resolve().parent.parent
out=root.parent/'releases';out.mkdir(exist_ok=True)
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()
secrets=[]
local=root/'.dev.vars'
if local.exists():
 for line in local.read_text(encoding='utf8').splitlines():
  if '=' in line:
   value=line.split('=',1)[1].strip().strip(chr(34)).strip(chr(39))
   if len(value)>20:secrets.append(value.encode())
archive=out/('convoke-'+json.loads((root/'package.json').read_text())['version']+'-source.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name in files:
  if name.startswith(('examples/','outputs/','.git/')) or name=='STARTER.md':continue
  p=root/name
  if not p.is_file():continue
  data=p.read_bytes()
  if name=='.openai/hosting.json':data=b'{"d1":"DB","r2":null}\n'
  if any(secret in data for secret in secrets):raise RuntimeError('Secret detected; archive not suitable for sharing')
  z.writestr('convoke/'+name,data)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert 'convoke/HOSTING.md' in z.namelist()
 assert not any(n.endswith('/.dev.vars') or '/node_modules/' in n or '/.wrangler/' in n for n in z.namelist())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(digest+'  '+archive.name+'\n',encoding='utf8')
print(json.dumps({'archive':str(archive),'files':len(files),'sha256':digest,'bytes':archive.stat().st_size}))

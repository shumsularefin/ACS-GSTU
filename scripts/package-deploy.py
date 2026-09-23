from pathlib import Path
import json,zipfile
root=Path.cwd();target=root/'output/acs-firebase-deploy.zip';target.parent.mkdir(exist_ok=True)
config=json.loads((root/'firebase.json').read_text(encoding='utf-8-sig'));config['hosting'].pop('predeploy',None)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for p in (root/'public').rglob('*'):
  if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root/'public').parts) and p.name not in ['firebase.json','firebase-debug.log']:
   z.write(p,p.relative_to(root).as_posix())
 z.writestr('firebase.json',json.dumps(config,indent=2));z.write(root/'firestore.rules','firestore.rules')
print(target,round(target.stat().st_size/1024/1024,1),'MB')

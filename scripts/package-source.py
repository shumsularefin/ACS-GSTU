"""Create a clean source archive; never include backups, credentials or workbooks."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re

root = Path(__file__).resolve().parent.parent
target = root / 'output/ACS-GSTU-source.zip'
target.parent.mkdir(exist_ok=True)
files = [root / p for p in ['package.json', 'README.md', 'DEPLOYMENT.md', 'PROJECT-BRIEF.md', 'UPDATE-GUIDE.md', '.gitignore', '.firebaserc', 'firebase.json', 'firestore.rules', 'google3d74b2f79116caad.html']]
for folder in ['src', 'data', 'fonts', 'ico', 'images', 'tests', '.github']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root / folder).parts))
files.extend(root / 'css' / name for name in ['style.css', 'site.css', 'original-fonts.css', 'bootstrap.min.css'])
modules = ['media.js','site-shell.js','homepage.js','editor-access.js','admin-access-panel.js','content-model.js','content-render.js','public-content.js','admin.js','cloud-editor.js','excel-worker.js','certificate-model.js','certificate-render.js','certificate-admin.js','verify.js']
files.extend(root / 'js' / name for name in modules)
files.extend(p for p in (root / 'js/vendor').rglob('*') if p.is_file())
files.extend(root / 'scripts' / name for name in ['build.mjs','serve.mjs','import-content.mjs','package-deploy.py','package-source.py','check-browser.cjs','check-final-editor.cjs','check-editor-roles.cjs','check-certificates.cjs','check-member-certificates.cjs','check-layout-filters.cjs','check-filter-frames.cjs','check-firestore-rules.mjs'])
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for p in sorted(set(files)):
        if p.name == 'generated-pages.json' or 'backups' in p.parts:
            continue
        archive.write(p, p.relative_to(root).as_posix())
print(f'{target}: {len(files)} source files, {target.stat().st_size / 1024 / 1024:.1f} MB')

import zipfile
from pathlib import Path

api_dir = Path('.')
out_zip = api_dir.parent.parent.parent / 'fastapi_backend.zip'

include_patterns = [
    'main.py', 'test_endpoints.json', 'requirements.txt',
    'config.yaml', 'pyproject.toml', 'quick_test.py',
]
include_dirs = ['achp']
exclude_dirs = {'.venv', '__pycache__', '.git', 'data', 'tests'}
exclude_exts = {'.pyc', '.pyo', '.db', '.faiss', '.png', '.jpg'}

count = 0
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in include_patterns:
        p = api_dir / f
        if p.exists():
            zf.write(p, 'fastapi_backend/' + f)
            print('  +', f)
            count += 1
    for d in include_dirs:
        dp = api_dir / d
        if dp.is_dir():
            for fp in dp.rglob('*'):
                if not fp.is_file():
                    continue
                parts = set(fp.parts)
                if any(exc in parts for exc in exclude_dirs):
                    continue
                if fp.suffix in exclude_exts:
                    continue
                rel = str(fp.relative_to(api_dir))
                zf.write(fp, 'fastapi_backend/' + rel)
                count += 1

print('Created:', out_zip.resolve())
print('Total files:', count)

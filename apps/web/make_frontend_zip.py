#!/usr/bin/env python3
"""Package the upgraded Next.js frontend folder into a zip."""
import zipfile, sys
from pathlib import Path

web_dir = Path('.')
out_zip = web_dir.parent.parent.parent / 'upgraded_nextjs_frontend.zip'

include_dirs  = ['app', 'components', 'lib', 'public']
include_files = ['package.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'pnpm-workspace.yaml', '.gitignore', 'eslint.config.mjs']
exclude_dirs  = {'node_modules', '.next', '.git', '__pycache__'}
exclude_exts  = {'.pyc', '.pyo'}

count = 0
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in include_files:
        p = web_dir / f
        if p.exists():
            zf.write(p, 'upgraded_nextjs_frontend/' + f)
            print('  file:', f)
            count += 1
    for d in include_dirs:
        dp = web_dir / d
        if not dp.is_dir():
            continue
        for fp in dp.rglob('*'):
            if not fp.is_file():
                continue
            parts = set(fp.parts)
            if any(ex in parts for ex in exclude_dirs):
                continue
            if fp.suffix in exclude_exts:
                continue
            rel = str(fp.relative_to(web_dir))
            zf.write(fp, 'upgraded_nextjs_frontend/' + rel)
            count += 1

print(f'Created: {out_zip.resolve()}')
print(f'Total files: {count}')

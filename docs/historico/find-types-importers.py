import os, re

# Padrões de import que apontam para src/types.ts
patterns = [
    r"from ['\"]@/types['\"]",
    r"from ['\"]\.\.?/types['\"]",
    r"from ['\"]\.\.?/\.\.?/types['\"]",
    r"from ['\"]\.\.?/\.\.?/\.\.?/types['\"]",
    r"from ['\"]src/types['\"]",
]
combined = re.compile('|'.join(patterns))

importers = []
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.git']]
    for fname in files:
        if fname.endswith(('.ts', '.tsx')):
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                if combined.search(content):
                    rel = filepath.replace('\\', '/')
                    importers.append(rel)
            except Exception:
                pass

print(f'Modulos que importam de src/types.ts: {len(importers)}')
for i in sorted(importers):
    print(f'  {i}')

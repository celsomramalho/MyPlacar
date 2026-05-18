import json, sys
from collections import defaultdict

# Lê de stdin ou de arquivo
if not sys.stdin.isatty():
    raw = sys.stdin.read()
else:
    with open('violations-raw.json', 'r', encoding='utf-8-sig') as f:
        raw = f.read()

# Remove possível BOM e espaços iniciais
raw = raw.strip().lstrip('\ufeff')
if not raw:
    print("ERRO: entrada vazia")
    sys.exit(1)

data = json.loads(raw)

summary    = data.get('summary', {})
violations = data.get('violations', [])

total_warn    = summary.get('warn', 0)
total_error   = summary.get('error', 0)
total_info    = summary.get('info', 0)
total_cruised = summary.get('totalCruised', 0)

print("=" * 70)
print("ANÁLISE DE VIOLAÇÕES — dependency-cruiser")
print("=" * 70)
print(f"\nMódulos analisados : {total_cruised}")
print(f"Violations (warn)  : {total_warn}")
print(f"Violations (error) : {total_error}")
print(f"Violations (info)  : {total_info}")
print(f"Total violations   : {len(violations)}")

# Agrupar por regra
by_rule = defaultdict(list)
for v in violations:
    rule = v.get('rule', {}).get('name', 'unknown')
    by_rule[rule].append(v)

print("\n--- Por regra ---")
for rule, items in sorted(by_rule.items(), key=lambda x: -len(x[1])):
    print(f"  {rule}: {len(items)}")

# Circulares e Órfãos
circulars = by_rule.get('no-circular', [])
orphans   = by_rule.get('no-orphans', [])

print(f"\n{'='*70}")
print(f"CIRCULARES ({len(circulars)} violações)")
print("=" * 70)

mod_count = defaultdict(int)
for v in circulars:
    mod_count[v.get('from', '')] += 1
    mod_count[v.get('to', '')]   += 1

top_mods = sorted(mod_count.items(), key=lambda x: -x[1])[:15]
print("\nTOP 15 módulos mais envolvidos em ciclos:")
for i, (mod, cnt) in enumerate(top_mods, 1):
    flag = " ◀ HUB CRÍTICO" if cnt >= 5 else (" ◀ ALTO" if cnt >= 3 else "")
    print(f"  {i:2d}. ({cnt:2d}x) {mod}{flag}")

types_violations = [v for v in circulars
                    if 'types' in v.get('from','') or 'types' in v.get('to','')]
print(f"\nCiclos envolvendo types.ts: {len(types_violations)}")
for v in types_violations[:8]:
    print(f"  {v.get('from','')}  →  {v.get('to','')}")

print(f"\n{'='*70}")
print(f"MÓDULOS ÓRFÃOS ({len(orphans)})")
print("=" * 70)
for v in orphans:
    print(f"  {v.get('from','?')}")

print(f"\n{'='*70}")
print("RESUMO DIAGNÓSTICO")
print("=" * 70)
pct_types = round(len(types_violations)/len(circulars)*100) if circulars else 0
top_hub   = top_mods[0] if top_mods else ('?', 0)
print(f"  Circulares totais   : {len(circulars)}")
print(f"  Envolvem types.ts   : {len(types_violations)} ({pct_types}%)")
print(f"  Órfãos              : {len(orphans)}")
print(f"  Maior hub           : {top_hub[0]}")
print(f"                         ({top_hub[1]} aparições em ciclos)")
print(f"\n  Objetivo final      : <10 violações (redução 87%+)")

"""Verifies that every image/screenshot referenced by UX_AUDIT_REPORT.md and friction-log.csv exists on disk.
Run from audit/:  python3 scripts/check_images.py"""
import csv, os, re, sys
base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..')
rep = open(os.path.join(base, 'UX_AUDIT_REPORT.md'), encoding='utf-8').read()
refs = set(re.findall(r'\]\((\./screenshots/[^)\s]+)\)', rep)) | set(re.findall(r'src="(\./screenshots/[^"]+)"', rep))
missing = sorted(r for r in refs if not os.path.exists(os.path.join(base, r)))
rows = list(csv.DictReader(open(os.path.join(base, 'friction-log.csv'), encoding='utf-8')))
fl_refs = {s.strip() for r in rows for s in r['screenshot'].split('|') if s.strip()}
fl_missing = sorted(s for s in fl_refs if not os.path.exists(os.path.join(base, s)))
no_shot = [r['id'] for r in rows if not r['screenshot'].strip()]
print(f'report image/screenshot links: {len(refs)} unique, missing: {len(missing)}')
print(f'friction-log entries: {len(rows)}, screenshot refs: {len(fl_refs)} unique, missing: {len(fl_missing)}, entries without screenshot: {len(no_shot)}')
for m in missing + fl_missing: print('MISSING', m)
sys.exit(1 if (missing or fl_missing or no_shot) else 0)

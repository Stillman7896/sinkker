import pathlib
p = pathlib.Path("ui/src/views/FilterLists.vue"); s = p.read_text()
P = [
 ("          No remote blocklist — every query goes to the upstream unless a rule or filter stops it.\n",
  "          {{ t('No remote blocklist — every query goes to the upstream unless a rule or filter stops it.') }}\n"),
 ("          Reset worker\n          </AppButton>",
  "          {{ t('Reset worker') }}\n          </AppButton>"),
]
miss = 0
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

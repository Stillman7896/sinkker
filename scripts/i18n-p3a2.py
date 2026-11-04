import pathlib
P = [
 ("import { normalizeDomain } from '../validate.js';", "import { normalizeDomain } from '../validate.js';\nimport { t } from '../i18n.js';"),
 ("view.value === 'deny' ? 'Block rules' : view.value === 'allow' ? 'Allow rules' : 'All rules',",
  "view.value === 'deny' ? t('Block rules') : view.value === 'allow' ? t('Allow rules') : t('All rules'),"),
 ("if (invalid.value) return 'Needs a real domain, like ads.example.net.';",
  "if (invalid.value) return t('Needs a real domain, like ads.example.net.');"),
 ("return `Saves as ${normalized.value}.`;", "return t('Saves as {d}.').replace('{d}', normalized.value);"),
 ("return 'A rule applies to the domain and every subdomain of it. Allow wins over the blocklist.';",
  "return t('A rule applies to the domain and every subdomain of it. Allow wins over the blocklist.');"),
 ("verb: 'Add rule',", "verb: t('Add rule'),"),
 ("ok: (r) => `${r.domain} ${r.kind === 'deny' ? 'now blocked' : 'now allowed'}`,",
  "ok: (r) => `${r.domain} ${r.kind === 'deny' ? t('now blocked') : t('now allowed')}`,"),
 ("verb: 'Import rules',", "verb: t('Import rules'),"),
 ("? `${r.added} added, ${r.skipped.length} left out`", "? t('{n} added, {m} left out').replace('{n}', r.added).replace('{m}', r.skipped.length)"),
 (": `${r.added} rules added`),", ": t('{n} rules added').replace('{n}', r.added)),"),
 ("verb: 'Remove rule',", "verb: t('Remove rule'),"),
 ("ok: () => `${r.domain} removed`,", "ok: () => `${r.domain} ${t('removed')}`,"),
 (">Rules</h1>", ">{{ t('Rules') }}</h1>"),
 ("{{ customCount === 1 ? 'custom rule' : 'custom rules' }}", "{{ customCount === 1 ? t('custom rule') : t('custom rules') }}"),
 ("{{ exceptionCount }} allow {{ exceptionCount === 1 ? 'exception' : 'exceptions' }} from the blocklist",
  "{{ exceptionCount }} {{ exceptionCount === 1 ? t('allow exception') : t('allow exceptions') }} {{ t('from the blocklist') }}"),
 ("{{ showBulk ? 'Close bulk import' : 'Bulk import' }}", "{{ showBulk ? t('Close bulk import') : t('Bulk import') }}"),
 (">Add a rule</h2>", ">{{ t('Add a rule') }}</h2>"),
]
miss = 0
p = pathlib.Path("ui/src/views/Rules.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

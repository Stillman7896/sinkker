import pathlib
P = [
 ("import { normalizeDomain, normalizeRouteValue, isHttpsUrl, isRelayTemplate } from '../validate.js';",
  "import { normalizeDomain, normalizeRouteValue, isHttpsUrl, isRelayTemplate } from '../validate.js';\nimport { t } from '../i18n.js';"),
 ("verb: 'Save settings',\n      ok: `Blocked queries now answer ${value}`,",
  "verb: t('Save settings'),\n      ok: t('Blocked queries now answer {v}').replace('{v}', value),"),
 ("verb: 'Save settings',\n      ok: `${t.label} ${value ? 'on' : 'off'}`,",
  "verb: t('Save settings'),\n      ok: `${t(t.label)} ${value ? t('on') : t('off')}`,"),
 ("retentionError.value = 'Enter a whole number of days between 0 and 3650.';",
  "retentionError.value = t('Enter a whole number of days between 0 and 3650.');"),
 ("ok: `Log kept ${Number(retention.value) === 0 ? 'forever' : `for ${retention.value} days`}`,",
  "ok: Number(retention.value) === 0 ? t('Log kept forever') : t('Log kept for {n} days').replace('{n}', retention.value),"),
 ("if (source === 'deploy') return 'Currently pinned by the UPSTREAM_URL deployment variable. Saving a provider here takes over.';",
  "if (source === 'deploy') return t('Currently pinned by the UPSTREAM_URL deployment variable. Saving a provider here takes over.');"),
 ("if (source === 'default') return 'No provider saved yet — this is the built-in default.';", "if (source === 'default') return t('No provider saved yet — this is the built-in default.');"),
 ("return 'Saved in this dashboard.';", "return t('Saved in this dashboard.');"),
 ("? 'Needs an https:// URL, like https://doh.example.com/dns-query.'", "? t('Needs an https:// URL, like https://doh.example.com/dns-query.')"),
 ("? 'Needs an https:// template containing {?targethost,targetpath}.'", "? t('Needs an https:// template containing {?targethost,targetpath}.')"),
 ("if (!fallbackOn.value) return 'Off — if the primary resolver fails, the query fails too.';", "if (!fallbackOn.value) return t('Off — if the primary resolver fails, the query fails too.');"),
 ("if (!info) return 'On, but no fallback server is available.';", "if (!info) return t('On, but no fallback server is available.');"),
 ("if (info.source === 'settings') return `In use: ${info.url} (custom fallback URL).`;", "if (info.source === 'settings') return t('In use: {u} (custom fallback URL).').replace('{u}', info.url);"),
 ("if (info.source === 'deploy') return `In use: ${info.url} (UPSTREAM_FALLBACK_URL variable).`;", "if (info.source === 'deploy') return t('In use: {u} (UPSTREAM_FALLBACK_URL variable).').replace('{u}', info.url);"),
 ("return `In use: ${info.url} — built-in alternate (${info.label}).`;", "return t('In use: {u} — built-in alternate ({l}).').replace('{u}', info.url).replace('{l}', info.label);"),
 ("ok: `Fallback server ${value ? 'on' : 'off'}`,", "ok: t('Fallback server {v}').replace('{v}', value ? t('on') : t('off')),"),
 ("verb: 'Save fallback',", "verb: t('Save fallback'),"),
 ("ok: (r) => (r.fallback ? `Fallback: ${r.fallback.url}` : 'Fallback off'),", "ok: (r) => (r.fallback ? t('Fallback: {u}').replace('{u}', r.fallback.url) : t('Fallback off')),"),
 ("verb: 'Save provider',\n      ok: (r) => `Upstream: ${r.upstream.label}`,", "verb: t('Save provider'),\n      ok: (r) => `${t('Upstream:')}${r.upstream.label}`,"),
 ("verb: 'Test upstream',", "verb: t('Test upstream'),"),
 ("ok: (r) => `${r.kind === 'odoh' ? 'Relay and resolver' : 'Resolver'} answered in ${r.ms} ms`,",
  "ok: (r) => `${r.kind === 'odoh' ? t('Relay and resolver') : t('Resolver')} ${t('answered in {n} ms').replace('{n}', r.ms)}`,"),
 ("verb: 'Add route',", "verb: t('Add route'),"),
 ("verb: 'Remove route',", "verb: t('Remove route'),"),
 ("ok: `${route.domain} removed`,", "ok: `${route.domain} ${t('removed')}`,"),
]
miss = 0
p = pathlib.Path("ui/src/views/Settings.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:70])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

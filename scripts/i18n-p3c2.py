import pathlib
P = [
 ("import { t } from '../i18n.js');", "XXNOMATCHXX"),
]
P = [
 ("} from '../validate.js';", "} from '../validate.js';\nimport { t } from '../i18n.js';"),
 ("verb: `Add ${form.addLabel}`,", "verb: t('Add {x}').replace('{x}', form.addLabel),"),
 ("ok: (r) => (r.added ? `${value} added` : `${value} was already on the list`),",
  "ok: (r) => (r.added ? t('{d} added').replace('{d}', value) : t('{d} was already on the list').replace('{d}', value)),"),
 ("verb: 'Remove from list',", "verb: t('Remove from list'),"),
 ("ok: `${value} removed`,", "ok: `${value} ${t('removed')}`,"),
 ("return 'Needs an https:// URL — the worker fetches the list over https.';", "return t('Needs an https:// URL — the worker fetches the list over https.');"),
 ("return 'That blocklist is already subscribed.';", "return t('That blocklist is already subscribed.');"),
 ("verb: 'Add blocklist',", "verb: t('Add blocklist'),"),
 ("ok: (r) => `${r.subscriptions.length} subscription${r.subscriptions.length === 1 ? '' : 's'}`,",
  "ok: (r) => `${r.subscriptions.length} ${r.subscriptions.length === 1 ? t('subscription') : t('subscriptions')}`,"),
 ("verb: 'Remove blocklist',\n    ok: 'Blocklist removed',", "verb: t('Remove blocklist'),\n    ok: t('Blocklist removed'),"),
 ("verb: 'Reload blocklists',\n    ok: 'Blocklists reloaded',", "verb: t('Reload blocklists'),\n    ok: t('Blocklists reloaded'),"),
 ("'Wipes settings, routes and custom rules on the worker.\\nDeployment variables and the query log stay.\\n\\nDashboard password:'",
  "t('Wipes settings, routes and custom rules on the worker.') + '\\n' + t('Deployment variables and the query log stay.') + '\\n\\n' + t('Dashboard password:')"),
 ("verb: 'Reset worker',\n    ok: 'Worker reset — settings and custom rules cleared',", "verb: t('Reset worker'),\n    ok: t('Worker reset — settings and custom rules cleared'),"),
 ("verb: 'Save settings',\n      ok: `Regex blocking ${value ? 'on' : 'off'}`,",
  "verb: t('Save settings'),\n      ok: t('Regex blocking {v}').replace('{v}', value ? t('on') : t('off')),"),
]
miss = 0
p = pathlib.Path("ui/src/views/FilterLists.vue"); s = p.read_text()
for old, new in P[1:]:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

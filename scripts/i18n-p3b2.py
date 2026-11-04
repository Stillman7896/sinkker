import pathlib
P = [
 ("import { qtypeLabel } from '../qtype.js';", "import { qtypeLabel } from '../qtype.js';\nimport { t } from '../i18n.js';"),
 ("verb: 'Search logs', ok: `Showing ${total.value} matches`", "verb: t('Search logs'), ok: t('Showing {n} matches').replace('{n}', total.value)"),
 ("verb: 'Apply status filter', ok: `Filtered to ${total.value} rows`", "verb: t('Apply status filter'), ok: t('Filtered to {n} rows').replace('{n}', total.value)"),
 ("const label = v === 'untagged' ? 'untagged clients' : `client “${v}”`;", "const label = v === 'untagged' ? t('untagged clients') : t('client “{c}”').replace('{c}', v);"),
 ("verb: 'Apply client filter', ok: `Filtered to ${label}`", "verb: t('Apply client filter'), ok: t('Filtered to {n} rows').replace('{n}', label)"),
 ("verb: 'Reload logs', ok: `${total.value} rows loaded`", "verb: t('Reload logs'), ok: t('{n} rows loaded').replace('{n}', total.value)"),
 ("verb: 'Delete filtered logs',\n    ok: `${total.value} rows deleted`,", "verb: t('Delete filtered logs'),\n    ok: t('{n} rows deleted').replace('{n}', total.value),"),
 ("verb: 'Clear all logs',\n    ok: 'Log cleared',", "verb: t('Clear all logs'),\n    ok: t('Log cleared'),"),
 ("verb: 'Delete row',\n    ok: `${row.domain} entry deleted`,", "verb: t('Delete row'),\n    ok: t('{d} entry deleted').replace('{d}', row.domain),"),
 ("verb: kind === 'deny' ? 'Block domain' : 'Allow domain',", "verb: kind === 'deny' ? t('Block domain') : t('Allow domain'),"),
 ("ok: `${row.domain} ${kind === 'deny' ? 'now blocked' : 'now allowed'}`,", "ok: `${row.domain} ${kind === 'deny' ? t('now blocked') : t('now allowed')}`,"),
 ("const rel = diff < 60_000 ? 'just now'\n    : diff < 3_600_000 ? `${Math.floor(diff / 60_000)} min ago`\n      : diff < 86_400_000 ? `${Math.floor(diff / 3_600_000)} h ago`\n        : `${Math.floor(diff / 86_400_000)} d ago`;",
  "const rel = diff < 60_000 ? t('just now')\n    : diff < 3_600_000 ? t('{n} min ago').replace('{n}', Math.floor(diff / 60_000))\n      : diff < 86_400_000 ? t('{n} h ago').replace('{n}', Math.floor(diff / 3_600_000))\n        : t('{n} d ago').replace('{n}', Math.floor(diff / 86_400_000));"),
 (">Logs</h1>", ">{{ t('Logs') }}</h1>"),
 ("{{ total === 1 ? 'entry' : 'entries' }}", "{{ total === 1 ? t('entry') : t('entries') }}"),
 ("<template v-if=\"activeFilter\"> matching this filter</template>", "<template v-if=\"activeFilter\"> {{ t('matching this filter') }}</template>"),
 (">Reload</AppButton>", ">{{ t('Reload') }}</AppButton>"),
 ("busy-key=\"logs.deleteFiltered\" @click=\"deleteFiltered\">\n          Delete filtered\n        </AppButton>", "busy-key=\"logs.deleteFiltered\" @click=\"deleteFiltered\">\n          {{ t('Delete filtered') }}\n        </AppButton>"),
 ('label="Clear all"', ':label="t(\'Clear all\')"'),
 ('armed-label="Really clear the log?"', ':armed-label="t(\'Really clear the log?\')"'),
 ('<span class="sr-only">Search domain</span>', "<span class=\"sr-only\">{{ t('Search domain') }}</span>"),
 ('placeholder="Search domain…"', ':placeholder="t(\'Search domain…\')"'),
 ('hidden sm:inline">Status</span>', "hidden sm:inline\">{{ t('Status') }}</span>"),
 (":value=\"s\">{{ s || 'any' }}</option>", ":value=\"s\">{{ s || t('any') }}</option>"),
 ('hidden sm:inline">Client</span>', "hidden sm:inline\">{{ t('Client') }}</span>"),
 ('<option value="">any client</option>', "<option value=\"\">{{ t('any client') }}</option>"),
 ('<option value="untagged">untagged</option>', "<option value=\"untagged\">{{ t('untagged') }}</option>"),
 ('hidden sm:inline">Rows</span>', "hidden sm:inline\">{{ t('Rows') }}</span>"),
 (">\n        Reset filter\n      </button>", ">\n        {{ t('Reset filter') }}\n      </button>"),
]
miss = 0
p = pathlib.Path("ui/src/views/Logs.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

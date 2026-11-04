import pathlib
P = [
 ('aria-label="Domain"', ":aria-label=\"t('Domain')\""),
 ("{ value: 'deny', label: 'Block' },\n              { value: 'allow', label: 'Allow' },",
  "{ value: 'deny', label: t('Block') },\n              { value: 'allow', label: t('Allow') },"),
 ('label="Answer"', ":label=\"t('Answer')\""),
 (">\n          Add rule\n        </AppButton>", ">\n          {{ t('Add rule') }}\n        </AppButton>"),
 (">Paste many domains</h2>", ">{{ t('Paste many domains') }}</h2>"),
 (">One per line, or separated by commas.</p>", ">{{ t('One per line, or separated by commas.') }}</p>"),
 ('aria-label="Domains to import"', ":aria-label=\"t('Domains to import')\""),
 ("{ value: 'deny', label: 'Block them' },\n            { value: 'allow', label: 'Allow them' },",
  "{ value: 'deny', label: t('Block them') },\n            { value: 'allow', label: t('Allow them') },"),
 ('label="Kind"', ":label=\"t('Kind')\""),
 (">\n          Import\n        </AppButton>", ">\n          {{ t('Import') }}\n        </AppButton>"),
 ("{{ bulkReady }} of {{ bulkLines.length }} lines ready", "{{ bulkReady }} / {{ bulkLines.length }} {{ t('lines ready') }}"),
 ("<template v-if=\"bulkLines.length && bulkReady < bulkLines.length\">— the rest are not domains</template>",
  "<template v-if=\"bulkLines.length && bulkReady < bulkLines.length\">{{ t('— the rest are not domains') }}</template>"),
 ("{ value: 'all', label: 'All' },\n            { value: 'deny', label: 'Block' },\n            { value: 'allow', label: 'Allow' },",
  "{ value: 'all', label: t('All') },\n            { value: 'deny', label: t('Block') },\n            { value: 'allow', label: t('Allow') },"),
 ('label="View"', ":label=\"t('View')\""),
 ('<span class="sr-only">Filter rules</span>', "<span class=\"sr-only\">{{ t('Filter rules') }}</span>"),
 ('placeholder="Filter…"', ':placeholder="t(\'Filter…\')"'),
 ('<caption class="sr-only">Custom allow and deny rules</caption>', "<caption class=\"sr-only\">{{ t('Custom allow and deny rules') }}</caption>"),
 ('class="px-5 py-2 font-medium">Domain</th>', "class=\"px-5 py-2 font-medium\">{{ t('Domain') }}</th>"),
 ('whitespace-nowrap">Answer</th>', "whitespace-nowrap\">{{ t('Answer') }}</th>"),
 ('whitespace-nowrap">Source</th>', "whitespace-nowrap\">{{ t('Source') }}</th>"),
 ("{{ r.kind === 'deny' ? 'blocked' : 'allowed' }}", "{{ r.kind === 'deny' ? t('blocked') : t('allowed') }}"),
 ("{{ r.src === 'blocklist' ? 'blocklist' : 'custom' }}", "{{ r.src === 'blocklist' ? t('blocklist') : t('custom') }}"),
 ("? 'From the blocklist file (@@ exception) — edit the list, not this dashboard'\n                    : 'Set in this dashboard'",
  "? t('From the blocklist file (@@ exception) — edit the list, not this dashboard')\n                    : t('Set in this dashboard')"),
 ('label="Remove"', ":label=\"t('Remove')\""),
 ('armed-label="Confirm?"', ":armed-label=\"t('Confirm?')\""),
 ('<span v-else class="hint text-[12px]">read-only</span>', "<span v-else class=\"hint text-[12px]\">{{ t('read-only') }}</span>"),
 ("? `No rule matches “${ruleFilter}”.`", "? t('No rule matches “{f}”.').replace('{f}', ruleFilter)"),
 (": view === 'deny' ? 'No block rules yet.'\n            : view === 'allow' ? 'No allow rules yet.'\n            : 'No custom rules yet.' }}",
  ": view === 'deny' ? t('No block rules yet.')\n            : view === 'allow' ? t('No allow rules yet.')\n            : t('No custom rules yet.') }}"),
 ("? 'Try part of the domain, without the top-level suffix.'", "? t('Try part of the domain, without the top-level suffix.')"),
 ("? 'Add a domain above to block it even when the shared list lets it through.'", "? t('Add a domain above to block it even when the shared list lets it through.')"),
 ("? 'Allow rules force an answer. @@ exceptions in the blocklist file show up here too.'", "? t('Allow rules force an answer. @@ exceptions in the blocklist file show up here too.')"),
 (": 'Add a domain above to force an answer, or force-allow one the shared blocklist stops.' }}", ": t('Add a domain above to force an answer, or force-allow one the shared blocklist stops.') }}"),
]
miss = 0
p = pathlib.Path("ui/src/views/Rules.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

import pathlib
P = [
 (">Open settings</AppButton>", ">{{ t('Open settings') }}</AppButton>"),
 ('<caption class="sr-only">Recent DNS queries</caption>', "<caption class=\"sr-only\">{{ t('Recent DNS queries') }}</caption>"),
 ('whitespace-nowrap">When</th>', "whitespace-nowrap\">{{ t('When') }}</th>"),
 ('<th scope="col" class="px-3 py-2 font-medium">Domain</th>', "<th scope=\"col\" class=\"px-3 py-2 font-medium\">{{ t('Domain') }}</th>"),
 ('whitespace-nowrap">Outcome</th>', "whitespace-nowrap\">{{ t('Outcome') }}</th>"),
 ('whitespace-nowrap">Client</th>', "whitespace-nowrap\">{{ t('Client') }}</th>"),
 ('whitespace-nowrap">Type</th>', "whitespace-nowrap\">{{ t('Type') }}</th>"),
 ("`Show only queries from ${r.client}`", "t('Show only queries from {c}').replace('{c}', r.client)"),
 ("`Quick actions for ${r.domain}`", "t('Quick actions for {d}').replace('{d}', r.domain)"),
 ("{{ activeFilter ? 'Nothing matches that filter.' : 'The log is empty.' }}", "{{ activeFilter ? t('Nothing matches that filter.') : t('The log is empty.') }}"),
 ("{{ activeFilter ? 'Clear the filter to see everything recorded.' : 'Queries will appear here as clients use this resolver.' }}", "{{ activeFilter ? t('Clear the filter to see everything recorded.') : t('Queries will appear here as clients use this resolver.') }}"),
 (">Previous</AppButton>", ">{{ t('Previous') }}</AppButton>"),
 (">\n          Next page\n        </AppButton>", ">\n          {{ t('Next page') }}\n        </AppButton>"),
]
miss = 0
p = pathlib.Path("ui/src/views/Logs.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

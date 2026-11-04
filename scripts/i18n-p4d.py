import pathlib
P = [
 ("<h2 class=\"text-[15px] font-medium\">Domain response routing</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Domain response routing') }}</h2>"),
 ("{{ state.routes.length === 1 ? 'route' : 'routes' }}", "{{ state.routes.length === 1 ? t('route') : t('routes') }}"),
 ("<h2 class=\"text-[15px] font-medium\">Upstream resolver</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Upstream resolver') }}</h2>"),
 ('<caption class="sr-only">Domain response routes</caption>', "<caption class=\"sr-only\">{{ t('Domain response routes') }}</caption>"),
 ('class="px-5 py-2 font-medium">Domain</th>', "class=\"px-5 py-2 font-medium\">{{ t('Domain') }}</th>"),
 ('class="px-3 py-2 font-medium">Answer</th>', "class=\"px-3 py-2 font-medium\">{{ t('Answer') }}</th>"),
 ('label="Remove"', ':label="t(\'Remove\')"'),
 ('armed-label="Confirm?"', ':armed-label="t(\'Confirm?\')"'),
 ("<h2 class=\"text-[15px] font-medium\">Filters</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Filters') }}</h2>"),
 (":label=\"t.label\"", ":label=\"t(t.label)\""),
 (":effect=\"t.effect\"", ":effect=\"t(t.effect)\""),
 ("<h2 class=\"text-[15px] font-medium\">Blocked queries</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Blocked queries') }}</h2>"),
 ("<h2 class=\"text-[15px] font-medium\">Query log</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Query log') }}</h2>"),
 ('<span class="label">Response</span>', "<span class=\"label\">{{ t('Response') }}</span>"),
 (":value=\"o.value\">{{ o.label }}</option>", ":value=\"o.value\">{{ t(o.label) }}</option>"),
 ('<span class="label">Keep rows for</span>', "<span class=\"label\">{{ t('Keep rows for') }}</span>"),
 ('<span class="text-[13px] text-muted">days</span>', "<span class=\"text-[13px] text-muted\">{{ t('days') }}</span>"),
]
miss = 0
p = pathlib.Path("ui/src/views/Settings.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:70])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

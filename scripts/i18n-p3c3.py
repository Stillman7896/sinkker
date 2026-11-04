import pathlib
P = [
 (">Filter lists</h1>", ">{{ t('Filter lists') }}</h1>"),
 (">Remote blocklist subscriptions and three plain lists that decide on their own.</p>", ">{{ t('Remote blocklist subscriptions and three plain lists that decide on their own.') }}</p>"),
 ("<h2 class=\"text-[15px] font-medium\">Blocklist subscriptions</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Blocklist subscriptions') }}</h2>"),
 ("{{ subs.length }}/{{ blMax }} listed", "{{ subs.length }}/{{ blMax }} {{ t('listed') }}"),
 (">\n          Reload\n        </AppButton>", ">\n          {{ t('Reload') }}\n        </AppButton>"),
 ('aria-label="Blocklist URL to subscribe"', ":aria-label=\"t('Blocklist URL to subscribe')\""),
 (">\n            Add blocklist\n          </AppButton>", ">\n            {{ t('Add blocklist') }}\n          </AppButton>"),
 ("{{ blProblem || 'Each subscription is fetched over https and merged in memory; the union answers every query.' }}", "{{ blProblem || t('Each subscription is fetched over https and merged in memory; the union answers every query.') }}"),
 ("title=\"Comes from the BLOCKLIST_URL deployment variable — editable and deletable like any other.\"", ":title=\"t('Comes from the BLOCKLIST_URL deployment variable — editable and deletable like any other.')\""),
 ("hh NOSPAN", "hh"),
 ('                default\n              </span>', "                {{ t('default') }}\n              </span>"),
 ("<span>{{ s.entries.toLocaleString() }} entries</span>", "<span>{{ s.entries.toLocaleString() }} {{ t('entries') }}</span>"),
 ("· {{ s.exceptions.toLocaleString() }} except.</span>", "· {{ s.exceptions.toLocaleString() }} {{ t('except.') }}</span>"),
 ('label="Remove"', ':label="t(\'Remove\')"'),
 ('armed-label="Confirm?"', ':armed-label="t(\'Confirm?\')"'),
 (">No remote blocklist — every query goes to the upstream unless a rule or filter stops it.\n        </p>", ">{{ t('No remote blocklist — every query goes to the upstream unless a rule or filter stops it.') }}\n        </p>"),
 ("{{ blTotal.toLocaleString() }} entries held in memory", "{{ blTotal.toLocaleString() }} {{ t('entries held in memory') }}"),
 ("More than {{ blLimit.toLocaleString() }} entries — the free plan can run the isolate out of memory.", "{{ t('More than {n} entries — the free plan can run the isolate out of memory.').replace('{n}', blLimit.toLocaleString()) }}"),
 ('title="Wipe settings, routes and custom rules on the worker — the last resort when it can no longer answer the dashboard."', ":title=\"t('Wipe settings, routes and custom rules on the worker — the last resort when it can no longer answer the dashboard.')\""),
 (">Reset worker\n          </AppButton>", ">{{ t('Reset worker') }}\n          </AppButton>"),
 ("<h2 class=\"text-[15px] font-medium\">{{ form.title }}</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t(form.title) }}</h2>"),
 ("<span class=\"st text-[12.5px] text-muted\">{{ items(form.id).length }} listed</span>", "<span class=\"st text-[12.5px] text-muted\">{{ items(form.id).length }} {{ t('listed') }}</span>"),
 ('label="Regex blocking"', ":label=\"t('Regex blocking')\""),
 ('effect="Apply the patterns below to live queries."', ":effect=\"t('Apply the patterns below to live queries.')\""),
 ("{{ form.kicker }}", "{{ t(form.kicker) }}"),
 ("aria-label=\"Blocklist URL to subscribe\"", "aria-label=\"Blocklist URL to subscribe\""),
 (":aria-label=\"`New ${form.title} entry`\"", ":aria-label=\"t('New entry for {x}').replace('{x}', t(form.title))\""),
 (">\n            Add\n          </AppButton>", ">\n            {{ t('Add') }}\n          </AppButton>"),
 ("{{ problem(form) || form.hint }}", "{{ problem(form) || t(form.hint) }}"),
 (":aria-label=\"`Remove ${item} from ${form.title}`\"", ":aria-label=\"t('Remove {v} from {x}').replace('{v}', item).replace('{x}', t(form.title))\""),
 ("Empty. {{ form.empty }}", "{{ t('Empty.') }} {{ t(form.empty) }}"),
]
miss = 0
p = pathlib.Path("ui/src/views/FilterLists.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:60])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

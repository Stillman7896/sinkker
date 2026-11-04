import pathlib
P = [
 ("            Answer a name — and every subdomain — with a fixed record instead of asking upstream.\n            Private addresses and local names are welcome here; the route is checked before every other filter.\n",
  "            {{ t('Answer a name — and every subdomain — with a fixed record instead of asking upstream. Private addresses and local names are welcome here; the route is checked before every other filter.') }}\n"),
 ('<span class="label">Domain</span>', "<span class=\"label\">{{ t('Domain') }}</span>"),
 ('<span class="label">Answer</span>', "<span class=\"label\">{{ t('Answer') }}</span>"),
 ('placeholder="192.168.1.20 or hostname"', ':placeholder="t(\'192.168.1.20 or hostname\')"'),
 ('aria-label="Route TTL in seconds"', ':aria-label="t(\'Route TTL in seconds\')"'),
 (">\n              Add route\n            </AppButton>", ">\n              {{ t('Add route') }}\n            </AppButton>"),
 ("{{ !routeTtlOk ? 'TTL must be a whole number of seconds between 0 and 86400.' : routeHint }}", "{{ !routeTtlOk ? t('TTL must be a whole number of seconds between 0 and 86400.') : routeHint }}"),
 (">No routes yet — add one to serve a local name, pin a hostname to an IP, or alias a domain.\n        </p>", ">{{ t('No routes yet — add one to serve a local name, pin a hostname to an IP, or alias a domain.') }}\n        </p>"),
 (">\n                Open list\n              </button>", ">\n                {{ t('Open list') }}\n              </button>"),
 (">What this resolver sends back for a name that a filter stopped.</p>", ">{{ t('What this resolver sends back for a name that a filter stopped.') }}</p>"),
 (">\n            Save response\n          </AppButton>", ">\n            {{ t('Save response') }}\n          </AppButton>"),
 ("{{ blockedResponseHint }} Routes are unaffected — they always answer with their own record.", "{{ t(blockedResponseHint) }} {{ t('Routes are unaffected — they always answer with their own record.') }}"),
 (">Older rows are deleted by a scheduled job.</p>", ">{{ t('Older rows are deleted by a scheduled job.') }}</p>"),
 (">\n            Save retention\n          </AppButton>", ">\n            {{ t('Save retention') }}\n          </AppButton>"),
 ("{{ retentionError || (Number(retention) === 0 ? '0 keeps rows forever.' : `Drops on day ${Number(retention) + 1}.`) }}",
  "{{ retentionError || (Number(retention) === 0 ? t('0 keeps rows forever.') : t('Drops on day {n}.').replace('{n}', Number(retention) + 1)) }}"),
]
miss = 0
p = pathlib.Path("ui/src/views/Settings.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:70])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

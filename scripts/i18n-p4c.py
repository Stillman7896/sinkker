import pathlib
P = [
 ("if (raw && !routeAnswer.value) return 'Needs an IPv4 or IPv6 address, or a hostname to point at.';",
  "if (raw && !routeAnswer.value) return t('Needs an IPv4 or IPv6 address, or a hostname to point at.');"),
 ("if (!raw) return 'A route answers this name and every subdomain — before any other filter, including allow and deny rules.';",
  "if (!raw) return t('A route answers this name and every subdomain — before any other filter, including allow and deny rules.');"),
 ("if (answer.type === 'cname') return `Saves as a CNAME to ${answer.value}.`;", "if (answer.type === 'cname') return t('Saves as a CNAME to {v}.').replace('{v}', answer.value);"),
 ("return `Saves as an ${answer.type.toUpperCase()} record for ${answer.value}.`;", "return t('Saves as an {t} record for {v}.').replace('{t}', answer.type.toUpperCase()).replace('{v}', answer.value);"),
 (">Settings</h1>", ">{{ t('Settings') }}</h1>"),
 (">Each change is written to KV as you make it — there is nothing else to save.</p>", ">{{ t('Each change is written to KV as you make it — there is nothing else to save.') }}</p>"),
 (">Reading current settings…</p>", ">{{ t('Reading current settings…') }}</p>"),
 ("<h2 class=\"text-[15px] font-medium\">Upstream resolver</h2>", "<h2 class=\"text-[15px] font-medium\">{{ t('Upstream resolver') }}</h2>"),
 (">where allowed queries are forwarded</span>", ">{{ t('where allowed queries are forwarded') }}</span>"),
 ('<span class="label">Provider</span>', "<span class=\"label\">{{ t('Provider') }}</span>"),
 ('<option value="">Default — {{ effective?.label }}</option>', "<option value=\"\">{{ t('Default') }} — {{ effective?.label }}</option>"),
 (">\n            Test connection\n          </AppButton>", ">\n            {{ t('Test connection') }}\n          </AppButton>"),
 ("{{ chosen?.note || effective?.note || 'Any RFC 8484 endpoint works.' }}", "{{ chosen?.note || effective?.note || t('Any RFC 8484 endpoint works.') }}"),
 ('for="custom-url">DoH URL</label>', 'for="custom-url">{{ t(\'DoH URL\') }}</label>'),
 (">\n              Save provider\n            </AppButton>", ">\n              {{ t('Save provider') }}\n            </AppButton>"),
 ("{{ urlProblem || 'The worker must be able to reach this URL over https.' }}", "{{ urlProblem || t('The worker must be able to reach this URL over https.') }}"),
 ('for="odoh-relay">Relay template</label>', 'for="odoh-relay">{{ t(\'Relay template\') }}</label>'),
 ("{{ relayProblem || 'Queries are encrypted for the resolver and posted through this relay, so neither end sees both the name and your network.' }}", "{{ relayProblem || t('Queries are encrypted for the resolver and posted through this relay, so neither end sees both the name and your network.') }}"),
 ('<span class="text-[12.5px] text-muted">In use</span>', "<span class=\"text-[12.5px] text-muted\">{{ t('In use') }}</span>"),
 ('<span v-if="dirty" class="text-[12px] text-beacon">· unsaved change above</span>', "<span v-if=\"dirty\" class=\"text-[12px] text-beacon\">{{ t('· unsaved change above') }}</span>"),
 ("            relay {{ effective.relay }}\n          </p>", "            {{ t('relay') }} {{ effective.relay }}\n          </p>"),
 ('label="Fallback DNS server"', ':label="t(\'Fallback DNS server\')"'),
 ("'Retry a second server when this one is unreachable, errors, or answers SERVFAIL/REFUSED.'", "t('Retry a second server when this one is unreachable, errors, or answers SERVFAIL/REFUSED.')"),
 ('for="fallback-url">Custom fallback URL (optional)</label>', 'for="fallback-url">{{ t(\'Custom fallback URL (optional)\') }}</label>'),
 (">\n                Save fallback\n              </AppButton>", ">\n                {{ t('Save fallback') }}\n              </AppButton>"),
 ("{{ fallbackProblem || 'Leave empty to use the built-in alternate provider. The fallback answers in place of the primary only after the primary fails; NXDOMAIN from the primary is a real answer and is never retried.' }}", "{{ fallbackProblem || t('Leave empty to use the built-in alternate provider. The fallback answers in place of the primary only after the primary fails; NXDOMAIN from the primary is a real answer and is never retried.') }}"),
 ("{{ probe.ok ? 'Answered' : 'No answer' }}", "{{ probe.ok ? t('Answered') : t('No answer') }}"),
 ("{{ probe.answers }} {{ probe.answers === 1 ? 'record' : 'records' }}", "{{ probe.answers }} {{ t('records') }}"),
 ("{{ probe.kind === 'odoh' ? `via ${probe.url}` : probe.url }}", "{{ probe.kind === 'odoh' ? `${t('via')} ${probe.url}` : probe.url }}"),
]
miss = 0
p = pathlib.Path("ui/src/views/Settings.vue"); s = p.read_text()
for old, new in P:
    if s.count(old) == 0: print("MISS:", repr(old[:70])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

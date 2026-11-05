import pathlib
def rep(p, pairs):
    s = p.read_text(); miss = []
    for old, new in pairs:
        if old in s: s = s.replace(old, new, 1)
        else: miss.append(old[:50])
    p.write_text(s); print(p, "MISS:", miss or "none")
rep(pathlib.Path("wrangler.toml"), [
 ("They are overriden in the danhboard and stored in KV",
  "They are overridden in the dashboard and stored in KV"),
 ("# Preview for developent", "# Preview for development"),
 ('UPSTREAM_URL = "https://dns.quad9.net/dns-query"\n',
  'UPSTREAM_URL = "https://dns.quad9.net/dns-query"\n'
  '# UPSTREAM_FALLBACK_URL = "https://dns.google/dns-query"  # failover DoH (see docs/configuration.md)\n'),
 ("# When unset the dashboard is disabled (DoH filtering still works).",
  "# When unset the dashboard is disabled (DoH filtering still works).\n"
  "#\n"
  "# Code constants (blocklist.js, NOT deploy vars — values in docs/configuration.md):\n"
  "#   MAX_BLOCKLIST_URLS     = 10          max concurrent subscriptions\n"
  "#   BLOCKLIST_ENTRY_LIMIT  = 1_000_000  merged-entry ceiling across subscriptions\n"
  "#   MAX_SOURCE_ENTRIES     = 400_000    per-document entry cap (refused before parse)\n"
  "#   MAX_SOURCE_BYTES       = 24 MiB     per-document size cap (refused before parse)\n"),
])
rep(pathlib.Path("README.md"), [
 ("set\n  the password by configurinc `DASHBOARD_PASSWORD` in your Workers settings.",
  "set\n  the password by configuring `DASHBOARD_PASSWORD` in your Workers settings."),
 ("Live logs** of DNS queries of all cennected devices, tag a device to filter\n  by it's source.",
  "Live logs** of DNS queries of all connected devices, tag a device to filter\n  by its source."),
 ("a\n  private address in' an answer", "a\n  private address in an answer"),
 ("**Custom upstream DNS**, choose from  selection of provider, or input your own\n  DNS over HTTPS provider URL.",
  "**Custom upstream DNS**, choose from a selection of providers, or enter your own\n  DNS over HTTPS provider URL."),
 ("set `DASHBOARD_PASSWOND` as a variable secret to use the dashboard.",
  "set `DASHBOARD_PASSWORD` as a secret to use the dashboard."),
 ("- **Oblivious DoH (RFC 9230)**",
  "- **Mandarin UI**: the language button in the header switches the dashboard\n  between English and 简体中文 on the fly (persisted in localStorage, no reload).\n- **Oblivious DoH (RFC 9230)**"),
])

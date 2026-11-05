# Deploy, upgrade, troubleshoot

Operator's manual: how to point devices at the resolver, how to upgrade a
running deployment, how to reclaim legacy KV keys, and a symptom → cause table
for the failures that actually happen. Design background lives in
[architecture.md](architecture.md), every setting and endpoint is in
[configuration.md](configuration.md).

- [Client configuration](#client-configuration)
- [Upgrading](#upgrading)
- [Reclaiming legacy rule keys](#reclaiming-legacy-rule-keys)
- [Symptom → cause](#symptom--cause)

## Client configuration

The endpoint every client needs is the full DoH URL:

```
https://<your-worker>.workers.dev/dns-query
```

Optionally tag a device so its rows are labelled in the logs:
`https://<your-worker>.workers.dev/dns-query/laptop` (or `?tag=laptop`).

| Client | How |
|---|---|
| Firefox | Settings → Privacy → DNS over HTTPS → Max Protection → Custom provider, paste the full URL |
| Chrome / Edge | `chrome://flags/#dns-over-https` is template-based and limited; prefer the OS-level options below or a DoH-capable app |
| iOS / iPadOS | Needs a DoH configuration profile or an app (the OS settings alone only do DoT) — point it at the full URL |
| Android | **Private DNS** in system settings only accepts a hostname and speaks DoT, not DoH-with-a-path — use a DoH client app (Intra, Rethink DNS, personalDNSfilter) and paste the full URL |
| Router / general | Anything that speaks RFC 8484 and accepts a full URL; browsers and OS apps are the common case |

The Overview tab of the dashboard builds a ready-to-paste **tagged** URL — copy
from there instead of assembling it by hand. Invalid tags are rejected with
`400` before anything is logged, so a typo fails loudly rather than silently
untagged.

## Upgrading

```sh
git pull
npm ci
npm run deploy
```

That is the whole loop for a worker-only change. Two things to know:

- **`assets/` is committed.** The deployed Worker has no bundler; the dashboard
  is served from the committed `assets/` build output. Any change under `ui/`
  needs `npm run ui:build` and the rebuilt `assets/` committed in the same
  change. `npm run verify:assets` rebuilds and fails on drift, and CI runs it —
  a PR that touches `ui/` without rebuilding `assets/` does not pass.
- **Schema changes are lazy.** The D1 log table and its columns are created /
  extended automatically by the Worker on the first logged query
  (`ALTER TABLE ... ADD COLUMN`, duplicate-column errors ignored), so an
  upgrade never needs a manual migration. `schema.sql` exists for operators who
  prefer applying it up front.

`wrangler.toml` changes (`[vars]`, bindings) always ride along with a deploy —
runtime variables are read on every request, so a new value is live the moment
the deploy lands.

## Reclaiming legacy rule keys

Early versions stored one KV key per rule (`rule:<domain>` = `allow`/`deny`).
Current versions keep all rules in the single `rules:data` blob and migrate the
old keys automatically on first load — the migration is read-only, the legacy
keys are left in place so cleanup does not consume the free plan's write quota
(1,000 writes/day to different keys).

They are harmless but can be reclaimed once you confirm the migration is done
(the Rules tab shows your rules, sourced from `rules:data`):

```sh
wrangler kv key list --namespace-id=<RULES-namespace-id> --prefix "rule:"
wrangler kv key delete "rule:example.com" --namespace-id=<RULES-namespace-id>
```

Bulk-deleting many keys counts toward the same daily write quota, so do it in
batches. Keys under the `rule:` prefix are never read again once migrated;
deleting them only frees namespace clutter.

## Symptom → cause

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows a "not configured" message, never asks for a password | `DASHBOARD_PASSWORD` is not set | `wrangler secret put DASHBOARD_PASSWORD` |
| Every query returns SERVFAIL | Upstream dead, or a saved ODoH relay stopped working | Settings → Test connection; if ODoH, test a plain DoH preset or clear the relay |
| Resolver answers `503`, `/healthz` lists `problems[]` | No blocklist document could be loaded (all subscriptions failed) | Filter lists → Reload; check the per-row fetch error; fix the URL or add a working subscription |
| A subscription row shows an over-limit error | Document over `MAX_SOURCE_ENTRIES` (400k) or `MAX_SOURCE_BYTES` (24 MB) | Use a smaller list variant; the previous copy keeps answering meanwhile |
| New subscription refused | Merged entries already at `BLOCKLIST_ENTRY_LIMIT` (1,000,000) | Remove or shrink a subscription first |
| A setting changed on one device shows the old value elsewhere | Normal propagation: isolates cache settings for 30 s | Wait ~30 s; not a bug |
| A blocked response type did not change immediately | Answers are cached; the chosen value is part of the cache key | Takes effect on the next uncached query; up to 300 s for held answers |
| Logs tab is empty but the resolver works | D1 binding `LOGS` missing, or logging turned off | Configure the D1 binding; check `logPassed` / log retention in Settings |
| Worker error page (1101) on every path | Configuration corner: monster list exhausting CPU/memory | POST `/healthz/reset` (below), then re-add lists one at a time |
| Dashboard unreachable but DoH works | Assets drift or API breakdown | Redeploy with a rebuilt `assets/` (`npm run ui:build`); the reset hatch still works |
| Answer for a name is stale after changing its route | Route TTL served to clients (default 300 s, max 86400) | Wait out the TTL or lower the route's TTL |

## Escape hatch: `/healthz/reset`

A deployment can configure itself into a corner (too many blocklists, one
monster list) until every request dies on the CPU or memory budget — including
the dashboard API that would let you undo it. The reset hatch runs before any
store or blocklist work, needs only the dashboard password, and wipes the KV
configuration (settings, custom rules, routes, filter lists, legacy rule rows).
Deployment variables and the D1 query log are untouched:

```sh
curl -X POST https://<worker>.workers.dev/healthz/reset \
  -H 'Authorization: Bearer <DASHBOARD_PASSWORD>'
# or:  --data '{"password":"<DASHBOARD_PASSWORD>"}'
```

It is disabled (403) when no `DASHBOARD_PASSWORD` is set. The same action is
the **Reset worker** button in the dashboard's Filter lists tab, and the
dashboard's failure screen prints this exact command when the worker stops
answering — that is the only screen such a worker can still show.

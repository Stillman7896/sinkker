<p align="center">
  <img src="brand/mark.svg" width="76" height="76" alt="" />
</p>

<h1 align="center">Sinkker</h1>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <b>A DNS sinkhole that runs on Cloudflare Workers.</b><br />
  Block ads, trackers and malware on all your devices.
</p>

<p align="center">
  <a href="https://github.com/Stillman7896/sinkker/actions/workflows/ci.yml"><img src="https://github.com/Stillman7896/sinkker/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="#license"><img src="https://img.shields.io/github/license/Stillman7896/sinkker?style=flat-square" alt="License: Unlicense" /></a>
  <a href="https://github.com/Stillman7896/sinkker/stargazers"><img src="https://img.shields.io/github/stars/Stillman7896/sinkker?style=flat-square&logo=github" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-3c873a?style=flat-square&logo=node.js" alt="Node 22+" />
  <img src="https://img.shields.io/badge/runtime%20deps-0-brightgreen?style=flat-square" alt="No runtime dependencies" />
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome" /></a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Stillman7896/sinkker"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" /></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/overview-dark.png" />
    <img src="docs/img/overview.png" width="880" alt="Sinkker dashboard: queries logged, share blocked by policy, custom rules, blocklist entries and the DoH endpoint to hand to clients" />
  </picture>
</p>

Sinkker answers DNS over HTTPS (RFC 8484) from the edge, decides each query
against a blocklist and your own rules, and gives you a small dashboard to run
it. It is the Pi-hole-shaped hole in a serverless setup: the blocking runs on
Cloudflare's network, close to the client, and the free plan is enough for a
household or a small office.

Also checkout https://github.com/serverless-dns/serverless-dns

## Features

- **Password protected dashboard**: your dashboard is private by default. set
  the password by configuring `DASHBOARD_PASSWORD` in your Workers settings.
  The dashboard is turned off if no password is set.
- **Remote blocklists, several at once.** Subscribe up to 10 documents; plain
  domains, hosts files and AdBlock syntax can be mixed. The `@@` exceptions
  for AdBlock syntax list are imported as allow rules.
- **Your own allow and deny rules**, with subdomain matching — allow
  `example.com` and everything under it is allowed, deny-one-name still works.
- **Live logs** of DNS queries of all connected devices, tag a device to filter
  by its source. Logs can be turned off in settings.
- **Custom upstream DNS**, choose from a selection of providers, or enter your own
  DNS over HTTPS provider URL. 
- **CNAME uncloaking**: answers whose CNAME chain lands on a known disguised tracker (the auto-updated [cname-trackers](https://github.com/AdguardTeam/cname-trackers) list by [AdGuard](https://github.com/AdguardTeam)) are refused — opt-in, off by default.
- **Threat feed (TIF) blocking**: an optional layer backed by the HaGeZi
  [Threat Intelligence Feeds](https://github.com/hagezi/dns-blocklists) list
  (~1.4M malware, phishing and scam domains), built by a Durable Object and
  verified hit-by-hit so legitimate domains are never blocked by accident.
  Off by default.
- **DNS rebinding protection**: internal and special-use names are refused, and a
  private address in an answer (including cloud metadata `169.254.169.254`) is
  dropped before the client sees it.
- **IDN homograph blocking** for punycode lookalike domains where
  internationalized alphabet such as the Cyrillic character “а” (U+0430) looking
  visually indistinguishable from the Latin character “a” (U+0061).
- **Choose the blocked answer**: NXDOMAIN, REFUSED, a null IP (`0.0.0.0` / `::`)
  or NODATA.
- **Response routes**: answer a request with local set record — point `nas.home.lan`
  at a LAN address, or alias one name onto another with a CNAME.
- **Block by TLDs, keywords and regex**
- **Mandarin UI**: the language button in the header switches the dashboard
  between English and 简体中文 on the fly (persisted in localStorage, no reload).
- **Oblivious DoH (RFC 9230)** if you want no single hop to learn both the name
  and your address, and **automatic failover** with negative caching so one dead
  upstream is not an outage.

## Quick start

**Fastest path** — click *Deploy to Cloudflare*, configure your KV + D1 bindings,
set `DASHBOARD_PASSWORD` as a secret to use the dashboard. Your DNS server
will be deployed at `https://<your-worker>.workers.dev/dns-query`.

One setting in the deploy wizard: the **build command** must be `npm run
ui:build` — the dashboard is compiled at deploy time and is not stored in the
repo. If a deploy fails with `assets.directory does not exist`, that command is
missing in the worker's Build settings.

**From a clone** — Node 22+

```sh
npm ci
wrangler kv namespace create RULES --binding RULES --update-config
wrangler secret put DASHBOARD_PASSWORD
npm run deploy
```

## Screenshots

| Rules | Filter lists |
|---|---|
| [![Rules](docs/img/rules.png)](docs/img/rules.png) | [![Filter lists](docs/img/lists.png)](docs/img/lists.png) |
| **Logs** | **Settings** |
| [![Logs](docs/img/logs.png)](docs/img/logs.png) | [![Settings](docs/img/settings.png)](docs/img/settings.png) |
| **Probe** | **Backup** |
| [![Probe](docs/img/probe.png)](docs/img/probe.png) | [![Backup](docs/img/backup.png)](docs/img/backup.png) |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/mobile-overview.png" />
    <img src="docs/img/mobile-logs.png" width="300" alt="Sinkker on a phone" />
  </picture>
</p>

## Documentation

| | |
|---|---|
| [Configuration reference](docs/configuration.md) | Deploy variables, settings, API endpoints, list formats, upstream resolver, logs |
| [How it works](docs/architecture.md) | Filter precedence, storage design, the free-plan budget, source layout |
| [Deploy, upgrade, troubleshoot](docs/operations.md) | Client configuration, upgrading, symptom → cause table |
| [Contributing](CONTRIBUTING.md) | Setup, test expectations, asset and screenshot generation |
| [Security policy](SECURITY.md) | Private reporting, scope, hardening expectations |
| [Changelog](CHANGELOG.md) | What changed, and what to do about it |

## Community

- Bugs and feature requests: [issues](https://github.com/Stillman7896/sinkker/issues)
  (the templates ask for the few things needed to reproduce).
- Security problems: [private report](https://github.com/Stillman7896/sinkker/security/advisories/new),
  never a public issue.
- Pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md);
  `CODE_OF_CONDUCT.md` applies everywhere in this project.

## Credits

- Blocklists are fetched at runtime from their publishers, by default
  [HaGeZi's DNS blocklists](https://github.com/hagezi/dns-blocklists), which are
  published under **GPL-3.0**. Sinkker stores only the URL: no list content is
  bundled in this repository, and the list's own license governs any copy you
  redistribute.
- Runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), with
  KV, D1 and Workers Builds.
- Not affiliated with Cloudflare, Pi-hole, AdBlock or the blocklist publishers.

## License

[Unlicense](https://unlicense.org/), see LICENSE.

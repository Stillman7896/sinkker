<p align="center">
  <img src="brand/mark.svg" width="76" height="76" alt="" />
</p>

<h1 align="center">Sinkker</h1>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

<p align="center">
  <b>运行于 Cloudflare Workers 的 DNS 拦截洞。</b><br />
  在所有设备上拦截广告、追踪器与恶意软件。
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
    <img src="docs/img/overview.png" width="880" alt="Sinkker 面板：已记录的查询、按策略拦截的份额、自定义规则、拦截清单条目以及交给客户端的 DoH 端点" />
  </picture>
</p>

Sinkker 在边缘节点应答 DNS over HTTPS（RFC 8484），按拦截清单和你自己的规则判定每条查询，并提供一个小型面板来管理它。它填补了无服务器场景下 Pi-hole 那个空位：拦截逻辑运行在 Cloudflare 的网络上，靠近客户端，免费额度足够一个家庭或小型办公室使用。

另可参考 https://github.com/serverless-dns/serverless-dns

## 功能特性

- **密码保护的面板**：面板默认私密。在 Workers 设置中通过配置 `DASHBOARD_PASSWORD` 设置密码。未设置密码时面板关闭。
- **远程拦截清单，可同时多份。** 最多订阅 10 份文档；纯域名、hosts 文件与 AdBlock 语法可混合使用。AdBlock 语法清单中的 `@@` 例外会被导入为放行规则。
- **你自己的放行与拦截规则**，支持子域名匹配——放行 `example.com` 时其下所有子域名一并放行，按名单拦一项仍然有效。
- **实时日志**记录所有已连接设备的 DNS 查询，可给设备打标签按来源过滤。日志可在设置中关闭。
- **自定义上游 DNS**，从一组预置提供方中选择，或填入你自己的 DNS over HTTPS 提供方 URL。
- **DNS 重绑定防护**：拒绝内部及特殊用途名称，并在客户端看到之前丢弃应答中的私有地址（含云元数据 `169.254.169.254`）。
- **IDN 同形字拦截**：拦截 punycode 形似的域名，例如国际化字母中西里尔字母 “а”（U+0430）伪装成视觉上无法区分的拉丁字母 “a”（U+0061）。
- **可选的拦截应答**：NXDOMAIN、REFUSED、空 IP（`0.0.0.0` / `::`）或 NODATA。
- **应答路由**：用本地固定记录应答请求——把 `nas.home.lan` 指向一个局域网地址，或用 CNAME 把一个名称别名到另一个。
- **按 TLD、关键词和正则拦截**
- **简体中文界面**：顶部标题栏的语言按钮可在英文与 简体中文 之间即时切换（持久化在 localStorage，无需刷新）。
- **Oblivious DoH（RFC 9230）**：当你不希望任何单跳同时获知域名与你的地址时使用；配合带负面缓存的**自动故障转移**，单台上游宕机不会变成中断。

## 快速开始

**最快路径**——点击 *Deploy to Cloudflare*，配置 KV + D1 绑定，将 `DASHBOARD_PASSWORD` 设为 secret 以使用面板。你的 DNS 服务器将部署在 `https://<your-worker>.workers.dev/dns-query`。

**从克隆构建**——Node 22+

```sh
npm ci
wrangler kv namespace create RULES --binding RULES --update-config
wrangler secret put DASHBOARD_PASSWORD
npm run deploy
```

## 截图

| 规则 | 过滤清单 |
|---|---|
| [![规则](docs/img/rules.png)](docs/img/rules.png) | [![过滤清单](docs/img/lists.png)](docs/img/lists.png) |
| **日志** | **设置** |
| [![日志](docs/img/logs.png)](docs/img/logs.png) | [![设置](docs/img/settings.png)](docs/img/settings.png) |
| **探测** | **备份** |
| [![探测](docs/img/probe.png)](docs/img/probe.png) | [![备份](docs/img/backup.png)](docs/img/backup.png) |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/mobile-overview.png" />
    <img src="docs/img/mobile-logs.png" width="300" alt="Sinkker 在手机上" />
  </picture>
</p>

## 文档

| | |
|---|---|
| [配置参考](docs/configuration.md) | 部署变量、设置、API 端点、清单格式、上游解析器、日志 |
| [工作原理](docs/architecture.md) | 过滤优先级、存储设计、免费额度、源码结构 |
| [部署、升级与排障](docs/operations.md) | 客户端配置、升级、症状 → 原因对照表 |
| [贡献指南](CONTRIBUTING.md) | 环境搭建、测试要求、资源与截图生成 |
| [安全策略](SECURITY.md) | 私密上报、范围、加固预期 |
| [更新日志](CHANGELOG.md) | 改了什么，以及你需要做什么 |

## 社区

- Bug 与功能请求：[issues](https://github.com/Stillman7896/sinkker/issues)（模板会询问复现所需的最少信息）。
- 安全问题：[私密上报](https://github.com/Stillman7896/sinkker/security/advisories/new)，切勿公开 issue。
- 欢迎提交 PR——参见 [CONTRIBUTING.md](CONTRIBUTING.md)；`CODE_OF_CONDUCT.md` 在本项目各处适用。

## 致谢

- 拦截清单在运行时从发布方拉取，默认为 [HaGeZi 的 DNS 拦截清单](https://github.com/hagezi/dns-blocklists)，采用 **GPL-3.0** 发布。Sinkker 仅存储 URL：本仓库不打包任何清单内容，清单自身的许可证约束你重新分发的任何副本。
- 运行于 [Cloudflare Workers](https://developers.cloudflare.com/workers/)，使用 KV、D1 与 Workers Builds。
- 与 Cloudflare、Pi-hole、AdBlock 或各清单发布方均无关联。

## 许可证

[Unlicense](https://unlicense.org/)，详见 LICENSE。

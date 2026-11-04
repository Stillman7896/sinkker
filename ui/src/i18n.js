import { ref, computed } from 'vue';

const KEY = 'dns-dash-locale';
const LANGS = ['en', 'zh'];

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.includes(v) ? v : 'en';
  } catch { return 'en'; }
}

export const locale = ref(stored());

const ZH = {
  'System': '系统', 'Light': '浅色', 'Dark': '深色',
  'next: light': '下一项：浅色', 'next: dark': '下一项：深色', 'next: system': '下一项：系统',
  'Theme': '主题',
  'Sign out': '退出登录',
  'Sign in': '登录',
  'Live traffic': '实时流量',
  'Configuration': '配置',
  'running': '运行中',
  'Language': '语言',
  // nav
  'Overview': '总览', 'Rules': '规则', 'Probe': '探测', 'Logs': '日志',
  'Filter lists': '过滤列表', 'Settings': '设置', 'Backup': '备份',
  'See traffic': '查看流量', 'Test one domain': '测试单个域名',
  'Read the query log': '查看查询日志', 'Try again': '重试', 'Undo': '撤销',
  // phase 2: login + overview
  'Signed in': '已登录',
  'Enter the dashboard password.': '请输入仪表盘密码。',
  'That password did not match.': '密码不正确。',
  'No dashboard password yet': '尚未设置仪表盘密码',
  'Signed out. Enter the password to get back in.': '已退出登录，请重新输入密码。',
  'Dashboard password for this resolver.': '此解析器的仪表盘密码。',
  'Dashboard password': '仪表盘密码',
  'Check again': '再次检查',
  'Check setup again': '再次检查配置',
  'Configuration found — enter the password below': '已找到配置 — 请在下方输入密码',
  'What this resolver has seen and what it stopped.': '此解析器看到并拦截的内容。',
  'Refresh': '刷新', 'Refresh overview': '刷新总览', 'Overview up to date': '总览已更新',
  'Connect a client': '连接客户端',
  'Any DoH client pointed at this endpoint is filtered — no agent, no extra deploy.': '任何指向此端点的 DoH 客户端都会被过滤 — 无需代理，无需额外部署。',
  'Setup guide': '配置指南',
  'DNS over HTTPS endpoint': 'DoH 端点',
  'Tagged DoH endpoint': '带标签的 DoH 端点',
  'per-client tag, e.g. laptop': '客户端标签，如 laptop',
  'Client tag for the DoH URL': 'DoH 链接的客户端标签',
  'Letters, digits, dashes and underscores — e.g. “laptop”.': '仅字母、数字、连字符和下划线 — 例如 “laptop”。',
  'Optional: copy the tagged URL instead and every query from that device is labelled on the Logs page, where the Client filter can show it alone.': '可选：改用带标签的链接，该设备的所有查询都会在日志页标注，可在“客户端”筛选中单独查看。',
  'Upstream:': '上游：', 'change': '更改',
  'route answers locally': '条路由本地应答', 'routes answer locally': '条路由本地应答',
  'Point a client at this resolver': '将客户端指向此解析器',
  'Client type': '客户端类型',
  'Browsers': '浏览器', 'Router': '路由器', 'Mobile': '移动设备', 'curl': 'curl',
  'Command': '命令', 'Done': '完成',
  'DoH only — plain port 53 is not served by this worker.': '仅支持 DoH — 此 Worker 不提供明文 53 端口。',
  'Queries logged': '已记录查询', 'Stopped by policy': '按策略拦截', 'queries': '次查询',
  'Custom rules': '自定义规则', 'routes': '条路由', 'keywords': '个关键词', 'TLDs': '个顶级域',
  'Blocklist entries in memory': '内存中的屏蔽列表条目',
  'subscription': '个订阅源', 'subscriptions': '个订阅源', 'exceptions': '条例外',
  'Query volume by hour of day': '按小时统计的查询量',
  'Last 7 days, local time. Peak {p} queries in an hour.': '近 7 天，本地时间。单小时峰值 {p} 次查询。',
  'total': '总计',
  'Verification outcomes': '验证结果',
  'Share of logged queries by the filter that decided.': '按生效过滤器统计的已记录查询占比。',
  'Most blocked domains': '被拦截最多的域名', 'Open logs': '打开日志',
  'Nothing blocked yet — this resolver is letting everything through.': '还没有拦截记录 — 此解析器放行了全部查询。',
  'custom rule on file': '条自定义规则已保存', 'custom rules on file': '条自定义规则已保存',
  'No query history is being kept': '未保留查询历史',
  'Reading the audit log…': '正在读取审计日志…',
  'Firefox — Settings → Privacy & Security → DNS over HTTPS → Max Protection → Custom, then paste the endpoint.': 'Firefox — 设置 → 隐私与安全 → 基于 HTTPS 的 DNS → 最大保护 → 自定义，然后粘贴端点。',
  'Chrome / Edge — Settings → Privacy and security → Security → Use secure DNS → With → Custom, then paste the endpoint.': 'Chrome / Edge — 设置 → 隐私和安全 → 安全 → 使用安全 DNS → 自定义，然后粘贴端点。',
  'AdGuard Home — Settings → DNS settings → Upstream DNS servers, add the endpoint, then Test upstreams.': 'AdGuard Home — 设置 → DNS 设置 → 上游 DNS 服务器，添加端点，然后点击“测试上游”。',
  'Pi-hole — run cloudflared against the endpoint and point Pi-hole at 127.0.0.1#5053.': 'Pi-hole — 对该端点运行 cloudflared，并把 Pi-hole 指向 127.0.0.1#5053。',
  'Android — Private DNS only speaks DoT, so use a DoH client app and point it at the endpoint.': 'Android — 私人 DNS 仅支持 DoT，请使用 DoH 客户端应用并指向该端点。',
  'iOS / macOS — install a DoH configuration profile or use a DoH client app; both just need the endpoint.': 'iOS / macOS — 安装 DoH 配置描述文件或使用 DoH 客户端应用；两者都只需该端点。',
  'query.bin is a raw DNS message; the response is one too.': 'query.bin 是原始 DNS 报文；响应同样是原始报文。',
  // phase 2: login + overview
  'Signed in': '已登录',
  'Enter the dashboard password.': '请输入仪表盘密码。',
  'That password did not match.': '密码不正确。',
  'No dashboard password yet': '尚未设置仪表盘密码',
  'Signed out. Enter the password to get back in.': '已退出登录，请重新输入密码。',
  'Dashboard password for this resolver.': '此解析器的仪表盘密码。',
  'Dashboard password': '仪表盘密码',
  'Check again': '再次检查',
  'Check setup again': '再次检查配置',
  'Configuration found — enter the password below': '已找到配置 — 请在下方输入密码',
  'What this resolver has seen and what it stopped.': '此解析器看到并拦截的内容。',
  'Refresh': '刷新', 'Refresh overview': '刷新总览', 'Overview up to date': '总览已更新',
  'Connect a client': '连接客户端',
  'Any DoH client pointed at this endpoint is filtered — no agent, no extra deploy.': '任何指向此端点的 DoH 客户端都会被过滤 — 无需代理，无需额外部署。',
  'Setup guide': '配置指南',
  'DNS over HTTPS endpoint': 'DoH 端点',
  'Tagged DoH endpoint': '带标签的 DoH 端点',
  'per-client tag, e.g. laptop': '客户端标签，如 laptop',
  'Client tag for the DoH URL': 'DoH 链接的客户端标签',
  'Letters, digits, dashes and underscores — e.g. “laptop”.': '仅字母、数字、连字符和下划线 — 例如 “laptop”。',
  'Optional: copy the tagged URL instead and every query from that device is labelled on the Logs page, where the Client filter can show it alone.': '可选：改用带标签的链接，该设备的所有查询都会在日志页标注，可在“客户端”筛选中单独查看。',
  'Upstream:': '上游：', 'change': '更改',
  'route answers locally': '条路由本地应答', 'routes answer locally': '条路由本地应答',
  'Point a client at this resolver': '将客户端指向此解析器',
  'Client type': '客户端类型',
  'Browsers': '浏览器', 'Router': '路由器', 'Mobile': '移动设备', 'curl': 'curl',
  'Command': '命令', 'Done': '完成',
  'DoH only — plain port 53 is not served by this worker.': '仅支持 DoH — 此 Worker 不提供明文 53 端口。',
  'Queries logged': '已记录查询', 'Stopped by policy': '按策略拦截', 'queries': '次查询',
  'Custom rules': '自定义规则', 'routes': '条路由', 'keywords': '个关键词', 'TLDs': '个顶级域',
  'Blocklist entries in memory': '内存中的屏蔽列表条目',
  'subscription': '个订阅源', 'subscriptions': '个订阅源', 'exceptions': '条例外',
  'Query volume by hour of day': '按小时统计的查询量',
  'Last 7 days, local time. Peak {p} queries in an hour.': '近 7 天，本地时间。单小时峰值 {p} 次查询。',
  'total': '总计',
  'Verification outcomes': '验证结果',
  'Share of logged queries by the filter that decided.': '按生效过滤器统计的已记录查询占比。',
  'Most blocked domains': '被拦截最多的域名', 'Open logs': '打开日志',
  'Nothing blocked yet — this resolver is letting everything through.': '还没有拦截记录 — 此解析器放行了全部查询。',
  'custom rule on file': '条自定义规则已保存', 'custom rules on file': '条自定义规则已保存',
  'No query history is being kept': '未保留查询历史',
  'Reading the audit log…': '正在读取审计日志…',
  'Firefox — Settings → Privacy & Security → DNS over HTTPS → Max Protection → Custom, then paste the endpoint.': 'Firefox — 设置 → 隐私与安全 → 基于 HTTPS 的 DNS → 最大保护 → 自定义，然后粘贴端点。',
  'Chrome / Edge — Settings → Privacy and security → Security → Use secure DNS → With → Custom, then paste the endpoint.': 'Chrome / Edge — 设置 → 隐私和安全 → 安全 → 使用安全 DNS → 自定义，然后粘贴端点。',
  'AdGuard Home — Settings → DNS settings → Upstream DNS servers, add the endpoint, then Test upstreams.': 'AdGuard Home — 设置 → DNS 设置 → 上游 DNS 服务器，添加端点，然后点击“测试上游”。',
  'Pi-hole — run cloudflared against the endpoint and point Pi-hole at 127.0.0.1#5053.': 'Pi-hole — 对该端点运行 cloudflared，并把 Pi-hole 指向 127.0.0.1#5053。',
  'Android — Private DNS only speaks DoT, so use a DoH client app and point it at the endpoint.': 'Android — 私人 DNS 仅支持 DoT，请使用 DoH 客户端应用并指向该端点。',
  'iOS / macOS — install a DoH configuration profile or use a DoH client app; both just need the endpoint.': 'iOS / macOS — 安装 DoH 配置描述文件或使用 DoH 客户端应用；两者都只需该端点。',
  'query.bin is a raw DNS message; the response is one too.': 'query.bin 是原始 DNS 报文；响应同样是原始报文。',
};

export function t(key) {
  return locale.value === 'zh' ? (ZH[key] ?? key) : key;
}

export function setLocale(l) {
  locale.value = LANGS.includes(l) ? l : 'en';
  try { localStorage.setItem(KEY, locale.value); } catch { /* private mode */ }
}

export function toggleLocale() {
  setLocale(locale.value === 'en' ? 'zh' : 'en');
}


export const langLabel = computed(() => (locale.value === 'en' ? '中文' : 'EN'));

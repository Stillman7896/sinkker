import pathlib
DICT = """
  // rules
  'Block rules': '拦截规则', 'Allow rules': '放行规则', 'All rules': '全部规则',
  'Needs a real domain, like ads.example.net.': '需要有效域名，如 ads.example.net。',
  'Saves as {d}.': '保存为 {d}。',
  'A rule applies to the domain and every subdomain of it. Allow wins over the blocklist.': '规则适用于该域名及其所有子域名。放行优先于屏蔽列表。',
  'Add rule': '添加规则', 'Remove rule': '移除规则',
  'now blocked': '现已拦截', 'now allowed': '现已放行', 'removed': '已移除',
  'Import rules': '导入规则',
  '{n} added, {m} left out': '已添加 {n} 条，跳过 {m} 条', '{n} rules added': '已添加 {n} 条规则',
  'custom rule': '条自定义规则', 'custom rules': '条自定义规则',
  'allow exception': '条例外放行', 'allow exceptions': '条例外放行', 'from the blocklist': '来自屏蔽列表',
  'Close bulk import': '关闭批量导入', 'Bulk import': '批量导入', 'Import': '导入',
  'Add a rule': '添加规则', 'Paste many domains': '粘贴多个域名',
  'One per line, or separated by commas.': '每行一个，或用逗号分隔。',
  'Block': '拦截', 'Allow': '放行', 'Block them': '批量拦截', 'Allow them': '批量放行',
  'Answer': '应答', 'Kind': '类型', 'View': '视图', 'All': '全部',
  'Domains to import': '要导入的域名', 'lines ready': '行就绪',
  '— the rest are not domains': '— 其余不是域名',
  'Filter rules': '筛选规则', 'Filter…': '筛选…',
  'Custom allow and deny rules': '自定义放行与拦截规则',
  'Domain': '域名', 'Source': '来源',
  'blocked': '已拦截', 'allowed': '已放行', 'blocklist': '屏蔽列表', 'custom': '自定义',
  'From the blocklist file (@@ exception) — edit the list, not this dashboard': '来自屏蔽列表文件（@@ 例外）— 请编辑列表文件，而非此仪表盘',
  'Set in this dashboard': '在此仪表盘中设置',
  'Remove': '移除', 'Confirm?': '确认？', 'read-only': '只读',
  'No rule matches “{f}”.': '没有匹配 “{f}” 的规则。',
  'No block rules yet.': '还没有拦截规则。', 'No allow rules yet.': '还没有放行规则。', 'No custom rules yet.': '还没有自定义规则。',
  'Try part of the domain, without the top-level suffix.': '试试域名的一部分，不含顶级后缀。',
  'Add a domain above to block it even when the shared list lets it through.': '在上方添加域名，即使共享列表放行也会拦截。',
  'Allow rules force an answer. @@ exceptions in the blocklist file show up here too.': '放行规则强制应答。屏蔽列表文件中的 @@ 例外也会显示在这里。',
  'Add a domain above to force an answer, or force-allow one the shared blocklist stops.': '在上方添加域名以强制应答，或强制放行被共享屏蔽列表拦截的域名。',
"""
p = pathlib.Path("ui/src/i18n.js"); s = p.read_text()
i = s.index("\n};\n"); s = s[:i] + DICT + s[i:]
p.write_text(s); print("dict ok")

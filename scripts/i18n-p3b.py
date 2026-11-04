import pathlib
DICT = """
  // logs
  'Search logs': '搜索日志', 'Showing {n} matches': '共 {n} 条匹配',
  'Apply status filter': '应用状态筛选', 'Filtered to {n} rows': '已筛选出 {n} 行',
  'Apply client filter': '应用客户端筛选', 'untagged clients': '未标记客户端', 'client “{c}”': '客户端 “{c}”',
  'Reload logs': '重新加载日志', '{n} rows loaded': '已加载 {n} 行',
  'Delete filtered logs': '删除筛选结果', '{n} rows deleted': '已删除 {n} 行',
  'Clear all logs': '清空全部日志', 'Log cleared': '日志已清空',
  'Delete row': '删除记录', '{d} entry deleted': '{d} 的记录已删除',
  'Block domain': '拦截域名', 'Allow domain': '放行域名',
  'entry': '条记录', 'entries': '条记录', 'matching this filter': '匹配当前筛选',
  'Reload': '重新加载', 'Delete filtered': '删除筛选结果',
  'Clear all': '清空全部', 'Really clear the log?': '确定要清空日志吗？',
  'Search domain': '搜索域名', 'Search domain…': '搜索域名…',
  'Status': '状态', 'any': '全部', 'Client': '客户端', 'any client': '全部客户端', 'untagged': '未标记',
  'Rows': '行数', 'Reset filter': '重置筛选',
  'The audit log is switched off': '审计日志已关闭', 'Open settings': '打开设置',
  'Recent DNS queries': '近期 DNS 查询',
  'When': '时间', 'Outcome': '结果', 'Type': '类型',
  'Show only queries from {c}': '只看来自 {c} 的查询',
  'Quick actions for {d}': '{d} 的快捷操作',
  'Nothing matches that filter.': '没有符合该筛选的记录。', 'The log is empty.': '日志为空。',
  'Clear the filter to see everything recorded.': '清除筛选以查看全部记录。',
  'Queries will appear here as clients use this resolver.': '客户端使用此解析器时，查询会显示在这里。',
  'Previous': '上一页', 'Next page': '下一页',
  'just now': '刚刚', '{n} min ago': '{n} 分钟前', '{n} h ago': '{n} 小时前', '{n} d ago': '{n} 天前',
"""
p = pathlib.Path("ui/src/i18n.js"); s = p.read_text()
i = s.index("\n};\n"); s = s[:i] + DICT + s[i:]; p.write_text(s); print("dict ok")

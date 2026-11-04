import pathlib
p = pathlib.Path("ui/src/i18n.js"); s = p.read_text()
marker = "export const langLabel = computed(() => (locale.value === 'en' ? '中文' : 'EN'));\n"
head, sep, tail = s.partition(marker)
assert sep, "marker not found"
entries = tail.strip("\n")
# ZH object closes with the first "\n};\n" in head
zh_end = head.index("\n};\n")
head = head[:zh_end] + "\n" + entries + head[zh_end:]
p.write_text(head); print("ok")

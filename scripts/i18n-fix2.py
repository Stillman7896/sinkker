import pathlib
p = pathlib.Path("ui/src/views/Overview.vue"); s = p.read_text()
old = "“laptop”.' : ''"; new = "“laptop”.') : ''"
assert s.count(old) == 1, s.count(old)
p.write_text(s.replace(old, new)); print("ok")

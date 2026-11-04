import pathlib, re
src = pathlib.Path("scripts/zh_settings.py").read_text()
entries = re.findall(r"^\s*'(.+?)': '(.+?)',", src, re.M)
p = pathlib.Path("ui/src/i18n.js"); s = p.read_text()
have = {m.group(1) for m in re.finditer(r"^\s*'(.+?)':", s, re.M)}
add = "\n".join(f"  '{k}': '{v}'," for k, v in entries if k not in have)
if not add:
    print("nothing to add"); raise SystemExit
i = s.index("\n};\n"); p.write_text(s[:i] + add + "\n" + s[i:])
print("added", add.count("': '"))

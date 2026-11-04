import pathlib
p = pathlib.Path("ui/src/views/Overview.vue"); s = p.read_text()
pairs = [
 ("\n            change\n          </button>", "\n            {{ t('change') }}\n          </button>"),
 ("\n              Open logs\n            </button>", "\n              {{ t('Open logs') }}\n            </button>"),
 ("? 'Letters", "? t('Letters"), ("”.' : '')", "”.') : '')"),
]
miss = 0
for old, new in pairs:
    if s.count(old) == 0: print("MISS:", repr(old[:50])); miss += 1
    else: s = s.replace(old, new)
p.write_text(s); print("misses:", miss)

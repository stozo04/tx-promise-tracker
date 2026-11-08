# Save Squarespace images the crawler skipped (".../name.png/?format=1500w" looks like a folder URL)
# and point every size variant at one local copy. Also keep links to the campaign site inside the
# mirror, and load YouTube embeds from youtube-nocookie.com.
import re, sys, glob, os, hashlib, urllib.parse, urllib.request
root = sys.argv[1]
# Public path of the mirror, e.g. /archive/goodwin (the folder name under public/archive/).
BASE = "/archive/" + os.path.basename(os.path.normpath(root))
ORIGIN = os.environ.get("ORIGIN", "https://www.vikkigoodwin.com")
SITE_HOST = re.escape(re.sub(r"^www\.", "", urllib.parse.urlparse(ORIGIN).hostname))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg"}
pat = re.compile(r'(?:https:)?//(?:images\.squarespace-cdn\.com|static1\.squarespace\.com)[^"\' )<>,]*')
files = [p for p in glob.glob(os.path.join(root, "**", "index.html"), recursive=True) if not os.path.relpath(p, root).startswith("act" + os.sep)]
pages = set(os.path.relpath(os.path.dirname(p), root).replace(os.sep, "/") for p in files)
bases = {}
for p in files:
    for m in pat.findall(open(p, encoding="utf-8", errors="surrogateescape").read()):
        raw = m.replace("&amp;", "&")
        base = re.sub(r"\?.*$", "", raw)
        base = ("https:" + base) if base.startswith("//") else base
        bases.setdefault(base.rstrip("/"), set()).add(m)
local = {}
fails = []
for base in bases:
    for url in (base + "/?format=1500w", base + "?format=1500w", base):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ORIGIN + "/"})
            res = urllib.request.urlopen(req, timeout=30)
            body = res.read(); ctype = res.headers.get("Content-Type", "").split(";")[0]
            if ctype not in EXT: raise ValueError(f"type {ctype}")
            name = hashlib.sha1(base.encode()).hexdigest()[:20] + "." + EXT[ctype]
            open(os.path.join(root, "assets", name), "wb").write(body)
            local[base] = f"{BASE}/assets/" + name
            break
        except Exception as e:
            err = str(e)
    else:
        fails.append((base, err))
changed = 0
for p in files:
    s = open(p, encoding="utf-8", errors="surrogateescape").read(); o = s
    def repl(m):
        raw = m.group(0).replace("&amp;", "&")
        base = re.sub(r"\?.*$", "", raw); base = ("https:" + base) if base.startswith("//") else base
        return local.get(base.rstrip("/"), m.group(0))
    s = pat.sub(repl, s)
    # Links to the campaign site that the mirror holds stay inside the mirror.
    def link(m):
        path = m.group(2).split("#")[0].split("?")[0].strip("/")
        key = path if path else "."
        return f'href={m.group(1)}{BASE}/{path + "/" if path else ""}{m.group(1)}' if key in pages else m.group(0)
    s = re.sub(r'href=(["\'])https?://(?:www\.)?' + SITE_HOST + r'/?([^"\']*)\1', link, s)
    s = s.replace("https://www.youtube.com/embed/", "https://www.youtube-nocookie.com/embed/")
    if s != o:
        open(p, "w", encoding="utf-8", errors="surrogateescape").write(s); changed += 1
print("images", len(bases), "saved", len(local), "fails", fails, "pages changed", changed)

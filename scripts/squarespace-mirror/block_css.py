# Squarespace loads each block's stylesheet from data-block-css with JavaScript. The mirror has no
# scripts, so save those stylesheets (and the files they reference) locally and link them in <head>.
import re, sys, glob, os, hashlib, html, urllib.request, urllib.parse
root = sys.argv[1]
# Public path of the mirror, e.g. /archive/goodwin (the folder name under public/archive/).
BASE = "/archive/" + os.path.basename(os.path.normpath(root))
ORIGIN = os.environ.get("ORIGIN", "https://www.vikkigoodwin.com")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
cache = {}
fails = []
def local_name(url, ext):
    return hashlib.sha1(url.encode()).hexdigest()[:20] + "." + ext
def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ORIGIN + "/"})
    return urllib.request.urlopen(req, timeout=30).read()
def save(url, depth=0):
    if url in cache: return cache[url]
    path = urllib.parse.urlparse(url).path
    ext = (path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else "bin")[:5]
    try:
        body = fetch(url)
    except Exception as e:
        fails.append((url, str(e))); cache[url] = None; return None
    name = local_name(url, ext)
    if ext == "css" and depth < 3:
        css = body.decode("utf-8", "replace")
        def repl(m):
            ref = m.group(2)
            if ref.startswith("data:") or ref.startswith("#"): return m.group(0)
            loc = save(urllib.parse.urljoin(url, ref), depth + 1)
            return f'url("{loc}")' if loc else m.group(0)
        css = re.sub(r'url\(\s*([\'"]?)([^\'")]+)\1\s*\)', repl, css)
        body = css.encode("utf-8")
    open(os.path.join(root, "assets", name), "wb").write(body)
    cache[url] = f"{BASE}/assets/{name}"
    return cache[url]
pages = 0
for p in glob.glob(os.path.join(root, "**", "index.html"), recursive=True):
    if os.path.relpath(p, root).startswith("act" + os.sep): continue
    s = open(p, encoding="utf-8", errors="surrogateescape").read()
    urls = []
    for attr in re.findall(r'data-block-css="([^"]*)"', s):
        for u in re.findall(r'https://[^"\]\s,]+?\.css', html.unescape(attr)):
            if u not in urls: urls.append(u)
    links = [save(u) for u in urls]
    links = [l for l in links if l]
    if not links or "data-mirror-block-css" in s: continue
    tags = "".join(f'<link rel="stylesheet" data-mirror-block-css href="{l}">' for l in links)
    s = s.replace("</head>", tags + "</head>", 1)
    open(p, "w", encoding="utf-8", errors="surrogateescape").write(s)
    pages += 1
print("pages", pages, "files", len([v for v in cache.values() if v]), "fails", fails[:10])

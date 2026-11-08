# Make a rendered Squarespace mirror static: drop scripts (the DOM is already rendered), external
# preconnect/preload hints, tracking pixels, and disable forms. Never touches visible text.
import re, sys, glob, os
root = sys.argv[1]
skip = set(sys.argv[2:])  # subfolders to leave alone
stats = {"files": 0, "scripts": 0, "hints": 0, "pixels": 0, "forms": 0, "iframes": 0}
def disable_form(m):
    stats["forms"] += 1
    f = m.group(0)
    open_tag = re.match(r'<form\b[^>]*>', f).group(0)
    new_open = re.sub(r'\saction=("[^"]*"|\'[^\']*\')', '', open_tag)
    new_open = re.sub(r'\sonsubmit=("[^"]*"|\'[^\']*\')', '', new_open)
    new_open = new_open[:-1] + ' action="#" onsubmit="return false">'
    f = f.replace(open_tag, new_open, 1)
    return re.sub(r'<(input|select|textarea|button)\b(?![^>]*\sdisabled\b)', r'<\1 disabled', f)
for path in glob.glob(os.path.join(root, '**', 'index.html'), recursive=True):
    rel = os.path.relpath(path, root)
    if rel.split(os.sep)[0] in skip:
        continue
    s = open(path, encoding='utf-8', errors='surrogateescape').read()
    o = s
    s, n = re.subn(r'<script\b(?![^>]*type=["\']application/ld\+json)[^>]*>[\s\S]*?</script>', '', s, flags=re.I); stats["scripts"] += n
    s, n = re.subn(r'<link\b[^>]*rel=["\'](?:preconnect|dns-prefetch|preload|modulepreload|prefetch)["\'][^>]*>', '', s, flags=re.I); stats["hints"] += n
    s, n = re.subn(r'<link\b[^>]*href=["\']https://(?:fonts\.googleapis\.com/icon|www\.gstatic\.com/_/translate_http)[^"\']*["\'][^>]*>', '', s, flags=re.I); stats["hints"] += n
    s, n = re.subn(r'<img\b[^>]*src=["\']https?://[^"\']*(?:ngpvan\.com/v1/Track|google\.com/images/cleardot)[^"\']*["\'][^>]*>', '', s, flags=re.I); stats["pixels"] += n
    s = re.sub(r'<form\b[\s\S]*?</form>', disable_form, s, flags=re.I)
    s, n = re.subn(r'<iframe\b[^>]*src=["\']https?://[^"\']*(?:translate\.google|recaptcha)[^"\']*["\'][^>]*>\s*</iframe>', '', s, flags=re.I); stats["iframes"] += n
    if s != o:
        open(path, 'w', encoding='utf-8', errors='surrogateescape').write(s)
        stats["files"] += 1
print(stats)

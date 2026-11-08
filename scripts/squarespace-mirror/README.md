# Squarespace mirror fixes

`scripts/mirror-campaign-site.mjs` saves a rendered copy of a campaign site. A Squarespace site needs three more passes before the copy is static and private, because Squarespace's scripts keep loading code and analytics after the page renders. They were used for `public/archive/goodwin/`. Run them in this order with Python 3 (`python3 -I <script> <mirror folder>`), then check the copy in a browser served from `python3 -m http.server -d public`.

1. `localize_sqsp.py <mirror>`: saves Squarespace images whose address ends in a folder-style slash (`.../name.png/?format=1500w`, which the crawler skips) and points every size variant at one copy. Keeps links to the campaign site inside the mirror and loads YouTube embeds from youtube-nocookie.com. Set `ORIGIN` to the campaign site's origin.
2. `staticize.py <mirror> [subfolders to skip]`: removes scripts, resource hints, tracking pixels and the Google Translate widget, and disables every form.
3. `block_css.py <mirror>`: saves the block stylesheets that Squarespace loads with a script (`data-block-css`) and links them in each page's head.

Record each change in the mirror's `archive-manifest.json` under `modifications`.

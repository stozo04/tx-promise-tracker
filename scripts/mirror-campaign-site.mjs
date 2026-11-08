// Mirror a campaign site into public/archive/<name>/ the same way the James and Gina mirrors were made:
// rendered DOM from a real browser, assets saved under /archive/<name>/assets/<hash>.<ext>,
// internal links rewritten to the mirror, noindex + canonical injected, videos preload="none",
// and an archive-manifest.json with pages, crawl errors and asset failures.
//
// Usage:
//   node scripts/mirror-campaign-site.mjs <origin> <name> <outRoot> <chromePath> [extra page URLs...]
//   e.g. node scripts/mirror-campaign-site.mjs https://zach4texas.com zach public/archive "<path to Chromium>"
//
// Environment:
//   SITEMAP=<url>        Sitemap or sitemap index to start from (default <origin>/sitemap.xml).
//                        Child sitemaps whose URL mentions "image" are skipped.
//   SINGLE=1             Mirror only the extra page URLs given; no sitemap, no link following.
//   ASSET_HOSTS=<regex>  Extra hosts whose files count as assets (e.g. "squarespace-cdn\\.com|squarespace\\.com").
//
// Requires Playwright (`npm i playwright` in a scratch folder) and a Chromium binary; pass its path.
// Use the browser's real user agent. Faking one got 403s from WordPress.com hosting.
// Pages with forms: disable the form afterwards and record that in the manifest's "modifications".
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [origin, name, outRoot, chromePath, ...extraPages] = process.argv.slice(2);
const ORIGIN = new URL(origin).origin;
const HOST = new URL(origin).host;
const OUT = path.join(outRoot, name);
const ASSET_DIR = path.join(OUT, "assets");
const PUBLIC_BASE = `/archive/${name}`;
// Direct downloads identify as the project, like the tx_sync Edge Function. The browser keeps its own user agent.
const UA = "PromiseVsDelivered/1.0 (+https://github.com/stozo04/tx-promise-tracker)";

const assets = new Map(); // absolute URL -> local public path
const assetFailures = [];
const crawlErrors = [];
const captured = new Map(); // URL -> { body: Buffer, type }

const EXT_BY_TYPE = {
  "text/css": "css",
  "application/javascript": "js",
  "text/javascript": "js",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "application/font-woff": "woff",
  "application/font-woff2": "woff2",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "text/html": "html",
  "application/json": "json",
};

function extFor(url, type) {
  const clean = (type ?? "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE[clean]) return EXT_BY_TYPE[clean];
  const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : "bin";
}

function hashName(url, type) {
  return `${createHash("sha1").update(url).digest("hex").slice(0, 20)}.${extFor(url, type)}`;
}

function normalizePage(url) {
  const u = new URL(url, ORIGIN);
  u.hash = "";
  u.search = "";
  if (!u.pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += "/";
  return u.toString();
}

function isPageUrl(url) {
  let u;
  try {
    u = new URL(url, ORIGIN);
  } catch {
    return false;
  }
  if (u.host !== HOST) return false;
  if (u.search) return false;
  if (/^\/(wp-|feed|comments\/feed|xmlrpc|cdn-cgi)/.test(u.pathname)) return false;
  if (/\/feed\/?$/.test(u.pathname)) return false;
  if (/\.[a-z0-9]{2,5}$/i.test(u.pathname)) return false;
  return true;
}

async function fetchAsset(url) {
  if (captured.has(url)) return captured.get(url);
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: ORIGIN + "/" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const entry = { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
  captured.set(url, entry);
  return entry;
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/g;

async function saveAsset(url, depth = 0) {
  if (assets.has(url)) return assets.get(url);
  if (!/^https?:/.test(url)) return null;
  let entry;
  try {
    entry = await fetchAsset(url);
  } catch (err) {
    assetFailures.push({ url, error: String(err) });
    return null;
  }
  const file = hashName(url, entry.type);
  const local = `${PUBLIC_BASE}/assets/${file}`;
  assets.set(url, local);
  let body = entry.body;
  if (extFor(url, entry.type) === "css" && depth < 4) {
    body = Buffer.from(await rewriteCss(body.toString("utf8"), url, depth + 1));
  }
  await writeFile(path.join(ASSET_DIR, file), body);
  return local;
}

async function rewriteCss(css, baseUrl, depth) {
  const refs = new Set();
  for (const m of css.matchAll(CSS_URL)) refs.add(m[2]);
  for (const m of css.matchAll(CSS_IMPORT)) refs.add(m[2]);
  const map = new Map();
  for (const ref of refs) {
    if (ref.startsWith("data:") || ref.startsWith("#")) continue;
    let abs;
    try {
      abs = new URL(ref, baseUrl).toString();
    } catch {
      continue;
    }
    const local = await saveAsset(abs, depth);
    if (local) map.set(ref, local);
  }
  return css
    .replace(CSS_URL, (all, q, ref) => (map.has(ref) ? `url("${map.get(ref)}")` : all))
    .replace(CSS_IMPORT, (all, q, ref) => (map.has(ref) ? `@import "${map.get(ref)}"` : all));
}

const ASSET_TYPES = new Set(["stylesheet", "script", "image", "font", "media"]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function capturePage(context, url) {
  const page = await context.newPage();
  const seen = [];
  page.on("response", async (res) => {
    const type = res.request().resourceType();
    if (!ASSET_TYPES.has(type)) return;
    const u = res.url();
    if (!/^https?:/.test(u) || !res.ok()) return;
    try {
      const body = await res.body();
      captured.set(u, { body, type: res.headers()["content-type"] ?? null });
      seen.push(u);
    } catch {
      // Body not available (redirect or streamed media); fetched again later if referenced.
    }
  });
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  if (!response || !response.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
  // Scroll to the bottom so lazy images, Elementor lazy backgrounds and animations load.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
  const html = await page.content();
  const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
  await page.close();
  return { html, links, seen };
}

function collectHtmlUrls(html) {
  const urls = new Set();
  const attr = /(?:src|href|poster|data-src|data-lazy-src|data-bg|content)=["']([^"']+)["']/gi;
  for (const m of html.matchAll(attr)) urls.add(m[1].replace(/&amp;/g, "&"));
  const srcset = /(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  for (const m of html.matchAll(srcset)) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) urls.add(u.replace(/&amp;/g, "&"));
    }
  }
  for (const m of html.matchAll(CSS_URL)) urls.add(m[2].replace(/&amp;/g, "&").replace(/&quot;/g, ""));
  // Any origin or WordPress.com CDN URL in any context (importmaps, inline config).
  const anyUrl = new RegExp(`(?:https?:)?//(?:${escapeRegex(HOST)}|[ics][0-9]\\.wp\\.com)/[^\\s"'<>)\\\\]+`, "g");
  for (const m of html.matchAll(anyUrl)) urls.add(m[0].replace(/&amp;/g, "&"));
  // JSON-escaped URLs inside inline scripts and data-settings (Elementor backgrounds, slideshows).
  for (const m of html.matchAll(/https?:\\\/\\\/[^"'\s]+/g)) urls.add(m[0].replace(/\\\//g, "/"));
  return urls;
}

function looksLikeAsset(url) {
  try {
    const u = new URL(url);
    // Folder URLs from plugin config ("…/assets/", "…/uploads") are not files.
    if (u.pathname.endsWith("/") || !/\.[a-z0-9]{2,5}$/i.test(u.pathname) && !u.pathname.startsWith("/_static/")) return false;
    if (u.host === HOST) {
      return (/^\/wp-(content|includes)\//.test(u.pathname) || u.pathname.startsWith("/_static/")) && !/\.php$/.test(u.pathname);
    }
    if (/^[ics][0-9]\.wp\.com$/.test(u.host)) return true;
    if (process.env.ASSET_HOSTS && new RegExp(process.env.ASSET_HOSTS).test(u.host)) return true;
    return captured.has(url);
  } catch {
    return false;
  }
}

async function rewriteHtml(html, pageUrl, pageSet) {
  // 1. Assets referenced anywhere in the rendered DOM.
  const map = new Map(); // spelling in the HTML -> local path
  for (const raw of collectHtmlUrls(html)) {
    if (raw.startsWith("data:") || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let abs;
    try {
      abs = new URL(raw, pageUrl).toString();
    } catch {
      continue;
    }
    if (!looksLikeAsset(abs)) continue;
    const local = await saveAsset(abs);
    if (local) {
      map.set(abs, local);
      if (raw !== abs) map.set(raw, local);
    }
  }
  let out = html;
  // Longest first so a URL is never partly replaced by a shorter prefix.
  for (const [abs, local] of [...map.entries()].sort((a, b) => b[0].length - a[0].length)) {
    const forms = new Set([abs, abs.replace(/&/g, "&amp;"), abs.replace(/\//g, "\\/")]);
    const u = new URL(abs, pageUrl);
    if (u.host === HOST && /^https?:/.test(abs)) {
      forms.add(abs.replace(ORIGIN, ""));
      forms.add(`//${HOST}${u.pathname}${u.search}`);
    }
    for (const form of forms) {
      const replacement = form.includes("\\/") ? local.replace(/\//g, "\\/") : local;
      out = out.replace(new RegExp(`(["'(\\s,])${escapeRegex(form)}(?=["')\\s,])`, "g"), `$1${replacement}`);
    }
  }
  // 2. Links to archived pages stay inside the mirror.
  out = out.replace(/href=(["'])([^"']+)\1/g, (all, q, href) => {
    let abs;
    try {
      abs = new URL(href.replace(/&amp;/g, "&"), pageUrl);
    } catch {
      return all;
    }
    if (abs.host !== HOST) return all;
    const hash = abs.hash;
    const key = normalizePage(abs.toString());
    if (!pageSet.has(key)) return all;
    const local = `${PUBLIC_BASE}${new URL(key).pathname}`;
    return `href=${q}${local}${hash}${q}`;
  });
  // 3. Videos only load when played.
  out = out.replace(/<video\b(?![^>]*\bpreload=)/g, '<video preload="none"');
  out = out.replace(/(<video\b[^>]*\bpreload=)(["'])(?:auto|metadata)\2/g, '$1$2none$2');
  // 4. Keep the mirror out of search results and point at the original.
  out = out.replace(/<meta[^>]+name=["']robots["'][^>]*>\s*/gi, "");
  out = out.replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/gi, "");
  out = out.replace(
    /<head([^>]*)>/i,
    `<head$1><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${pageUrl}">`,
  );
  return out;
}

/** Page URLs from a sitemap, following a sitemap index one level down. */
async function sitemapPages(url, depth = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (/<sitemapindex/i.test(xml) && depth < 2) {
    const pages = [];
    for (const child of locs.filter((loc) => !/image/i.test(loc))) pages.push(...(await sitemapPages(child, depth + 1)));
    return pages;
  }
  return locs.filter((loc) => isPageUrl(loc)).map((loc) => normalizePage(loc));
}

async function main() {
  await mkdir(ASSET_DIR, { recursive: true });
  // SINGLE=1 mirrors only the pages named on the command line and follows no links.
  const single = process.env.SINGLE === "1";
  const queue = [];
  if (!single) {
    queue.push(...(await sitemapPages(process.env.SITEMAP || `${ORIGIN}/sitemap.xml`)));
  }
  for (const extra of extraPages) queue.push(normalizePage(extra));
  if (!single && !queue.includes(`${ORIGIN}/`)) queue.unshift(`${ORIGIN}/`);

  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const pages = new Map(); // URL -> html
  const pageSet = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (pageSet.has(url)) continue;
    pageSet.add(url);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const { html, links } = await capturePage(context, url);
      pages.set(url, html);
      for (const link of links) {
        if (single || !isPageUrl(link)) continue;
        const key = normalizePage(link);
        if (!pageSet.has(key) && !queue.includes(key)) queue.push(key);
      }
      console.log(`captured ${url}`);
    } catch (err) {
      crawlErrors.push({ url, error: String(err) });
      pageSet.delete(url);
      console.log(`FAILED ${url}: ${err}`);
    }
  }
  await browser.close();

  for (const [url, html] of pages) {
    const out = await rewriteHtml(html, url, pageSet);
    const dir = path.join(OUT, decodeURIComponent(new URL(url).pathname));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), out);
  }

  const manifest = {
    captured: new Date().toISOString().slice(0, 10),
    origin: ORIGIN,
    pages: [...pages.keys()],
    crawlErrors,
    assetFailures,
  };
  await writeFile(path.join(OUT, "archive-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`pages ${pages.size}, assets ${assets.size}, asset failures ${assetFailures.length}, crawl errors ${crawlErrors.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

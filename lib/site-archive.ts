export const SITE_ARCHIVE_BUCKET = "tx-site-archive";

export const SITE_ARCHIVE_ASSET_EXTENSIONS = [
  "avif",
  "bin",
  "bmp",
  "css",
  "eot",
  "gif",
  "jpeg",
  "jpg",
  "js",
  "json",
  "mp4",
  "png",
  "svg",
  "ttf",
  "webp",
  "woff",
  "woff2",
];

export function siteArchiveBase(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${SITE_ARCHIVE_BUCKET}`;
}

export function siteArchiveKey(segments: string[]) {
  if (!segments.length || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  const last = segments[segments.length - 1];
  return last.includes(".") ? segments.join("/") : [...segments, "index.html"].join("/");
}

export function siteArchiveUrl(supabaseUrl: string, key: string) {
  return `${siteArchiveBase(supabaseUrl)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

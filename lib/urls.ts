export function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function storagePublicUrl(supabaseUrl: string, path: string | null) {
  if (!path) return null;
  const encoded = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/tx-campaign-archives/${encoded}`;
}

import { siteArchiveKey, siteArchiveUrl } from "@/lib/site-archive";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400";

export async function GET(_request: Request, context: RouteContext<"/archive/[...path]">) {
  const { path } = await context.params;
  const key = siteArchiveKey(path);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !supabaseUrl) return new Response("Not found", { status: 404 });

  const upstream = await fetch(siteArchiveUrl(supabaseUrl, key));
  if (!upstream.ok || !upstream.body) return new Response("Not found", { status: 404 });

  const contentType = key.endsWith(".html")
    ? "text/html; charset=utf-8"
    : (upstream.headers.get("content-type") ?? "application/octet-stream");
  return new Response(upstream.body, {
    headers: { "content-type": contentType, "cache-control": CACHE_CONTROL },
  });
}

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Cache-Control": "public, max-age=60",
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export function options() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export function paging(url: URL) {
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  let limit = 200;
  let offset = 0;

  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) {
      return { error: "limit must be a whole number from 0 to 500." };
    }
    limit = Math.min(500, Number(limitRaw));
  }
  if (offsetRaw !== null) {
    if (!/^\d+$/.test(offsetRaw)) {
      return { error: "offset must be a whole number." };
    }
    offset = Number(offsetRaw);
  }

  return { limit, offset };
}

export function one(url: URL, name: string) {
  const value = url.searchParams.get(name);
  return value && value.trim() ? value : null;
}

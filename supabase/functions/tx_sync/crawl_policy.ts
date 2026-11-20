export type Robots = { allow: string[]; disallow: string[]; delayMs: number; sitemaps: string[] };

export const AGENT_TOKEN = "promisevsdelivered";
export const MIN_SITE_GAP_MS = 500;
export const REFUSAL_STATUSES = [401, 403, 429, 451];

export const DISALLOW_ALL: Robots = { allow: [], disallow: ["/"], delayMs: 0, sitemaps: [] };

export function isRefusal(status: number) {
  return REFUSAL_STATUSES.includes(status);
}

type Group = { agents: string[]; allow: string[]; disallow: string[]; delayMs: number | null };

export function parseRobots(text: string, token = AGENT_TOKEN): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let readingAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.replace(/#.*$/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !readingAgents) {
        current = { agents: [], allow: [], disallow: [], delayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    if (!current) continue;
    if (field === "allow" && value) current.allow.push(value);
    else if (field === "disallow" && value) current.disallow.push(value);
    else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delayMs = Math.round(seconds * 1000);
    }
  }
  const own = groups.filter((g) => g.agents.includes(token.toLowerCase()));
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  const delays = chosen.map((g) => g.delayMs).filter((d): d is number => d !== null);
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    delayMs: delays.length > 0 ? Math.max(...delays) : 0,
    sitemaps,
  };
}

function rulePattern(rule: string) {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function robotsAllows(robots: Robots | null, url: string) {
  if (!robots) return true;
  const { pathname, search } = new URL(url);
  const path = `${pathname}${search}`;
  let best = { length: -1, allowed: true };
  for (const [rules, allowed] of [[robots.allow, true], [robots.disallow, false]] as const) {
    for (const rule of rules) {
      if (!rulePattern(rule).test(path)) continue;
      if (rule.length > best.length || (rule.length === best.length && allowed)) best = { length: rule.length, allowed };
    }
  }
  return best.allowed;
}

export function siteGapMs(robots: Robots | null) {
  return Math.max(MIN_SITE_GAP_MS, robots?.delayMs ?? 0);
}

export function sameOriginSitemaps(robots: Robots | null, origin: string) {
  const declared = (robots?.sitemaps ?? []).filter((url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  });
  return declared.length > 0 ? [...new Set(declared)] : [`${origin}/sitemap.xml`];
}

export class SiteGate {
  #next = new Map<string, number>();

  waitMs(site: string, now = Date.now()) {
    return Math.max(0, (this.#next.get(site) ?? 0) - now);
  }

  reserve(site: string, gapMs: number, now = Date.now()) {
    const at = Math.max(now, this.#next.get(site) ?? 0);
    this.#next.set(site, at + gapMs);
    return at - now;
  }
}

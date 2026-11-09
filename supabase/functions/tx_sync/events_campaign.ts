// Public appearances from each official's own campaign events page (politicians.campaign_events_url,
// the page their campaign site's menu links to). Two kinds of page are read:
//
// - A Squarespace events collection (vikkigoodwin.com/events), read as the site's own JSON
//   (`?format=json`): title, start and end, place, and the event's page.
// - A Mobilize organization page (mobilize.us/{campaign}), read through Mobilize's public API. A
//   Mobilize page also shows events other organizations (party groups) host; only events the
//   campaign's own organization hosts are kept.
//
// Each row is labeled a campaign event. Dates, times and places are taken only as the page states
// them. Events before the official's term starts are not stored: they do not concern the office.
import { type EventDraft, eventsFrom, forOfficial, saveEvents } from "./events.ts";
import { cellText, type Ctx, type Politician } from "./shared.ts";

export type CampaignEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  details: string | null;
  url: string;
};

/** Campaign sites store times to the millisecond; the page shows minutes. */
const minute = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
const clip = (text: string, max = 600) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

type SquarespaceItem = {
  id: string;
  title: string;
  startDate: number;
  endDate?: number;
  fullUrl: string;
  excerpt?: string;
  location?: { addressTitle?: string; addressLine1?: string; addressLine2?: string };
  structuredContent?: { allDay?: boolean };
};

/** Events in a Squarespace events collection's JSON. `upcoming` only; past events are not appearances to come. */
export function squarespaceEvents(json: unknown, origin: string): CampaignEvent[] {
  const body = json as { upcoming?: SquarespaceItem[] };
  return (body.upcoming ?? []).map((e) => {
    const place = [e.location?.addressTitle, e.location?.addressLine1, e.location?.addressLine2].map((part) => part?.trim()).filter(Boolean).join(", ");
    return {
      id: e.id,
      title: e.title.trim(),
      startsAt: minute(e.startDate),
      endsAt: e.endDate ? minute(e.endDate) : null,
      allDay: e.structuredContent?.allDay === true,
      location: place || null,
      details: e.excerpt ? clip(cellText(e.excerpt)) || null : null,
      url: new URL(e.fullUrl, origin).toString(),
    };
  });
}

/** The past events in the same JSON, for the live check and tests. */
export function squarespacePast(json: unknown, origin: string) {
  return squarespaceEvents({ upcoming: (json as { past?: SquarespaceItem[] }).past ?? [] }, origin);
}

type MobilizeEvent = {
  id: number;
  title: string;
  summary?: string;
  description?: string;
  browser_url: string;
  visibility: string;
  is_virtual: boolean;
  sponsor: { id: number; name: string };
  timeslots: { id: number; start_date: number; end_date: number }[];
  location?: { venue?: string; address_lines?: string[]; locality?: string; region?: string } | null;
};

/** The organization ID in a Mobilize page's embedded data. */
export function mobilizeOrganization(html: string) {
  const at = html.indexOf("window.__MLZ_EMBEDDED_DATA__ = ");
  if (at === -1) return null;
  const text = html.slice(at + "window.__MLZ_EMBEDDED_DATA__ = ".length);
  const match = text.match(/"current_organization":\s*\{"id":\s*(\d+)/) ?? text.match(/"current_organization":\s*\{[^{}]*?"id":\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Public events a Mobilize organization hosts itself, one per time slot. */
export function mobilizeEvents(json: unknown, organizationId: number): CampaignEvent[] {
  const events: CampaignEvent[] = [];
  for (const e of (json as { data?: MobilizeEvent[] }).data ?? []) {
    if (e.sponsor?.id !== organizationId || e.visibility !== "PUBLIC") continue;
    const place = e.is_virtual
      ? "Online"
      : [e.location?.venue, e.location?.locality, e.location?.region].map((part) => part?.trim()).filter(Boolean).join(", ");
    for (const slot of e.timeslots ?? []) {
      events.push({
        id: `${e.id}:${slot.id}`,
        title: e.title.trim(),
        startsAt: new Date(slot.start_date * 1000).toISOString(),
        endsAt: slot.end_date ? new Date(slot.end_date * 1000).toISOString() : null,
        allDay: false,
        location: place || null,
        details: clip((e.summary || e.description || "").replace(/\s+/g, " ").trim()) || null,
        url: e.browser_url,
      });
    }
  }
  return events;
}

const central = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function appearanceDraft(e: CampaignEvent, host: string, slugPrefix: string): EventDraft {
  return {
    kind: "appearance",
    title: e.title,
    starts_on: central(e.startsAt),
    ends_on: e.endsAt && central(e.endsAt) !== central(e.startsAt) ? central(e.endsAt) : null,
    starts_at: e.allDay ? null : e.startsAt,
    location: e.location,
    details: e.details,
    body: "Campaign",
    is_campaign: true,
    source_name: `Campaign events page (${host})`,
    source_url: e.url,
    event_key: `${slugPrefix}:${e.id}`,
  };
}

/** Sync source: campaign events from the official's own events page, from the term start on. */
export async function campaignAppearances(ctx: Ctx, p: Politician) {
  if (!p.campaign_events_url) {
    ctx.log.notes.push(`Campaign events: no events page is stored for ${p.name} (politicians.campaign_events_url).`);
    return;
  }
  const page = new URL(p.campaign_events_url);
  let events: CampaignEvent[];
  let listed: number;
  if (page.hostname.endsWith("mobilize.us")) {
    const res = await ctx.http.text(page.toString(), 30_000);
    if (!res.ok) throw new Error(`${res.status} from ${page}`);
    const org = mobilizeOrganization(res.text);
    if (!org) throw new Error(`no organization found on ${page}`);
    const json = (await ctx.http.json(`https://api.mobilize.us/v1/organizations/${org}/events?timeslot_start=gte_now&per_page=100`)) as { data?: unknown[] };
    listed = json.data?.length ?? 0;
    events = mobilizeEvents(json, org);
  } else {
    const json = await ctx.http.json(`${page.origin}${page.pathname}?format=json`);
    listed = (json as { upcoming?: unknown[] }).upcoming?.length ?? 0;
    events = squarespaceEvents(json, page.origin);
  }
  const from = eventsFrom(ctx, p);
  const kept = events.filter((e) => central(e.startsAt) >= from);
  ctx.log.notes.push(
    `Campaign events: ${page.hostname}${page.pathname} lists ${listed} upcoming ${listed === 1 ? "event" : "events"}; ${kept.length} ${kept.length === 1 ? "is" : "are"} hosted by ${p.name}'s campaign on or after ${from}.`,
  );
  const prefix = `campaign:${page.hostname.replace(/^www\./, "")}`;
  await saveEvents(ctx, p, "Campaign events", `${prefix}:`, kept.map((e) => forOfficial(appearanceDraft(e, page.hostname.replace(/^www\./, ""), prefix), p)), {
    from,
    complete: true,
  });
}

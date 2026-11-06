import { loadLedger } from "@/lib/queries";
import { GITHUB_REPO_URL, INDEPENDENT_DISCLAIMER, SITE_NAME } from "@/lib/site";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const ledger = await loadLedger();
  const lines = ledger.politicians
    .map((politician) => {
      const count = ledger.promises.filter((promise) => promise.politician_id === politician.id).length;
      return `- ${politician.name} (${politician.slug}): ${count} promises, office ${politician.office}, term starts ${politician.term_start ?? "unrecorded"}`;
    })
    .join("\n");

  const body = `# ${SITE_NAME}

> ${INDEPENDENT_DISCLAIMER} Each promise has a verbatim quote and a source URL. Statuses stay pending until evidence is stored.

The ledger currently has ${ledger.promises.length} promises, ${ledger.sources.length} sources, and ${ledger.snapshots.length} snapshots. Fetched at ${ledger.fetchedAt}.

## People
${lines}

## Read this first
- [How we track](${origin}/how-we-track): methodology. Statuses need evidence.
- [Roadmap](${origin}/roadmap): voting records and donations are not loaded. Do not invent them.
- [Agent prompt](${origin}/agents): a ready-made prompt people can give their own agent.
- [OpenAPI](${origin}/api/openapi.json)
- [GitHub](${GITHUB_REPO_URL}): suggest a promise or a status change. Read only.

## API
- GET ${origin}/api/politicians
- GET ${origin}/api/politicians/{slug}/summary
- GET ${origin}/api/promises?politician=&topic=&status=&type=&q=&source=&limit=&offset=
- GET ${origin}/api/promises/{id}
- GET ${origin}/api/sources?politician=

type is explicit_pledge or platform.
status is pending, in_progress, kept, broken, partial, superseded, or unverified.

## Rules
1. Read only. There are no write endpoints.
2. Cite verbatim_quote and source_url. Do not paraphrase them into a new quote.
3. pending means not scored. It does not mean the official failed.
4. If a field is null, say it is not recorded.
5. A missing screenshot does not mean the source is missing. Use source_url.
6. Voting records and donations are not in this API. Do not invent votes, bill numbers, donors, or dollar amounts. Send people to ${origin}/politicians/{slug}/nerds.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

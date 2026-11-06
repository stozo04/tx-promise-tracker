export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Promise vs. Delivered",
    version: "1.0.0",
    description:
      "Read-only JSON for the public promise ledger. Every promise has a verbatim quote and a source URL. Statuses are pending until evidence is recorded. Voting records and donations are not in this API. Do not invent them.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/politicians": {
      get: {
        operationId: "listPoliticians",
        summary: "List politicians in the ledger",
        responses: {
          "200": { description: "Politicians plus a note that votes and donations are not tracked yet." },
        },
      },
    },
    "/api/politicians/{slug}/summary": {
      get: {
        operationId: "politicianSummary",
        summary: "Counts by status, type, and topic, plus the term clock",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string", examples: ["james-talarico", "gina-hinojosa"] },
          },
        ],
        responses: {
          "200": { description: "Summary computed from stored promises." },
          "404": { description: "Unknown slug." },
        },
      },
    },
    "/api/promises": {
      get: {
        operationId: "listPromises",
        summary: "List promises",
        parameters: [
          { name: "politician", in: "query", schema: { type: "string" }, description: "Politician slug." },
          { name: "topic", in: "query", schema: { type: "string" }, description: "Topic key, such as public_education." },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "in_progress", "kept", "partial", "broken", "superseded", "unverified"],
            },
          },
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["explicit_pledge", "platform"] },
            description: "explicit_pledge or platform.",
          },
          { name: "q", in: "query", schema: { type: "string" }, description: "Search quote, summary, notes, and topic." },
          { name: "source", in: "query", schema: { type: "string" }, description: "Exact source URL." },
          { name: "limit", in: "query", schema: { type: "integer", default: 200, maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": { description: "Matching promises. total is the filtered count before paging." },
          "400": { description: "Unknown status, type, limit, or offset." },
          "404": { description: "Unknown politician slug." },
        },
      },
    },
    "/api/promises/{id}": {
      get: {
        operationId: "getPromise",
        summary: "One promise with its source, archives, and status timeline",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "The stored promise. status_updates may be an empty list." },
          "400": { description: "The id is not a UUID." },
          "404": { description: "No promise with that id." },
        },
      },
    },
    "/api/sources": {
      get: {
        operationId: "listSources",
        summary: "List primary sources",
        parameters: [
          { name: "politician", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 200, maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": { description: "Sources captured for the ledger." },
          "404": { description: "Unknown politician slug." },
        },
      },
    },
  },
} as const;

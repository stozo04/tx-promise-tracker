// Read single files out of the Texas Ethics Commission's daily campaign finance zip
// (TEC_CF_CSV.zip, about 1 GB) with HTTP range requests, so a run never downloads the whole zip.
import { UA } from "./shared.ts";

export const TEC_ZIP_URL = "https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip";

export type ZipEntry = { name: string; crc: string; method: number; compressedSize: number; size: number; offset: number };

async function range(url: string, start: number, end: number) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(60_000) });
  if (res.status !== 206) throw new Error(`${res.status} for a byte range of the TEC zip (expected 206)`);
  return res;
}

/** The zip's central directory: every file, its CRC, sizes, and where its data starts. */
export function parseCentralDirectory(tail: Uint8Array, tailStart: number): ZipEntry[] {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("TEC zip: end of central directory not found");
  let count = view.getUint16(eocd + 10, true);
  let dirOffset = view.getUint32(eocd + 16, true);
  // ZIP64: the real values sit in the ZIP64 end record, found through its locator.
  if (dirOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (view.getUint32(locator, true) !== 0x07064b50) throw new Error("TEC zip: ZIP64 locator not found");
    const recordAt = Number(view.getBigUint64(locator + 8, true)) - tailStart;
    count = Number(view.getBigUint64(recordAt + 32, true));
    dirOffset = Number(view.getBigUint64(recordAt + 48, true));
  }
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = dirOffset - tailStart;
  if (at < 0) throw new Error("TEC zip: central directory is larger than the bytes read");
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("TEC zip: bad central directory entry");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true).toString(16).padStart(8, "0");
    let compressedSize = view.getUint32(at + 20, true);
    let size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let offset = view.getUint32(at + 42, true);
    const name = decoder.decode(tail.subarray(at + 46, at + 46 + nameLength));
    // ZIP64 extra field (0x0001) holds the 64-bit values that overflowed, in this order.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let p = extra + 4;
        if (size === 0xffffffff) (size = Number(view.getBigUint64(p, true))), (p += 8);
        if (compressedSize === 0xffffffff) (compressedSize = Number(view.getBigUint64(p, true))), (p += 8);
        if (offset === 0xffffffff) offset = Number(view.getBigUint64(p, true));
      }
      extra += 4 + length;
    }
    entries.push({ name, crc, method, compressedSize, size, offset });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** Where the zip is served from now and when it was last built (one HEAD request). */
export async function headZip(url = TEC_ZIP_URL) {
  const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const length = Number(head.headers.get("content-length"));
  if (!head.ok || !length) throw new Error(`${head.status} for the TEC zip (HEAD)`);
  return { url: head.url, lastModified: head.headers.get("last-modified") ?? "", length };
}

/** List the files in the zip. Reads only the last 128 KB. */
export async function listZip(url = TEC_ZIP_URL) {
  const head = await headZip(url);
  const start = Math.max(0, head.length - 131_072);
  const tail = new Uint8Array(await (await range(head.url, start, head.length - 1)).arrayBuffer());
  return { ...head, entries: parseCentralDirectory(tail, start) };
}

/**
 * A stream of one file's text, inflated as it arrives, from ONE range request: the local header
 * (whose name and extra-field lengths are read from its first 30 bytes) is skipped in the stream.
 * With `maxBytes`, only that much compressed data is read (enough for the first rows).
 */
export async function entryText(url: string, entry: ZipEntry, maxBytes = entry.compressedSize) {
  if (entry.method !== 8) throw new Error(`TEC zip: ${entry.name} uses compression method ${entry.method}`);
  const length = Math.min(entry.compressedSize, maxBytes);
  // The local header is 30 bytes plus the name and extra field; 1 KB covers both.
  const res = await range(url, entry.offset, entry.offset + 30 + 1024 + length - 1);
  const reader = res.body!.getReader();
  let skip = -1;
  let left = length;
  let head = new Uint8Array(0);
  const data = new ReadableStream<BufferSource>({
    async pull(controller) {
      while (true) {
        if (left <= 0) {
          controller.close();
          await reader.cancel().catch(() => {});
          return;
        }
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        let chunk = value;
        if (skip < 0) {
          const joined = new Uint8Array(head.length + chunk.length);
          joined.set(head);
          joined.set(chunk, head.length);
          if (joined.length < 30) {
            head = joined;
            continue;
          }
          const view = new DataView(joined.buffer, joined.byteOffset, joined.byteLength);
          if (view.getUint32(0, true) !== 0x04034b50) throw new Error(`TEC zip: bad local header for ${entry.name}`);
          skip = 30 + view.getUint16(26, true) + view.getUint16(28, true);
          chunk = joined;
        }
        if (skip > 0) {
          const drop = Math.min(skip, chunk.length);
          chunk = chunk.subarray(drop);
          skip -= drop;
          if (chunk.length === 0) continue;
        }
        const take = chunk.subarray(0, Math.min(chunk.length, left));
        left -= take.length;
        controller.enqueue(take);
        return;
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
  return data.pipeThrough(new DecompressionStream("deflate-raw")).pipeThrough(new TextDecoderStream());
}

/**
 * Hand each line of a CSV that contains any of the needles (for example ",00080440,") to `onLine`,
 * and return the header row. Only the matching lines are split out, so a 200 MB file costs a fast
 * substring search, not a full parse. With `firstRowOnly`, it stops after the first data row.
 */
export async function grepLines(stream: ReadableStream<string>, needles: string[], onLine: (line: string, header: string) => void, firstRowOnly = false) {
  const reader = stream.getReader();
  let carry = "";
  let header: string | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = carry + value;
      const lastBreak = text.lastIndexOf("\n");
      if (lastBreak === -1) {
        carry = text;
        continue;
      }
      let body = text.slice(0, lastBreak);
      carry = text.slice(lastBreak + 1);
      if (header === null) {
        const end = body.indexOf("\n");
        header = (end === -1 ? body : body.slice(0, end)).replace(/\r$/, "");
        body = end === -1 ? "" : body.slice(end + 1);
      }
      if (firstRowOnly) {
        if (!body) continue;
        const end = body.indexOf("\n");
        onLine((end === -1 ? body : body.slice(0, end)).replace(/\r$/, ""), header);
        break;
      }
      const starts = new Set<number>();
      for (const needle of needles) {
        let from = 0;
        while (true) {
          const hit = body.indexOf(needle, from);
          if (hit === -1) break;
          const start = body.lastIndexOf("\n", hit) + 1;
          const end = body.indexOf("\n", hit);
          if (!starts.has(start)) {
            starts.add(start);
            onLine(body.slice(start, end === -1 ? body.length : end).replace(/\r$/, ""), header);
          }
          from = end === -1 ? body.length : end + 1;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return header ?? "";
}

/** Split one CSV line (quoted fields, doubled quotes). */
export function csvFields(line: string) {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(field), (field = "");
    else field += c;
  }
  out.push(field);
  return out;
}

/** Turns CSV lines into objects keyed by the header's column names. */
export function csvReader(header: string) {
  const columns = csvFields(header);
  return (line: string) => {
    const values = csvFields(line);
    return Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ""])) as Record<string, string>;
  };
}

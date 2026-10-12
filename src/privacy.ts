type PrivacyAccount = { email: string; name?: string };
type RecipientHeaders = { to?: string; cc?: string };
export type PrivacyRange = {
  start: number;
  end: number;
  kind: "address" | "name";
  value: string;
};
export type PrivacySegment = {
  start: number;
  end: number;
  text: string;
  kind: "text" | "address" | "name";
  value?: string;
};

const addressToken = /[^\s<>()"',;:]+/g;
const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;
const cleanName = (name: string) => name.trim().replace(/\s+/gu, " ");

// Headers are already mailparser-formatted. Quotes protect commas and escapes.
function recipientNames(header: string, emails: Set<string>): string[] {
  const names: string[] = [];
  let start = 0;
  let angle = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < header.length; index++) {
    const character = header[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && character === "\\") { escaped = true; continue; }
    if (character === '"' && angle < 0) { quoted = !quoted; continue; }
    if (quoted) continue;
    if (character === "<") angle = index;
    else if (character === ">" && angle >= 0) {
      if (emails.has(header.slice(angle + 1, index).trim().toLowerCase())) {
        let name = header.slice(start, angle).trim();
        if (name.startsWith('"') && name.endsWith('"'))
          name = name.slice(1, -1).replace(/\\(.)/g, "$1");
        if (name) names.push(name);
      }
      start = index + 1;
      angle = -1;
    } else if (angle < 0 && (character === ":" || character === ";")) {
      start = index + 1;
    } else if (angle < 0 && character === ",") {
      const preceding = header.slice(start, index).trim();
      // A comma inside an unquoted surname stays in the phrase.
      if (!preceding || preceding.includes("@")) start = index + 1;
    }
  }
  return names;
}

// Use one message's headers, not a mailbox-wide alias dictionary.
export function collectPrivateNames(
  accounts: readonly PrivacyAccount[],
  recipients: RecipientHeaders = {},
): string[] {
  const emails = new Set(accounts.map((account) => account.email.trim().toLowerCase()));
  const candidates = [
    ...accounts.map((account) => account.name || ""),
    ...recipientNames(recipients.to || "", emails),
    ...recipientNames(recipients.cc || "", emails),
  ];
  const names = new Map<string, string>();
  for (const candidate of candidates) {
    const name = cleanName(candidate);
    if (name && /\p{L}/u.test(name)) names.set(name.toLowerCase(), name);
  }
  // Greetings often use only the first name or surname from the same recipient.
  for (const name of [...names.values()]) {
    for (const part of name.split(/[\s,]+/u)) {
      if (/^\p{L}[\p{L}\p{M}’'-]*$/u.test(part) && !/^(mr|mrs|ms|mx|dr)$/i.test(part))
        names.set(part.toLowerCase(), part);
    }
  }
  return [...names.values()];
}

// Map decoded URL bytes back to source offsets, including malformed UTF-8.
function decodedText(text: string) {
  let decoded = "";
  const offsets: [number, number][] = [];
  let last = 0;
  const append = (start: number, end: number) => {
    for (let index = start; index < end; index++) {
      decoded += text[index];
      offsets.push([index, index + 1]);
    }
  };
  for (const match of text.matchAll(/(?:%[\da-f]{2})+/gi)) {
    append(last, match.index);
    for (let position = 0; position < match[0].length;) {
      const byte = parseInt(match[0].slice(position + 1, position + 3), 16);
      let width = byte >= 0xc2 && byte <= 0xdf ? 2 :
        byte >= 0xe0 && byte <= 0xef ? 3 : byte >= 0xf0 && byte <= 0xf4 ? 4 : 1;
      let value: string;
      try { value = decodeURIComponent(match[0].slice(position, position + width * 3)); }
      catch { value = "\ufffd"; width = 1; }
      const start = match.index + position;
      const end = start + width * 3;
      decoded += value;
      for (let index = 0; index < value.length; index++) offsets.push([start, end]);
      position += width * 3;
    }
    last = match.index + match[0].length;
  }
  append(last, text.length);
  return { decoded, offsets };
}

// Offsets use UTF-16, like String.slice. Values are sensitive and never for attrs.
export function privateRanges(text: string, names: readonly string[] = []): PrivacyRange[] {
  const { decoded, offsets } = decodedText(text);
  const ranges: PrivacyRange[] = [];
  const add = (start: number, end: number, kind: PrivacyRange["kind"], value: string) => {
    ranges.push({ start: offsets[start][0], end: offsets[end - 1][1], kind, value });
  };
  // Scan delimiter-separated tokens once; an unanchored email regex is quadratic on long words.
  for (const match of decoded.matchAll(addressToken)) {
    const at = match[0].lastIndexOf("@");
    if (at < 1) continue;
    const suffix = [...match[0].slice(at + 1).matchAll(/\.[a-z]{2,}/gi)].at(-1);
    if (!suffix) continue;
    const length = at + 1 + suffix.index + suffix[0].length;
    add(match.index, match.index + length, "address", match[0].slice(0, length));
  }
  for (const name of new Set(names.map(cleanName).filter(Boolean))) {
    const pattern = name.split(/\s+/u)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s+]+");
    for (const match of decoded.matchAll(new RegExp(pattern, "giu"))) {
      const start = match.index;
      const end = start + match[0].length;
      const before = Array.from(decoded.slice(Math.max(0, start - 2), start)).at(-1) || "";
      const after = String.fromCodePoint(decoded.codePointAt(end) || 0);
      if (!wordCharacter.test(before) && !wordCharacter.test(after))
        add(start, end, "name", name);
    }
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: PrivacyRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start < previous.end) {
      previous.end = Math.max(previous.end, range.end);
      // A name overlap must not become an address-only click-to-reveal token.
      if (range.kind === "name") { previous.kind = "name"; previous.value = range.value; }
    } else merged.push({ ...range });
  }
  return merged;
}

export function segmentPrivateText(text: string, names: readonly string[] = []): PrivacySegment[] {
  const segments: PrivacySegment[] = [];
  let last = 0;
  for (const range of privateRanges(text, names)) {
    if (range.start > last)
      segments.push({ start: last, end: range.start, text: text.slice(last, range.start), kind: "text" });
    segments.push({ ...range, text: text.slice(range.start, range.end) });
    last = range.end;
  }
  if (last < text.length)
    segments.push({ start: last, end: text.length, text: text.slice(last), kind: "text" });
  return segments;
}

export function redactPrivateText(text: string, names: readonly string[] = []): string {
  return segmentPrivateText(text, names)
    .map((segment) => segment.kind === "text" ? segment.text : "••••••••").join("");
}

// Pass decoded visible text leaves in order, with explicit block separators.
// Returned offsets are local to each leaf; hidden segments keep their shared value.
export function segmentPrivateParts(parts: readonly string[], names: readonly string[] = []): PrivacySegment[][] {
  const segments = segmentPrivateText(parts.join(""), names);
  let offset = 0;
  let cursor = 0;
  return parts.map((part) => {
    const end = offset + part.length;
    const result: PrivacySegment[] = [];
    while (cursor < segments.length && segments[cursor].end <= offset) cursor++;
    for (let index = cursor; index < segments.length && segments[index].start < end; index++) {
      const segment = segments[index];
      const start = Math.max(segment.start, offset) - offset;
      const stop = Math.min(segment.end, end) - offset;
      if (start < stop)
        result.push({ ...segment, start, end: stop, text: part.slice(start, stop) });
    }
    offset = end;
    return result;
  });
}

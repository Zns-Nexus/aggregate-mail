import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { personalMailDomains } from "../shared/types.js";
import type { LogoSummary } from "../shared/types.js";

// Company logos come from theSVG, an open brand icon library. Its registry
// lists every icon next to the brand's own website, so a sender domain is
// matched on the host of that website rather than on a guessed filename. A
// domain the library does not know falls through to the favicon service.
const registryUrl = "https://thesvg.org/api/registry.json";
const iconUrl = "https://thesvg.org/icons";
const registryMaxAge = 3 * 24 * 60 * 60 * 1000;
// A registry that could not be read is retried, but not on every request.
const registryRetry = 5 * 60 * 1000;
const requestTimeout = 8000;
const maxBytes = 512 * 1024;
// theSVG publishes no documented rate limit, so the crawl stays gentle, and a
// scan stops after this many domains so one request cannot run for minutes.
const concurrency = 4;
const syncLimit = 300;

export type LogoEntry = {
  slug: string;
  title: string;
  aliases: string[];
  variants: string[];
};
export type LogoImage = { body: Buffer; type: string };
export type RegistryIndex = {
  // Entries keyed by the host of the brand's website, best match first.
  hosts: Map<string, LogoEntry[]>;
  // The same entries keyed by registrable domain, so mail.google.com reaches
  // the google entry.
  registrable: Map<string, LogoEntry[]>;
  // Slug, then alias, then title, keyed without punctuation.
  names: Map<string, LogoEntry>;
};

// Brand sites use two-part public suffixes often enough that ignoring them
// would resolve mail.bbc.co.uk to a registrable domain of co.uk.
const multiPartSuffixes = new Set([
  "ac.uk", "co.id", "co.il", "co.in", "co.jp", "co.ke", "co.kr", "co.nz",
  "co.th", "co.uk", "co.za", "com.ar", "com.au", "com.br", "com.cn",
  "com.hk", "com.mx", "com.my", "com.ng", "com.ph", "com.pl", "com.sg",
  "com.tr", "com.tw", "com.ua", "com.vn", "gov.uk", "ne.jp", "net.au",
  "org.au", "org.uk", "or.jp",
]);
const hostPattern =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
const bodyPattern = /^\s*(?:<\?xml|<svg|<!doctype svg)/i;
const iconVariants = ["color", "default", "mono"];

// Takes a bare host or a full address, since both a sender row and the logo
// route need the same answer.
export function normalizeDomain(value: string): string | null {
  const host = (value.split("@").pop() || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!hostPattern.test(host)) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}

// Consumer mail hosts, where a logo would show the provider rather than the
// sender. The shared list covers the common ones and gmx is a family of hosts.
export function isFreeMail(domain: string): boolean {
  return personalMailDomains.has(domain) || domain.startsWith("gmx.");
}

export function registrableDomain(host: string): string {
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const width = multiPartSuffixes.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-width).join(".");
}

// Punctuation is not a reliable part of a brand name: theSVG writes
// hugging-face where the domain says huggingface.
const nameKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function brandSite(value: unknown): { host: string; root: boolean } | null {
  if (typeof value !== "string") return null;
  let site: URL;
  try {
    site = new URL(value);
  } catch {
    return null;
  }
  if (site.protocol !== "https:" && site.protocol !== "http:") return null;
  const host = site.hostname.replace(/^www\./, "").toLowerCase();
  if (!hostPattern.test(host)) return null;
  return { host, root: site.pathname === "" || site.pathname === "/" };
}

// A brand's own site root describes the brand; a page under the same host
// usually belongs to another product, and hundreds of projects are hosted on
// github.com. Ranking happens once per host, so lookup stays a map read.
function rank(buckets: Map<string, { entry: LogoEntry; root: boolean }[]>) {
  const ranked = new Map<string, LogoEntry[]>();
  for (const [host, hits] of buckets) {
    const label = nameKey(host.split(".")[0]);
    const score = ({ entry, root }: { entry: LogoEntry; root: boolean }) =>
      (root ? 4 : 0) +
      ([entry.slug, entry.title, ...entry.aliases].some(
        (name) => nameKey(name) === label,
      )
        ? 2
        : 0) +
      (entry.slug.endsWith("-badge") ? 0 : 1);
    ranked.set(
      host,
      [...hits].sort((a, b) => score(b) - score(a)).map((hit) => hit.entry),
    );
  }
  return ranked;
}

export function buildIndex(icons: unknown): RegistryIndex {
  const hosts = new Map<string, { entry: LogoEntry; root: boolean }[]>();
  const registrable = new Map<string, { entry: LogoEntry; root: boolean }[]>();
  const names = new Map<string, LogoEntry>();
  if (!Array.isArray(icons))
    return { hosts: rank(hosts), registrable: rank(registrable), names };
  const entries: LogoEntry[] = [];
  const push = (
    buckets: typeof hosts,
    host: string,
    entry: LogoEntry,
    root: boolean,
  ) => {
    const hits = buckets.get(host);
    if (hits) hits.push({ entry, root });
    else buckets.set(host, [{ entry, root }]);
  };
  for (const icon of icons) {
    if (!icon || typeof icon !== "object") continue;
    const { slug, title, aliases, variants, url } = icon as Record<
      string,
      unknown
    >;
    if (typeof slug !== "string" || !slug) continue;
    const entry: LogoEntry = {
      slug,
      title: typeof title === "string" ? title : "",
      aliases: strings(aliases),
      variants: strings(variants),
    };
    entries.push(entry);
    const site = brandSite(url);
    if (!site) continue;
    push(hosts, site.host, entry, site.root);
    push(registrable, registrableDomain(site.host), entry, site.root);
  }
  // Slugs answer before aliases, and aliases before titles, so a name one icon
  // already owns is never taken by a later one.
  const claim = (name: string, entry: LogoEntry) => {
    const key = nameKey(name);
    if (key && !names.has(key)) names.set(key, entry);
  };
  for (const entry of entries) claim(entry.slug, entry);
  for (const entry of entries)
    for (const alias of entry.aliases) claim(alias, entry);
  for (const entry of entries) claim(entry.title, entry);
  return { hosts: rank(hosts), registrable: rank(registrable), names };
}

// The search order is deliberate: a host the brand owns outright, then the
// registrable domain, then a name that matches the domain on its own.
export function matchDomain(
  index: RegistryIndex,
  value: string,
): LogoEntry | null {
  const domain = normalizeDomain(value);
  if (!domain || isFreeMail(domain)) return null;
  const exact = index.hosts.get(domain);
  if (exact?.length) return exact[0];
  const base = registrableDomain(domain);
  const near = index.registrable.get(base);
  if (near?.length) return near[0];
  // The label of the registrable domain, not of the subdomain: mail.google.com
  // is a Google address, not an address for an icon called mail.
  return index.names.get(nameKey(base.split(".")[0])) || null;
}

export function variantOf(entry: LogoEntry): string {
  return (
    iconVariants.find((variant) => entry.variants.includes(variant)) ||
    entry.variants[0] ||
    "default"
  );
}

const dataDir = () => process.env.MAIL_DATA_DIR || ".data";
const cacheDir = (dir: string) => path.join(dir, "logos");
const registryFile = (dir: string) => path.join(dir, "logo-registry.json");

// Every cache is keyed by the data directory it belongs to, so a second data
// directory in the same process cannot read another one's registry.
type State = {
  misses: Set<string>;
  registry?: Promise<RegistryIndex | null>;
  retryAt?: number;
};
const states = new Map<string, State>();
function stateFor(dir: string) {
  let state = states.get(dir);
  if (!state) {
    state = { misses: new Set() };
    states.set(dir, state);
  }
  return state;
}

async function downloadRegistry(): Promise<unknown[] | null> {
  try {
    const response = await fetch(registryUrl, {
      signal: AbortSignal.timeout(requestTimeout * 2),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { icons } = (await response.json()) as { icons?: unknown };
    if (!Array.isArray(icons)) throw new Error("the registry listed no icons");
    return icons;
  } catch (error) {
    console.warn(
      `theSVG registry unavailable: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

function cachedRegistry(file: string) {
  if (!existsSync(file)) return null;
  try {
    const { fetchedAt, icons } = JSON.parse(readFileSync(file, "utf8")) as {
      fetchedAt: number;
      icons: unknown;
    };
    return Array.isArray(icons) ? { fetchedAt, icons } : null;
  } catch {
    return null;
  }
}

// A stale copy on disk beats no logos at all, so a failed refresh keeps it.
async function readRegistry(dir: string): Promise<RegistryIndex | null> {
  const file = registryFile(dir);
  const cached = cachedRegistry(file);
  if (cached && Date.now() - cached.fetchedAt < registryMaxAge)
    return buildIndex(cached.icons);
  const fetched = await downloadRegistry();
  if (fetched) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(
        `${file}.tmp`,
        JSON.stringify({ fetchedAt: Date.now(), icons: fetched }),
        { mode: 0o600 },
      );
      renameSync(`${file}.tmp`, file);
    } catch {
      // The registry is only an optimisation: a cache that cannot be written
      // costs a download, not a broken request.
    }
    return buildIndex(fetched);
  }
  return cached ? buildIndex(cached.icons) : null;
}

function registry(dir: string): Promise<RegistryIndex | null> {
  const state = stateFor(dir);
  if (state.registry && (!state.retryAt || Date.now() < state.retryAt))
    return state.registry;
  const promise = readRegistry(dir);
  state.registry = promise;
  state.retryAt = 0;
  // A loaded registry is kept for the session; a missing one is retried later
  // rather than on every request.
  void promise.then((index) => {
    if (!index) state.retryAt = Date.now() + registryRetry;
  });
  return promise;
}

async function downloadIcon(entry: LogoEntry): Promise<LogoImage | null> {
  try {
    const response = await fetch(
      `${iconUrl}/${encodeURIComponent(entry.slug)}/${variantOf(entry)}.svg`,
      { signal: AbortSignal.timeout(requestTimeout) },
    );
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    // Sniffed rather than trusted: the bytes are served to the renderer from
    // this origin, so they must be the vector shape the file claims to be.
    if (!body.length || body.length > maxBytes) return null;
    return bodyPattern.test(body.subarray(0, 256).toString("utf8"))
      ? { body, type: "image/svg+xml" }
      : null;
  } catch {
    return null;
  }
}

type Outcome =
  | { status: "found"; image: LogoImage }
  | { status: "missing" | "failed" };

async function resolveLogo(value: string): Promise<Outcome> {
  const dir = dataDir();
  const domain = normalizeDomain(value);
  if (!domain || isFreeMail(domain)) return { status: "missing" };
  const file = path.join(cacheDir(dir), `${domain}.svg`);
  if (existsSync(file))
    try {
      return {
        status: "found",
        image: { body: readFileSync(file), type: "image/svg+xml" },
      };
    } catch {
      // Fall through to a fresh download.
    }
  const state = stateFor(dir);
  if (state.misses.has(domain)) return { status: "missing" };
  const index = await registry(dir);
  if (!index) return { status: "failed" };
  const entry = matchDomain(index, domain);
  if (!entry) {
    // Not in the library, which will not change before the registry is
    // refreshed, so the domain is not looked up again this session.
    state.misses.add(domain);
    return { status: "missing" };
  }
  const image = await downloadIcon(entry);
  // A download failure is left unremembered: it is usually the network, and
  // the route's 404 is still cached by the renderer.
  if (!image) return { status: "failed" };
  try {
    mkdirSync(cacheDir(dir), { recursive: true, mode: 0o700 });
    writeFileSync(file, image.body, { mode: 0o600 });
  } catch {
    // A logo is decorative: a cache that cannot be written is not an error.
  }
  return { status: "found", image };
}

// The route asks for bytes and falls back to the favicon when there are none.
export async function companySvg(value: string): Promise<LogoImage | null> {
  const outcome = await resolveLogo(value);
  return outcome.status === "found" ? outcome.image : null;
}

export async function syncLogos(domains: string[]): Promise<LogoSummary> {
  const queue = [...new Set(domains)].sort().slice(0, syncLimit);
  const summary: LogoSummary = {
    total: queue.length,
    found: 0,
    missing: 0,
    failed: 0,
  };
  // Each worker drains the shared queue, so the pass holds the queue itself
  // rather than one pending promise per domain.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        const { status } = await resolveLogo(queue[cursor++]);
        summary[status]++;
      }
    }),
  );
  return summary;
}

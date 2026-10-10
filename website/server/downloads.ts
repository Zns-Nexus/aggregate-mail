const releasesUrl = "https://api.github.com/repos/Zns-Nexus/aggregate-mail/releases";
const cacheMs = 10 * 60 * 1000;
let cached: { until: number; value: number | null } = { until: 0, value: null };
let pending: Promise<number | null> | undefined;

function releaseDownloads(release: unknown): number {
  if (!release || typeof release !== "object" || !("draft" in release) || typeof release.draft !== "boolean")
    throw new Error("Invalid GitHub release");
  if (release.draft) return 0;
  if (!("assets" in release) || !Array.isArray(release.assets))
    throw new Error("Invalid GitHub release assets");

  const assets: readonly unknown[] = release.assets;
  let total = 0;
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || !("name" in asset) || typeof asset.name !== "string")
      throw new Error("Invalid GitHub asset");
    // These are the installers published by the release workflow, across all architectures.
    if (!/\.(exe|dmg|appimage)$/i.test(asset.name)) continue;
    if (!("download_count" in asset) || typeof asset.download_count !== "number" ||
        !Number.isSafeInteger(asset.download_count) || asset.download_count < 0)
      throw new Error("Invalid GitHub download count");
    total += asset.download_count;
  }
  return total;
}

async function readDownloads(): Promise<number | null> {
  try {
    const signal = AbortSignal.timeout(5000);
    let total = 0;
    for (let page = 1; ; page++) {
      const response = await fetch(`${releasesUrl}?per_page=100&page=${page}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "emc2-showcase" },
        signal,
      });
      if (!response.ok) throw new Error(`GitHub releases: ${response.status}`);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error("Invalid GitHub releases response");
      const releases: readonly unknown[] = body;
      for (const release of releases) total += releaseDownloads(release);
      if (!response.headers.get("link")?.includes('rel="next"')) break;
    }
    cached.value = total;
  } catch {
    // Never replace the last complete count with a partial total or a failed read.
  }
  cached.until = Date.now() + cacheMs;
  return cached.value;
}

export function githubDownloads(): Promise<number | null> {
  if (Date.now() < cached.until) return Promise.resolve(cached.value);
  return pending ??= readDownloads().finally(() => { pending = undefined; });
}

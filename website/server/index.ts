import { capsule, endpoint, query, text } from "lakebed/server";

// Star counts for the two hosts that carry the repository. GitHub allows about
// sixty anonymous reads an hour per address and the capsule shares one, so the
// answer is held for ten minutes and a failed read falls back to the last one.
const GITHUB_REPO = "Zns-Nexus/aggregate-mail";
const CAFE_REPO = "screen/aggregate-mail";
const cacheMs = 10 * 60 * 1000;

export type Stars = { github: number | null; cafe: number | null };

let cached: { at: number; value: Stars } = { at: 0, value: { github: null, cafe: null } };

async function githubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "emc2-showcase" },
    });
    if (res.ok) {
      const body = (await res.json()) as { stargazers_count?: number };
      if (typeof body.stargazers_count === "number") return body.stargazers_count;
    }
  } catch {
    // Fall through to the badge service.
  }
  // A spent budget or a blocked call falls back to the badge service, which does
  // its own read with its own credentials.
  try {
    const res = await fetch(`https://img.shields.io/github/stars/${GITHUB_REPO}.json`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { message?: string };
    const value = Number(body.message);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function cafeStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://git.cafe/api/repos/${CAFE_REPO}/star`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { count?: number };
    return typeof body.count === "number" ? body.count : null;
  } catch {
    return null;
  }
}

async function stars(): Promise<Stars> {
  const now = Date.now();
  if (now - cached.at < cacheMs) return cached.value;
  const [github, cafe] = await Promise.all([githubStars(), cafeStars()]);
  cached = {
    at: now,
    value: { github: github ?? cached.value.github, cafe: cafe ?? cached.value.cafe },
  };
  return cached.value;
}

// Lakebed builds the shell for the app's own root: its title comes from the
// capsule name, and the root path is reserved, so a capsule cannot put an
// og:image there. A link preview therefore needs a path of its own, which
// answers with the tags a crawler reads and moves a person on to the app.
const APP_URL = "https://emc2.lakebed.app";
const SHARE_URL = `${APP_URL}/share`;
const TITLE = "Emc² — mail that sorts itself";
const DESCRIPTION =
  "A desktop email client for Windows, macOS and Linux. Connect Gmail, iCloud, Fastmail, Yahoo or any IMAP server — every inbox is read, sorted and kept in an encrypted store you own.";
const OG_IMAGE = "https://api.capy.ai/pr-assets/UNc8s3JzeEhfj80gzilwbYYu7OcbJyPVM-hd8PdbNDQ.png";
const OG_ALT = "Emc² hero: mail that sorts itself, and stays on your machine, above the sorted inbox.";

// A crawler reads the tags and stops, because none of them run the script that
// moves the browser on to the client.
function sharePage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>${TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="theme-color" content="#0a0a0a" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Emc²" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SHARE_URL}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${OG_ALT}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <meta name="twitter:image:alt" content="${OG_ALT}" />
  </head>
  <body style="margin:0;background:#0a0a0a;color:#ededed;font-family:Geist,system-ui,-apple-system,sans-serif">
    <main style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;text-align:center">
      <p style="margin:0;font-size:20px;font-weight:500">${TITLE}</p>
      <p style="margin:0;max-width:34rem;color:#b4b4b4;font-size:14px;line-height:1.6">${DESCRIPTION}</p>
      <a href="/" style="color:#8ab0ff;font-size:14px">Open the client →</a>
    </main>
    <script>location.replace("/");</script>
  </body>
</html>`;
}

export default capsule({
  name: "Emc² — mail that sorts itself",

  auth: { requireSignIn: false },

  schema: {},

  queries: {
    stars: query(async () => stars()),
  },

  endpoints: {
    share: endpoint({ method: "GET", path: "/share", readOnly: true }, async () =>
      text(sharePage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
      }),
    ),
  },
});

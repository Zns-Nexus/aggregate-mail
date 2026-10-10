import assert from "node:assert/strict";
import { test } from "node:test";
import { githubDownloads } from "../website/server/downloads.ts";

test("download totals include all desktop installers and keep the last complete count on failure", async (t) => {
  let now = 1;
  let calls = 0;
  const cacheMs = 10 * 60 * 1000;
  const advance = () => { now += cacheMs; };
  const release = (assets, draft = false) => ({ draft, assets });
  const asset = (name, download_count) => ({ name, download_count });
  const page = (body, next = false) => Response.json(body, {
    headers: next ? { link: '<https://api.github.com/repos/example/app/releases?page=2>; rel="next"' } : {},
  });
  let respond = () => new Response(null, { status: 403 });
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (url) => { calls++; return respond(url); });

  assert.equal(await githubDownloads(), null, "an initial failure is unavailable, not zero");
  advance();
  respond = (url) => {
    if (url.endsWith("page=1")) return page([
      release([
        asset("Emc²-0.1.4-win-x64.exe", 10),
        asset("Emc²-0.1.4-mac-arm64.dmg", 3),
        asset("Emc²-0.1.4-mac-x64.dmg", 2),
        asset("Emc²-0.1.4-linux-x64.AppImage", 5),
        asset("app.exe.blockmap", 200),
        asset("SHA256SUMS.txt", 200),
        asset("source.zip", 200),
        asset("source.tar.gz", 200),
      ]),
      release([asset("draft.exe", 1000)], true),
    ], true);
    assert.ok(url.endsWith("page=2"));
    return page([release([asset("Aggregate-Mail-Setup-0.1.2.exe", 4)])]);
  };
  const before = calls;
  assert.deepEqual(await Promise.all([githubDownloads(), githubDownloads()]), [24, 24]);
  assert.equal(calls - before, 2, "concurrent queries share one paginated fetch");
  assert.equal(await githubDownloads(), 24);
  assert.equal(calls - before, 2, "cached queries make no requests");

  advance();
  respond = (url) => url.endsWith("page=1")
    ? page([release([asset("new.exe", 100)])], true)
    : new Response(null, { status: 503 });
  assert.equal(await githubDownloads(), 24, "a failed later page cannot publish a partial total");

  for (const body of [{ message: "bad response" }, [{ draft: false }], [release([asset("bad.exe", -1)])]]) {
    advance();
    respond = () => page(body);
    assert.equal(await githubDownloads(), 24, "invalid data preserves the last count");
  }
  advance();
  respond = () => { throw new Error("Network unavailable"); };
  assert.equal(await githubDownloads(), 24);

  advance();
  respond = () => page([release([asset("new.dmg", 30)])]);
  assert.equal(await githubDownloads(), 30, "a recovered request refreshes the total");
  advance();
  respond = () => page([]);
  assert.equal(await githubDownloads(), 0, "an empty successful response is a real zero");
});

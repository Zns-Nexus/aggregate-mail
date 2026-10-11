import { test } from "node:test";
import assert from "node:assert/strict";
import { coalesceReload } from "./App";

const deferred = () => {
  let resolve!: (value: number) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<number>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
};

test("progress notifications share one active reload and one pending final refresh", async () => {
  const first = deferred(), final = deferred();
  let calls = 0, active = 0, peak = 0;
  const reload = coalesceReload(async () => {
    calls++; peak = Math.max(peak, ++active);
    try { return await (calls === 1 ? first.promise : final.promise); }
    finally { active--; }
  });
  const requests = [reload()];
  await Promise.resolve();
  for (let i = 0; i < 100; i++) requests.push(reload());
  try {
    assert.equal(calls, 1); assert.equal(peak, 1);
    first.resolve(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(calls, 2); assert.equal(peak, 1);
    final.resolve(2);
    assert.ok((await Promise.all(requests)).every((value) => value === 2));
    const repeat = reload(); await Promise.resolve();
    assert.equal(calls, 3); assert.equal(await repeat, 2);
  } finally { first.resolve(1); final.resolve(2); await Promise.allSettled(requests); }
});

test("a notification queued during a rejected read still receives one final refresh", async () => {
  const first = deferred(), final = deferred();
  let calls = 0, active = 0, peak = 0;
  const reload = coalesceReload(async () => {
    calls++; peak = Math.max(peak, ++active);
    try { return await (calls === 1 ? first.promise : final.promise); }
    finally { active--; }
  });
  const initial = reload();
  await Promise.resolve();
  const queued = reload();
  const results = Promise.allSettled([initial, queued]);
  first.reject(new Error("Synthetic failure"));
  try {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(calls, 2); assert.equal(peak, 1);
    final.resolve(2);
    assert.deepEqual(await results, [{ status: "fulfilled", value: 2 }, { status: "fulfilled", value: 2 }]);
    await Promise.resolve(); assert.equal(calls, 2, "no retry without another notification");
  } finally { first.resolve(1); final.resolve(2); await results; }
});

test("failed reload releases its slot so a later request can recover", async () => {
  let fail = true, calls = 0;
  const reload = coalesceReload(async () => { calls++; if (fail) throw new Error("Synthetic failure"); return 2; });
  const first = reload(), duplicate = reload();
  await Promise.all([assert.rejects(first, /Synthetic failure/), assert.rejects(duplicate, /Synthetic failure/)]);
  assert.equal(calls, 1);
  fail = false;
  assert.equal(await reload(), 2); assert.equal(calls, 2);
});

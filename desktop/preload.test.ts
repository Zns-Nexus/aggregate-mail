import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

test("preload navigation bridge validates directions and removes its listener", () => {
  const ipcRenderer = new EventEmitter();
  let bridge!: NonNullable<Window["desktop"]>;
  const code = transformSync(readFileSync(new URL("./preload.ts", import.meta.url), "utf8"),
    { loader: "ts", format: "cjs" }).code;
  runInNewContext(code, { exports: {}, module: { exports: {} }, process: { platform: "linux" },
    require: () => ({ ipcRenderer, contextBridge: {
      exposeInMainWorld: (_name: string, value: typeof bridge) => { bridge = value; },
    } }),
  });
  const directions: string[] = [];
  const unsubscribe = bridge.onNavigation((direction) => directions.push(direction));
  for (const direction of ["back", "forward", "browser-backward", "invalid", null])
    ipcRenderer.emit("mail-navigation", {}, direction);
  assert.deepEqual(directions, ["back", "forward"]);
  unsubscribe();
  assert.equal(ipcRenderer.listenerCount("mail-navigation"), 0);
  ipcRenderer.emit("mail-navigation", {}, "back");
  assert.deepEqual(directions, ["back", "forward"]);
});

test("preload update bridge forwards only enum actions and correlates renderer drain without exposing IPC", async () => {
  const ipcRenderer = new EventEmitter() as EventEmitter & {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    send: (channel: string, ...args: unknown[]) => void;
  };
  const calls: unknown[][] = [];
  ipcRenderer.invoke = async (...args) => { calls.push(args); return { phase: "idle" }; };
  ipcRenderer.send = (...args) => { calls.push(args); };
  let bridge!: NonNullable<Window["desktop"]>;
  const code = transformSync(readFileSync(new URL("./preload.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  runInNewContext(code, { exports: {}, module: { exports: {} }, process: { platform: "linux" },
    require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (_name: string, value: typeof bridge) => { bridge = value; } } }),
  });
  const updates = bridge.updates!;
  await updates.state(); await updates.command("download");
  assert.deepEqual(calls, [["update-state"], ["update-command", "download"]]);
  let drains = 0;
  const unsubscribe = updates.onDrain(async () => { drains++; });
  ipcRenderer.emit("update-drain", {}, "bad request");
  const request = "a".repeat(32);
  ipcRenderer.emit("update-drain", {}, request);
  await Promise.resolve();
  assert.equal(drains, 1); assert.deepEqual(calls.at(-1), ["update-drained", request]);
  let states = 0;
  const unsubscribeState = updates.onState(() => { states++; });
  ipcRenderer.emit("update-state", {}, { phase: "ready" });
  assert.equal(states, 1);
  unsubscribe(); unsubscribeState();
  assert.equal(ipcRenderer.listenerCount("update-drain"), 0);
  assert.equal(ipcRenderer.listenerCount("update-state"), 0);
});

test("isolated startup checks omit the updater bridge and perform no updater IPC", () => {
  let bridge!: NonNullable<Window["desktop"]>;
  const code = transformSync(readFileSync(new URL("./preload.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  runInNewContext(code, { exports: {}, module: { exports: {} },
    process: { platform: "linux", argv: ["--emc2-disable-updates"] },
    require: () => ({ ipcRenderer: { invoke: () => { throw Error("No updater IPC allowed in startup checks"); } },
      contextBridge: { exposeInMainWorld: (_name: string, value: typeof bridge) => { bridge = value; } } }),
  });
  assert.equal(bridge.updates, undefined);
});

test("preload exposes credential fallback mode only for the exact main-process flag", () => {
  for (const [argv, expected] of [
    [["--emc2-credential-fallback=linux-local"], "linux-local"],
    [["--emc2-credential-fallback=other"], undefined],
    [[], undefined],
  ] as const) {
    let bridge!: NonNullable<Window["desktop"]>;
    const code = transformSync(readFileSync(new URL("./preload.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
    runInNewContext(code, { exports: {}, module: { exports: {} }, process: { platform: "linux", argv },
      require: () => ({ ipcRenderer: new EventEmitter(), contextBridge: { exposeInMainWorld: (_name: string, value: typeof bridge) => { bridge = value; } } }),
    });
    assert.equal(bridge.credentialFallback, expected);
  }
});

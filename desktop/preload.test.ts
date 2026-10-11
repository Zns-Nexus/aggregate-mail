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

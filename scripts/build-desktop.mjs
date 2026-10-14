import { build } from "esbuild";
await build({
  entryPoints: ["desktop/entry.ts"],
  outfile: ".desktop/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  packages: "external",
});
await build({
  entryPoints: ["desktop/preload.ts"],
  outfile: ".desktop/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
});

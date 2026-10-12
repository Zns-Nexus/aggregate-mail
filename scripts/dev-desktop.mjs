import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
import "./build-desktop.mjs";

const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:32145" },
  },
});
try {
  await vite.listen();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [".", "--dev", ...process.argv.slice(2)], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const stop = () => child.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("Desktop hot reload ready. Choose Quit in the tray menu to stop development.");
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await vite.close();
}

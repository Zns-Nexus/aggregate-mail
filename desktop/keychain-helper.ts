import { app, safeStorage } from "electron";
import { readFrame, encodeFrame, validateHelperProfile, wrapRequest } from "./keychain.js";

export async function runHelper(): Promise<void> {
  const profile = validateHelperProfile(process.argv, app.commandLine.getSwitchValue("user-data-dir"), !!process.stdin.isTTY);
  app.setName("Emc²");
  app.setPath("userData", profile);
  if (app.getPath("userData") !== profile) throw new Error("Invalid helper profile.");
  const request = await readFrame(process.stdin);
  await app.whenReady();
  const response = encodeFrame(wrapRequest(request, safeStorage));
  await new Promise<void>((resolve, reject) => process.stdout.end(response, (error?: Error | null) => {
    response.fill(0);
    if (error) reject(error); else resolve();
  }));
  app.exit(0);
}

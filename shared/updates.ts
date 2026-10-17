export type UpdateReason = "development" | "mac-signing" | "platform" | "appimage" |
  "metadata" | "candidate" | "network" | "download" | "verification" | "mail-busy" |
  "cancelled" | "installer" | "source-build" | "source-target";

export type UpdateState = {
  phase: "idle" | "checking" | "current" | "available" | "downloading" |
    "ready" | "installing" | "unsupported" | "unavailable" | "error";
  method?: "mac-source";
  version?: string;
  percent?: number;
  reason?: UpdateReason;
};

export type UpdateCommand = "check" | "download" | "install";

export interface UpdateBridge {
  state: () => Promise<UpdateState>;
  command: (command: UpdateCommand) => Promise<UpdateState>;
  onState: (callback: (state: UpdateState) => void) => () => void;
  onDrain: (callback: () => Promise<void>) => () => void;
}

export function versionParts(version: string, stable: boolean) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match || version.length > 100 || (stable && (match[4] || match[5]))) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  if (match[4]?.split(".").some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))) return null;
  if (match[5]?.split(".").some((part) => !part)) return null;
  return { parts, prerelease: !!match[4] };
}
export function isHigherStableVersion(candidate: string, current: string) {
  const next = versionParts(candidate, true), installed = versionParts(current, false);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next.parts[i] !== installed.parts[i]) return next.parts[i] > installed.parts[i];
  }
  return installed.prerelease;
}

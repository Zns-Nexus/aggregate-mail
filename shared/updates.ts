export type UpdateReason = "development" | "mac-signing" | "platform" | "appimage" |
  "metadata" | "candidate" | "network" | "download" | "verification" | "mail-busy" |
  "cancelled" | "installer";

export type UpdateState = {
  phase: "idle" | "checking" | "current" | "available" | "downloading" |
    "ready" | "installing" | "unsupported" | "unavailable" | "error";
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

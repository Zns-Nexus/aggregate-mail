import type { UpdateBridge } from "../shared/updates";
declare global {
  interface Window {
    desktop?: {
      platform: string;
      updates?: UpdateBridge;
      onNavigation: (callback: (direction: "back" | "forward") => void) => () => void;
      onMailChanged: (callback: () => void) => () => void;
      oauthUrl: string;
      windowCommand: (command: "minimize" | "maximize" | "close") => void;
      onWindowState: (callback: (maximized: boolean) => void) => () => void;
      onAccountConnected: (
        callback: (error: string | null) => void,
      ) => () => void;
    };
  }
}

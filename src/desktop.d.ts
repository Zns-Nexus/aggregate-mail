export {};
declare global {
  interface Window {
    desktop?: {
      onMailChanged: (callback: () => void) => () => void;
      oauthUrl: string;
      onAccountConnected: (
        callback: (error: string | null) => void,
      ) => () => void;
    };
  }
}

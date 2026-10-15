import { useCallback, useSyncExternalStore } from "react";

const media = (query: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;

/**
 * Whether a media query matches, kept current as the window changes. Layout
 * decisions that remove whole panes use this instead of CSS, so the window
 * controls can follow whichever pane sits in each corner. Without matchMedia
 * (the renderer tests) it reports `fallback`.
 */
export function useMedia(query: string, fallback = true): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = media(query);
    list?.addEventListener("change", onChange);
    return () => list?.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(
    subscribe,
    () => media(query)?.matches ?? fallback,
    () => fallback,
  );
}

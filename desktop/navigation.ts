export function isLocalNavigation(url: string, origin: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && parsed.pathname === "/";
  } catch {
    return false;
  }
}
export function isExternalLink(url: string, origin: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin
      ? parsed.pathname === "/api/oauth/google"
      : parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// The site's security headers (P10 task 4), built from the backend's origin so the policy follows
// NEXT_PUBLIC_API_URL. Applied by next.config.ts to every route of a production build.
//
// script-src keeps 'unsafe-inline' because Next's bootstrap and the theme script are inline and a nonce would make
// every page dynamic; there is no 'unsafe-eval'. Fonts are self-hosted by next/font. Images: our own, data/blob URLs
// (the OG image, the print view) and the source favicons from DuckDuckGo's icon service (no referrer is sent).

export const FAVICON_HOST = 'https://icons.duckduckgo.com';

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The backend the client talks to; the same default as lib/runs/api.ts. */
export const DEFAULT_API = 'http://localhost:8000';

export function contentSecurityPolicy(apiUrl: string | undefined): string {
  const api = originOf(apiUrl ?? DEFAULT_API);
  const connect = ["'self'", api].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${FAVICON_HOST}`,
    `connect-src ${connect}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function securityHeaders(apiUrl: string | undefined): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(apiUrl) },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    // ACHP is silent and needs no device access: no microphone, camera or location, and no autoplay.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), autoplay=(), payment=(), usb=()' },
  ];
}

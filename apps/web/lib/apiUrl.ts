// Where the backend lives. One place, so the client, the security headers and the page links cannot disagree.
//
// NEXT_PUBLIC_API_URL wins when it is set (and not empty). Otherwise a production build talks to the hosted backend
// and a development server to a local one, so a deploy that forgot the variable still works instead of calling the
// reader's own localhost. The address is public config; nothing secret belongs here.

export const HOSTED_API = 'https://theshivansh-achp-api.hf.space';
export const LOCAL_API = 'http://localhost:8000';

export function defaultApi(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === 'production' ? HOSTED_API : LOCAL_API;
}

/** The backend's base address without a trailing slash. `configured` is NEXT_PUBLIC_API_URL. */
export function resolveApi(configured: string | undefined, nodeEnv?: string): string {
  const url = configured?.trim() || defaultApi(nodeEnv);
  return url.replace(/\/+$/, '');
}

// process.env.NEXT_PUBLIC_API_URL is written out in full so the bundler can inline it at build time.
export const apiBase = (): string => resolveApi(process.env.NEXT_PUBLIC_API_URL);

import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '../csp';

const directives = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('the security headers', () => {
  it('lets the page talk to its own backend and nothing else', () => {
    const d = directives(contentSecurityPolicy('https://theshivansh-achp-api.hf.space/'));
    expect(d['connect-src']).toEqual(["'self'", 'https://theshivansh-achp-api.hf.space']);
    expect(directives(contentSecurityPolicy(undefined))['connect-src']).toEqual(["'self'", 'http://localhost:8000']);
  });

  it('never allows eval, plugins, framing or media', () => {
    const csp = contentSecurityPolicy('https://api.example');
    const d = directives(csp);
    expect(csp).not.toContain('unsafe-eval');
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['media-src']).toEqual(["'none'"]);
    expect(d['img-src']).toContain('https://icons.duckduckgo.com');
  });

  it('asks for no microphone, camera or autoplay (ACHP is silent)', () => {
    const p = securityHeaders('https://api.example').find((h) => h.key === 'Permissions-Policy')!.value;
    for (const f of ['microphone=()', 'camera=()', 'autoplay=()']) expect(p).toContain(f);
  });
});

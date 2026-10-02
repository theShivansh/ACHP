import { describe, expect, it } from 'vitest';
import { HOSTED_API, LOCAL_API, defaultApi, resolveApi } from '../apiUrl';

describe('the backend address', () => {
  it('uses NEXT_PUBLIC_API_URL when it is set, without a trailing slash', () => {
    expect(resolveApi('https://api.example//', 'production')).toBe('https://api.example');
  });

  it('falls back to the hosted backend in production, so a deploy without the variable still works', () => {
    expect(resolveApi(undefined, 'production')).toBe(HOSTED_API);
    expect(resolveApi('', 'production')).toBe(HOSTED_API);
    expect(resolveApi('   ', 'production')).toBe(HOSTED_API);
  });

  it('falls back to a local backend everywhere else', () => {
    expect(resolveApi(undefined, 'development')).toBe(LOCAL_API);
    expect(defaultApi('test')).toBe(LOCAL_API);
  });
});

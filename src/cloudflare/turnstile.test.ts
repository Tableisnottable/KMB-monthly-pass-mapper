import { describe, expect, it, vi } from 'vitest';
import { turnstileResponse } from './turnstile';

const origin = 'https://preview.example';
const env = { TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET_KEY: 'fixture-only' };
const proof = (host = 'preview.example', action = 'planner_access') => vi.fn<typeof fetch>(async () =>
  Response.json({ success: true, hostname: host, action }));
const submit = (target = origin) => new Request(origin + '/macau/en?lang=en', {
  method: 'POST', headers: { Origin: target },
  body: new URLSearchParams({ 'cf-turnstile-response': 'fixture-token' }),
});

describe('Turnstile access verification', () => {
  it('keeps development and unrelated requests available and fails closed on incomplete settings', async () => {
    expect(await turnstileResponse(new Request(origin + '/macau'), {})).toBeUndefined();
    expect(await turnstileResponse(new Request(origin + '/_next/static/example.js'), env)).toBeUndefined();
    expect(await turnstileResponse(new Request(origin + '/macau'), { TURNSTILE_SITE_KEY: 'public-key' })).toBeUndefined();
    expect((await turnstileResponse(new Request(origin + '/macau'), { TURNSTILE_SECRET_KEY: 'fixture-only' }))?.status).toBe(503);
    expect(await turnstileResponse(new Request(origin + '/api/notifications', { method: 'DELETE' }), env)).toBeUndefined();
  });
  it('serves a private challenge for the planner and denies an unverified provider API request', async () => {
    const response = await turnstileResponse(new Request(origin + '/macau/en'), env);
    expect(await response?.text()).toContain('Verify to open the planner');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Content-Security-Policy')).toContain('https://challenges.cloudflare.com');
    expect((await turnstileResponse(new Request(origin + '/api/upstream'), env))?.status).toBe(403);
  });
  it('calls Siteverify and authorizes the host with an expiring signed cookie', async () => {
    const verify = proof();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1795660800000);
    try {
      const response = await turnstileResponse(submit(), env, verify);
      expect(verify).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({ method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: 'fixture-token' }) }));
      expect(response?.status).toBe(303);
      expect(response?.headers.get('Location')).toBe('/macau/en?lang=en');
      const cookie = response?.headers.get('Set-Cookie')!;
      expect(cookie).toContain('; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400');
      const pair = cookie.split(';')[0];
      const provider = (site: string, value: string) => turnstileResponse(new Request(site + '/api/upstream', { headers: { Cookie: value } }), env);
      expect(await provider(origin, pair)).toBeUndefined();
      expect((await provider('https://other.example', pair))?.status).toBe(403);
      expect((await provider(origin, pair.replace(/\.[A-Za-z0-9+/]{43}=$/, '.' + 'A'.repeat(43) + '=')))?.status).toBe(403);
      now.mockReturnValue(1795747200000);
      expect((await provider(origin, pair))?.status).toBe(403);
    } finally { now.mockRestore(); }
  });
  it('rejects failed verification, cross-origin posts and proofs from another hostname or action', async () => {
    const verify = proof();
    expect((await turnstileResponse(submit('https://other.example'), env, verify))?.status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
    expect((await turnstileResponse(submit(), env, proof('other.example')))?.status).toBe(403);
    expect((await turnstileResponse(submit(), env, proof('preview.example', 'different')))?.status).toBe(403);
    const rejected = vi.fn<typeof fetch>(async () => Response.json({ success: false }));
    expect((await turnstileResponse(submit(), env, rejected))?.headers.get('Set-Cookie')).toBeNull();
    const invalid = vi.fn<typeof fetch>(async () => Response.json({ success: 'true', hostname: 'preview.example', action: 'planner_access' }));
    expect((await turnstileResponse(submit(), env, invalid))?.status).toBe(403);
  });
});

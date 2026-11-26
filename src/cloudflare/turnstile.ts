interface TurnstileBindings {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

const action = 'planner_access';
const cookieName = '__Host-compass-verified';
const sessionSeconds = 24 * 60 * 60;
const plannerPages = new Set(['/', '/en', '/macau', '/macau/en', '/routes', '/timetables', '/traffic', '/updates', '/install', '/coverage', '/world', '/world/en', '/asia', '/asia/en', '/japan', '/japan/en', '/taiwan', '/taiwan/en']);
const encode = new TextEncoder();
const noStore = { 'Cache-Control': 'no-store' };

function isPlannerPage(path: string) {
  return plannerPages.has(path.replace(/\.html$/, '').replace(/\/$/, '') || '/') || path === '/index.html';
}

function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encode.encode('transit-compass-turnstile:' + secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function hasVerifiedSession(request: Request, host: string, secret: string) {
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='));
  const value = cookie?.slice(cookieName.length + 1);
  const match = value?.match(/^(\d{13}\.[0-9a-f-]{36})\.([A-Za-z0-9+/]{43}=)$/);
  if (!match || Number(match[1].split('.')[0]) <= Date.now()) return false;
  const signature = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
  return crypto.subtle.verify('HMAC', await signingKey(secret), signature, encode.encode(host + ':' + match[1]));
}

async function signedCookie(host: string, secret: string) {
  const value = (Date.now() + sessionSeconds * 1000) + '.' + crypto.randomUUID();
  const signed = await crypto.subtle.sign('HMAC', await signingKey(secret), encode.encode(host + ':' + value));
  const signature = btoa(Array.from(new Uint8Array(signed), byte => String.fromCharCode(byte)).join(''));
  return cookieName + '=' + value + '.' + signature + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + sessionSeconds;
}

function challenge(siteKey: string, english: boolean, error = false) {
  const nonce = crypto.randomUUID();
  const title = english ? 'Verify to open the planner' : '驗證後開啟路線規劃';
  const retry = english ? 'Verification could not be completed. Please try again.' : '未能完成驗證，請再試。';
  const button = english ? 'Continue' : '繼續';
  // The managed widget usually resolves without interaction. The visible
  // submit button also works if the automatic callback is interrupted.
  const html = `<!doctype html><html lang="${english ? 'en' : 'zh-Hant'}"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Transit Compass</title>
  <style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf4eb;color:#172521;font:1rem system-ui,sans-serif}main{box-sizing:border-box;width:min(100%,420px);padding:clamp(10px,calc((100vw - 300px)/2),24px);border-radius:1rem;background:white}h1{font-size:1.3rem}button{padding:.55rem 1rem;border:0;border-radius:.5rem;background:#286e22;color:white;font:inherit}p{color:#9b2f24}</style>
  <script nonce="${nonce}">function verified(){document.getElementById('verify').requestSubmit()}</script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head><body>
  <main><strong>Transit Compass</strong><h1>${title}</h1>${error ? `<p role="alert">${retry}</p>` : ''}
  <form id="verify" method="post"><div class="cf-turnstile" data-sitekey="${siteKey}" data-action="${action}" data-callback="verified"
  data-language="${english ? 'en' : 'zh-TW'}" data-size="flexible"></div>
  <button type="submit">${button}</button></form></main></body></html>`;
  return new Response(html, { status: error ? 403 : 200, headers: {
    ...noStore, 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "' https://challenges.cloudflare.com; style-src 'nonce-" + nonce
      + "'; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

/** The provider proxy is checked before any shared cache lookup. The static
 *  assets and local route computation never require an API verification. */
export async function turnstileResponse(request: Request, env: TurnstileBindings, fetcher: typeof fetch = fetch): Promise<Response | undefined> {
  const url = new URL(request.url), page = isPlannerPage(url.pathname);
  const protectedApi = url.pathname === '/api/upstream' || url.pathname === '/api/open-map' || (url.pathname === '/api/notifications' && request.method === 'POST');
  if (!page && !protectedApi) return;
  const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secret } = env;
  if (!siteKey && !secret) return;
  if (!siteKey || !/^[A-Za-z0-9_-]{1,100}$/.test(siteKey) || !secret) {
    return new Response('Verification configuration is incomplete.', { status: 503, headers: noStore });
  }
  const english = /(?:^|\/)en(?:\.html|\/|$)/.test(url.pathname) || url.searchParams.get('lang') === 'en';
  const authorised = await hasVerifiedSession(request, url.hostname, secret);
  if (protectedApi) {
    if (authorised) return;
    return Response.json({ code: 'TURNSTILE_REQUIRED', error: 'Open or reload the planner to verify access.' }, {
      status: 403, headers: noStore,
    });
  }
  if (request.method === 'GET' || request.method === 'HEAD') return authorised ? undefined : challenge(siteKey, english);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...noStore, Allow: 'GET, HEAD, POST' } });
  if (request.headers.get('Origin') !== url.origin
    || !request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')
    || Number(request.headers.get('Content-Length')) > 4096) return challenge(siteKey, english, true);
  try {
    const form = new URLSearchParams(await request.text());
    const token = form.get('cf-turnstile-response');
    if (!token || token.length > 2048) return challenge(siteKey, english, true);
    const body = new URLSearchParams({ secret, response: token });
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.set('remoteip', ip);
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const verified: { success?: boolean; hostname?: string; action?: string } = await response.json();
      if (verified.success && verified.hostname === url.hostname && verified.action === action) {
        return new Response(null, { status: 303, headers: { ...noStore, Location: url.pathname + url.search,
          'Set-Cookie': await signedCookie(url.hostname, secret) } });
      }
    }
  } catch { /* A temporary verification outage keeps the retry form available. */ }
  return challenge(siteKey, english, true);
}

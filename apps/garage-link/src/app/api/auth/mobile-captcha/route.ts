import { NextRequest, NextResponse } from 'next/server';

/** Public challenge only: this page never receives credentials or auth sessions. */
export function GET(request: NextRequest) {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION === 'true';
  const siteKey = process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY?.trim() ?? '';
  const validKey = /^[a-zA-Z0-9_-]{3,200}$/.test(siteKey);
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (enabled && !validKey) return NextResponse.json({ code: 'CAPTCHA_CONFIGURATION_UNAVAILABLE' }, { status: 503, headers });
  if (request.nextUrl.searchParams.get('format') === 'config') {
    return NextResponse.json({ enabled, siteKey: enabled ? siteKey : null }, { headers });
  }
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ログインの安全確認</title></head><body><div id="challenge"></div><script nonce="${nonce}">
function report(type,token){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,token:token}));}}
window.onChallengeReady=function(){turnstile.render('#challenge',{sitekey:${JSON.stringify(siteKey)},callback:function(token){report('captcha-token',token);},'expired-callback':function(){report('captcha-expired');},'error-callback':function(){report('captcha-error');}});};
${enabled ? '' : "report('captcha-disabled');"}
</script>${enabled ? `<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onChallengeReady&amp;render=explicit" async defer></script>` : ''}</body></html>`;
  return new NextResponse(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}

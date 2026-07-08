import type { InstagramTokenResult } from '@/utilities/instagram/exchange'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fieldBlock(label: string, value: string, id: string): string {
  const safeValue = escapeHtml(value)
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <textarea id="${id}" readonly>${safeValue}</textarea>
      <button type="button" data-copy="${id}">Copy</button>
    </div>
  `
}

export function renderInstagramSuccessPage(result: InstagramTokenResult): string {
  const token = result.longLived?.access_token || result.shortLived.access_token
  const expiresIn = result.longLived?.expires_in
  const tokenKind = result.longLived ? 'long-lived (preferred)' : 'short-lived'
  const expiryText =
    typeof expiresIn === 'number'
      ? `~${Math.round(expiresIn / 86400)} days (${expiresIn} seconds)`
      : 'short-lived tokens expire in about 1 hour'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Instagram token ready</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      body { margin: 0; padding: 2rem; background: #111; color: #f5f5f5; }
      main { max-width: 720px; margin: 0 auto; }
      h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
      p { line-height: 1.5; color: #cfcfcf; }
      .warn { background: #3a2200; border: 1px solid #8a5a00; padding: 0.75rem 1rem; border-radius: 8px; }
      .field { margin: 1rem 0 1.25rem; }
      label { display: block; margin-bottom: 0.35rem; font-weight: 600; }
      textarea { width: 100%; min-height: 4.5rem; padding: 0.75rem; border-radius: 8px; border: 1px solid #444; background: #1b1b1b; color: #f5f5f5; resize: vertical; }
      button { margin-top: 0.5rem; padding: 0.45rem 0.8rem; border-radius: 6px; border: 1px solid #666; background: #222; color: #fff; cursor: pointer; }
      button:hover { background: #333; }
      code { background: #222; padding: 0.1rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Instagram access token ready</h1>
      <p>Copy the token below into the client site's server env (for example <code>INSTAGRAM_ACCESS_TOKEN</code>). This page does not store the token.</p>
      <p class="warn">Treat this like a password. Do not share it publicly or commit it to git.</p>
      ${fieldBlock('Access token (' + tokenKind + ')', token, 'access-token')}
      ${fieldBlock('Instagram user ID', String(result.shortLived.user_id), 'user-id')}
      ${fieldBlock('Expiry note', expiryText, 'expiry-note')}
      <p>Optional: test the token with <code>POST /api/instagram/sync</code> before deploying to a client site.</p>
    </main>
    <script>
      document.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = button.getAttribute('data-copy');
          const el = document.getElementById(id);
          if (!el) return;
          const text = el.value || el.textContent || '';
          try {
            await navigator.clipboard.writeText(text);
            button.textContent = 'Copied';
            setTimeout(() => { button.textContent = 'Copy'; }, 1500);
          } catch {
            el.focus();
            el.select();
          }
        });
      });
    </script>
  </body>
</html>`
}

export function renderInstagramErrorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Instagram connection failed</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; background: #111; color: #f5f5f5; }
      main { max-width: 640px; margin: 0 auto; }
      .error { background: #3a1010; border: 1px solid #8a2020; padding: 1rem; border-radius: 8px; }
      a { color: #8cf; }
    </style>
  </head>
  <body>
    <main>
      <h1>Instagram connection failed</h1>
      <p class="error">${escapeHtml(message)}</p>
      <p><a href="/api/instagram/connect">Try again</a></p>
    </main>
  </body>
</html>`
}

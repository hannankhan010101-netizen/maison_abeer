import { createServer } from 'node:http';

/**
 * The public booking API for the lab run (`playwright.lab.config.ts`).
 *
 * Its own port, 54399, so it never meets the server-render suite's fake API
 * (`fakeApi.ts`, 54398). Three classes in three crafts, so the storefront
 * renders every section, and the studio's real handle, so the page carries the
 * links it carries in production. Run as `node e2e/helpers/labApi.ts`.
 */

const PORT = 54399;
const DAY = 86_400_000;

function classes() {
  const start = Date.now() + 2 * DAY;
  const one = (id: string, name: string, color_token: string, seats_left: number) => ({
    id,
    name,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + 9_000_000).toISOString(),
    location: 'Bloom Café, Gulberg',
    color_token,
    photo_url: null,
    seats_left,
    is_full: false,
    waitlist_is_open: false,
  });
  return {
    studio: {
      name: 'Maison Abeer',
      instagram_handle: 'maison._abeer',
      logo_url: null,
      primary_color: null,
      accent_color: null,
      hero_photo_url: null,
      story: null,
    },
    classes: [
      one('lab-1', 'Bento cake decorating', 'pink', 4),
      one('lab-2', 'Pottery & wheel throwing', 'terra', 8),
      one('lab-3', 'Ceramic painting', 'sage', 2),
    ],
  };
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;
  const ok = path === '/__health' || /^\/api\/v1\/public\/[^/]+\/classes$/.test(path);
  res.writeHead(ok ? 200 : 404, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
  });
  res.end(JSON.stringify(ok ? (path === '/__health' ? { ok: true } : classes()) : {}));
}).listen(PORT, '127.0.0.1');

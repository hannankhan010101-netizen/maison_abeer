import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * A stand-in for the public booking API, for `playwright.ssr.config.ts`.
 *
 * The production-build spec needs a real server: the page's schedule is now
 * fetched by the Next server, where `page.route()` cannot reach. Run as its
 * own process (`node e2e/helpers/fakeApi.ts`, Node strips the types).
 *
 * `GET /api/v1/public/<any slug>/classes` answers with one class. The spec
 * picks a fresh slug per test, so the page's 15 s cache never carries one
 * test's answer into the next. `POST /__mode/<mode>` switches every later
 * answer:
 *
 * * `ok` — the class, 8 seats left.
 * * `slow` — the same, after 3 s (longer than the server's 1.2 s timeout).
 * * `error` — a 500.
 * * `different-seats` — 8 seats to the Next server, 2 to the browser. The two
 *   are told apart by `Origin`, which only the browser's cross-origin fetch
 *   sends; so the first HTML is stale and the browser's refresh corrects it.
 *
 * `POST /__seats/<n>` sets the count `ok` mode answers with (default 8), and
 * `GET /__hits/<slug>` says how many server-side (no `Origin`) requests a slug
 * has had: how the spec proves a page came from the cache.
 */

const FAKE_API_PORT = 54398;

type Mode = 'ok' | 'slow' | 'error' | 'different-seats';
const MODES: readonly Mode[] = ['ok', 'slow', 'error', 'different-seats'];

const DAY = 86_400_000;

function classList(seatsLeft: number) {
  const start = Date.now() + 2 * DAY;
  return {
    studio: {
      name: 'Maison Abeer',
      instagram_handle: null,
      logo_url: null,
      primary_color: null,
      accent_color: null,
      hero_photo_url: null,
      story: null,
    },
    classes: [
      {
        id: 'ssr-class-1',
        name: 'Bento cake decorating',
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + 9_000_000).toISOString(),
        location: 'Bloom Café, Gulberg',
        color_token: 'pink',
        photo_url: null,
        seats_left: seatsLeft,
        is_full: false,
        waitlist_is_open: false,
      },
    ],
  };
}

let mode: Mode = 'ok';
let seats = 8;
const serverHits = new Map<string, number>();

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${FAKE_API_PORT}`);

  const switchTo = /^\/__mode\/([a-z-]+)$/.exec(url.pathname)?.[1];
  if (switchTo !== undefined) {
    if (!MODES.includes(switchTo as Mode)) return send(req, res, 400, { message: 'no such mode' });
    mode = switchTo as Mode;
    return send(req, res, 200, { mode });
  }

  const setSeats = /^\/__seats\/(\d+)$/.exec(url.pathname)?.[1];
  if (setSeats !== undefined) {
    seats = Number(setSeats);
    return send(req, res, 200, { seats });
  }

  const hitsFor = /^\/__hits\/([^/]+)$/.exec(url.pathname)?.[1];
  if (hitsFor !== undefined) return send(req, res, 200, { hits: serverHits.get(hitsFor) ?? 0 });

  if (url.pathname === '/__health') return send(req, res, 200, { mode });

  const slug = /^\/api\/v1\/public\/([^/]+)\/classes$/.exec(url.pathname)?.[1];
  if (slug === undefined) return send(req, res, 404, { message: 'Not found' });
  if (!req.headers.origin) serverHits.set(slug, (serverHits.get(slug) ?? 0) + 1);

  if (mode === 'error') return send(req, res, 500, { message: 'Something went wrong' });
  if (mode === 'slow') {
    setTimeout(() => send(req, res, 200, classList(8)), 3000);
    return;
  }
  if (mode === 'different-seats') {
    return send(req, res, 200, classList(req.headers.origin ? 2 : 8));
  }
  return send(req, res, 200, classList(seats));
});

server.listen(FAKE_API_PORT, '127.0.0.1');

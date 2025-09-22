import http from 'node:http';
import url from 'node:url';
import db from '../persistence/db.js';
import { loadManifest } from '../content/contentLoader.js';

function json(res: any, status: number, data: any) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function queryDB(sql: string, params: any[] = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('Dashboard query failed', err);
    return [];
  }
}

export function startDashboardServer(port: number) {
  if (!port) return;
  const server = http.createServer((req: any, res: any) => {
    if (!req.url) return json(res, 404, { error: 'Not found' });
    const parsed = url.parse(req.url, true);
    const path = parsed.pathname || '/';

    if (path === '/health') {
      return json(res, 200, { ok: true });
    }

    if (path === '/economy') {
      const balances = queryDB('SELECT user_id, coins, gems, fragments FROM profiles LIMIT 100');
      const ledger = queryDB('SELECT * FROM economy_ledger ORDER BY ts DESC LIMIT 50');
      return json(res, 200, { balances, ledger });
    }

    if (path === '/shop') {
      const rotations = queryDB('SELECT * FROM shop_rotations ORDER BY active_from DESC LIMIT 5');
      return json(res, 200, { rotations });
    }

    if (path === '/content') {
      const manifest = loadManifest('genesis');
      return json(res, 200, { manifest });
    }

    if (path === '/analytics') {
      const runs = queryDB('SELECT * FROM runs ORDER BY updated_at DESC LIMIT 20');
      const events = queryDB("SELECT type, COUNT(*) as count FROM events GROUP BY type ORDER BY count DESC LIMIT 20");
      return json(res, 200, { runs, events });
    }

    if (path === '/licenses') {
      const licenses = queryDB('SELECT * FROM licenses');
      return json(res, 200, { licenses });
    }

    return json(res, 404, { error: 'Unknown endpoint' });
  });

  server.listen(port, () => {
    console.log(`[dashboard] listening on ${port}`);
  });
}

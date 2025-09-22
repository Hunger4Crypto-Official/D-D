import * as http from 'node:http';
import url from 'node:url';
import crypto from 'node:crypto';
import { CFG } from '../config.js';
import db from '../persistence/db.js';
import { getGuildSettings, upsertGuildSettings } from '../persistence/settings.js';
import { listLicenses, upsertLicense, setFeatureFlag } from '../persistence/licensing.js';
import { listGemOrders, recordGemPurchase, verifyWebhookSignature, GemPurchasePayload } from '../payments/gems.js';
import { loadManifest } from '../content/contentLoader.js';

interface DiscordGuildSummary {
  id: string;
  name: string;
  permissions: string;
}

interface DashboardUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  guilds: DiscordGuildSummary[];
  accessibleGuilds: string[];
}

interface SessionRecord {
  id: string;
  user?: DashboardUser;
  state?: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();
const SESSION_COOKIE = 'ledger_session';
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8 hours
const MANAGE_GUILD = BigInt(1 << 5);

function now() {
  return Date.now();
}

function parseCookies(header?: string) {
  const result: Record<string, string> = {};
  if (!header) return result;
  const parts = header.split(';');
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k && v) result[k] = decodeURIComponent(v);
  }
  return result;
}

function createSession(res: http.ServerResponse): SessionRecord {
  const id = crypto.randomBytes(18).toString('hex');
  const record: SessionRecord = { id, expiresAt: now() + SESSION_TTL };
  sessions.set(id, record);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; Max-Age=${SESSION_TTL / 1000}; SameSite=Lax`);
  return record;
}

function getSession(req: http.IncomingMessage, res: http.ServerResponse): SessionRecord {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    const record = sessions.get(sid);
    if (record && record.expiresAt > now()) {
      record.expiresAt = now() + SESSION_TTL;
      return record;
    }
    sessions.delete(sid);
  }
  return createSession(res);
}

function destroySession(res: http.ServerResponse, session: SessionRecord) {
  sessions.delete(session.id);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function hasManageGuild(permissions: string | number): boolean {
  try {
    const value = typeof permissions === 'string' ? BigInt(permissions) : BigInt(permissions);
    return (value & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

function isOwner(user?: DashboardUser) {
  return Boolean(user && CFG.ownerId && user.id === CFG.ownerId);
}

function canManageGuild(user: DashboardUser, guild_id: string) {
  if (isOwner(user)) return true;
  return user.accessibleGuilds.includes(guild_id);
}

function guildLabel(user: DashboardUser, guild_id: string) {
  const match = user.guilds.find((g) => g.id === guild_id);
  if (match) return `${match.name} (${guild_id})`;
  if (guild_id === CFG.homeGuildId) return `Home Guild (${guild_id})`;
  return guild_id;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendHtml(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function sendJson(res: http.ServerResponse, status: number, payload: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function redirect(res: http.ServerResponse, location: string) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function renderDashboard(user: DashboardUser) {
  const licenses = listLicenses();
  const licenseMap = new Map(licenses.map((lic) => [lic.guild_id, lic]));
  const manifest = loadManifest('genesis');
  const orders = isOwner(user) ? listGemOrders(20) : [];
  const guildIds = Array.from(new Set(user.accessibleGuilds));

  const economyRows = guildIds
    .map((guild_id) => {
      const settings = getGuildSettings(guild_id);
      const tier = licenseMap.get(guild_id)?.tier ?? '—';
      return `<tr><td>${htmlEscape(guildLabel(user, guild_id))}</td><td>${tier}</td><td>${settings.gm_reward}</td><td>${settings.gn_reward}</td><td>${settings.xp_reward}</td><td>${settings.difficulty_bias}</td></tr>`;
    })
    .join('');

  const guildOptions = guildIds
    .map((guild_id) => `<option value="${guild_id}">${htmlEscape(guildLabel(user, guild_id))}</option>`)
    .join('');

  const licenseRows = licenses
    .map((lic) => {
      const expires = lic.expires_at ? new Date(lic.expires_at).toISOString() : '—';
      return `<tr><td>${lic.guild_id}</td><td>${lic.tier ?? '—'}</td><td>${htmlEscape(lic.features_json ?? '[]')}</td><td>${expires}</td></tr>`;
    })
    .join('');

  const ordersRows = orders
    .map(
      (order: any) =>
        `<tr><td>${order.order_id}</td><td>${order.user_id}</td><td>${order.network}</td><td>${order.tx_id}</td><td>${order.gems}</td><td>${new Date(order.created_at).toLocaleString()}</td></tr>`
    )
    .join('');

  const manifestSummary = manifest
    ? `<p><strong>${htmlEscape(manifest.book_name ?? 'Genesis')}</strong> • Version ${htmlEscape(manifest.version ?? '1.0.0')} • Scenes: ${manifest.scenes?.length ?? 0}</p>`
    : '<p>No manifest loaded.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>LedgerLegends Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #111827; color: #f9fafb; }
    a { color: #93c5fd; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #374151; padding: 0.5rem; text-align: left; }
    th { background: #1f2937; }
    section { margin-bottom: 2rem; padding: 1rem; background: #1f2937; border-radius: 0.75rem; }
    input, select, textarea { width: 100%; padding: 0.5rem; margin-top: 0.25rem; margin-bottom: 0.75rem; border-radius: 0.5rem; border: 1px solid #4b5563; background: #111827; color: #f9fafb; }
    button { padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; background: #2563eb; color: white; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    form.inline { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
    form.inline label { flex: 1 1 12rem; }
  </style>
</head>
<body>
  <header>
    <h1>LedgerLegends Control Panel</h1>
    <p>Logged in as <strong>${htmlEscape(`${user.username}#${user.discriminator}`)}</strong>. <a href="/logout">Log out</a></p>
  </header>

  <section>
    <h2>Economy Snapshot</h2>
    <table>
      <thead><tr><th>Guild</th><th>Tier</th><th>GM Reward</th><th>GN Reward</th><th>XP Reward</th><th>Difficulty Bias</th></tr></thead>
      <tbody>${economyRows || '<tr><td colspan="6">No guilds accessible.</td></tr>'}</tbody>
    </table>
    <form method="POST" action="/economy">
      <label>Guild
        <select name="guild_id" required>${guildOptions}</select>
      </label>
      <label>GM Reward (coins)
        <input name="gm_reward" type="number" value="25" min="0" step="1" />
      </label>
      <label>GN Reward (coins)
        <input name="gn_reward" type="number" value="25" min="0" step="1" />
      </label>
      <label>XP Reward
        <input name="xp_reward" type="number" value="1" min="0" step="1" />
      </label>
      <label>Difficulty Bias (-3 .. +3)
        <input name="difficulty_bias" type="number" value="0" min="-3" max="3" step="1" />
      </label>
      <button type="submit">Save Economy Settings</button>
    </form>
  </section>

  <section>
    <h2>Feature Flags</h2>
    <form method="POST" action="/features" class="inline">
      <label>Guild
        <select name="guild_id" required>${guildOptions}</select>
      </label>
      <label>Feature Key
        <input name="feature" placeholder="seasonal" required />
      </label>
      <label>Enabled
        <select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>
      </label>
      <button type="submit">Update Feature Flag</button>
    </form>
  </section>

  ${isOwner(user) ? `<section>
    <h2>Licenses</h2>
    <table>
      <thead><tr><th>Guild</th><th>Tier</th><th>Features JSON</th><th>Expires</th></tr></thead>
      <tbody>${licenseRows || '<tr><td colspan="4">No licenses recorded.</td></tr>'}</tbody>
    </table>
    <form method="POST" action="/licenses">
      <label>Guild ID
        <input name="guild_id" required />
      </label>
      <label>Tier
        <input name="tier" placeholder="pro" />
      </label>
      <label>Features (comma separated)
        <input name="features" placeholder="campaign,shop,seasonal" />
      </label>
      <label>Expires At (ISO timestamp)
        <input name="expires_at" placeholder="2026-01-01T00:00:00Z" />
      </label>
      <button type="submit">Upsert License</button>
    </form>
  </section>` : ''}

  ${isOwner(user) ? `<section>
    <h2>Shop Configuration</h2>
    <form method="POST" action="/shop/packs">
      <label>Pack ID
        <input name="pack_id" required />
      </label>
      <label>Rotation Tag
        <input name="rotation_tag" placeholder="weekly" />
      </label>
      <label>Definition JSON
        <textarea name="definition_json" rows="6" placeholder='{"name":"Genesis Pack","cost":1000}'></textarea>
      </label>
      <button type="submit">Save Pack Definition</button>
    </form>
    <form method="POST" action="/shop/rotation">
      <label>Packs JSON
        <textarea name="packs_json" rows="4" placeholder='[{"id":"genesis","weight":1}]'></textarea>
      </label>
      <label>Items JSON
        <textarea name="items_json" rows="4" placeholder='[]'></textarea>
      </label>
      <button type="submit">Publish Rotation</button>
    </form>
  </section>` : ''}

  ${isOwner(user) ? `<section>
    <h2>Gem Purchase Orders</h2>
    <table>
      <thead><tr><th>Order</th><th>User</th><th>Network</th><th>Transaction</th><th>Gems</th><th>Created</th></tr></thead>
      <tbody>${ordersRows || '<tr><td colspan="6">No orders recorded.</td></tr>'}</tbody>
    </table>
  </section>` : ''}

  <section>
    <h2>Content Overview</h2>
    ${manifestSummary}
  </section>
</body>
</html>`;
}

async function handleOAuth(session: SessionRecord, code: string) {
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CFG.dashboardClientId,
      client_secret: CFG.dashboardClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: CFG.dashboardRedirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  const token = (await tokenResponse.json()) as { access_token: string; token_type: string };
  const headers = { Authorization: `${token.token_type} ${token.access_token}` };
  const userResponse = await fetch('https://discord.com/api/users/@me', { headers });
  const guildResponse = await fetch('https://discord.com/api/users/@me/guilds', { headers });
  if (!userResponse.ok || !guildResponse.ok) {
    throw new Error('Failed to fetch user profile');
  }
  const userJson = (await userResponse.json()) as {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string | null;
  };
  const guildsJson = (await guildResponse.json()) as any[];
  const manageable: DiscordGuildSummary[] = Array.isArray(guildsJson)
    ? guildsJson
        .filter((g) => hasManageGuild(g.permissions))
        .map((g) => ({ id: g.id, name: g.name, permissions: g.permissions }))
    : [];
  const accessible = new Set<string>(manageable.map((g) => g.id));
  if (CFG.homeGuildId) accessible.add(CFG.homeGuildId);
  CFG.allowedGuilds.forEach((g) => accessible.add(g));
  if (userJson.id === CFG.ownerId) {
    listLicenses().forEach((lic) => accessible.add(lic.guild_id));
  }
  session.user = {
    id: userJson.id,
    username: userJson.username,
    discriminator: userJson.discriminator,
    avatar: userJson.avatar,
    guilds: manageable,
    accessibleGuilds: Array.from(accessible),
  };
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
  const base = CFG.dashboardBaseUrl || `http://localhost:${port}`;

  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const session = getSession(req, res);
    const parsedUrl = req.url ? new url.URL(req.url, base) : new url.URL('/', base);
    const path = parsedUrl.pathname;

    try {
      if (path === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (path === '/webhooks/gems' && req.method === 'POST') {
        if (!CFG.gemWebhookSecret) {
          return sendJson(res, 503, { error: 'Gems webhook disabled' });
        }
        const raw = await readBody(req);
        const signature = req.headers['x-ledger-signature'] as string | undefined;
        if (!verifyWebhookSignature(raw, signature)) {
          return sendJson(res, 401, { error: 'Invalid signature' });
        }
        try {
          const payload = JSON.parse(raw) as GemPurchasePayload;
          const result = recordGemPurchase(payload);
          return sendJson(res, 200, { ok: true, result });
        } catch (err) {
          return sendJson(res, 400, { error: 'Malformed payload' });
        }
      }

      if (path === '/login') {
        session.state = crypto.randomBytes(16).toString('hex');
        const authorize = new url.URL('https://discord.com/api/oauth2/authorize');
        authorize.searchParams.set('client_id', CFG.dashboardClientId);
        authorize.searchParams.set('redirect_uri', CFG.dashboardRedirectUri);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', 'identify guilds');
        authorize.searchParams.set('state', session.state ?? '');
        return redirect(res, authorize.toString());
      }

      if (path === '/oauth/callback') {
        const state = parsedUrl.searchParams.get('state');
        const code = parsedUrl.searchParams.get('code');
        if (!state || state !== session.state || !code) {
          return sendHtml(res, 400, '<h1>OAuth state mismatch</h1>');
        }
        session.state = undefined;
        try {
          await handleOAuth(session, code);
          return redirect(res, '/');
        } catch (err) {
          console.error('OAuth callback failed', err);
          return sendHtml(res, 500, '<h1>OAuth failure</h1>');
        }
      }

      if (path === '/logout') {
        destroySession(res, session);
        return redirect(res, '/login');
      }

      if (!session.user) {
        return redirect(res, '/login');
      }

      const user = session.user;

      if (path === '/' && req.method === 'GET') {
        return sendHtml(res, 200, renderDashboard(user));
      }

      if (path === '/economy' && req.method === 'POST') {
        const body = await readBody(req);
        const params = new url.URLSearchParams(body);
        const guild_id = params.get('guild_id') || '';
        if (!guild_id || !canManageGuild(user, guild_id)) {
          return sendHtml(res, 403, '<h1>Forbidden</h1>');
        }
        const gm = Number(params.get('gm_reward') ?? 25);
        const gn = Number(params.get('gn_reward') ?? 25);
        const xp = Number(params.get('xp_reward') ?? 1);
        const bias = Number(params.get('difficulty_bias') ?? 0);
        upsertGuildSettings(guild_id, {
          gm_reward: Number.isFinite(gm) ? gm : 25,
          gn_reward: Number.isFinite(gn) ? gn : 25,
          xp_reward: Number.isFinite(xp) ? xp : 1,
          difficulty_bias: Math.max(-3, Math.min(3, Number.isFinite(bias) ? bias : 0)),
        });
        return redirect(res, '/');
      }

      if (path === '/features' && req.method === 'POST') {
        const body = await readBody(req);
        const params = new url.URLSearchParams(body);
        const guild_id = params.get('guild_id') || '';
        const feature = params.get('feature') || '';
        if (!guild_id || !feature || !canManageGuild(user, guild_id)) {
          return sendHtml(res, 403, '<h1>Forbidden</h1>');
        }
        const toggle = (params.get('enabled') || '').toLowerCase();
        const enabled = toggle === 'true' || toggle === '1' || toggle === 'enabled' || toggle === 'on';
        setFeatureFlag(guild_id, feature, enabled);
        return redirect(res, '/');
      }

      if (path === '/licenses' && req.method === 'POST') {
        if (!isOwner(user)) {
          return sendHtml(res, 403, '<h1>Owner only</h1>');
        }
        const body = await readBody(req);
        const params = new url.URLSearchParams(body);
        const guild_id = params.get('guild_id') || '';
        if (!guild_id) {
          return sendHtml(res, 400, '<h1>Missing guild</h1>');
        }
        const tier = params.get('tier') || undefined;
        const features = (params.get('features') || '')
          .split(',')
          .map((f: string) => f.trim())
          .filter(Boolean);
        const expires = params.get('expires_at');
        const expiresAt = expires ? Date.parse(expires) : undefined;
        upsertLicense({
          guild_id,
          tier,
          features_json: JSON.stringify(features),
          expires_at: Number.isFinite(expiresAt) ? expiresAt : null,
        });
        return redirect(res, '/');
      }

      if (path === '/shop/packs' && req.method === 'POST') {
        if (!isOwner(user)) {
          return sendHtml(res, 403, '<h1>Owner only</h1>');
        }
        const body = await readBody(req);
        const params = new url.URLSearchParams(body);
        const pack_id = params.get('pack_id') || '';
        if (!pack_id) {
          return sendHtml(res, 400, '<h1>Missing pack id</h1>');
        }
        const definition = params.get('definition_json') || '{}';
        const rotation_tag = params.get('rotation_tag') || null;
        try {
          const parsed = definition ? JSON.parse(definition) : {};
          db.prepare(
            `INSERT INTO shop_packs (pack_id, definition_json, rotation_tag, updated_at)
             VALUES (?,?,?,?)
             ON CONFLICT(pack_id) DO UPDATE SET definition_json=excluded.definition_json, rotation_tag=excluded.rotation_tag, updated_at=excluded.updated_at`
          ).run(pack_id, JSON.stringify(parsed), rotation_tag, now());
          return redirect(res, '/');
        } catch {
          return sendHtml(res, 400, '<h1>Invalid JSON payload</h1>');
        }
      }

      if (path === '/shop/rotation' && req.method === 'POST') {
        if (!isOwner(user)) {
          return sendHtml(res, 403, '<h1>Owner only</h1>');
        }
        const body = await readBody(req);
        const params = new url.URLSearchParams(body);
        try {
          const packs = params.get('packs_json') ? JSON.parse(params.get('packs_json') as string) : [];
          const items = params.get('items_json') ? JSON.parse(params.get('items_json') as string) : [];
          db.prepare(
            `INSERT INTO shop_rotations (rotation_id, active_from, active_to, packs_json, items_json)
             VALUES (?,?,?,?,?)`
          ).run(`rot_${now()}`, now(), now(), JSON.stringify(packs), JSON.stringify(items));
          return redirect(res, '/');
        } catch {
          return sendHtml(res, 400, '<h1>Invalid rotation JSON</h1>');
        }
      }

      if (path === '/api/orders' && req.method === 'GET') {
        if (!isOwner(user)) {
          return sendJson(res, 403, { error: 'Owner only' });
        }
        return sendJson(res, 200, { orders: listGemOrders(100) });
      }

      return sendHtml(res, 404, '<h1>Not Found</h1>');
    } catch (err) {
      console.error('Dashboard request failed', err);
      return sendHtml(res, 500, '<h1>Server Error</h1>');
    }
    
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

import crypto from 'node:crypto';
import db from '../persistence/db.js';
import { CFG } from '../config.js';

export interface GemPurchasePayload {
  order_id: string;
  user_id: string;
  network: string;
  tx_id: string;
  amount: number;
  gems: number;
  metadata?: Record<string, any>;
}

export function verifyWebhookSignature(rawBody: string, signature?: string | null) {
  if (!CFG.gemWebhookSecret) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', CFG.gemWebhookSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function recordGemPurchase(payload: GemPurchasePayload) {
  const now = Date.now();
  const existing = db
    .prepare('SELECT status FROM gem_orders WHERE order_id=?')
    .get(payload.order_id) as { status?: string } | undefined;
  if (existing?.status === 'processed') {
    return { alreadyProcessed: true };
  }

  db.prepare(
    `INSERT INTO gem_orders (order_id, user_id, network, tx_id, amount, gems, status, meta_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(order_id) DO UPDATE SET
       user_id=excluded.user_id,
       network=excluded.network,
       tx_id=excluded.tx_id,
       amount=excluded.amount,
       gems=excluded.gems,
       status=excluded.status,
       meta_json=excluded.meta_json,
       updated_at=excluded.updated_at`
  ).run(
    payload.order_id,
    payload.user_id,
    payload.network,
    payload.tx_id,
    payload.amount,
    payload.gems,
    'processed',
    JSON.stringify(payload.metadata ?? {}),
    now,
    now
  );

  const userExists = db.prepare('SELECT 1 FROM users WHERE user_id=?').get(payload.user_id);
  if (!userExists) {
    db.prepare('INSERT INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(payload.user_id, payload.user_id, now);
    db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?,?,?)').run(payload.user_id, 0, 0);
  }

  db.prepare('UPDATE profiles SET gems=gems+? WHERE user_id=?').run(payload.gems, payload.user_id);
  db.prepare(
    'INSERT INTO economy_ledger (txn_id, user_id, kind, amount, reason, meta_json, ts) VALUES (?,?,?,?,?,?,?)'
  ).run(
    `gem_${payload.order_id}`,
    payload.user_id,
    'gem_purchase',
    payload.gems,
    payload.network,
    JSON.stringify({ tx: payload.tx_id, amount: payload.amount }),
    now
  );
  return { processed: true };
}

export function listGemOrders(limit = 100) {
  return db
    .prepare('SELECT * FROM gem_orders ORDER BY created_at DESC LIMIT ?')
    .all(limit);
}

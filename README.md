# Ledger Legends (Discord RPG)

## Quick Start
1. `npm i`
2. Copy `.env.example` → `.env` and fill values
3. `npm run db:reset`
4. `npm run dev`
5. In your server, type `!start` in a text channel to launch Scene 1.

## Rituals
- Type `gm` or `gn` (≥4h apart, max 2/day) → +25 Coins, +1 XP

## Shop
- Click **Open Shop** button → Buy Genesis pack (Coins). Pity system included.
- Admin command `/admin_gems_grant` to simulate on-chain gem purchases for now.

## Content
- JSON scenes in `content/genesis/scenes/`
- Packs in `content/droptables/packs_genesis.json`
- Compliments in `content/ui/compliments.json`

## Notes
- SQLite for persistence (easy to swap to Postgres later).
- RNG per run seedable; economy events logged immutably.

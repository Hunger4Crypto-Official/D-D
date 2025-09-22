import 'dotenv/config';

export const CFG = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  ownerId: process.env.OWNER_ID || '',
  dbPath: process.env.DATABASE_PATH || './data/bot.db',
  botName: process.env.BOT_NAME || 'LedgerLegends',
  contentRoot: './content',
  dashboardPort: Number(process.env.DASHBOARD_PORT || 0),
};

if (!CFG.token) throw new Error('Missing DISCORD_TOKEN in .env');

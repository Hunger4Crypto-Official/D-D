import 'dotenv/config';

export const CFG = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  ownerId: process.env.OWNER_ID || '',
  dbPath: process.env.DATABASE_PATH || './data/bot.db',
  botName: process.env.BOT_NAME || 'LedgerLegends',
  contentRoot: './content',
  dashboardPort: Number(process.env.DASHBOARD_PORT || 0),
  dashboardClientId: process.env.DASHBOARD_CLIENT_ID || '',
  dashboardClientSecret: process.env.DASHBOARD_CLIENT_SECRET || '',
  dashboardRedirectUri: process.env.DASHBOARD_REDIRECT_URI || '',
  dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET || '',
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || '',
  homeGuildId: process.env.HOME_GUILD_ID || '',
  allowedGuilds: (process.env.ALLOWED_GUILD_IDS || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean),
  gemWebhookSecret: process.env.GEM_WEBHOOK_SECRET || '',
};

if (!CFG.token) throw new Error('Missing DISCORD_TOKEN in .env');

if (CFG.dashboardPort && !CFG.dashboardSessionSecret) {
  throw new Error('Missing DASHBOARD_SESSION_SECRET for dashboard authentication');
}

if (CFG.dashboardPort && (!CFG.dashboardClientId || !CFG.dashboardClientSecret || !CFG.dashboardRedirectUri)) {
  throw new Error('Dashboard OAuth configuration incomplete. Set DASHBOARD_CLIENT_ID, DASHBOARD_CLIENT_SECRET, and DASHBOARD_REDIRECT_URI.');
}

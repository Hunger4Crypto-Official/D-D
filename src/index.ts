import { client } from './bot.js';
import { CFG } from './config.js';
import { startDashboardServer } from './dashboard/server.js';

startDashboardServer(CFG.dashboardPort);
client.login(CFG.token);

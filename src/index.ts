import { client } from './bot.js';
import { CFG } from './config.js';
import { startDashboardServer } from './dashboard/server.js';
import { worldEventManager } from './events/worldEvents.js';
import { initializePvP } from './pvp/duels.js';

worldEventManager.initialize();
initializePvP();
startDashboardServer(CFG.dashboardPort);
client.login(CFG.token);

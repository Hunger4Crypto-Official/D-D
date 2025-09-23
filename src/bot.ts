import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  SlashCommandBuilder,
  SlashCommandUserOption,
  SlashCommandIntegerOption,
  REST,
  Routes,
  ButtonInteraction,
  StringSelectMenuInteraction,
  Message,
  Interaction,
} from 'discord.js';
import { CFG } from './config.js';
import db from './persistence/db.js';
import { onButton, showShop, onSelectMenu, syncPinnedUi } from './ui/ui.js';
import {
  showRoleSelection,
  getCurrentRole,
  startRoleBasedRun,
  joinGameWithRole,
  showUserGames,
  getUserActiveRuns,
  getRoleById,
} from './ui/roles.js';
import { claimWeeklyReward } from './ui/shop.js';
import { renderEquipment } from './ui/equipment.js';
import { attemptSelfReboot, attemptAllyRevive } from './ui/recovery.js';
import { startMinigame, handleMinigameButton } from './ui/minigames.js';
import { listSeasons, startSeasonalRun } from './ui/seasonal.js';
import { listCraftables, craftItem } from './ui/crafting.js';
import {
  queueForMatch,
  listActiveMatches,
  recordPvPAction,
  concludeMatch,
  getPvPLeaderboard,
  getPvPRecord,
} from './pvp/duels.js';
import { getRun, processAfkTimeouts, startRun } from './engine/orchestrator.js';
import { guildHasLicense, featureEnabled } from './persistence/licensing.js';
import { getGuildSettings } from './persistence/settings.js';
import {
  createPlayerGuild,
  inviteMembersToGuild,
  acceptGuildInvite,
  guildSummary,
  leaveGuild,
  listAvailableRaids,
  prepareRaidStart,
  ensureUserRecord,
  registerRunParticipants,
  declineGuildInvite,
} from './guilds/guilds.js';
import { worldEventManager, WORLD_EVENTS } from './events/worldEvents.js';

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel],
});

(globalThis as any)._client = client;

function scheduleDecay(messagePromise: Promise<any>) {
  messagePromise
    .then((msg) => {
      if (!msg) return;
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 45 * 60 * 1000);
    })
    .catch(() => {});
}

function tokenizeArgs(raw: string): string[] {
  const matches = raw.match(/"[^"]+"|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^"|"$/g, ''));
}

function ensureFeatureAccess(message: Message, feature: string) {
  const guildId = message.guild?.id ?? null;
  if (!guildId) {
    return true;
  }
  if (!guildHasLicense(guildId)) {
    scheduleDecay(
      message.reply({
        content: '❌ This server is not licensed for LedgerLegends. Contact the bot owner to activate a subscription.',
      })
    );
    return false;
  }
  if (!featureEnabled(guildId, feature)) {
    scheduleDecay(message.reply({ content: '❌ This feature is not enabled for this server.' }));
    return false;
  }
  return true;
}

client.once(Events.ClientReady, async (c: Client<true>) => {
  const tag = c.user?.tag ?? 'unknown user';
  console.log(`Logged in as ${tag}`);
  await registerSlash();

  try {
    await worldEventManager.checkEventTriggers();
  } catch (err) {
    console.error('World event trigger sweep failed on startup', err);
  }

  // AFK timeout processing
  setInterval(async () => {
    const events = processAfkTimeouts();
    for (const evt of events) {
      try {
        const channel = await client.channels.fetch(evt.channel_id);
        if (channel && channel.isTextBased()) {
          if (evt.message) {
            await (channel as TextChannel).send({ content: evt.message });
          }
          if (evt.refresh) {
            await syncPinnedUi(channel as TextChannel, evt.run_id);
          }
        }
      } catch (err) {
        console.error('Failed to broadcast AFK timeout', err);
      }
    }
  }, 60_000);
});

client.on(Events.MessageCreate, async (m: Message) => {
  if (m.author.bot) return;
  const lc = m.content.trim().toLowerCase();
  
  // Ensure user exists
  const exists = db.prepare('SELECT 1 FROM users WHERE user_id=?').get(m.author.id);
  if (!exists) {
    db.prepare('INSERT INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(m.author.id, m.author.id, Date.now());
    db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?, ?, ?)').run(m.author.id, 0, 0);
  }

  // Handle rituals (gm/gn)
  if (lc === 'gm' || lc === 'gn') {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const prof = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(m.author.id);
    const now = Date.now();
    const last = lc === 'gm' ? prof?.last_gm_ts ?? 0 : prof?.last_gn_ts ?? 0;
    const delta = now - last;
    const can = delta >= 4 * 60 * 60 * 1000;
    const claims = db
      .prepare(`SELECT COUNT(*) c FROM events WHERE user_id=? AND type='ritual.claim' AND ts > ?`)
      .get(m.author.id, now - 24 * 60 * 60 * 1000).c;
    
    if (can && claims < 2) {
      const settings = getGuildSettings(m.guild?.id);
      const coinsAward = lc === 'gm' ? settings.gm_reward : settings.gn_reward;
      const xpAward = settings.xp_reward;
      const column = lc === 'gm' ? 'last_gm_ts' : 'last_gn_ts';
      
      db.prepare(`UPDATE profiles SET coins=coins+?, xp=xp+?, ${column}=? WHERE user_id=?`)
        .run(coinsAward, xpAward, now, m.author.id);
      db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
        .run(`${m.id}`, '', m.author.id, 'ritual.claim', JSON.stringify({ kind: lc }), now);
      
      await m.reply({
        content: `☀️ **${lc.toUpperCase()}!** You earned +${coinsAward.toLocaleString()} Coins, +${xpAward} XP.`,
      });
    } else {
      scheduleDecay(m.reply({ content: '(Ritual on cooldown or max 2/day reached.)' }));
    }
    return;
  }

  if (lc === '!events') {
    const events = worldEventManager.listActiveEvents();
    if (!events.length) {
      scheduleDecay(m.reply({ content: '🌍 No global events are active right now.' }));
    } else {
      const lines = events.map((evt) => {
        const goals = evt.progress
          .map((goal) => `${goal.completed ? '✅' : `${goal.current}/${goal.target}`} ${goal.goalId}`)
          .join(' | ');
        const hours = Math.ceil(evt.remainingMs / (60 * 60 * 1000));
        return `• **${evt.event.name}** (${hours}h left) — ${goals || 'No goals'}`;
      });
      scheduleDecay(m.reply({ content: lines.join('\n') }));
    }
    return;
  }

  if (lc.startsWith('!event')) {
    const raw = m.content.trim().slice('!event'.length).trim();
    const tokens = tokenizeArgs(raw);
    const sub = (tokens.shift() ?? 'status').toLowerCase();

    if (sub === 'list') {
      const list = WORLD_EVENTS.map((evt) => `${evt.id} — ${evt.name} (${evt.rarity})`).join('\n');
      scheduleDecay(m.reply({ content: list || 'No events defined.' }));
      return;
    }

    if (sub === 'status') {
      const events = worldEventManager.listActiveEvents();
      const lines = events.map((evt) => {
        const goals = evt.progress
          .map((goal) => `${goal.completed ? '✅' : `${goal.current}/${goal.target}`} ${goal.goalId}`)
          .join(' | ');
        const hours = Math.ceil(evt.remainingMs / (60 * 60 * 1000));
        return `• **${evt.event.name}** (${hours}h left) — ${goals || 'No goals'}`;
      });
      scheduleDecay(m.reply({ content: lines.join('\n') || '🌍 No active events.' }));
      return;
    }

    if (sub === 'start' && tokens[0]) {
      if (m.author.id !== CFG.ownerId) {
        scheduleDecay(m.reply({ content: '❌ Only the bot owner can start world events.' }));
        return;
      }
      const eventId = tokens[0];
      const serverId = tokens[1] ?? 'global';
      const triggered = await worldEventManager.triggerEvent(eventId, serverId, { source: 'manual' });
      if (!triggered) {
        scheduleDecay(m.reply({ content: '❌ Event not found or already active.' }));
      } else {
        scheduleDecay(m.reply({ content: `🌍 Event **${eventId}** triggered for ${serverId}.` }));
      }
      return;
    }

    if (sub === 'end' && tokens[0]) {
      if (m.author.id !== CFG.ownerId) {
        scheduleDecay(m.reply({ content: '❌ Only the bot owner can end events.' }));
        return;
      }
      const eventId = tokens[0];
      const serverId = tokens[1] ?? 'global';
      const ended = await worldEventManager.forceEndEvent(eventId, serverId);
      scheduleDecay(
        m.reply({ content: ended ? `🌅 Event **${eventId}** ended for ${serverId}.` : '❌ Event not active.' })
      );
      return;
    }

    if (sub === 'sweep') {
      if (m.author.id !== CFG.ownerId) {
        scheduleDecay(m.reply({ content: '❌ Only the bot owner can run the trigger sweep.' }));
        return;
      }
      await worldEventManager.checkEventTriggers();
      scheduleDecay(m.reply({ content: '🔍 Trigger sweep complete.' }));
      return;
    }

    scheduleDecay(
      m.reply({
        content:
          '🌍 **World Event Commands**\n' +
          '• `!events` — show active events\n' +
          '• `!event list` — list event definitions\n' +
          '• `!event status` — show current progress\n' +
          '• `!event start <id> [server]` — owner only\n' +
          '• `!event end <id> [server]` — owner only\n' +
          '• `!event sweep` — owner only trigger check',
      })
    );
    return;
  }

  // Guild commands
  if (lc.startsWith('!guild')) {
    if (!ensureFeatureAccess(m, 'guilds')) return;
    const raw = m.content.trim().slice('!guild'.length).trim();
    const tokens = tokenizeArgs(raw);
    const sub = (tokens.shift() ?? 'info').toLowerCase();

    if (sub === 'create') {
      const name = tokens.join(' ');
      const res = createPlayerGuild(m.author.id, name);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }

    if (sub === 'invite') {
      const mentions = Array.from(m.mentions.users.values()).map((user: any) => user.id as string);
      const res = inviteMembersToGuild(m.author.id, mentions);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }

    if (sub === 'accept') {
      const name = tokens.join(' ');
      const res = acceptGuildInvite(m.author.id, name || undefined);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }

    if (sub === 'decline') {
      const name = tokens.join(' ');
      const res = declineGuildInvite(m.author.id, name || undefined);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }

    if (sub === 'leave') {
      const res = leaveGuild(m.author.id);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }

    if (sub === 'raid') {
      const raidSub = (tokens.shift() ?? '').toLowerCase();
      if (raidSub === 'list' || raidSub === '') {
        const raids = listAvailableRaids();
        const lines = raids.map((r) => `• **${r.name}** — ${r.min_party}-${r.max_party} players`);
        scheduleDecay(m.reply({ content: lines.length ? lines.join('\n') : 'No raids available yet.' }));
        return;
      }
      if (raidSub === 'start') {
        if (!ensureFeatureAccess(m, 'campaign')) return;
        if (!m.guild || m.channel.type !== ChannelType.GuildText) {
          scheduleDecay(m.reply({ content: '❌ Raids must be started inside a server text channel.' }));
          return;
        }
        const raidName = tokens.join(' ');
        if (!raidName) {
          scheduleDecay(m.reply({ content: '❌ Provide the raid name. Example: `!guild raid start "Custodian\'s Vault"`' }));
          return;
        }
        const prep = prepareRaidStart(m.author.id, raidName);
        if (!prep.success) {
          scheduleDecay(m.reply({ content: prep.message }));
          return;
        }
        const { party_ids, raid } = prep;
        for (const id of party_ids) {
          ensureUserRecord(id);
        }
        const run_id = startRun(
          m.guild.id,
          (m.channel as TextChannel).id,
          party_ids,
          raid.content_id,
          raid.scene_id
        );
        registerRunParticipants(run_id, raid.scene_id, party_ids);
        await syncPinnedUi(m.channel as TextChannel, run_id);
        const names = party_ids.map((id) => `<@${id}>`).join(', ');
        await m.reply({ content: `⚔️ **${raid.name}** raid started! Party: ${names}` });
        return;
      }
      scheduleDecay(m.reply({ content: '❌ Unknown raid command. Use `list` or `start`.' }));
      return;
    }

    if (sub === 'info') {
      scheduleDecay(m.reply({ content: guildSummary(m.author.id) }));
      return;
    }

    const help =
      '🏰 **Guild Commands**\n' +
      '• `!guild create "Name"` — create a guild\n' +
      '• `!guild invite @user` — invite players\n' +
      '• `!guild accept` — accept the newest invite\n' +
      '• `!guild decline` — decline an invite\n' +
      '• `!guild raid list` — list raids\n' +
      '• `!guild raid start "Custodian\'s Vault"` — begin a guild raid\n' +
      '• `!guild info` — show guild roster';
    scheduleDecay(m.reply({ content: help }));
    return;
  }

  // Role selection
  if (lc === '!role') {
    const view = await showRoleSelection(m.author.id);
    await m.reply(view);
    return;
  }

  // Show games
  if (lc === '!games') {
    scheduleDecay(m.reply({ content: showUserGames(m.author.id) }));
    return;
  }

  // Resume game
  if (lc.startsWith('!resume')) {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const runs = getUserActiveRuns(m.author.id);
    if (runs.length === 0) {
      await m.reply({ content: '❌ No active games to resume.' });
      return;
    }
    
    const parts = m.content.trim().split(/\s+/);
    const indexArg = parts[1] ? Number(parts[1]) : 1;
    const selectedIndex = Number.isFinite(indexArg) && indexArg > 0 ? indexArg - 1 : 0;
    const target = runs[selectedIndex];
    
    if (!target) {
      await m.reply({ content: '❌ Invalid game number. Use `!games` to list active runs.' });
      return;
    }
    
    const storedRun = getRun(target.run_id);
    const channelId = storedRun?.channel_id ?? target.channel_id;
    let destination: TextChannel | null = null;
    
    if (channelId) {
      try {
        const fetched = await client.channels.fetch(channelId);
        if (fetched && fetched.type === ChannelType.GuildText) {
          destination = fetched as TextChannel;
        }
      } catch (err) {
        console.warn('Failed to fetch run channel', err);
      }
    }
    
    if (!destination && m.guild && m.channel.type === ChannelType.GuildText) {
      destination = m.channel as TextChannel;
    }
    
    if (!destination) {
      await m.reply({ content: '❌ Could not locate the original run channel.' });
      return;
    }
    
    await syncPinnedUi(destination, target.run_id);
    const channelMention = `<#${destination.id}>`;
    const where = destination.id === m.channel.id ? 'here' : `in ${channelMention}`;
    await m.reply({ content: `▶️ Resumed Scene ${target.current_scene_id} (${target.round_id}) ${where}.` });
    return;
  }

  // Weekly reward
  if (lc === '!weekly') {
    if (!ensureFeatureAccess(m, 'shop')) return;
    const reward = claimWeeklyReward(m.author.id);
    if (!reward.success) {
      scheduleDecay(m.reply({ content: '❌ Weekly reward already claimed.' }));
    } else {
      await m.reply({ content: `📅 Weekly reward claimed! +${reward.amount?.toLocaleString()} coins (streak ${reward.streak}).` });
    }
    return;
  }

  // Loadout
  if (lc === '!loadout') {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const view = await renderEquipment(m.author.id);
    await m.reply(view);
    return;
  }

  // Crafting
  if (lc === '!crafts') {
    if (!ensureFeatureAccess(m, 'shop')) return;
    const lines = listCraftables().map((c) => `${c.id} — ${c.costFragments} fragments`).join('\n');
    scheduleDecay(m.reply({ content: `🛠️ Available recipes:\n${lines}` }));
    return;
  }

  if (lc.startsWith('!craft ')) {
    if (!ensureFeatureAccess(m, 'shop')) return;
    const parts = m.content.trim().split(/\s+/);
    const recipeId = parts[1];
    const res = craftItem(m.author.id, recipeId);
    scheduleDecay(m.reply({ content: res.message }));
    return;
  }

  // Recovery
  if (lc === '!reboot') {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const res = attemptSelfReboot(m.author.id);
    scheduleDecay(m.reply({ content: res.message }));
    return;
  }

  if (lc.startsWith('!revive')) {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const target = m.mentions.users.first();
    if (!target) {
      scheduleDecay(m.reply({ content: '❌ Mention a user to revive.' }));
      return;
    }
    const res = attemptAllyRevive(m.author.id, target.id);
    await m.reply({ content: res.message });
    return;
  }

  // Minigames
  if (lc.startsWith('!minigame')) {
    if (!ensureFeatureAccess(m, 'minigames')) return;
    const parts = m.content.trim().split(/\s+/);
    const type = (parts[1] as any) || 'memory';
    const { embed, row } = startMinigame(m.author.id, type);
    await m.reply({ embeds: [embed], components: [row] });
    return;
  }

  // Seasonal
  if (lc.startsWith('!season')) {
    if (!ensureFeatureAccess(m, 'seasonal')) return;
    const parts = m.content.trim().split(/\s+/);
    if (!parts[1]) {
      const seasons = listSeasons();
      const lines = seasons.map((s) => `${s.id} (${s.version}) — ${s.description}`).join('\n');
      scheduleDecay(m.reply({ content: lines || 'No seasons loaded.' }));
      return;
    }
    if (parts[1] === 'start' && parts[2]) {
      if (m.channel.type !== ChannelType.GuildText) return;
      try {
        const run_id = startSeasonalRun(m.author.id, m.guild!.id, (m.channel as TextChannel).id, parts[2]);
        await syncPinnedUi(m.channel as TextChannel, run_id);
        await m.reply({ content: `🎄 Seasonal run started: ${parts[2]}` });
      } catch (err: any) {
        scheduleDecay(m.reply({ content: `❌ ${err.message ?? 'Failed to start season.'}` }));
      }
      return;
    }
  }

  // PvP
  if (lc.startsWith('!pvp')) {
    if (!ensureFeatureAccess(m, 'pvp')) return;
    const parts = m.content.trim().split(/\s+/);
    const sub = parts[1] ?? 'queue';
    if (sub === 'queue') {
      const mode = (parts[2] as any) || '1v1';
      const res = queueForMatch(m.author.id, mode);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }
    if (sub === 'matches') {
      const matches = listActiveMatches();
      const lines = matches.map((match) => `${match.matchId}: ${match.participants.join(', ')} ${JSON.stringify(match.scores)}`).join('\n');
      scheduleDecay(m.reply({ content: lines || 'No active matches.' }));
      return;
    }
    if (sub === 'leaderboard') {
      const limitArg = Number(parts[2] ?? 10);
      const limit = Number.isFinite(limitArg) ? Math.max(1, Math.min(25, limitArg)) : 10;
      const board = getPvPLeaderboard(limit);
      const lines = board
        .map(
          (entry, index) =>
            `#${index + 1} <@${entry.user_id}> — ${entry.wins}W/${entry.losses}L/${entry.draws}D (rating ${entry.rating})`
        )
        .join('\n');
      scheduleDecay(m.reply({ content: lines || 'No ranked matches yet.' }));
      return;
    }
    if (sub === 'stats') {
      const mention = m.mentions.users.first();
      const target = mention?.id || parts[2] || m.author.id;
      const record = getPvPRecord(target);
      if (!record) {
        scheduleDecay(m.reply({ content: `📉 No PvP record for <@${target}>.` }));
      } else {
        scheduleDecay(
          m.reply({
            content: `🎯 PvP record for <@${target}> — ${record.wins}W/${record.losses}L/${record.draws}D (rating ${record.rating}).`,
          })
        );
      }
      return;
    }
    if (sub === 'report' && parts[2] && parts[3]) {
      const res = recordPvPAction(parts[2], m.author.id, parts[3] as any);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }
    if (sub === 'conclude' && parts[2]) {
      const res = concludeMatch(parts[2]);
      if (res.success) {
        const winners = res.winners?.length ? res.winners.map((id) => `<@${id}>`).join(', ') : 'No clear winner';
        scheduleDecay(m.reply({ content: `Match ${parts[2]} complete. Winner(s): ${winners}` }));
      } else {
        scheduleDecay(m.reply({ content: 'Unable to conclude.' }));
      }
      return;
    }
  }

  // Tutorial
  if (lc === '!tutorial') {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    const currentRole = getCurrentRole(m.author.id);
    if (!currentRole?.selected_role) {
      const view = await showRoleSelection(m.author.id, true);
      await m.reply({ content: '❌ Please select a role first.', ...view });
      return;
    }
    if (!m.guild || m.channel.type !== ChannelType.GuildText) return;
    const run_id = startRoleBasedRun(m.author.id, currentRole.selected_role, '1.1', {
      is_tutorial: true,
      guild_id: m.guild.id,
      channel_id: (m.channel as TextChannel).id,
    });
    await syncPinnedUi(m.channel as TextChannel, run_id);
    const roleInfo = getRoleById(currentRole.selected_role);
    await m.reply({ content: `🔄 Tutorial restarted as ${roleInfo?.emoji ?? '🎭'} ${roleInfo?.name ?? 'Adventurer'}!` });
    return;
  }

  // Start game
  if (lc.startsWith('!start')) {
    if (!ensureFeatureAccess(m, 'campaign')) return;
    if (m.channel.type !== ChannelType.GuildText) return;
    const parts = m.content.trim().split(/\s+/);
    const sceneId = parts[1] ?? '1.1';
    const join = joinGameWithRole(m.author.id, sceneId, m.guild!.id, (m.channel as TextChannel).id);
    if (!join.success) {
      const view = await showRoleSelection(m.author.id);
      await m.reply({ content: join.message, ...view });
      return;
    }
    await syncPinnedUi(m.channel as TextChannel, join.run_id!);
    const shopRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('shop:open').setLabel('Open Shop').setStyle(ButtonStyle.Primary)
    );
    await (m.channel as TextChannel).send({ content: 'Open the shop:', components: [shopRow] });
    await m.reply({ content: join.message });
    return;
  }
});

client.on(Events.InteractionCreate, async (i: Interaction) => {
  if (i.isButton()) {
    if (i.customId === 'shop:open') return showShop(i as ButtonInteraction);
    if (i.customId.startsWith('minigame:')) return handleMinigameButton(i as ButtonInteraction);
    return onButton(i as ButtonInteraction);
  }
  if (i.isStringSelectMenu()) {
    return onSelectMenu(i as StringSelectMenuInteraction);
  }
  if (i.isChatInputCommand()) {
    if (i.commandName === 'admin_gems_grant') {
      if (i.user.id !== CFG.ownerId) return i.reply({ ephemeral: true, content: 'Not allowed' });
      const who = i.options.getUser('user', true);
      const amt = i.options.getInteger('amount', true);
      db.prepare('UPDATE profiles SET gems=gems+? WHERE user_id=?').run(amt, who.id);
      db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
        .run(`txn_${Date.now()}`, who.id, 'gem_grant', amt, 'admin_grant', '{}', Date.now());
      return i.reply({ ephemeral: true, content: `Granted ${amt} Gems to ${who.tag}` });
    }
  }
});

async function registerSlash() {
  const rest = new REST({ version: '10' }).setToken(CFG.token);
  const body = [
    new SlashCommandBuilder()
      .setName('admin_gems_grant')
      .setDescription('Grant Gems to a user (owner only)')
      .addUserOption((o: SlashCommandUserOption) =>
        o.setName('user').setDescription('User').setRequired(true)
      )
      .addIntegerOption((o: SlashCommandIntegerOption) =>
        o.setName('amount').setDescription('Amount').setRequired(true)
      )
      .toJSON(),
  ];
  try {
    await rest.put(Routes.applicationCommands(CFG.clientId), { body });
    console.log('Slash commands registered.');
  } catch (e) {
    console.error(e);
  }
}

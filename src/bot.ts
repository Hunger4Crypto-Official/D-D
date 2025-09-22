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
import { renderScene, onButton, showShop, onSelectMenu } from './ui/ui.js';
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
import { queueForMatch, listActiveMatches, recordPvPAction, concludeMatch } from './pvp/duels.js';
import { processAfkTimeouts } from './engine/orchestrator.js';

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

client.once(Events.ClientReady, async (c: Client<true>) => {
  const tag = c.user?.tag ?? 'unknown user';
  console.log(`Logged in as ${tag}`);
  await registerSlash();
  setInterval(async () => {
    const events = processAfkTimeouts();
    for (const evt of events) {
      try {
        const channel = await client.channels.fetch(evt.channel_id);
        if (channel && channel.isTextBased()) {
          await (channel as TextChannel).send({ content: evt.message });
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
  const exists = db.prepare('SELECT 1 FROM users WHERE user_id=?').get(m.author.id);
  if (!exists) {
    db.prepare('INSERT INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(m.author.id, m.author.id, Date.now());
    db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?, ?, ?)').run(m.author.id, 0, 0);
  }

  if (lc === 'gm' || lc === 'gn') {
    const prof = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(m.author.id);
    const now = Date.now();
    const last = lc === 'gm' ? prof?.last_gm_ts ?? 0 : prof?.last_gn_ts ?? 0;
    const delta = now - last;
    const can = delta >= 4 * 60 * 60 * 1000;
    const claims = db
      .prepare(`SELECT COUNT(*) c FROM events WHERE user_id=? AND type='ritual.claim' AND ts > ?`)
      .get(m.author.id, now - 24 * 60 * 60 * 1000).c;
    if (can && claims < 2) {
      db.prepare(
        'UPDATE profiles SET coins=coins+?, xp=xp+?, ' + (lc === 'gm' ? 'last_gm_ts=?' : 'last_gn_ts=?') + ' WHERE user_id=?'
      ).run(25, 1, now, m.author.id);
      db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
        .run(`${m.id}`, '', m.author.id, 'ritual.claim', JSON.stringify({ kind: lc }), now);
      await m.reply({ content: `☀️ **${lc.toUpperCase()}!** You earned +25 Coins, +1 XP.` });
    } else {
      scheduleDecay(m.reply({ content: '(Ritual on cooldown or max 2/day reached.)' }));
    }
    return;
  }

  if (lc === '!role') {
    const view = await showRoleSelection(m.author.id);
    await m.reply(view);
    return;
  }

  if (lc === '!games') {
    scheduleDecay(m.reply({ content: showUserGames(m.author.id) }));
    return;
  }

  if (lc === '!resume') {
    const runs = getUserActiveRuns(m.author.id);
    if (runs.length === 0) {
      await m.reply({ content: '❌ No active games to resume.' });
      return;
    }
    if (m.channel.type !== ChannelType.GuildText) return;
    const latest = runs[0];
    const payload = await renderScene(latest.run_id);
    await (m.channel as TextChannel).send(payload);
    await m.reply({ content: `▶️ Resumed Scene ${latest.current_scene_id} (${latest.round_id}).` });
    return;
  }

  if (lc === '!weekly') {
    const reward = claimWeeklyReward(m.author.id);
    if (!reward.success) {
      scheduleDecay(m.reply({ content: '❌ Weekly reward already claimed.' }));
    } else {
      await m.reply({ content: `📅 Weekly reward claimed! +${reward.amount?.toLocaleString()} coins (streak ${reward.streak}).` });
    }
    return;
  }

  if (lc === '!loadout') {
    const view = await renderEquipment(m.author.id);
    await m.reply(view);
    return;
  }

  if (lc === '!crafts') {
    const lines = listCraftables().map((c) => `${c.id} — ${c.costFragments} fragments`).join('\n');
    scheduleDecay(m.reply({ content: `🛠️ Available recipes:\n${lines}` }));
    return;
  }

  if (lc.startsWith('!craft ')) {
    const parts = m.content.trim().split(/\s+/);
    const recipeId = parts[1];
    const res = craftItem(m.author.id, recipeId);
    scheduleDecay(m.reply({ content: res.message }));
    return;
  }

  if (lc === '!reboot') {
    const res = attemptSelfReboot(m.author.id);
    scheduleDecay(m.reply({ content: res.message }));
    return;
  }

  if (lc.startsWith('!revive')) {
    const target = m.mentions.users.first();
    if (!target) {
      scheduleDecay(m.reply({ content: '❌ Mention a user to revive.' }));
      return;
    }
    const res = attemptAllyRevive(m.author.id, target.id);
    await m.reply({ content: res.message });
    return;
  }

  if (lc.startsWith('!minigame')) {
    const parts = m.content.trim().split(/\s+/);
    const type = (parts[1] as any) || 'memory';
    const { embed, row } = startMinigame(m.author.id, type);
    await m.reply({ embeds: [embed], components: [row] });
    return;
  }

  if (lc.startsWith('!season')) {
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
        const run_id = startSeasonalRun(m.author.id, (m.channel as TextChannel).id, parts[2]);
        const payload = await renderScene(run_id);
        await (m.channel as TextChannel).send(payload);
        await m.reply({ content: `🎄 Seasonal run started: ${parts[2]}` });
      } catch (err: any) {
        scheduleDecay(m.reply({ content: `❌ ${err.message ?? 'Failed to start season.'}` }));
      }
      return;
    }
  }

  if (lc.startsWith('!pvp')) {
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
    if (sub === 'report' && parts[2] && parts[3]) {
      const res = recordPvPAction(parts[2], m.author.id, parts[3] as any);
      scheduleDecay(m.reply({ content: res.message }));
      return;
    }
    if (sub === 'conclude' && parts[2]) {
      const res = concludeMatch(parts[2]);
      scheduleDecay(m.reply({ content: res.success ? `Match ${parts[2]} complete. Winner <@${res.winner}>` : 'Unable to conclude.' }));
      return;
    }
  }

  if (lc === '!tutorial') {
    const currentRole = getCurrentRole(m.author.id);
    if (!currentRole?.selected_role) {
      const view = await showRoleSelection(m.author.id, true);
      await m.reply({ content: '❌ Please select a role first.', ...view });
      return;
    }
    if (m.channel.type !== ChannelType.GuildText) return;
    const run_id = startRoleBasedRun(m.author.id, currentRole.selected_role, '1.1', true);
    const payload = await renderScene(run_id);
    await (m.channel as TextChannel).send(payload);
    const roleInfo = getRoleById(currentRole.selected_role);
    await m.reply({ content: `🔄 Tutorial restarted as ${roleInfo?.emoji ?? '🎭'} ${roleInfo?.name ?? 'Adventurer'}!` });
    return;
  }

  if (lc.startsWith('!start')) {
    if (m.channel.type !== ChannelType.GuildText) return;
    const parts = m.content.trim().split(/\s+/);
    const sceneId = parts[1] ?? '1.1';
    const join = joinGameWithRole(m.author.id, sceneId);
    if (!join.success) {
      const view = await showRoleSelection(m.author.id);
      await m.reply({ content: join.message, ...view });
      return;
    }
    const payload = await renderScene(join.run_id!);
    await (m.channel as TextChannel).send(payload);
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

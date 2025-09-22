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
  REST,
  Routes,
  ButtonInteraction,
  StringSelectMenuInteraction,
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

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

(globalThis as any)._client = client;

client.once(Events.ClientReady, async (c)=>{
  console.log(`Logged in as ${c.user.tag}`);
  await registerSlash();
});

client.on(Events.MessageCreate, async (m)=>{
  if (m.author.bot) return;
  const lc = m.content.trim().toLowerCase();
  // ensure profile
  const exists = db.prepare('SELECT 1 FROM users WHERE user_id=?').get(m.author.id);
  if (!exists){
    db.prepare('INSERT INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(m.author.id, m.author.id, Date.now());
    db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?, ?, ?)').run(m.author.id, 0, 0);
  }

  // GM/GN ritual
  if (lc === 'gm' || lc === 'gn'){
    const prof = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(m.author.id);
    const now = Date.now();
    const last = lc==='gm' ? (prof?.last_gm_ts||0) : (prof?.last_gn_ts||0);
    const delta = now - last;
    const can = delta >= 4*60*60*1000;
    const claims = db.prepare(`SELECT COUNT(*) c FROM events WHERE user_id=? AND type='ritual.claim' AND ts > ?`).get(m.author.id, now-24*60*60*1000).c;
    if (can && claims < 2){
      db.prepare('UPDATE profiles SET coins=coins+?, xp=xp+?, '+(lc==='gm'?'last_gm_ts=?':'last_gn_ts=?')+' WHERE user_id=?')
        .run(25, 1, now, m.author.id);
      db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
        .run(`${m.id}`, '', m.author.id, 'ritual.claim', JSON.stringify({kind:lc}), now);
      await m.reply({ content:`☀️ **${lc.toUpperCase()}!** You earned +25 Coins, +1 XP.` });
    } else {
      await m.reply({ content:`(Ritual on cooldown or max 2/day reached.)` });
    }
    return;
  }

  if (lc === '!role'){
    const view = await showRoleSelection(m.author.id);
    await m.reply(view);
    return;
  }

  if (lc === '!games'){
    await m.reply({ content: showUserGames(m.author.id) });
    return;
  }

  if (lc === '!resume'){
    const runs = getUserActiveRuns(m.author.id);
    if (runs.length === 0){
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

  if (lc === '!weekly'){
    const reward = claimWeeklyReward(m.author.id);
    if (!reward.success){
      await m.reply({ content: '❌ Weekly reward already claimed.' });
    } else {
      await m.reply({ content: `📅 Weekly reward claimed! +${reward.amount?.toLocaleString()} coins (streak ${reward.streak}).` });
    }
    return;
  }

  if (lc === '!tutorial'){
    const currentRole = getCurrentRole(m.author.id);
    if (!currentRole?.selected_role){
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

  if (lc.startsWith('!start')){
    if (m.channel.type !== ChannelType.GuildText) return;
    const parts = m.content.trim().split(/\s+/);
    const sceneId = parts[1] ?? '1.1';
    const join = joinGameWithRole(m.author.id, sceneId);
    if (!join.success){
      const view = await showRoleSelection(m.author.id);
      await m.reply({ content: join.message, ...view });
      return;
    }
    const payload = await renderScene(join.run_id!);
    await (m.channel as TextChannel).send(payload);
    const shopRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(new ButtonBuilder().setCustomId('shop:open').setLabel('Open Shop').setStyle(ButtonStyle.Primary));
    await (m.channel as TextChannel).send({ content:'Open the shop:', components:[shopRow] });
    await m.reply({ content: join.message });
    return;
  }
});

client.on(Events.InteractionCreate, async (i)=>{
  if (i.isButton()){
    if (i.customId === 'shop:open') return showShop(i as ButtonInteraction);
    return onButton(i as ButtonInteraction);
  }
  if (i.isStringSelectMenu()){
    return onSelectMenu(i as StringSelectMenuInteraction);
  }
  if (i.isChatInputCommand()){
    if (i.commandName === 'admin_gems_grant'){
      if (i.user.id !== CFG.ownerId) return i.reply({ ephemeral:true, content:'Not allowed' });
      const who = i.options.getUser('user', true);
      const amt = i.options.getInteger('amount', true);
      db.prepare('UPDATE profiles SET gems=gems+? WHERE user_id=?').run(amt, who.id);
      db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
        .run(`txn_${Date.now()}`, who.id, 'gem_grant', amt, 'admin_grant', '{}', Date.now());
      return i.reply({ ephemeral:true, content:`Granted ${amt} Gems to ${who.tag}` });
    }
  }
});

async function registerSlash(){
  const rest = new REST({version: '10'}).setToken(CFG.token);
  const body = [
    new SlashCommandBuilder().setName('admin_gems_grant').setDescription('Grant Gems to a user (owner only)')
      .addUserOption(o=>o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true))
      .toJSON()
  ];
  try {
    await rest.put(Routes.applicationCommands(CFG.clientId), { body });
    console.log('Slash commands registered.');
  } catch (e){ console.error(e); }
}

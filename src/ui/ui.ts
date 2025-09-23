import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuInteraction,
  Message,
  TextChannel,
} from 'discord.js';
import { sceneState, handleAction } from '../engine/orchestrator.js';
import db from '../persistence/db.js';
import { renderEnhancedShop, handleEnhancedShopInteraction, showShop } from './shop.js';
import { handleRoleSelection, showRoleSelection } from './roles.js';
import {
  renderEquipment,
  handleEquipmentButton,
  handleEquipmentEquip,
  handleEquipmentSelect,
} from './equipment.js';

export async function renderScene(run_id: string) {
  const run = db.prepare('SELECT * FROM runs WHERE run_id=?').get(run_id);
  const scene = sceneState(run);
  const round = scene.rounds.find((r) => r.round_id === run.round_id)!;

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${scene.title}`)
    .setDescription(`${scene.narration}\n\n**${round.description}**`)
    .setColor(0x5b8cff);

  if (run.active_user_id) {
    const expires = run.turn_expires_at ? `<t:${Math.floor(run.turn_expires_at / 1000)}:R>` : '—';
    embed.addFields({
      name: 'Current Turn',
      value: `<@${run.active_user_id}> • Expires ${expires}`,
      inline: false,
    });
  }
  embed.addFields({ name: 'Sleight Score', value: `${run.sleight_score ?? 0}`, inline: true });

  const rows: any[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const a of round.actions) {
    if ((row as any).components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`act:${run_id}:${a.id}`)
        .setLabel(a.label)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  rows.push(row);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`equipment:open:${run_id}`).setLabel('Loadout').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('shop:open').setLabel('Shop').setStyle(ButtonStyle.Primary)
    )
  );
  return { embeds: [embed], components: rows };
}

async function ensureUiReference(run_id: string, message: Message) {
  if (!message.pinned) {
    try {
      await message.pin();
    } catch (err) {
      console.warn('Unable to pin UI message', err);
    }
  }
  db.prepare('UPDATE runs SET ui_message_id=?, ui_channel_id=? WHERE run_id=?').run(
    message.id,
    message.channelId,
    run_id
  );
}

export async function syncPinnedUi(channel: TextChannel, run_id: string, reuse?: Message | null) {
  const run = db.prepare('SELECT ui_message_id, ui_channel_id FROM runs WHERE run_id=?').get(run_id) as
    | { ui_message_id?: string; ui_channel_id?: string }
    | undefined;
  const payload = await renderScene(run_id);
  let target = reuse ?? null;
  if (!target && run?.ui_message_id) {
    try {
      target = await channel.messages.fetch(run.ui_message_id);
    } catch {
      target = null;
    }
  }
  if (target) {
    await target.edit(payload);
  } else {
    target = await channel.send(payload);
  }
  if (!target) throw new Error('Failed to render scene UI');
  await ensureUiReference(run_id, target);
  return target;
}

export async function onButton(i: ButtonInteraction) {
  const [prefix, run_id, rest] = i.customId.split(':');
  
  if (prefix === 'act') {
    await i.deferReply({ ephemeral: true });
    let res;
    try {
      res = handleAction(run_id, i.user.id, rest);
      await i.editReply(`🎲 You chose **${rest}** → ${res.summary}`);
    } catch (err: any) {
      await i.editReply(`❌ ${err.message ?? 'Could not resolve action.'}`);
      return;
    }
    if (i.channel && (i.channel as any).isTextBased?.()) {
      await syncPinnedUi(i.channel as unknown as TextChannel, run_id, i.message as Message);
    }
    const channel = i.channel;
    if (res.compliment && channel && channel.isTextBased() && 'send' in channel) {
      await (channel as any).send({ content: `✨ ${res.compliment} (<@${i.user.id}>)` });
    }
    return;
  }
  
  if (prefix === 'shop') {
    await i.deferReply({ ephemeral: true });
    const msg = await handleEnhancedShopInteraction(i.customId, i.user.id);
    if (i.customId === 'shop:refresh') {
      const view = await renderEnhancedShop(i.user.id);
      await i.message.edit(view);
    }
    await i.editReply(msg);
    return;
  }
  
  if (prefix === 'role') {
    await i.deferReply({ ephemeral: true });
    const msg = handleRoleSelection(i.customId, i.user.id);
    const isTutorial = i.customId.includes('tutorial');
    const view = await showRoleSelection(i.user.id, isTutorial);
    await i.message.edit(view);
    await i.editReply(msg);
    return;
  }
  
  if (prefix === 'equipment') {
    if (rest === 'open') {
      await i.deferReply({ ephemeral: true });
      const view = await renderEquipment(i.user.id);
      await i.editReply(view);
      return;
    }
    await handleEquipmentButton(i);
    return;
  }
}

export async function onSelectMenu(i: StringSelectMenuInteraction) {
  if (i.customId.startsWith('shop:')) {
    await i.deferReply({ ephemeral: true });
    const msg = await handleEnhancedShopInteraction(i.customId, i.user.id, i.values);
    if (i.customId === 'shop:select' || i.customId === 'shop:craft') {
      const view = await renderEnhancedShop(i.user.id);
      await i.message.edit(view);
    }
    await i.editReply(msg);
    return;
  }
  
  if (i.customId.startsWith('role:')) {
    await i.deferReply({ ephemeral: true });
    const msg = handleRoleSelection(i.customId, i.user.id, i.values);
    const isTutorial = i.customId.includes('tutorial');
    const view = await showRoleSelection(i.user.id, isTutorial);
    await i.message.edit(view);
    await i.editReply(msg);
    return;
  }
  
  if (i.customId === 'equipment:slot') {
    await handleEquipmentSelect(i);
    return;
  }
  
  if (i.customId.startsWith('equipment:equip:')) {
    await handleEquipmentEquip(i);
    return;
  }
}

// Add to src/ui/ui.ts
import { cardEngine, deckManager } from '../nft/cards.js';

export async function renderSceneWithCards(run_id: string) {
  const baseRender = await renderScene(run_id);
  const run = db.prepare('SELECT active_user_id FROM runs WHERE run_id=?').get(run_id) as any;
  
  if (!run?.active_user_id) return baseRender;
  
  const hand = await cardEngine.getHand(run_id);
  if (hand.length === 0) {
    // Draw initial hand
    for (let i = 0; i < 3; i++) {
      await cardEngine.drawCard(run_id, run.active_user_id);
    }
  }
  
  // Add card buttons
  if (hand.length > 0) {
    const cardRow = new ActionRowBuilder<ButtonBuilder>();
    for (const card of hand.slice(0, 5)) {
      cardRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`card:${run_id}:${card.id}`)
          .setLabel(`🎴 ${card.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    baseRender.components.push(cardRow);
  }
  
  return baseRender;
}

// Handle card plays in onButton
if (prefix === 'card') {
  const [, runId, cardId] = i.customId.split(':');
  const result = await cardEngine.playCard(runId, i.user.id, cardId);
  await i.reply({ 
    content: result.message, 
    ephemeral: true 
  });
  // Refresh UI
  await syncPinnedUi(i.channel as TextChannel, runId);
  return;
}

export { showShop } from './shop.js';

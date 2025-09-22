import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuInteraction,
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
    const payload = await renderScene(run_id);
    await i.message.edit(payload);
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

export { showShop } from './shop.js';

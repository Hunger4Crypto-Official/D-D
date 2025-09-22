import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder } from 'discord.js';
import { nanoid } from 'nanoid';
import db from '../persistence/db.js';

type MinigameType = 'memory' | 'reaction' | 'cipher' | 'gambit';

interface MinigameSession {
  id: string;
  type: MinigameType;
  userId: string;
  state: any;
  createdAt: number;
}

const sessions = new Map<string, MinigameSession>();

function storeScore(userId: string, type: MinigameType, score: number) {
  const row = db
    .prepare('SELECT best_score FROM minigame_scores WHERE user_id=? AND minigame_id=?')
    .get(userId, type) as { best_score?: number } | undefined;
  const best = Math.max(score, row?.best_score ?? 0);
  db.prepare(
    `INSERT INTO minigame_scores (user_id,minigame_id,best_score,last_played)
     VALUES (?,?,?,?)
     ON CONFLICT(user_id,minigame_id) DO UPDATE SET best_score=excluded.best_score, last_played=excluded.last_played`
  ).run(userId, type, best, Date.now());
}

export function startMinigame(userId: string, type: MinigameType) {
  const sessionId = nanoid(10);
  let embed: EmbedBuilder;
  let row: ActionRowBuilder<ButtonBuilder>;
  let state: any = {};

  if (type === 'memory') {
    const choices = ['🔴', '🟢', '🔵', '🟡', '🟣'];
    const sequence = Array.from({ length: 4 }, () => choices[Math.floor(Math.random() * choices.length)]);
    state.sequence = sequence;
    state.progress = 0;
    embed = new EmbedBuilder()
      .setTitle('🧠 Memory Runes')
      .setDescription(`Memorize this sequence, then repeat it by pressing the buttons: ${sequence.join(' ')}`)
      .setColor(0xf0c987);
    row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...choices.map((emoji) =>
        new ButtonBuilder().setCustomId(`minigame:memory:${sessionId}:${emoji}`).setLabel(emoji).setStyle(ButtonStyle.Secondary)
      )
    );
  } else if (type === 'reaction') {
    state.started = Date.now();
    embed = new EmbedBuilder()
      .setTitle('⚡ Reaction Sparks')
      .setDescription('Wait for the prompt, then tap GO as fast as possible!')
      .setColor(0xf97316);
    row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`minigame:reaction:${sessionId}:go`).setLabel('GO!').setStyle(ButtonStyle.Primary)
    );
  } else if (type === 'cipher') {
    const words = [
      ['vault', 'A ancient system hums.'],
      ['ledger', 'Blocks align silently.'],
      ['gremlin', 'Mischief in the vents.'],
    ];
    const pick = words[Math.floor(Math.random() * words.length)];
    const hint = pick[1];
    const answer = pick[0];
    const scrambled = answer
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
    state.answer = answer;
    state.guesses = 0;
    embed = new EmbedBuilder()
      .setTitle('🔐 Cipher Nibbles')
      .setDescription(`Unscramble the word: **${scrambled}**\nHint: ${hint}`)
      .setFooter({ text: 'Use the buttons to guess.' })
      .setColor(0x22c55e);
    row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...answer.split('').map((letter, idx) =>
        new ButtonBuilder()
          .setCustomId(`minigame:cipher:${sessionId}:${letter}:${idx}`)
          .setLabel(letter.toUpperCase())
          .setStyle(ButtonStyle.Secondary)
      )
    );
    state.progress = '';
  } else {
    state.pick = Math.floor(Math.random() * 3);
    embed = new EmbedBuilder()
      .setTitle('🎲 Gremlin Gambits')
      .setDescription('Pick the cup hiding the ledger chip!')
      .setColor(0x8b5cf6);
    row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...[0, 1, 2].map((idx) =>
        new ButtonBuilder()
          .setCustomId(`minigame:gambit:${sessionId}:${idx}`)
          .setLabel(`Cup ${idx + 1}`)
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  sessions.set(sessionId, { id: sessionId, type, userId, state, createdAt: Date.now() });
  return { sessionId, embed, row };
}

export async function handleMinigameButton(i: ButtonInteraction) {
  const [, type, sessionId, payload] = i.customId.split(':');
  const session = sessions.get(sessionId);
  if (!session || session.userId !== i.user.id) {
    await i.reply({ ephemeral: true, content: '❌ Session expired.' });
    return;
  }
  if (type === 'memory') {
    const expected = session.state.sequence[session.state.progress];
    if (payload === expected) {
      session.state.progress += 1;
      if (session.state.progress >= session.state.sequence.length) {
        storeScore(i.user.id, 'memory', session.state.sequence.length);
        sessions.delete(sessionId);
        await i.update({ content: '✅ Perfect recall! Sleight score increased by 1.', components: [], embeds: [] });
      } else {
        await i.reply({ ephemeral: true, content: '👍 Correct! Keep going.' });
      }
    } else {
      sessions.delete(sessionId);
      await i.update({ content: '❌ Sequence broken. The runes fade.', components: [], embeds: [] });
    }
    return;
  }
  if (type === 'reaction') {
    const delta = Date.now() - session.state.started;
    storeScore(i.user.id, 'reaction', Math.max(0, 5000 - delta));
    sessions.delete(sessionId);
    await i.update({ content: `⚡ Reaction time: ${delta}ms`, components: [], embeds: [] });
    return;
  }
  if (type === 'cipher') {
    session.state.guesses += 1;
    session.state.progress += payload;
    if (session.state.progress.length >= session.state.answer.length) {
      const success = session.state.progress === session.state.answer;
      storeScore(i.user.id, 'cipher', success ? 100 - session.state.guesses * 5 : 0);
      sessions.delete(sessionId);
      await i.update({ content: success ? '🔓 Cipher solved!' : '❌ Incorrect cipher.', components: [], embeds: [] });
    } else {
      await i.reply({ ephemeral: true, content: `Current guess: ${session.state.progress}` });
    }
    return;
  }
  if (type === 'gambit') {
    const pick = Number(payload);
    const win = pick === session.state.pick;
    storeScore(i.user.id, 'gambit', win ? 50 : 0);
    sessions.delete(sessionId);
    await i.update({ content: win ? '🎉 You found the chip!' : '😵 Rugged! Gremlins cackle.', components: [], embeds: [] });
    return;
  }
}

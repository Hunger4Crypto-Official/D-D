import { nanoid } from 'nanoid';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import db from '../../persistence/db.js';
import { Effect } from '../../models.js';
import { applyEffects } from '../../engine/rules.js';

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss';
export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';

interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  currentRound: number;
  totalRounds: number;
  startTime: number;
  endTime?: number;
  entryFee: { coins?: number; gems?: number; fragments?: number };
  prizes: TournamentPrizes;
  rules: TournamentRules;
  metadata: Record<string, unknown>;
}

interface TournamentPrizes {
  first: Effect[];
  second: Effect[];
  third: Effect[];
  participation: Effect[];
  milestones: { rounds: number; rewards: Effect[] }[];
}

interface TournamentRules {
  banList: string[];
  allowedClasses: string[];
  levelRange: { min: number; max: number };
  gearRestrictions: string[];
  timeLimit: number;
  bestOf: number;
}

interface Bracket {
  tournamentId: string;
  round: number;
  matchId: string;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  loser: string | null;
  scores: { player1: number; player2: number };
  status: 'pending' | 'in_progress' | 'completed';
  scheduledTime?: number;
}

const DEFAULT_PRIZES: TournamentPrizes = {
  first: [
    { type: 'coins', value: 50_000 },
    { type: 'item', id: 'trophy_champion' },
    { type: 'xp', value: 5_000 },
  ],
  second: [
    { type: 'coins', value: 25_000 },
    { type: 'item', id: 'trophy_finalist' },
    { type: 'xp', value: 2_500 },
  ],
  third: [
    { type: 'coins', value: 10_000 },
    { type: 'item', id: 'trophy_semifinalist' },
    { type: 'xp', value: 1_000 },
  ],
  participation: [{ type: 'xp', value: 100 }],
  milestones: [
    { rounds: 1, rewards: [{ type: 'coins', value: 1_000 }] },
    { rounds: 3, rewards: [{ type: 'fragment', value: 50 }] },
    { rounds: 5, rewards: [{ type: 'item', id: 'tournament_badge' }] },
  ],
};

const DEFAULT_RULES: TournamentRules = {
  banList: [],
  allowedClasses: ['dev', 'trader', 'whale', 'hacker', 'validator', 'miner', 'shiller', 'meme'],
  levelRange: { min: 1, max: 100 },
  gearRestrictions: [],
  timeLimit: 30,
  bestOf: 3,
};

export class TournamentManager {
  private readonly activeTournaments = new Map<string, Tournament>();
  private readonly brackets = new Map<string, Bracket[]>();
  private readonly registrations = new Map<string, Set<string>>();

  constructor() {
    this.loadActiveTournaments();
  }

  private loadActiveTournaments() {
    const rows = db
      .prepare(
        `SELECT * FROM tournaments WHERE status IN ('registration', 'in_progress')`
      )
      .all() as any[];

    for (const row of rows) {
      const tournament: Tournament = {
        id: row.tournament_id,
        name: row.name,
        format: row.format,
        status: row.status,
        maxParticipants: row.max_participants,
        currentRound: row.current_round,
        totalRounds: row.total_rounds,
        startTime: row.start_time,
        endTime: row.end_time,
        entryFee: JSON.parse(row.entry_fee_json || '{}'),
        prizes: JSON.parse(row.prizes_json || '{}'),
        rules: JSON.parse(row.rules_json || '{}'),
        metadata: JSON.parse(row.metadata_json || '{}'),
      };

      this.activeTournaments.set(tournament.id, tournament);

      const bracketRows = db
        .prepare(`SELECT * FROM tournament_brackets WHERE tournament_id=?`)
        .all(tournament.id) as any[];
      const brackets = bracketRows.map((b) => ({
        tournamentId: b.tournament_id,
        round: b.round,
        matchId: b.match_id,
        player1: b.player1_id,
        player2: b.player2_id,
        winner: b.winner_id,
        loser: b.loser_id,
        scores: JSON.parse(b.scores_json || '{"player1":0,"player2":0}'),
        status: b.status,
        scheduledTime: b.scheduled_time,
      }));
      this.brackets.set(tournament.id, brackets);

      const regRows = db
        .prepare(`SELECT user_id FROM tournament_registrations WHERE tournament_id=?`)
        .all(tournament.id) as any[];
      this.registrations.set(tournament.id, new Set(regRows.map((r) => r.user_id)));
    }
  }

  createTournament(config: {
    name: string;
    format: TournamentFormat;
    maxParticipants: number;
    startTime: number;
    entryFee?: { coins?: number; gems?: number; fragments?: number };
    prizes?: Partial<TournamentPrizes>;
    rules?: Partial<TournamentRules>;
  }): Tournament {
    const id = `tour_${nanoid(8)}`;
    const entryFee = config.entryFee || {};
    const prizes: TournamentPrizes = {
      ...DEFAULT_PRIZES,
      ...config.prizes,
      milestones: config.prizes?.milestones || DEFAULT_PRIZES.milestones,
    };
    const rules: TournamentRules = {
      ...DEFAULT_RULES,
      ...config.rules,
    };

    const tournament: Tournament = {
      id,
      name: config.name,
      format: config.format,
      status: 'registration',
      maxParticipants: config.maxParticipants,
      currentRound: 0,
      totalRounds: this.calculateTotalRounds(config.format, config.maxParticipants),
      startTime: config.startTime,
      entryFee,
      prizes,
      rules,
      metadata: {},
    };

    db.prepare(
      `INSERT INTO tournaments (
         tournament_id, name, format, status, max_participants, current_round, total_rounds,
         start_time, entry_fee_json, prizes_json, rules_json, metadata_json, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      tournament.id,
      tournament.name,
      tournament.format,
      tournament.status,
      tournament.maxParticipants,
      tournament.currentRound,
      tournament.totalRounds,
      tournament.startTime,
      JSON.stringify(tournament.entryFee),
      JSON.stringify(tournament.prizes),
      JSON.stringify(tournament.rules),
      JSON.stringify(tournament.metadata),
      Date.now()
    );

    this.activeTournaments.set(tournament.id, tournament);
    this.registrations.set(tournament.id, new Set());
    this.brackets.set(tournament.id, []);

    return tournament;
  }

  registerPlayer(tournamentId: string, userId: string) {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    if (tournament.status !== 'registration') {
      return { success: false, message: 'Registration closed.' };
    }

    const registrations = this.registrations.get(tournamentId) || new Set<string>();
    if (registrations.has(userId)) {
      return { success: false, message: 'Already registered.' };
    }

    if (registrations.size >= tournament.maxParticipants) {
      return { success: false, message: 'Tournament is full.' };
    }

    const eligibility = this.checkEligibility(userId, tournament);
    if (!eligibility.eligible) {
      return { success: false, message: eligibility.reason ?? 'Not eligible.' };
    }

    if (!this.payEntryFee(userId, tournament.entryFee)) {
      return { success: false, message: 'Insufficient funds for entry fee.' };
    }

    db.prepare(
      `INSERT INTO tournament_registrations (tournament_id, user_id, registered_at, seed)
       VALUES (?,?,?,?)`
    ).run(tournamentId, userId, Date.now(), Math.random());

    registrations.add(userId);
    this.registrations.set(tournamentId, registrations);

    return {
      success: true,
      message: `Registered for ${tournament.name}! (${registrations.size}/${tournament.maxParticipants})`,
    };
  }

  startTournament(tournamentId: string) {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    const registrations = this.registrations.get(tournamentId) || new Set<string>();
    if (registrations.size < 2) {
      return { success: false, message: 'Not enough players to start.' };
    }

    const brackets = this.generateBrackets(tournament, Array.from(registrations));
    this.brackets.set(tournament.id, brackets);

    tournament.status = 'in_progress';
    tournament.currentRound = 1;

    db.prepare(
      `UPDATE tournaments SET status='in_progress', current_round=?, updated_at=? WHERE tournament_id=?`
    ).run(1, Date.now(), tournament.id);

    for (const bracket of brackets) {
      db.prepare(
        `INSERT INTO tournament_brackets (
           tournament_id, round, match_id, player1_id, player2_id, status, scores_json, created_at
         ) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        bracket.tournamentId,
        bracket.round,
        bracket.matchId,
        bracket.player1,
        bracket.player2,
        bracket.status,
        JSON.stringify(bracket.scores),
        Date.now()
      );
    }

    return { success: true, message: `${tournament.name} has started!` };
  }

  reportMatchResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    scores: { player1: number; player2: number }
  ) {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) {
      return { success: false, message: 'Tournament not found.' };
    }

    const brackets = this.brackets.get(tournamentId) || [];
    const bracket = brackets.find((b) => b.matchId === matchId);
    if (!bracket) {
      return { success: false, message: 'Match not found.' };
    }

    if (bracket.status === 'completed') {
      return { success: false, message: 'Match already completed.' };
    }

    bracket.winner = winnerId;
    bracket.loser = winnerId === bracket.player1 ? bracket.player2 : bracket.player1;
    bracket.scores = scores;
    bracket.status = 'completed';

    db.prepare(
      `UPDATE tournament_brackets
       SET winner_id=?, loser_id=?, scores_json=?, status='completed', completed_at=?
       WHERE tournament_id=? AND match_id=?`
    ).run(bracket.winner, bracket.loser, JSON.stringify(scores), Date.now(), tournamentId, matchId);

    const roundMatches = brackets.filter((b) => b.round === bracket.round);
    const roundComplete = roundMatches.every((m) => m.status === 'completed');

    if (roundComplete) {
      if (tournament.currentRound < tournament.totalRounds) {
        this.advanceToNextRound(tournament, brackets);
      } else {
        this.completeTournament(tournament, brackets);
      }
    }

    return { success: true, message: 'Result recorded.' };
  }

  async renderTournamentHub(userId: string) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Tournament Hub')
      .setDescription('Compete for glory, rewards, and eternal bragging rights!')
      .setColor(0xffd700);

    const active = Array.from(this.activeTournaments.values());

    if (!active.length) {
      embed.addFields({ name: 'No active tournaments', value: 'Check back soon!', inline: false });
    } else {
      for (const tournament of active) {
        const registrations = this.registrations.get(tournament.id) || new Set<string>();
        const statusLine =
          tournament.status === 'registration'
            ? `📝 Registration Open (${registrations.size}/${tournament.maxParticipants})`
            : `🏆 Round ${tournament.currentRound}/${tournament.totalRounds}`;

        const entryFeeParts = [] as string[];
        if (tournament.entryFee.coins) entryFeeParts.push(`${tournament.entryFee.coins} Coins`);
        if (tournament.entryFee.gems) entryFeeParts.push(`${tournament.entryFee.gems} Gems`);
        if (tournament.entryFee.fragments) entryFeeParts.push(`${tournament.entryFee.fragments} Fragments`);

        embed.addFields({
          name: tournament.name,
          value: [
            statusLine,
            `Format: ${tournament.format}`,
            `Entry: ${entryFeeParts.join(', ') || 'Free'}`,
            `Starts: <t:${Math.floor(tournament.startTime / 1000)}:R>`,
          ].join('\n'),
          inline: true,
        });
      }
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('tournament:select')
      .setPlaceholder('Select a tournament...')
      .addOptions(
        active.map((t) => ({
          label: t.name,
          description: `${t.format} — ${t.status.replace('_', ' ')}`,
          value: t.id,
        }))
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tournament:create')
        .setLabel('Create Tournament')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tournament:history')
        .setLabel('My History')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tournament:leaderboard')
        .setLabel('Global Leaderboard')
        .setEmoji('🏆')
        .setStyle(ButtonStyle.Secondary)
    );

    const components = active.length
      ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu), buttons]
      : [buttons];

    return { embeds: [embed], components };
  }

  async handleButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('tournament:')) {
      return false;
    }

    const [, action, arg] = interaction.customId.split(':');

    if (action === 'create') {
      const start = Date.now() + 60 * 60 * 1000;
      const tournament = this.createTournament({
        name: `Community Cup ${new Date().toLocaleDateString()}`,
        format: 'single_elimination',
        maxParticipants: 16,
        startTime: start,
      });

      await interaction.reply({
        ephemeral: true,
        content: `✅ Tournament **${tournament.name}** created. Registrations are open!`,
      });
      return true;
    }

    if (action === 'history') {
      const history = this.getUserTournamentHistory(interaction.user.id);
      if (!history.length) {
        await interaction.reply({
          ephemeral: true,
          content: 'You have not participated in any tournaments yet.',
        });
        return true;
      }

      const embed = new EmbedBuilder()
        .setTitle('📜 Tournament History')
        .setColor(0x3498db);

      for (const row of history) {
        embed.addFields({
          name: row.name,
          value: `Status: ${row.status}\nPlacement: ${row.placement ?? '—'}`,
          inline: false,
        });
      }

      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return true;
    }

    if (action === 'leaderboard') {
      const leaderboard = this.getGlobalLeaderboard();
      const embed = new EmbedBuilder()
        .setTitle('🏆 Tournament Champions')
        .setDescription(
          leaderboard
            .map(
              (entry, index) =>
                `**${index + 1}.** <@${entry.user_id}> — ${entry.championships} championships`
            )
            .join('\n') || 'No champions yet.'
        )
        .setColor(0xe67e22);

      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return true;
    }

    if (action === 'register' && arg) {
      const result = this.registerPlayer(arg, interaction.user.id);
      await interaction.reply({ ephemeral: true, content: result.message });
      return true;
    }

    if (action === 'start' && arg) {
      const result = this.startTournament(arg);
      await interaction.reply({ ephemeral: true, content: result.message });
      return true;
    }

    if (action === 'view' && arg) {
      const detail = this.renderTournamentDetail(arg, interaction.user.id);
      await interaction.reply({ ephemeral: true, ...detail });
      return true;
    }

    return false;
  }

  async handleSelectMenu(interaction: StringSelectMenuInteraction) {
    if (interaction.customId !== 'tournament:select') {
      return false;
    }

    const [tournamentId] = interaction.values;
    const detail = this.renderTournamentDetail(tournamentId, interaction.user.id);
    await interaction.reply({ ephemeral: true, ...detail });
    return true;
  }

  renderTournamentDetail(tournamentId: string, userId: string) {
    const tournament = this.activeTournaments.get(tournamentId);
    if (!tournament) {
      return {
        embeds: [new EmbedBuilder().setTitle('Tournament not found').setDescription('This event no longer exists.')],
      };
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏟️ ${tournament.name}`)
      .setDescription(`Format: **${tournament.format}**`)
      .addFields(
        { name: 'Status', value: tournament.status.replace('_', ' '), inline: true },
        {
          name: 'Registered',
          value: `${(this.registrations.get(tournamentId) || new Set()).size}/${tournament.maxParticipants}`,
          inline: true,
        },
        {
          name: 'Starts',
          value: `<t:${Math.floor(tournament.startTime / 1000)}:F>`,
          inline: true,
        }
      )
      .setColor(0x2ecc71);

    if (tournament.status !== 'registration') {
      const brackets = this.brackets.get(tournamentId) || [];
      const current = brackets.filter((b) => b.round === tournament.currentRound);
      if (current.length) {
        const lines = current.map((match) => {
          const p1 = match.player1 ? `<@${match.player1}>` : 'BYE';
          const p2 = match.player2 ? `<@${match.player2}>` : 'BYE';
          const score = `${match.scores.player1}-${match.scores.player2}`;
          const status =
            match.status === 'completed'
              ? match.winner
                ? `✅ <@${match.winner}>`
                : '✅ Completed'
              : '⏳ Pending';
          return `${match.matchId}: ${p1} vs ${p2} — ${score} ${status}`;
        });
        embed.addFields({ name: `Round ${tournament.currentRound}`, value: lines.join('\n') });
      }
    }

    const registrations = this.registrations.get(tournamentId) || new Set<string>();
    const userRegistered = registrations.has(userId);

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    if (tournament.status === 'registration') {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`tournament:register:${tournament.id}`)
          .setLabel(userRegistered ? 'Registered' : 'Register')
          .setStyle(userRegistered ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(userRegistered)
      );
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`tournament:start:${tournament.id}`)
          .setLabel('Start Tournament')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`tournament:view:${tournament.id}`)
          .setLabel('Refresh Overview')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    return { embeds: [embed], components: [buttons] };
  }

  getUserTournamentHistory(userId: string, limit = 10) {
    return db
      .prepare(
        `SELECT t.*, tp.placement
         FROM tournaments t
         LEFT JOIN tournament_prizes tp ON tp.tournament_id = t.tournament_id AND tp.user_id = ?
         WHERE t.tournament_id IN (
           SELECT tournament_id FROM tournament_registrations WHERE user_id = ?
         )
         ORDER BY COALESCE(t.end_time, t.start_time) DESC
         LIMIT ?`
      )
      .all(userId, userId, limit) as any[];
  }

  getGlobalLeaderboard(limit = 10) {
    return db
      .prepare(
        `SELECT user_id, COUNT(*) AS championships
         FROM tournament_prizes
         WHERE placement='champion'
         GROUP BY user_id
         ORDER BY championships DESC
         LIMIT ?`
      )
      .all(limit) as Array<{ user_id: string; championships: number }>;
  }

  private calculateTotalRounds(format: TournamentFormat, participants: number) {
    if (format === 'single_elimination' || format === 'double_elimination' || format === 'swiss') {
      return Math.ceil(Math.log2(Math.max(participants, 2)));
    }
    if (format === 'round_robin') {
      return Math.max(participants - 1, 1);
    }
    return 1;
  }

  private generateBrackets(tournament: Tournament, players: string[]): Bracket[] {
    const brackets: Bracket[] = [];

    if (tournament.format === 'single_elimination') {
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));

      while (shuffled.length < bracketSize) {
        shuffled.push(null as any);
      }

      for (let i = 0; i < shuffled.length; i += 2) {
        const player1 = shuffled[i];
        const player2 = shuffled[i + 1];

        const bracket: Bracket = {
          tournamentId: tournament.id,
          round: 1,
          matchId: `${tournament.id}_R1_M${Math.floor(i / 2)}`,
          player1,
          player2,
          winner: null,
          loser: null,
          scores: { player1: 0, player2: 0 },
          status: player2 ? 'pending' : 'completed',
        };

        if (!player2) {
          bracket.winner = player1;
        }

        brackets.push(bracket);
      }
    } else if (tournament.format === 'round_robin') {
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          brackets.push({
            tournamentId: tournament.id,
            round: 1,
            matchId: `${tournament.id}_RR_${i}_${j}`,
            player1: players[i],
            player2: players[j],
            winner: null,
            loser: null,
            scores: { player1: 0, player2: 0 },
            status: 'pending',
          });
        }
      }
    }

    return brackets;
  }

  private advanceToNextRound(tournament: Tournament, brackets: Bracket[]) {
    const winners = brackets
      .filter((b) => b.round === tournament.currentRound)
      .map((b) => b.winner)
      .filter((winner): winner is string => Boolean(winner));

    if (!winners.length) {
      return;
    }

    const nextRound = tournament.currentRound + 1;
    const nextBrackets: Bracket[] = [];

    for (let i = 0; i < winners.length; i += 2) {
      const bracket: Bracket = {
        tournamentId: tournament.id,
        round: nextRound,
        matchId: `${tournament.id}_R${nextRound}_M${Math.floor(i / 2)}`,
        player1: winners[i] ?? null,
        player2: winners[i + 1] ?? null,
        winner: null,
        loser: null,
        scores: { player1: 0, player2: 0 },
        status: winners[i + 1] ? 'pending' : 'completed',
      };

      if (!bracket.player2) {
        bracket.winner = bracket.player1;
      }

      nextBrackets.push(bracket);
      brackets.push(bracket);

      db.prepare(
        `INSERT INTO tournament_brackets (
           tournament_id, round, match_id, player1_id, player2_id, status, scores_json, created_at
         ) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        bracket.tournamentId,
        bracket.round,
        bracket.matchId,
        bracket.player1,
        bracket.player2,
        bracket.status,
        JSON.stringify(bracket.scores),
        Date.now()
      );
    }

    tournament.currentRound = nextRound;
    db.prepare(`UPDATE tournaments SET current_round=?, updated_at=? WHERE tournament_id=?`).run(
      nextRound,
      Date.now(),
      tournament.id
    );
  }

  private completeTournament(tournament: Tournament, brackets: Bracket[]) {
    tournament.status = 'completed';
    tournament.endTime = Date.now();

    const finalRound = brackets.filter((b) => b.round === tournament.totalRounds);
    const finalMatch = finalRound[0];
    const champion = finalMatch?.winner;
    const runnerUp = finalMatch?.loser;
    const previousRound = brackets.filter((b) => b.round === tournament.totalRounds - 1);
    const thirdPlace = previousRound
      .map((b) => b.loser)
      .filter((player) => player && player !== runnerUp)[0];

    if (champion) this.awardPrizes(champion, tournament.prizes.first, tournament.id, 'champion');
    if (runnerUp) this.awardPrizes(runnerUp, tournament.prizes.second, tournament.id, 'runner_up');
    if (thirdPlace)
      this.awardPrizes(thirdPlace, tournament.prizes.third, tournament.id, 'third_place');

    const participants = this.registrations.get(tournament.id) || new Set<string>();
    for (const participant of participants) {
      this.awardPrizes(participant, tournament.prizes.participation, tournament.id, 'participation');

      const roundsPlayed = brackets.filter(
        (b) => b.status === 'completed' && (b.player1 === participant || b.player2 === participant)
      ).length;

      for (const milestone of tournament.prizes.milestones) {
        if (roundsPlayed >= milestone.rounds) {
          this.awardPrizes(
            participant,
            milestone.rewards,
            tournament.id,
            `milestone_${milestone.rounds}`
          );
        }
      }
    }

    db.prepare(
      `UPDATE tournaments SET status='completed', end_time=?, updated_at=? WHERE tournament_id=?`
    ).run(tournament.endTime, Date.now(), tournament.id);

    this.activeTournaments.delete(tournament.id);
  }

  private checkEligibility(userId: string, tournament: Tournament) {
    const profile = db
      .prepare(`SELECT level, selected_role FROM profiles WHERE user_id=?`)
      .get(userId) as { level: number; selected_role: string } | undefined;

    if (!profile) {
      return { eligible: false, reason: 'Player profile not found.' };
    }

    if (profile.level < tournament.rules.levelRange.min) {
      return { eligible: false, reason: `Minimum level ${tournament.rules.levelRange.min} required.` };
    }

    if (profile.level > tournament.rules.levelRange.max) {
      return { eligible: false, reason: `Maximum level ${tournament.rules.levelRange.max} exceeded.` };
    }

    if (!tournament.rules.allowedClasses.includes(profile.selected_role)) {
      return { eligible: false, reason: 'Your role is not eligible for this event.' };
    }

    const banned = db
      .prepare(
        `SELECT 1 FROM tournament_bans WHERE user_id=? AND (expires_at IS NULL OR expires_at > ?)`
      )
      .get(userId, Date.now());

    if (banned) {
      return { eligible: false, reason: 'You are banned from tournaments.' };
    }

    return { eligible: true };
  }

  private payEntryFee(
    userId: string,
    fee: { coins?: number; gems?: number; fragments?: number }
  ) {
    const profile = db
      .prepare(`SELECT coins, gems, fragments FROM profiles WHERE user_id=?`)
      .get(userId) as { coins: number; gems: number; fragments: number } | undefined;

    if (!profile) return false;

    if (fee.coins && profile.coins < fee.coins) return false;
    if (fee.gems && profile.gems < fee.gems) return false;
    if (fee.fragments && profile.fragments < fee.fragments) return false;

    if (fee.coins) {
      db.prepare(`UPDATE profiles SET coins=coins-? WHERE user_id=?`).run(fee.coins, userId);
    }
    if (fee.gems) {
      db.prepare(`UPDATE profiles SET gems=gems-? WHERE user_id=?`).run(fee.gems, userId);
    }
    if (fee.fragments) {
      db.prepare(`UPDATE profiles SET fragments=fragments-? WHERE user_id=?`).run(
        fee.fragments,
        userId
      );
    }

    return true;
  }

  private awardPrizes(
    userId: string,
    prizes: Effect[],
    tournamentId: string,
    placement: string
  ) {
    if (!prizes.length) return;
    const state: any = {
      _coins: {},
      _xp: {},
      _fragments: {},
      _gems: {},
      _items: {},
    };

    applyEffects(prizes, state, userId);

    if (state._coins[userId]) {
      db.prepare(`UPDATE profiles SET coins=coins+? WHERE user_id=?`).run(state._coins[userId], userId);
    }
    if (state._xp[userId]) {
      db.prepare(`UPDATE profiles SET xp=xp+? WHERE user_id=?`).run(state._xp[userId], userId);
    }
    if (state._fragments[userId]) {
      db.prepare(`UPDATE profiles SET fragments=fragments+? WHERE user_id=?`).run(
        state._fragments[userId],
        userId
      );
    }
    if (state._gems[userId]) {
      db.prepare(`UPDATE profiles SET gems=gems+? WHERE user_id=?`).run(state._gems[userId], userId);
    }
    if (state._items[userId]) {
      for (const itemId of state._items[userId]) {
        db.prepare(
          `INSERT INTO inventories (user_id, item_id, kind, rarity, qty, meta_json)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(user_id, item_id) DO UPDATE SET qty=qty+excluded.qty`
        ).run(userId, itemId, 'tournament_prize', 'epic', 1, JSON.stringify({ tournamentId, placement }));
      }
    }

    db.prepare(
      `INSERT INTO tournament_prizes (tournament_id, user_id, placement, prizes_json, awarded_at)
       VALUES (?,?,?,?,?)`
    ).run(tournamentId, userId, placement, JSON.stringify(prizes), Date.now());
  }
}

export const tournamentManager = new TournamentManager();

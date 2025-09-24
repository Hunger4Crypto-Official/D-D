import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
} from 'discord.js';
import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { tournamentManager } from '../systems/tournament/tournamentManager.js';

interface TournamentConfig {
  name: string;
  format: 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss';
  maxParticipants: number;
  entryFee: { coins?: number; gems?: number; fragments?: number };
  startTime: number;
  duration: number; // minutes
  prizes: {
    first: { coins?: number; gems?: number; items?: string[] };
    second: { coins?: number; gems?: number; items?: string[] };
    third: { coins?: number; gems?: number; items?: string[] };
  };
}

const TOURNAMENT_PRESETS: Record<string, TournamentConfig> = {
  daily_clash: {
    name: 'Daily Clash',
    format: 'single_elimination',
    maxParticipants: 16,
    entryFee: { coins: 1000 },
    startTime: Date.now() + 30 * 60 * 1000, // 30 minutes
    duration: 120,
    prizes: {
      first: { coins: 10000, items: ['tournament_crown'] },
      second: { coins: 5000, items: ['tournament_medal'] },
      third: { coins: 2500, items: ['tournament_badge'] }
    }
  },
  weekend_warrior: {
    name: 'Weekend Warrior Championship',
    format: 'double_elimination',
    maxParticipants: 32,
    entryFee: { coins: 2500, fragments: 25 },
    startTime: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    duration: 180,
    prizes: {
      first: { coins: 50000, gems: 100, items: ['legendary_weapon', 'champion_title'] },
      second: { coins: 25000, gems: 50, items: ['epic_armor'] },
      third: { coins: 12500, gems: 25, items: ['rare_trinket'] }
    }
  },
  grand_masters: {
    name: 'Grand Masters Tournament',
    format: 'swiss',
    maxParticipants: 64,
    entryFee: { gems: 50, fragments: 100 },
    startTime: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    duration: 300,
    prizes: {
      first: { coins: 100000, gems: 500, items: ['mythic_artifact', 'grandmaster_title', 'eternal_flame'] },
      second: { coins: 50000, gems: 250, items: ['legendary_set_piece'] },
      third: { coins: 25000, gems: 125, items: ['epic_mount'] }
    }
  }
};

export class TournamentInterface {
  private activeTournaments = new Map<string, any>();
  
  async handleTournamentCommand(message: any, args: string[]) {
    const subcommand = args[0]?.toLowerCase() || 'list';
    
    switch (subcommand) {
      case 'list':
        return this.showTournamentList(message);
      case 'create':
        return this.showTournamentCreator(message, args[1]);
      case 'join':
        return this.joinTournament(message, args[1]);
      case 'bracket':
        return this.showBracket(message, args[1]);
      case 'schedule':
        return this.showSchedule(message);
      default:
        return this.showTournamentHelp(message);
    }
  }

  private async showTournamentList(message: any) {
    const active = await this.getActiveTournaments();
    const upcoming = await this.getUpcomingTournaments();
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Tournament Central')
      .setDescription('Compete for glory, prizes, and eternal bragging rights!')
      .setColor(0xffd700);

    if (active.length > 0) {
      const activeList = active.map(t => 
        `**${t.name}** - Round ${t.current_round}/${t.total_rounds}\n` +
        `⏱️ Started <t:${Math.floor(t.start_time / 1000)}:R> | ${t.participants} players`
      ).join('\n\n');
      embed.addFields({ name: '🔥 Active Tournaments', value: activeList, inline: false });
    }

    if (upcoming.length > 0) {
      const upcomingList = upcoming.map(t => 
        `**${t.name}** (${t.format})\n` +
        `🕒 Starts <t:${Math.floor(t.start_time / 1000)}:R>\n` +
        `💰 Entry: ${this.formatCost(t.entry_fee)}\n` +
        `👥 ${t.registered}/${t.max_participants} registered`
      ).join('\n\n');
      embed.addFields({ name: '📅 Upcoming Tournaments', value: upcomingList, inline: false });
    }

    if (active.length === 0 && upcoming.length === 0) {
      embed.addFields({ 
        name: '😴 No Active Tournaments', 
        value: 'Use the buttons below to create or schedule new tournaments!', 
        inline: false 
      });
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('tournament:create:quick')
          .setLabel('Quick Tournament')
          .setEmoji('⚡')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('tournament:create:custom')
          .setLabel('Custom Tournament')
          .setEmoji('🔧')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('tournament:schedule')
          .setLabel('Tournament Schedule')
          .setEmoji('📅')
          .setStyle(ButtonStyle.Secondary)
      );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('tournament:join')
      .setPlaceholder('Join a tournament...')
      .addOptions(
        upcoming.map(t => ({
          label: t.name,
          description: `${t.format} | Entry: ${this.formatCost(t.entry_fee)} | ${t.registered}/${t.max_participants}`,
          value: t.tournament_id,
          emoji: this.getTournamentEmoji(t.format)
        }))
      );

    const components = upcoming.length > 0 ? 
      [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu), buttons] : 
      [buttons];

    return message.reply({ embeds: [embed], components });
  }

  private async showTournamentCreator(message: any, preset?: string) {
    if (preset && TOURNAMENT_PRESETS[preset]) {
      return this.createTournamentFromPreset(message, preset);
    }

    const embed = new EmbedBuilder()
      .setTitle('🏗️ Tournament Creator')
      .setDescription('Choose a tournament format to get started!')
      .setColor(0x00ff7f);

    Object.entries(TOURNAMENT_PRESETS).forEach(([key, config]) => {
      embed.addFields({
        name: `${this.getTournamentEmoji(config.format)} ${config.name}`,
        value: [
          `**Format:** ${config.format.replace('_', ' ')}`,
          `**Players:** ${config.maxParticipants}`,
          `**Entry:** ${this.formatCost(config.entryFee)}`,
          `**Duration:** ${config.duration} minutes`,
          `**1st Prize:** ${this.formatPrize(config.prizes.first)}`
        ].join('\n'),
        inline: true
      });
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('tournament:create:preset')
      .setPlaceholder('Choose tournament type...')
      .addOptions(
        Object.entries(TOURNAMENT_PRESETS).map(([key, config]) => ({
          label: config.name,
          description: `${config.format} | ${config.maxParticipants} players | ${config.duration}min`,
          value: key,
          emoji: this.getTournamentEmoji(config.format)
        }))
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('tournament:create:advanced')
          .setLabel('Advanced Creator')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Primary)
      );

    return message.reply({ 
      embeds: [embed], 
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
        buttons
      ] 
    });
  }

  private async createTournamentFromPreset(message: any, presetKey: string) {
    const config = TOURNAMENT_PRESETS[presetKey];
    if (!config) return;

    // Check if user has permission (guild admin or tournament organizer role)
    if (!this.canCreateTournament(message.member)) {
      return message.reply('❌ You need tournament organizer permissions to create tournaments.');
    }

    try {
      const tournament = tournamentManager.createTournament({
        name: config.name,
        format: config.format,
        maxParticipants: config.maxParticipants,
        startTime: config.startTime,
        entryFee: config.entryFee,
        prizes: {
          first: this.convertPrizesToEffects(config.prizes.first),
          second: this.convertPrizesToEffects(config.prizes.second),
          third: this.convertPrizesToEffects(config.prizes.third),
          participation: [{ type: 'xp', value: 100 }],
          milestones: []
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🎉 Tournament Created!')
        .setDescription(`**${tournament.name}** is now accepting registrations!`)
        .setColor(0x00ff00)
        .addFields(
          { name: 'Format', value: tournament.format.replace('_', ' '), inline: true },
          { name: 'Max Players', value: tournament.maxParticipants.toString(), inline: true },
          { name: 'Entry Fee', value: this.formatCost(tournament.entryFee), inline: true },
          { name: 'Starts', value: `<t:${Math.floor(tournament.startTime / 1000)}:F>`, inline: false },
          { name: 'Prizes', value: this.formatAllPrizes(config.prizes), inline: false }
        );

      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`tournament:join:${tournament.id}`)
            .setLabel('Join Tournament')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`tournament:share:${tournament.id}`)
            .setLabel('Share')
            .setEmoji('📢')
            .setStyle(ButtonStyle.Secondary)
        );

      // Schedule auto-start
      this.scheduleAutoStart(tournament.id, tournament.startTime, message.channel as TextChannel);

      return message.reply({ embeds: [embed], components: [buttons] });

    } catch (error) {
      console.error('Failed to create tournament:', error);
      return message.reply('❌ Failed to create tournament. Please try again.');
    }
  }

  private async joinTournament(message: any, tournamentId?: string) {
    if (!tournamentId) {
      return message.reply('❌ Please specify a tournament ID or use the tournament menu.');
    }

    const result = tournamentManager.registerPlayer(tournamentId, message.author.id);
    
    if (!result.success) {
      return message.reply(`❌ ${result.message}`);
    }

    // Check if tournament is now full and should auto-start
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament && this.isTournamentFull(tournament)) {
      this.autoStartTournament(tournamentId, message.channel as TextChannel);
    }

    return message.reply(`✅ ${result.message}`);
  }

  private async showBracket(message: any, tournamentId?: string) {
    if (!tournamentId) {
      return message.reply('❌ Please specify a tournament ID.');
    }

    const bracket = await this.generateBracketDisplay(tournamentId);
    if (!bracket) {
      return message.reply('❌ Tournament not found or bracket not available.');
    }

    return message.reply({ embeds: [bracket.embed], components: bracket.components || [] });
  }

  private async generateBracketDisplay(tournamentId: string) {
    const tournament = tournamentManager.getTournament(tournamentId);
    const brackets = tournamentManager.getBrackets(tournamentId);
    
    if (!tournament || !brackets.length) return null;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name} - Tournament Bracket`)
      .setDescription(`${tournament.format.replace('_', ' ')} | Round ${tournament.currentRound}`)
      .setColor(0xffd700);

    // Group matches by round
    const roundMatches = new Map<number, any[]>();
    brackets.forEach(match => {
      if (!roundMatches.has(match.round)) {
        roundMatches.set(match.round, []);
      }
      roundMatches.get(match.round)!.push(match);
    });

    // Display current round prominently
    const currentRoundMatches = roundMatches.get(tournament.currentRound) || [];
    if (currentRoundMatches.length > 0) {
      const matchList = currentRoundMatches.map(match => {
        const p1 = match.player1 ? `<@${match.player1}>` : 'BYE';
        const p2 = match.player2 ? `<@${match.player2}>` : 'BYE';
        const status = match.status === 'completed' 
          ? `Winner: <@${match.winner}>` 
          : match.status === 'in_progress'
          ? '⏳ In Progress'
          : '⏳ Pending';
        
        return `**${match.matchId}:** ${p1} vs ${p2}\n${status}`;
      }).join('\n\n');

      embed.addFields({
        name: `⚔️ Round ${tournament.currentRound} Matches`,
        value: matchList || 'No matches scheduled',
        inline: false
      });
    }

    // Show completed rounds summary
    for (let round = 1; round < tournament.currentRound; round++) {
      const matches = roundMatches.get(round) || [];
      if (matches.length > 0) {
        const winners = matches
          .filter(m => m.winner)
          .map(m => `<@${m.winner}>`)
          .join(', ');
        
        embed.ad

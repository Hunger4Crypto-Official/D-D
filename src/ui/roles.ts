import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import db from '../persistence/db.js';
import { startRun } from '../engine/orchestrator.js';

interface Role {
  id: string;
  name: string;
  description: string;
  emoji: string;
  banter_key: string;
}

export const AVAILABLE_ROLES: Role[] = [
  {
    id: 'dev',
    name: 'Dev Wizard',
    description: 'See the code beneath reality. Master of logic and systems.',
    emoji: '🧙‍♂️',
    banter_key: 'dev',
  },
  {
    id: 'trader',
    name: 'Market Trader',
    description: 'Navigate volatility with precision. Risk and reward specialist.',
    emoji: '📈',
    banter_key: 'trader',
  },
  {
    id: 'validator',
    name: 'Consensus Keeper',
    description: 'Maintain order and integrity. Guardian of the network.',
    emoji: '⚖️',
    banter_key: 'validator',
  },
  {
    id: 'hacker',
    name: 'Edge Walker',
    description: 'Find exploits in any system. Master of unconventional solutions.',
    emoji: '🔓',
    banter_key: 'hacker',
  },
  {
    id: 'whale',
    name: 'Deep Pocket',
    description: 'Move markets with presence alone. Influence through weight.',
    emoji: '🐋',
    banter_key: 'whale',
  },
  {
    id: 'miner',
    name: 'Block Forger',
    description: 'Turn computation into consensus. Builder of the chain.',
    emoji: '⛏️',
    banter_key: 'miner',
  },
  {
    id: 'shiller',
    name: 'Hype Architect',
    description: 'Craft narratives that move crowds. Master of momentum.',
    emoji: '📢',
    banter_key: 'shiller',
  },
  {
    id: 'meme',
    name: 'Meme Lord',
    description: 'Weaponize culture and humor. Chaos with purpose.',
    emoji: '🎭',
    banter_key: 'meme',
  },
];

export const ROLE_SCHEMA_UPDATES = `
-- Add role tracking to profiles
ALTER TABLE profiles ADD COLUMN selected_role TEXT DEFAULT NULL;

-- Track multiple concurrent runs per user
CREATE TABLE IF NOT EXISTS user_runs (
  user_id TEXT,
  run_id TEXT,
  role_id TEXT,
  scene_id TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY(user_id, run_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_runs_status ON user_runs(user_id, status);
`;

export async function showRoleSelection(user_id: string, for_tutorial = false) {
  const userRuns = getUserActiveRuns(user_id);
  const currentRole = getCurrentRole(user_id);

  let description = for_tutorial
    ? '🎭 **Choose Your Role for Tutorial**\nEach role experiences the story differently with unique dialogue and options.\n\n'
    : '🎭 **Role Selection**\nYour role affects dialogue, available actions, and story perspective.\n\n';

  if (currentRole?.selected_role) {
    const role = getRoleById(currentRole.selected_role);
    if (role) {
      description += `**Current Role**: ${role.emoji} ${role.name}\n\n`;
    }
  }

  if (userRuns.length > 0) {
    description += `**Active Games**: ${userRuns.length}\n`;
    userRuns.forEach((run) => {
      const role = getRoleById(run.role_id);
      description += `• ${role?.emoji ?? '🎲'} Scene ${run.scene_id} (${role?.name ?? 'Unknown'})\n`;
    });
    description += '\n';
  }

  description += '**Available Roles**:\n';

  const embed = new EmbedBuilder()
    .setTitle('🎭 Role Selection')
    .setDescription(description)
    .setColor(0x5b8cff);

  AVAILABLE_ROLES.forEach((role) => {
    embed.addFields({
      name: `${role.emoji} ${role.name}`,
      value: role.description,
      inline: true,
    });
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(for_tutorial ? 'role:select:tutorial' : 'role:select:main')
    .setPlaceholder('Choose your role...')
    .addOptions(
      AVAILABLE_ROLES.map((role) => ({
        label: role.name,
        description: role.description.slice(0, 100),
        value: role.id,
        emoji: role.emoji,
      }))
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId('role:tutorial:replay')
      .setLabel('🔄 Replay Tutorial')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('role:games:list')
      .setLabel('📋 My Games')
      .setStyle(ButtonStyle.Primary),
  ];

  if (userRuns.length > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('role:resume:select')
        .setLabel('▶️ Resume Game')
        .setStyle(ButtonStyle.Success)
    );
  }

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  return { embeds: [embed], components: [row1, row2] };
}

export function handleRoleSelection(customId: string, user_id: string, values?: string[]) {
  const parts = customId.split(':');

  if (parts[0] !== 'role') return 'Unknown role action.';

  if (parts[1] === 'select') {
    const roleId = values?.[0];
    if (!roleId) return '❌ No role selected.';

    const role = getRoleById(roleId);
    if (!role) return '❌ Invalid role.';

    db.prepare('UPDATE profiles SET selected_role=? WHERE user_id=?').run(roleId, user_id);

    if (parts[2] === 'tutorial') {
      startRoleBasedRun(user_id, roleId, '1.1', { is_tutorial: true });
      return `🎭 **Tutorial Started**\nYou are now playing as **${role.emoji} ${role.name}**!\n\nThe tutorial will show you unique dialogue and choices for this role.`;
    }

    return `🎭 **Role Selected**\nYou are now **${role.emoji} ${role.name}**!\n\nYour role will affect dialogue and available actions in all future games.`;
  }

  if (parts[1] === 'tutorial' && parts[2] === 'replay') {
    const currentRole = getCurrentRole(user_id);
    if (!currentRole?.selected_role) {
      return '❌ Please select a role first.';
    }

    startRoleBasedRun(user_id, currentRole.selected_role, '1.1', { is_tutorial: true });
    const role = getRoleById(currentRole.selected_role);
    return `🔄 **Tutorial Restarted**\nPlaying as ${role?.emoji ?? '🎭'} ${role?.name ?? 'Unknown'}`;
  }

  if (parts[1] === 'games' && parts[2] === 'list') {
    return showUserGames(user_id);
  }

  if (parts[1] === 'resume' && parts[2] === 'select') {
    const runs = getUserActiveRuns(user_id);
    if (runs.length === 0) {
      return '❌ No active games to resume.';
    }
    const lines = runs
      .map((run, index) => {
        const role = getRoleById(run.role_id);
        const channelLabel = /^\d+$/.test(run.channel_id) ? `<#${run.channel_id}>` : run.channel_id;
        return `• **${index + 1}.** ${role?.emoji ?? '🎲'} Scene ${run.current_scene_id} — visit ${channelLabel} and use !resume ${
          index + 1
        }`;
      })
      .join('\n');
    return `▶️ **Resume Games**\n${lines}`;
  }

  return 'Unknown role action.';
}

export function startRoleBasedRun(
  user_id: string,
  role_id: string,
  scene_id: string,
  options: { is_tutorial?: boolean; guild_id?: string; channel_id?: string } = {}
): string {
  const guild_id = options.guild_id ?? (options.is_tutorial ? 'tutorial' : 'solo');
  const channel_id = options.channel_id ?? `${guild_id}:${user_id}`;
  const run_id = startRun(guild_id, channel_id, [user_id], 'genesis', scene_id);

  db.prepare(
    `
    INSERT INTO user_runs (user_id, run_id, role_id, scene_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(user_id, run_id, role_id, scene_id, 'active', Date.now(), Date.now());

  return run_id;
}

export interface ActiveRunSummary {
  run_id: string;
  role_id: string;
  scene_id: string;
  status: string;
  created_at: number;
  updated_at: number;
  current_scene_id: string;
  round_id: string;
  channel_id: string;
  guild_id: string;
}

export function getUserActiveRuns(user_id: string): ActiveRunSummary[] {
  return db
    .prepare(
      `
    SELECT ur.*, r.scene_id as current_scene_id, r.round_id, r.channel_id, r.guild_id
    FROM user_runs ur
    JOIN runs r ON ur.run_id = r.run_id
    WHERE ur.user_id = ? AND ur.status = 'active'
    ORDER BY ur.updated_at DESC
  `
    )
    .all(user_id) as ActiveRunSummary[];
}

export function getCurrentRole(user_id: string) {
  return db
    .prepare('SELECT selected_role FROM profiles WHERE user_id=?')
    .get(user_id) as { selected_role?: string } | undefined;
}

export function getRoleById(role_id: string): Role | undefined {
  return AVAILABLE_ROLES.find((r) => r.id === role_id);
}

export function showUserGames(user_id: string): string {
  const runs = getUserActiveRuns(user_id);

  if (runs.length === 0) {
    return '📋 **Your Games**\nNo active games. Start a new game or replay the tutorial!';
  }

  let response = '📋 **Your Active Games**\n\n';
  runs.forEach((run, index) => {
    const role = getRoleById(run.role_id);
    const channelLabel = /^\d+$/.test(run.channel_id) ? `<#${run.channel_id}>` : run.channel_id;
    response += `**${index + 1}.** ${role?.emoji ?? '🎲'} Scene ${run.current_scene_id}\n`;
    response += `   Role: ${role?.name ?? 'Unknown'}\n`;
    response += `   Progress: ${run.round_id}\n`;
    response += `   Channel: ${channelLabel}\n`;
    response += `   Started: <t:${Math.floor(run.created_at / 1000)}:R>\n\n`;
  });

  response += 'Use **Resume Game** or `!resume <number>` in the run channel to continue where you left off!';
  return response;
}

export function getRoleBanter(action: any, role_id: string): string | undefined {
  const role = getRoleById(role_id);
  if (!role || !action?.banter) return undefined;
  return action.banter[role.banter_key];
}

export function joinGameWithRole(user_id: string, scene_id: string, guild_id: string, channel_id: string) {
  const currentRole = getCurrentRole(user_id);

  if (!currentRole?.selected_role) {
    return {
      success: false,
      message: '❌ Please select a role first using the role selection menu.',
    };
  }

  const existingRun = db
    .prepare(
      `
    SELECT run_id FROM user_runs
    WHERE user_id = ? AND scene_id = ? AND status = 'active'
  `
    )
    .get(user_id, scene_id) as { run_id: string } | undefined;

  if (existingRun) {
    return {
      success: false,
      message: `❌ You already have an active game in Scene ${scene_id}. Resume it instead!`,
    };
  }

  const run_id = startRoleBasedRun(user_id, currentRole.selected_role, scene_id, {
    guild_id,
    channel_id,
  });
  const role = getRoleById(currentRole.selected_role);

  return {
    success: true,
    message: `🎮 **Game Started**\nScene ${scene_id} as ${role?.emoji ?? '🎭'} ${role?.name ?? 'Unknown'}`,
    run_id,
  };
}

export function completeTutorial(user_id: string, run_id: string) {
  db.prepare(
    `
    UPDATE user_runs
    SET status = 'completed', updated_at = ?
    WHERE user_id = ? AND run_id = ?
  `
  ).run(Date.now(), user_id, run_id);

  db.prepare('UPDATE profiles SET coins = coins + ? WHERE user_id = ?').run(500, user_id);
}

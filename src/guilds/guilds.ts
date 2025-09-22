import db from '../persistence/db.js';
import { nanoid } from 'nanoid';

export interface PlayerGuildRecord {
  guild_id: string;
  owner_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface GuildMemberRecord {
  guild_id: string;
  user_id: string;
  role: 'owner' | 'officer' | 'member';
  joined_at: number;
}

export interface GuildInviteRecord {
  invite_id: string;
  guild_id: string;
  inviter_id: string | null;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: number;
  responded_at: number | null;
}

export interface RaidDefinition {
  id: string;
  name: string;
  content_id: string;
  scene_id: string;
  min_party: number;
  max_party: number;
  description: string;
  aliases: string[];
}

const RAID_LIBRARY: RaidDefinition[] = [
  {
    id: 'custodians_vault',
    name: "Custodian's Vault",
    content_id: 'genesis',
    scene_id: '3.1',
    min_party: 3,
    max_party: 8,
    description: "A high-stakes incursion into the Custodian's inner vaults.",
    aliases: ["custodian's vault", 'custodians vault', 'vault'],
  },
];

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function ensureUserRecord(user_id: string) {
  const user = db.prepare('SELECT user_id FROM users WHERE user_id=?').get(user_id);
  if (!user) {
    const now = Date.now();
    db.prepare('INSERT INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(user_id, user_id, now);
    db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?, ?, ?)').run(user_id, 0, 0);
  } else {
    const profile = db.prepare('SELECT user_id FROM profiles WHERE user_id=?').get(user_id);
    if (!profile) {
      db.prepare('INSERT INTO profiles (user_id, coins, gems) VALUES (?, ?, ?)').run(user_id, 0, 0);
    }
  }
}

export function getGuildById(guild_id: string): PlayerGuildRecord | undefined {
  return db
    .prepare('SELECT guild_id, owner_id, name, created_at, updated_at FROM player_guilds WHERE guild_id=?')
    .get(guild_id) as PlayerGuildRecord | undefined;
}

export function getGuildByName(name: string): PlayerGuildRecord | undefined {
  return db
    .prepare('SELECT guild_id, owner_id, name, created_at, updated_at FROM player_guilds WHERE lower(name)=lower(?)')
    .get(name) as PlayerGuildRecord | undefined;
}

type MembershipRow = GuildMemberRecord & {
  owner_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
};

export function getMembership(user_id: string): (GuildMemberRecord & { guild: PlayerGuildRecord }) | undefined {
  const row = db
    .prepare(
      `SELECT pg.guild_id, pg.owner_id, pg.name, pg.created_at, pg.updated_at, gm.user_id, gm.role, gm.joined_at
       FROM player_guild_members gm
       JOIN player_guilds pg ON pg.guild_id = gm.guild_id
       WHERE gm.user_id = ?`
    )
    .get(user_id) as MembershipRow | undefined;
  if (!row) return undefined;
  return {
    guild_id: row.guild_id,
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at,
    guild: {
      guild_id: row.guild_id,
      owner_id: row.owner_id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

export function listGuildMembers(guild_id: string): GuildMemberRecord[] {
  return db
    .prepare('SELECT guild_id, user_id, role, joined_at FROM player_guild_members WHERE guild_id=? ORDER BY joined_at ASC')
    .all(guild_id) as GuildMemberRecord[];
}

export function createPlayerGuild(owner_id: string, rawName: string) {
  const name = normalizeName(rawName);
  if (!name) {
    return { success: false, message: '❌ Provide a guild name.' };
  }
  if (name.length < 3 || name.length > 32) {
    return { success: false, message: '❌ Guild name must be between 3 and 32 characters.' };
  }
  const membership = getMembership(owner_id);
  if (membership) {
    return { success: false, message: '❌ You are already a member of a guild.' };
  }
  const existing = getGuildByName(name);
  if (existing) {
    return { success: false, message: '❌ A guild with that name already exists.' };
  }
  const guild_id = `pg_${nanoid(8)}`;
  const now = Date.now();
  db.prepare('INSERT INTO player_guilds (guild_id, owner_id, name, created_at, updated_at) VALUES (?,?,?,?,?)').run(
    guild_id,
    owner_id,
    name,
    now,
    now
  );
  db.prepare('INSERT INTO player_guild_members (guild_id, user_id, role, joined_at) VALUES (?,?,?,?)').run(
    guild_id,
    owner_id,
    'owner',
    now
  );
  return {
    success: true,
    guild: { guild_id, owner_id, name, created_at: now, updated_at: now },
    message: `🏰 **${name}** created! Invite allies with \`!guild invite @user\`.`,
  };
}

export function inviteMembersToGuild(inviter_id: string, invitee_ids: string[]) {
  if (!invitee_ids.length) {
    return { success: false, message: '❌ Mention at least one player to invite.' };
  }
  const membership = getMembership(inviter_id);
  if (!membership) {
    return { success: false, message: '❌ You must be in a guild to invite players.' };
  }
  if (membership.role !== 'owner' && membership.role !== 'officer') {
    return { success: false, message: '❌ Only guild owners or officers can invite players.' };
  }
  const members = listGuildMembers(membership.guild.guild_id);
  if (members.length >= 8) {
    return { success: false, message: '❌ This guild is already at the 8 member limit.' };
  }
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO player_guild_invites (invite_id, guild_id, inviter_id, invitee_id, status, created_at, responded_at)
     VALUES (?,?,?,?,?,?,NULL)`
  );
  const responses: string[] = [];
  for (const target of invitee_ids) {
    if (target === inviter_id) {
      responses.push('• Cannot invite yourself.');
      continue;
    }
    const existingMembership = getMembership(target);
    if (existingMembership) {
      responses.push(`• <@${target}> is already in a guild.`);
      continue;
    }
    const pending = db
      .prepare('SELECT invite_id FROM player_guild_invites WHERE guild_id=? AND invitee_id=? AND status="pending"')
      .get(membership.guild.guild_id, target);
    if (pending) {
      responses.push(`• <@${target}> already has a pending invite.`);
      continue;
    }
    const invite_id = `ginv_${nanoid(6)}`;
    stmt.run(invite_id, membership.guild.guild_id, inviter_id, target, 'pending', now);
    responses.push(`• Invited <@${target}>.`);
  }
  return {
    success: true,
    message: ['📨 Invites sent:', ...responses].join('\n'),
  };
}

export function listPendingInvites(user_id: string) {
  return db
    .prepare(
      `SELECT pi.invite_id, pi.guild_id, pi.inviter_id, pi.status, pi.created_at, pg.name
       FROM player_guild_invites pi
       JOIN player_guilds pg ON pg.guild_id = pi.guild_id
       WHERE pi.invitee_id=? AND pi.status='pending'
       ORDER BY pi.created_at DESC`
    )
    .all(user_id) as Array<GuildInviteRecord & { name: string }>;
}

export function acceptGuildInvite(user_id: string, guildName?: string) {
  const membership = getMembership(user_id);
  if (membership) {
    return { success: false, message: '❌ You are already a member of a guild.' };
  }
  const invites = listPendingInvites(user_id);
  if (!invites.length) {
    return { success: false, message: '❌ You have no pending guild invites.' };
  }
  let chosen = invites[0];
  if (guildName) {
    const normalized = guildName.trim().toLowerCase();
    const match = invites.find((inv) => inv.name.toLowerCase() === normalized);
    if (!match) {
      return { success: false, message: `❌ No invite found for guild "${guildName}".` };
    }
    chosen = match;
  }
  const members = listGuildMembers(chosen.guild_id);
  if (members.length >= 8) {
    db.prepare('UPDATE player_guild_invites SET status="declined", responded_at=? WHERE invite_id=?').run(
      Date.now(),
      chosen.invite_id
    );
    return { success: false, message: '❌ That guild is already full.' };
  }
  const now = Date.now();
  db.prepare('INSERT INTO player_guild_members (guild_id, user_id, role, joined_at) VALUES (?,?,?,?)').run(
    chosen.guild_id,
    user_id,
    'member',
    now
  );
  db.prepare('UPDATE player_guild_invites SET status="accepted", responded_at=? WHERE invite_id=?').run(
    now,
    chosen.invite_id
  );
  const guild = getGuildById(chosen.guild_id)!;
  return {
    success: true,
    guild,
    message: `✅ Joined **${guild.name}**! Use \`!guild info\` to see your team.`,
  };
}

export function leaveGuild(user_id: string) {
  const membership = getMembership(user_id);
  if (!membership) {
    return { success: false, message: '❌ You are not in a guild.' };
  }
  if (membership.role === 'owner') {
    const members = listGuildMembers(membership.guild.guild_id);
    if (members.length > 1) {
      return { success: false, message: '❌ Transfer ownership or promote an officer before leaving.' };
    }
    db.prepare('DELETE FROM player_guild_members WHERE guild_id=? AND user_id=?').run(
      membership.guild.guild_id,
      user_id
    );
    db.prepare('DELETE FROM player_guilds WHERE guild_id=?').run(membership.guild.guild_id);
    return { success: true, message: '🏁 Guild disbanded.' };
  }
  db.prepare('DELETE FROM player_guild_members WHERE guild_id=? AND user_id=?').run(
    membership.guild.guild_id,
    user_id
  );
  return { success: true, message: `👋 You left **${membership.guild.name}**.` };
}

export function guildSummary(user_id: string) {
  const membership = getMembership(user_id);
  if (!membership) {
    const invites = listPendingInvites(user_id);
    if (!invites.length) {
      return '🏰 You are not in a guild. Create one with `!guild create "Name"` or ask for an invite.';
    }
    const inviteLines = invites.map((inv) => `• **${inv.name}** — invited <t:${Math.floor(inv.created_at / 1000)}:R>`);
    return `📨 Pending invites:\n${inviteLines.join('\n')}`;
  }
  const members = listGuildMembers(membership.guild.guild_id);
  const lines = members.map((mem) => {
    const roleLabel = mem.role === 'owner' ? '⭐ Owner' : mem.role === 'officer' ? '⚔️ Officer' : '🎲 Member';
    return `• <@${mem.user_id}> — ${roleLabel}`;
  });
  return `🏰 **${membership.guild.name}**\n${lines.join('\n')}`;
}

export function listAvailableRaids(): RaidDefinition[] {
  return RAID_LIBRARY.slice();
}

export function resolveRaid(name: string): RaidDefinition | undefined {
  const target = name.trim().toLowerCase();
  return RAID_LIBRARY.find(
    (raid) => raid.aliases.some((alias) => alias.toLowerCase() === target) || raid.name.toLowerCase() === target
  );
}

export type PrepareRaidResult =
  | { success: false; message: string }
  | { success: true; raid: RaidDefinition; party_ids: string[]; guild: PlayerGuildRecord };

export function prepareRaidStart(user_id: string, raidLabel: string): PrepareRaidResult {
  const membership = getMembership(user_id);
  if (!membership) {
    return { success: false, message: '❌ You must belong to a guild to start a raid.' };
  }
  if (membership.role !== 'owner' && membership.role !== 'officer') {
    return { success: false, message: '❌ Only guild owners or officers can start raids.' };
  }
  const raid = resolveRaid(raidLabel);
  if (!raid) {
    const available = RAID_LIBRARY.map((r) => r.name).join(', ');
    return { success: false, message: `❌ Unknown raid. Available: ${available}` };
  }
  const members = listGuildMembers(membership.guild.guild_id);
  if (members.length < raid.min_party) {
    return {
      success: false,
      message: `❌ ${raid.name} requires at least ${raid.min_party} members. Current roster: ${members.length}.`,
    };
  }
  if (members.length > raid.max_party) {
    return {
      success: false,
      message: `❌ ${raid.name} allows at most ${raid.max_party} members. Trim your roster first.`,
    };
  }
  const party_ids = members.map((mem) => mem.user_id);
  return {
    success: true,
    raid,
    party_ids,
    guild: membership.guild,
  };
}

export function registerRunParticipants(run_id: string, scene_id: string, user_ids: string[]) {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO user_runs (user_id, run_id, role_id, scene_id, status, created_at, updated_at)
     VALUES (?,?,?,?,?, ?, ?)
     ON CONFLICT(user_id, run_id) DO UPDATE SET scene_id=excluded.scene_id, status=excluded.status, updated_at=excluded.updated_at`
  );
  for (const id of user_ids) {
    stmt.run(id, run_id, null, scene_id, 'active', now, now);
  }
}

export function declineGuildInvite(user_id: string, guildName?: string) {
  const invites = listPendingInvites(user_id);
  if (!invites.length) {
    return { success: false, message: '❌ You have no pending invites.' };
  }
  let chosen = invites[0];
  if (guildName) {
    const normalized = guildName.trim().toLowerCase();
    const match = invites.find((inv) => inv.name.toLowerCase() === normalized);
    if (!match) {
      return { success: false, message: `❌ No invite found for guild "${guildName}".` };
    }
    chosen = match;
  }
  db.prepare('UPDATE player_guild_invites SET status="declined", responded_at=? WHERE invite_id=?').run(
    Date.now(),
    chosen.invite_id
  );
  return { success: true, message: `🚫 Declined invite to **${chosen.name}**.` };
}

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ActivityType,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const { Player, QueryType, useQueue, usePlayer } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const fs   = require('fs');
const path = require('path');

// ─── Client ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ─── discord-player setup ────────────────────────────────────────────────────
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  }
});

player.extractors.register(YoutubeiExtractor, {});

player.events.on('playerStart', (queue, track) => {
  queue.metadata?.channel?.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('now playing')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'duration',      value: track.duration,          inline: true },
          { name: 'requested by',  value: track.requestedBy?.tag ?? 'unknown', inline: true }
        )
        .setThumbnail(track.thumbnail)
    ]
  }).catch(() => {});
});

player.events.on('emptyQueue', queue => {
  queue.metadata?.channel?.send({
    embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('queue finished — leaving vc')]
  }).catch(() => {});
});

player.events.on('error', (queue, error) => {
  console.error(`player error in ${queue.guild.name}:`, error.message);
  queue.metadata?.channel?.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`player error: ${error.message}`)]
  }).catch(() => {});
});

player.events.on('playerError', (queue, error) => {
  console.error(`playerError in ${queue.guild.name}:`, error.message);
  queue.metadata?.channel?.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't play that track — skipping`)]
  }).catch(() => {});
});

// ─── File paths ───────────────────────────────────────────────────────────────
const TAGS_FILE        = path.join(__dirname, 'tags.json');
const HUSHED_FILE      = path.join(__dirname, 'hushed.json');
const CONFIG_FILE      = path.join(__dirname, 'config.json');
const AFK_FILE         = path.join(__dirname, 'afk.json');
const WHITELIST_FILE   = path.join(__dirname, 'whitelist.json');
const REBOOT_FILE      = path.join(__dirname, 'reboot_msg.json');
const VM_CONFIG_FILE   = path.join(__dirname, 'vm_config.json');
const VM_CHANNELS_FILE = path.join(__dirname, 'vm_channels.json');
const JAIL_FILE        = path.join(__dirname, 'jail.json');
const WL_MANAGERS_FILE = path.join(__dirname, 'wl_managers.json');
const AUTOREACT_FILE   = path.join(__dirname, 'autoreact.json');

// ─── JSON helpers ─────────────────────────────────────────────────────────────
function loadJSON(file)     { if (!fs.existsSync(file)) return {}; try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function saveJSON(file, d)  { fs.writeFileSync(file, JSON.stringify(d, null, 2)); }

function loadTags()         { return loadJSON(TAGS_FILE); }
function saveTags(t)        { saveJSON(TAGS_FILE, t); }
function loadHushed()       { return loadJSON(HUSHED_FILE); }
function saveHushed(h)      { saveJSON(HUSHED_FILE, h); }
function loadConfig()       { return loadJSON(CONFIG_FILE); }
function saveConfig(c)      { saveJSON(CONFIG_FILE, c); }
function loadAfk()          { return loadJSON(AFK_FILE); }
function saveAfk(a)         { saveJSON(AFK_FILE, a); }
function loadWhitelist()    { const d = loadJSON(WHITELIST_FILE); return Array.isArray(d.ids) ? d.ids : []; }
function saveWhitelist(ids) { saveJSON(WHITELIST_FILE, { ids }); }
function loadVmConfig()     { return loadJSON(VM_CONFIG_FILE); }
function saveVmConfig(c)    { saveJSON(VM_CONFIG_FILE, c); }
function loadVmChannels()   { return loadJSON(VM_CHANNELS_FILE); }
function saveVmChannels(c)  { saveJSON(VM_CHANNELS_FILE, c); }
function loadJail()         { return loadJSON(JAIL_FILE); }
function saveJail(j)        { saveJSON(JAIL_FILE, j); }
function loadWlManagers()   { const d = loadJSON(WL_MANAGERS_FILE); return Array.isArray(d.ids) ? d.ids : []; }
function saveWlManagers(ids){ saveJSON(WL_MANAGERS_FILE, { ids }); }
function loadAutoreact()    { return loadJSON(AUTOREACT_FILE); }

function isWlManager(userId) {
  if (loadWlManagers().includes(userId)) return true;
  return (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean).includes(userId);
}

// ─── Init config ─────────────────────────────────────────────────────────────
(function initConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveJSON(CONFIG_FILE, { logChannelId: null, prefix: '.', status: null });
  } else {
    const cfg = loadConfig();
    let changed = false;
    if (Array.isArray(cfg.whitelist) && cfg.whitelist.length > 0) {
      const merged = [...new Set([...loadWhitelist(), ...cfg.whitelist])];
      saveWhitelist(merged);
      delete cfg.whitelist;
      changed = true;
    } else if ('whitelist' in cfg) { delete cfg.whitelist; changed = true; }
    if (!cfg.prefix) { cfg.prefix = '.'; changed = true; }
    if (changed) saveConfig(cfg);
  }
  if (!fs.existsSync(WHITELIST_FILE)) saveWhitelist([]);
  if (!fs.existsSync(TAGS_FILE))      saveJSON(TAGS_FILE, {});
  if (!fs.existsSync(WL_MANAGERS_FILE)) {
    const fromEnv = (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean);
    saveWlManagers(fromEnv);
  }
})();

function getPrefix() { return loadConfig().prefix || '.'; }

async function sendLog(guild, embed) {
  const cfg = loadConfig();
  if (!cfg.logChannelId) return;
  try {
    const ch = await guild.channels.fetch(cfg.logChannelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (err) { console.error('log channel error:', err.message); }
}

// ─── Roblox ranking ──────────────────────────────────────────────────────────
async function rankRobloxUser(robloxUsername, roleId) {
  const cookie  = process.env.ROBLOX_COOKIE;
  const groupId = process.env.ROBLOX_GROUP_ID;
  if (!cookie || !groupId) throw new Error('ROBLOX_COOKIE or ROBLOX_GROUP_ID is not configured.');

  const lookupRes  = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: false })
  });
  const userBasic = (await lookupRes.json()).data?.[0];
  if (!userBasic) throw new Error(`Roblox user "${robloxUsername}" not found.`);
  const userId = userBasic.id;

  const memberData = await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json();
  if (!memberData.data?.some(g => String(g.group.id) === String(groupId)))
    throw new Error(`**${userBasic.name}** isn't in the group (ID: ${groupId}). They need to join first.`);

  const csrfRes   = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST', headers: { Cookie: `.ROBLOSECURITY=${cookie}` }
  });
  const csrfToken = csrfRes.headers.get('x-csrf-token');
  if (!csrfToken) throw new Error('Could not get CSRF token. Check your ROBLOX_COOKIE.');

  const rankRes = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken },
    body: JSON.stringify({ roleId: Number(roleId) })
  });
  if (!rankRes.ok) {
    const errData = await rankRes.json().catch(() => ({}));
    const code = errData.errors?.[0]?.code;
    const msg  = errData.errors?.[0]?.message ?? `HTTP ${rankRes.status}`;
    if (code === 4) throw new Error(`Bot doesn't have permission to rank this user.`);
    if (code === 2) throw new Error(`Role ID \`${roleId}\` doesn't exist.`);
    throw new Error(`Ranking failed: ${msg}`);
  }

  const avatarData = await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json();
  return { userId, displayName: userBasic.name, avatarUrl: avatarData.data?.[0]?.imageUrl ?? null };
}

// ─── Jail helpers ─────────────────────────────────────────────────────────────
async function jailMember(guild, member, reason, modTag) {
  const jailData = loadJail();
  if (!jailData[guild.id]) jailData[guild.id] = {};
  if (jailData[guild.id][member.id]) throw new Error(`**${member.user.tag}** is already jailed`);

  let jailChannel = guild.channels.cache.find(c => c.name === 'jail' && c.isTextBased());
  if (!jailChannel) {
    jailChannel = await guild.channels.create({
      name: 'jail', type: ChannelType.GuildText,
      permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }]
    });
  }
  await jailChannel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });

  const deniedChannels = [];
  for (const [, ch] of guild.channels.cache) {
    if (!ch.isTextBased() && ch.type !== ChannelType.GuildAnnouncement) continue;
    if (ch.id === jailChannel.id) continue;
    if (ch.permissionOverwrites.cache.get(member.id)?.deny.has(PermissionsBitField.Flags.ViewChannel)) continue;
    try { await ch.permissionOverwrites.edit(member.id, { ViewChannel: false }); deniedChannels.push(ch.id); } catch {}
  }

  jailData[guild.id][member.id] = { jailChannelId: jailChannel.id, deniedChannels };
  saveJail(jailData);
  return new EmbedBuilder().setTitle('jailed').setColor(0xed4245).setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'user', value: member.user.tag, inline: true }, { name: 'mod', value: modTag, inline: true }, { name: 'reason', value: reason })
    .setDescription(`they can only see ${jailChannel}`).setTimestamp();
}

async function unjailMember(guild, member, modTag) {
  const jailData = loadJail();
  const entry = jailData[guild.id]?.[member.id];
  if (!entry) throw new Error(`**${member.user.tag}** isn't jailed`);
  for (const chId of entry.deniedChannels) {
    try { const ch = guild.channels.cache.get(chId); if (ch) await ch.permissionOverwrites.delete(member.id); } catch {}
  }
  try { const jailCh = guild.channels.cache.get(entry.jailChannelId); if (jailCh) await jailCh.permissionOverwrites.delete(member.id); } catch {}
  delete jailData[guild.id][member.id];
  saveJail(jailData);
  return new EmbedBuilder().setTitle('unjailed').setColor(0x57f287).setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'user', value: member.user.tag, inline: true }, { name: 'mod', value: modTag, inline: true }).setTimestamp();
}

// ─── Help pages ───────────────────────────────────────────────────────────────
const COMMAND_PAGES = [
  {
    title: 'perms',
    cmds: [
      '{p}hb @user [reason]',
      '{p}ban @user [reason]',
      '{p}unban [userId] [reason]',
      '{p}timeout @user [minutes] [reason]',
      '{p}untimeout @user',
      '{p}mute @user [reason]',
      '{p}unmute @user',
      '{p}hush @user',
      '{p}unhush @user',
      '{p}jail @user',
      '{p}unjail @user',
      '{p}lock',
      '{p}unlock',
    ],
  },
  {
    title: 'rblx',
    cmds: [
      '{p}tag [name] | [content]',
      '{p}tag [robloxUser] [tagname]',
      '{p}roblox [username]',
      '{p}gc [username]',
      '{p}grouproles',
      '{p}afk [reason]',
    ],
  },
  {
    title: 'config',
    cmds: [
      '{p}prefix [new prefix]',
      '{p}status [type] [text]',
      '{p}restart',
      '{p}say [text]',
      '{p}cs',
      '/whitelist add @user',
      '/whitelist remove @user',
      '/whitelist list',
      '{p}setlog #channel',
    ],
  },
];

const MUSIC_COMMANDS = [
  '{p}play [song, artist, or link]',
  '> supports YouTube, Spotify, Apple Music, SoundCloud',
  '{p}pause',
  '{p}skip',
  '{p}queue',
  '{p}nowplaying',
  '{p}repeat',
  '{p}shuffle',
  '{p}volume [0-100]',
  '{p}leave / {p}stop',
];

const GC_PER_PAGE = 10;

function buildHelpEmbed(page) {
  const p     = getPrefix();
  const entry = COMMAND_PAGES[page] ?? { title: null, cmds: [] };
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(entry.title ?? null)
    .setDescription(entry.cmds.map(c => `\`${c.replace(/\{p\}/g, p)}\``).join('\n'))
    .setFooter({ text: `page ${page + 1}/${COMMAND_PAGES.length}` });
}

function buildHelpRow(page) {
  const total = COMMAND_PAGES.length;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help_${page - 1}`).setLabel('back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`help_${page + 1}`).setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
  );
}

function buildMusicHelpEmbed(prefix) {
  const p = prefix || getPrefix();
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('music commands')
    .setDescription(MUSIC_COMMANDS.map(c => c.startsWith('>') ? c : `\`${c.replace(/\{p\}/g, p)}\``).join('\n'))
    .setFooter({ text: 'No ads — audio streamed directly' });
}

function buildGcEmbed(username, groups, avatarUrl, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  const slice = groups.slice(page * GC_PER_PAGE, page * GC_PER_PAGE + GC_PER_PAGE);
  const embed = new EmbedBuilder().setColor(0x2b2d31)
    .setTitle(`${username}'s groups`)
    .setDescription(slice.map((g, i) => `${page * GC_PER_PAGE + i + 1}. **${g.group.name}**`).join('\n'))
    .setFooter({ text: `page ${page + 1}/${totalPages} · ${groups.length} groups` });
  if (page === 0 && avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function buildGcRow(username, groups, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gc_${page - 1}_${username}`).setLabel('back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`gc_${page + 1}_${username}`).setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
  );
}

function buildVmInterfaceEmbed(guild) {
  return new EmbedBuilder().setColor(0x2b2d31).setTitle('VoiceMaster Interface')
    .setDescription('Manage your voice channel by using the buttons below.')
    .addFields({ name: 'Button Usage', value: [
      '🔒 — **Lock** the voice channel', '🔓 — **Unlock** the voice channel',
      '👻 — **Ghost** the voice channel', '👁️ — **Reveal** the voice channel',
      '✏️ — **Rename**', '👑 — **Claim** the voice channel',
      '➕ — **Increase** the user limit', '➖ — **Decrease** the user limit',
      '🗑️ — **Delete**', '📋 — **View** channel information',
    ].join('\n') }).setThumbnail(guild?.iconURL() ?? null);
}

function buildVmInterfaceRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_unlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_ghost').setEmoji('👻').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_reveal').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_claim').setEmoji('👑').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_info').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_limit_up').setEmoji('➕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_limit_down').setEmoji('➖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildVmHelpEmbed(prefix) {
  const p = prefix || getPrefix();
  return new EmbedBuilder().setColor(0x2b2d31).setTitle('voicemaster').setDescription([
    `\`${p}vm setup\` — set up the voicemaster system`,
    `\`${p}vm lock\` — lock your channel`,
    `\`${p}vm unlock\` — unlock your channel`,
    `\`${p}vm claim\` — claim an abandoned channel`,
    `\`${p}vm limit [1-99]\` — set user limit (0 = no limit)`,
    `\`${p}vm allow @user\` — let a user join even when locked`,
    `\`${p}vm deny @user\` — block a user from joining`,
    `\`${p}vm rename [name]\` — rename your channel`,
    `\`${p}vm reset\` — reset your channel to defaults`,
    `\`${p}drag @user\` — drag a user into your vc`,
    '', 'You can also use the **buttons** in the interface channel.',
  ].join('\n'));
}

// ─── Caches ───────────────────────────────────────────────────────────────────
const gcCache    = new Map();
const snipeCache = new Map();

// ─── Slash commands ───────────────────────────────────────────────────────────
const GUILD_ONLY_COMMANDS = new Set(['ban', 'kick', 'unban', 'purge', 'snipe', 'timeout', 'mute', 'unmute', 'hush', 'lock', 'unlock', 'setlog']);

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('shows the command list').setDMPermission(true),
  new SlashCommandBuilder().setName('mhelp').setDescription('music command list').setDMPermission(true),
  new SlashCommandBuilder().setName('vmhelp').setDescription('voicemaster command list').setDMPermission(true),
  new SlashCommandBuilder().setName('afk').setDescription('set yourself as afk').setDMPermission(true)
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('roblox').setDescription('look up a roblox user').setDMPermission(true)
    .addStringOption(o => o.setName('username').setDescription('roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('gc').setDescription('list roblox groups for a user').setDMPermission(true)
    .addStringOption(o => o.setName('username').setDescription('roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('hb').setDescription('hardban a user').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user to ban').setRequired(false))
    .addStringOption(o => o.setName('id').setDescription('user id if not in server').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('ban a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('kick a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unban').setDescription('unban a user by id').setDMPermission(true)
    .addStringOption(o => o.setName('id').setDescription('user id to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('delete messages in bulk').setDMPermission(false)
    .addIntegerOption(o => o.setName('amount').setDescription('how many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('snipe').setDescription('show the last deleted message').setDMPermission(false),
  new SlashCommandBuilder().setName('timeout').setDescription('timeout a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('duration in minutes').setRequired(false).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('untimeout').setDescription('remove a timeout').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('mute a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unmute').setDescription('remove a mute').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('hush').setDescription('auto-delete all messages from a user').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('unhush').setDescription('remove auto-delete from a user').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('lock the current channel').setDMPermission(true),
  new SlashCommandBuilder().setName('unlock').setDescription('unlock the current channel').setDMPermission(true),
  new SlashCommandBuilder().setName('say').setDescription('make the bot say something').setDMPermission(true)
    .addStringOption(o => o.setName('text').setDescription('what to say').setRequired(true)),
  new SlashCommandBuilder().setName('cs').setDescription('clear the snipe cache').setDMPermission(true),
  new SlashCommandBuilder().setName('grouproles').setDescription('list roblox group roles').setDMPermission(true),
  new SlashCommandBuilder().setName('tag').setDescription('create a tag or rank someone').setDMPermission(true)
    .addStringOption(o => o.setName('name').setDescription('tag name').setRequired(true))
    .addStringOption(o => o.setName('content').setDescription('role id for new tag').setRequired(false))
    .addStringOption(o => o.setName('robloxuser').setDescription('roblox username to rank').setRequired(false)),
  new SlashCommandBuilder().setName('restart').setDescription('restart the bot').setDMPermission(true),
  new SlashCommandBuilder().setName('wlmanager').setDescription('manage whitelist managers').setDMPermission(true)
    .addStringOption(o => o.setName('action').setDescription('what to do').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }))
    .addUserOption(o => o.setName('user').setDescription('user (for add/remove)').setRequired(false)),
  new SlashCommandBuilder().setName('jail').setDescription('jail a user').setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('user to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unjail').setDescription('release a user from jail').setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('user to unjail').setRequired(true)),
  new SlashCommandBuilder().setName('prefix').setDescription('change or view the bot prefix').setDMPermission(true)
    .addStringOption(o => o.setName('new').setDescription('new prefix').setRequired(false)),
  new SlashCommandBuilder().setName('status').setDescription('change the bot status').setDMPermission(true)
    .addStringOption(o => o.setName('type').setDescription('type').setRequired(true)
      .addChoices({ name: 'playing', value: 'playing' }, { name: 'watching', value: 'watching' }, { name: 'listening', value: 'listening' }, { name: 'competing', value: 'competing' }, { name: 'custom', value: 'custom' }))
    .addStringOption(o => o.setName('text').setDescription('status text').setRequired(true)),
  new SlashCommandBuilder().setName('setlog').setDescription('set the log channel').setDMPermission(true)
    .addChannelOption(o => o.setName('channel').setDescription('channel').setRequired(true)),
  new SlashCommandBuilder().setName('whitelist').setDescription('manage the whitelist').setDMPermission(true)
    .addStringOption(o => o.setName('action').setDescription('what to do').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }))
    .addUserOption(o => o.setName('user').setDescription('user (for add/remove)').setRequired(false)),
  // ── Music slash commands ──────────────────────────────────────────────────
  new SlashCommandBuilder().setName('play').setDescription('play a song in your voice channel').setDMPermission(false)
    .addStringOption(o => o.setName('query').setDescription('song name, artist, or link').setRequired(true)),
  new SlashCommandBuilder().setName('pause').setDescription('pause or resume playback').setDMPermission(false),
  new SlashCommandBuilder().setName('skip').setDescription('skip the current song').setDMPermission(false),
  new SlashCommandBuilder().setName('queue').setDescription('show the current queue').setDMPermission(false),
  new SlashCommandBuilder().setName('nowplaying').setDescription('show what is currently playing').setDMPermission(false),
  new SlashCommandBuilder().setName('repeat').setDescription('toggle repeat mode').setDMPermission(false)
    .addStringOption(o => o.setName('mode').setDescription('repeat mode').setRequired(false)
      .addChoices({ name: 'off', value: 'off' }, { name: 'track', value: 'track' }, { name: 'queue', value: 'queue' })),
  new SlashCommandBuilder().setName('shuffle').setDescription('shuffle the queue').setDMPermission(false),
  new SlashCommandBuilder().setName('volume').setDescription('set music volume (0-100)').setDMPermission(false)
    .addIntegerOption(o => o.setName('level').setDescription('volume level (0-100)').setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder().setName('leave').setDescription('disconnect from voice').setDMPermission(false),
].map(c => c.toJSON());

// ─── Status helper ────────────────────────────────────────────────────────────
function applyStatus(statusData) {
  const typeMap = { playing: ActivityType.Playing, streaming: ActivityType.Streaming, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, custom: ActivityType.Custom };
  client.user.setActivity({ name: statusData.text, type: typeMap[statusData.type] ?? ActivityType.Playing });
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`logged in as ${client.user.tag}`);
  const cfg = loadConfig();
  if (cfg.status) applyStatus(cfg.status);

  if (fs.existsSync(REBOOT_FILE)) {
    const { channelId, messageId } = loadJSON(REBOOT_FILE);
    fs.unlinkSync(REBOOT_FILE);
    try { const ch = await client.channels.fetch(channelId); const msg = await ch.messages.fetch(messageId); await msg.edit('restart successful ✅'); } catch {}
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
      console.log('slash commands registered to guild');
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
      console.log('slash commands registered globally');
    }
  } catch (err) { console.error('failed to register slash commands:', err.message); }
});

// ─── Message delete snipe ─────────────────────────────────────────────────────
client.on('messageDelete', message => {
  if (message.author?.bot || !message.content) return;
  snipeCache.set(message.channel.id, { content: message.content, author: message.author?.tag ?? 'unknown', avatarUrl: message.author?.displayAvatarURL() ?? null, deletedAt: Date.now() });
});

// ─── VoiceMaster: auto-create / auto-delete ───────────────────────────────────
client.on('voiceStateUpdate', async (oldState, newState) => {
  const vmConfig   = loadVmConfig();
  const vmChannels = loadVmChannels();
  const guildId    = newState.guild?.id ?? oldState.guild?.id;
  const guildCfg   = vmConfig[guildId];

  if (guildCfg && newState.channelId === guildCfg.createChannelId && newState.member) {
    try {
      const newCh = await newState.guild.channels.create({
        name: `${newState.member.displayName}'s VC`, type: ChannelType.GuildVoice, parent: guildCfg.categoryId,
        permissionOverwrites: [{ id: newState.member.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak] }]
      });
      await newState.member.voice.setChannel(newCh);
      vmChannels[newCh.id] = { ownerId: newState.member.id, guildId };
      saveVmChannels(vmChannels);
    } catch (err) { console.error('vm create error:', err.message); }
  }

  if (oldState.channelId && vmChannels[oldState.channelId]) {
    const ch = oldState.channel;
    if (ch && ch.members.size === 0) {
      try { await ch.delete(); } catch {}
      delete vmChannels[oldState.channelId];
      saveVmChannels(vmChannels);
    }
  }
});

// ─── Interaction handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  // ── Modal: VM rename ────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'vm_rename_modal') {
    const newName = interaction.fields.getTextInputValue('vm_rename_input');
    const vc = interaction.member?.voice?.channel;
    const vmc = loadVmChannels();
    if (!vc || !vmc[vc.id]) return interaction.reply({ content: "you need to be in your voice channel", ephemeral: true });
    if (vmc[vc.id].ownerId !== interaction.user.id) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
    try {
      await vc.setName(newName);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✏️ renamed to **${newName}**`)], ephemeral: true });
    } catch (e) { return interaction.reply({ content: `couldn't rename — ${e.message}`, ephemeral: true }); }
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('help_')) {
      const page = parseInt(interaction.customId.split('_')[1]);
      return interaction.update({ embeds: [buildHelpEmbed(page)], components: [buildHelpRow(page)] });
    }
    if (interaction.customId.startsWith('gc_')) {
      const parts = interaction.customId.split('_');
      const page = parseInt(parts[1]);
      const username = parts.slice(2).join('_');
      const cached = gcCache.get(username.toLowerCase());
      if (!cached) return interaction.reply({ content: 'that expired, run it again', ephemeral: true });
      return interaction.update({
        embeds: [buildGcEmbed(cached.displayName, cached.groups, cached.avatarUrl, page)],
        components: cached.groups.length > GC_PER_PAGE ? [buildGcRow(username, cached.groups, page)] : []
      });
    }
    if (interaction.customId.startsWith('vm_')) {
      const vmChannels = loadVmChannels();
      const vc = interaction.member?.voice?.channel;
      if (!vc) return interaction.reply({ content: "you need to be in a voice channel", ephemeral: true });
      const chData = vmChannels[vc.id];
      if (!chData) return interaction.reply({ content: "that's not a voicemaster channel", ephemeral: true });
      const isOwner = chData.ownerId === interaction.user.id;
      const everyone = interaction.guild.roles.everyone;

      if (interaction.customId === 'vm_lock') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { Connect: false });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')], ephemeral: true });
      }
      if (interaction.customId === 'vm_unlock') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { Connect: null });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')], ephemeral: true });
      }
      if (interaction.customId === 'vm_ghost') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { ViewChannel: false });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('👻 channel hidden')], ephemeral: true });
      }
      if (interaction.customId === 'vm_reveal') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { ViewChannel: null });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('👁️ channel visible')], ephemeral: true });
      }
      if (interaction.customId === 'vm_claim') {
        if (vc.members.has(chData.ownerId)) return interaction.reply({ content: "the owner is still in the channel", ephemeral: true });
        chData.ownerId = interaction.user.id;
        vmChannels[vc.id] = chData;
        saveVmChannels(vmChannels);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`👑 you now own **${vc.name}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_info') {
        const limit = vc.userLimit === 0 ? 'no limit' : vc.userLimit;
        const owner = await interaction.guild.members.fetch(chData.ownerId).catch(() => null);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('📋 channel info')
          .addFields({ name: 'name', value: vc.name, inline: true }, { name: 'owner', value: owner?.displayName ?? 'unknown', inline: true },
            { name: 'members', value: `${vc.members.size}`, inline: true }, { name: 'limit', value: `${limit}`, inline: true })
        ], ephemeral: true });
      }
      if (interaction.customId === 'vm_limit_up') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const newLimit = Math.min((vc.userLimit || 0) + 1, 99);
        await vc.setUserLimit(newLimit);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`➕ limit set to **${newLimit}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_limit_down') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const newLimit = Math.max((vc.userLimit || 1) - 1, 0);
        await vc.setUserLimit(newLimit);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(`➖ limit set to **${newLimit === 0 ? 'no limit' : newLimit}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_rename') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const modal = new ModalBuilder().setCustomId('vm_rename_modal').setTitle('Rename Channel')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_rename_input').setLabel('New channel name').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
          ));
        return interaction.showModal(modal);
      }
      if (interaction.customId === 'vm_delete') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        try { await vc.delete(); } catch {}
        delete vmChannels[vc.id];
        saveVmChannels(vmChannels);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🗑️ channel deleted')], ephemeral: true }).catch(() => {});
      }
      return;
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, member, guild, channel } = interaction;
  const inDM = !guild;

  // ── Open-to-everyone commands ────────────────────────────────────────────────
  if (commandName === 'roblox') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user lol");
      const userId    = userBasic.id;
      const user      = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created   = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`${user.displayName} (@${user.name})`).setURL(profileUrl).setColor(0x2b2d31)
        .addFields({ name: 'created', value: created, inline: true }, { name: 'user id', value: `${userId}`, inline: true }).setThumbnail(avatarUrl).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl), new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`))]
      });
    } catch { return interaction.editReply("couldn't load that, try again"); }
  }

  if (commandName === 'gc') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user lol");
      const userId = userBasic.id;
      const groups = ((await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json()).data ?? []).sort((a, b) => a.group.name.localeCompare(b.group.name));
      if (!groups.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle(`${userBasic.name}'s groups`).setDescription("they're not in any groups lol")] });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      gcCache.set(username.toLowerCase(), { displayName: userBasic.name, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);
      return interaction.editReply({ embeds: [buildGcEmbed(userBasic.name, groups, avatarUrl, 0)], components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : [] });
    } catch { return interaction.editReply("couldn't load their groups, try again"); }
  }

  if (commandName === 'mhelp') return interaction.reply({ embeds: [buildMusicHelpEmbed()] });
  if (commandName === 'vmhelp') return interaction.reply({ embeds: [buildVmHelpEmbed()] });

  // ── Music slash commands (open to everyone in guilds) ────────────────────────
  if (commandName === 'play') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const query = interaction.options.getString('query');
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) return interaction.reply({ content: "you need to be in a vc first", ephemeral: true });
    await interaction.deferReply();
    try {
      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: { metadata: { channel }, volume: 80 },
        requestedBy: interaction.user
      });
      const queue = useQueue(guild.id);
      if (queue && queue.size > 1) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('added to queue').setDescription(`**[${track.title}](${track.url})**`)
          .addFields({ name: 'duration', value: track.duration, inline: true }, { name: 'position', value: `#${queue.size}`, inline: true }).setThumbnail(track.thumbnail)] });
      }
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('now playing').setDescription(`**[${track.title}](${track.url})**`)
        .addFields({ name: 'duration', value: track.duration, inline: true }).setThumbnail(track.thumbnail)] });
    } catch (err) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't play that — ${err.message}`)] });
    }
  }

  if (commandName === 'pause') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue?.currentTrack) return interaction.reply({ content: "nothing is playing", ephemeral: true });
    if (queue.node.isPaused()) {
      queue.node.resume();
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('▶ resumed')] });
    }
    queue.node.pause();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription('⏸ paused')] });
  }

  if (commandName === 'skip') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue?.currentTrack) return interaction.reply({ content: "nothing is playing", ephemeral: true });
    const skipped = queue.currentTrack.title;
    queue.node.skip();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`skipped **${skipped}**`)] });
  }

  if (commandName === 'queue') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue?.currentTrack) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('queue').setDescription('queue is empty rn')] });
    const lines = [`**now playing:** ${queue.currentTrack.title}`];
    if (queue.tracks.size) {
      lines.push('', '**up next:**');
      queue.tracks.toArray().slice(0, 10).forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
      if (queue.tracks.size > 10) lines.push(`...and ${queue.tracks.size - 10} more`);
    }
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('queue').setDescription(lines.join('\n'))] });
  }

  if (commandName === 'nowplaying') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue?.currentTrack) return interaction.reply({ content: "nothing is playing", ephemeral: true });
    const track = queue.currentTrack;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('now playing')
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields({ name: 'duration', value: track.duration, inline: true }, { name: 'requested by', value: track.requestedBy?.tag ?? 'unknown', inline: true })
      .setThumbnail(track.thumbnail)] });
  }

  if (commandName === 'repeat') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue) return interaction.reply({ content: "nothing is playing", ephemeral: true });
    const { QueueRepeatMode } = require('discord-player');
    const modeArg = interaction.options.getString('mode');
    const modeMap = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE };
    const newMode = modeArg ? modeMap[modeArg] : (queue.repeatMode === QueueRepeatMode.OFF ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF);
    queue.setRepeatMode(newMode);
    const modeLabel = { [QueueRepeatMode.OFF]: 'off', [QueueRepeatMode.TRACK]: 'track 🔂', [QueueRepeatMode.QUEUE]: 'queue 🔁' };
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`repeat is now **${modeLabel[newMode]}**`)] });
  }

  if (commandName === 'shuffle') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue?.tracks.size) return interaction.reply({ content: "queue is empty", ephemeral: true });
    queue.tracks.shuffle();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🔀 queue shuffled`)] });
  }

  if (commandName === 'volume') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (!queue) return interaction.reply({ content: "nothing is playing", ephemeral: true });
    const level = interaction.options.getInteger('level');
    queue.node.setVolume(level);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🔊 volume set to **${level}%**`)] });
  }

  if (commandName === 'leave') {
    if (!guild) return;
    const queue = useQueue(guild.id);
    if (queue) queue.delete();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('left the vc')] });
  }

  // ── Whitelist-only commands ───────────────────────────────────────────────────
  if (!loadWhitelist().includes(interaction.user.id)) {
    return interaction.reply({ content: "ur not whitelisted for this bot lol", ephemeral: true });
  }
  if (inDM && GUILD_ONLY_COMMANDS.has(commandName)) {
    return interaction.reply({ content: "that command only works in a server, not dms", ephemeral: true });
  }

  if (commandName === 'help') return interaction.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });

  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || null;
    const afk = loadAfk();
    afk[interaction.user.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ur afk now${reason ? `: ${reason}` : ''}`)], ephemeral: true });
  }

  if (commandName === 'hb') {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user');
    const rawId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!targetUser && !rawId) return interaction.editReply('give me a user or their id');
    const userId = targetUser?.id ?? rawId;
    if (!/^\d{17,19}$/.test(userId)) return interaction.editReply("that doesn't look like a real id");
    if (!guild) return interaction.editReply("need to be in a server for this");
    try {
      await guild.members.ban(userId, { reason: `hardban by ${interaction.user.tag}: ${reason}`, deleteMessageSeconds: 0 });
      let username = targetUser?.tag ?? userId;
      if (!targetUser) { try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {} }
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("hardban'd").setColor(0xed4245)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return interaction.editReply(`couldn't ban — ${err.message}`); }
  }

  if (commandName === 'ban') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: "can't ban them, they might be above me", ephemeral: true });
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("they're gone").setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (commandName === 'kick') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: "can't kick them, they might be above me", ephemeral: true });
    try { await target.kick(reason); } catch { return interaction.reply({ content: "couldn't kick them", ephemeral: true }); }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('kicked').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (commandName === 'unban') {
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!guild) return interaction.reply({ content: "need a server for this", ephemeral: true });
    try {
      await guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('unbanned').setColor(0x57f287)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return interaction.reply({ content: `couldn't unban — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'purge') {
    const amount = interaction.options.getInteger('amount');
    try {
      const deleted = await channel.bulkDelete(amount, true);
      const reply = await channel.send(`deleted ${deleted.size} message${deleted.size !== 1 ? 's' : ''}`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
      return interaction.reply({ content: 'done', ephemeral: true });
    } catch (err) { return interaction.reply({ content: `couldn't purge — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'snipe') {
    const snipe = snipeCache.get(channel.id);
    if (!snipe) return interaction.reply({ content: 'nothing to snipe rn', ephemeral: true });
    const ago = Math.floor((Date.now() - snipe.deletedAt) / 1000);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31)
      .setAuthor({ name: snipe.author, iconURL: snipe.avatarUrl ?? undefined })
      .setDescription(snipe.content).setFooter({ text: `deleted ${ago}s ago` }).setTimestamp()] });
  }

  if (commandName === 'timeout') {
    const target  = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes') ?? 5;
    const reason  = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(minutes * 60 * 1000, reason); } catch { return interaction.reply({ content: "couldn't time them out", ephemeral: true }); }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('timed out').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'duration', value: `${minutes}m`, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (commandName === 'untimeout') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(null); } catch { return interaction.reply({ content: "couldn't remove timeout", ephemeral: true }); }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('timeout removed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'mute') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); } catch { return interaction.reply({ content: "couldn't mute them", ephemeral: true }); }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('muted').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (commandName === 'unmute') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(null); } catch { return interaction.reply({ content: "couldn't unmute them", ephemeral: true }); }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('unmuted').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'hush') {
    const target = interaction.options.getUser('user');
    const hushedData = loadHushed();
    if (hushedData[target.id]) return interaction.reply({ content: `**${target.tag}** is already hushed`, ephemeral: true });
    hushedData[target.id] = { hushedBy: interaction.user.id, at: Date.now() };
    saveHushed(hushedData);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('hushed').setColor(0xfee75c).setDescription('every msg they send gets deleted lol').setThumbnail(target.displayAvatarURL())
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'unhush') {
    const target = interaction.options.getUser('user');
    const hushedData = loadHushed();
    if (!hushedData[target.id]) return interaction.reply({ content: `**${target.tag}** isn't hushed`, ephemeral: true });
    delete hushedData[target.id];
    saveHushed(hushedData);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('unhushed').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'lock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')] });
    } catch { return interaction.reply({ content: "couldn't lock the channel, check my perms", ephemeral: true }); }
  }

  if (commandName === 'unlock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')] });
    } catch { return interaction.reply({ content: "couldn't unlock the channel, check my perms", ephemeral: true }); }
  }

  if (commandName === 'say') {
    await channel.send(interaction.options.getString('text'));
    return interaction.reply({ content: 'sent', ephemeral: true });
  }

  if (commandName === 'cs') {
    const had = snipeCache.has(channel.id);
    snipeCache.delete(channel.id);
    return interaction.reply({ content: had ? 'snipe cleared' : 'nothing to clear', ephemeral: true });
  }

  if (commandName === 'grouproles') {
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return interaction.reply({ content: '`ROBLOX_GROUP_ID` isnt set', ephemeral: true });
    await interaction.deferReply();
    try {
      const data = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      if (!data.roles?.length) return interaction.editReply('no roles found for this group');
      const lines = data.roles.sort((a, b) => a.rank - b.rank).map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('group roles').setColor(0x2b2d31).setDescription(lines.join('\n')).setFooter({ text: `group id: ${groupId}` }).setTimestamp()] });
    } catch { return interaction.editReply("couldn't load group roles, try again"); }
  }

  if (commandName === 'tag') {
    const name = interaction.options.getString('name');
    const content = interaction.options.getString('content');
    const robloxUser = interaction.options.getString('robloxuser');
    if (content) {
      const tags = loadTags(); const isNew = !tags[name]; tags[name] = content; saveTags(tags);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)] });
    }
    if (robloxUser) {
      const tags = loadTags();
      if (!tags[name]) return interaction.reply({ content: `no tag called **${name}** exists`, ephemeral: true });
      const roleId = tags[name].trim();
      if (isNaN(Number(roleId))) return interaction.reply({ content: `tag **${name}** doesn't have a valid role id`, ephemeral: true });
      await interaction.deferReply();
      try {
        const result = await rankRobloxUser(robloxUser, roleId);
        const embed = new EmbedBuilder().setTitle('got em ranked').setColor(0x57f287)
          .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: name, inline: true }, { name: 'role id', value: roleId, inline: true })
          .setFooter({ text: `ranked by ${interaction.user.tag}` }).setTimestamp();
        if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
        return interaction.editReply({ embeds: [embed] });
      } catch (err) { return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't rank them — ${err.message}`)] }); }
    }
    const tags = loadTags();
    if (!tags[name]) return interaction.reply({ content: `no tag called **${name}** exists`, ephemeral: true });
    return interaction.reply({ content: tags[name] });
  }

  if (commandName === 'restart') {
    const sent = await interaction.reply({ content: 'restarting rq...', fetchReply: true });
    saveJSON(REBOOT_FILE, { channelId: sent.channelId, messageId: sent.id });
    setTimeout(() => process.exit(0), 500);
  }

  if (commandName === 'jail') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { return interaction.reply({ embeds: [await jailMember(guild, target, reason, interaction.user.tag)] }); }
    catch (e) { return interaction.reply({ content: `jail failed — ${e.message}`, ephemeral: true }); }
  }

  if (commandName === 'unjail') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { return interaction.reply({ embeds: [await unjailMember(guild, target, interaction.user.tag)] }); }
    catch (e) { return interaction.reply({ content: `unjail failed — ${e.message}`, ephemeral: true }); }
  }

  if (commandName === 'prefix') {
    const newPrefix = interaction.options.getString('new');
    const p = getPrefix();
    if (!newPrefix) return interaction.reply({ content: `prefix is \`${p}\` rn`, ephemeral: true });
    if (newPrefix.length > 5) return interaction.reply({ content: "prefix can't be more than 5 chars", ephemeral: true });
    const cfg = loadConfig(); cfg.prefix = newPrefix; saveConfig(cfg);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)] });
  }

  if (commandName === 'status') {
    const type = interaction.options.getString('type');
    const text = interaction.options.getString('text');
    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig(); cfg.status = statusData; saveConfig(cfg);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)] });
  }

  if (commandName === 'setlog') {
    const ch = interaction.options.getChannel('channel');
    if (!ch?.isTextBased()) return interaction.reply({ content: 'that needs to be a text channel', ephemeral: true });
    const cfg2 = loadConfig(); cfg2.logChannelId = ch.id; saveConfig(cfg2);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('log channel set').setColor(0x57f287).setDescription(`logs going to ${ch} now`).setTimestamp()] });
  }

  if (commandName === 'wlmanager') {
    const sub  = interaction.options.getString('action');
    const mgrs = loadWlManagers();
    if (sub === 'list') {
      const wl = loadWhitelist();
      if (!wl.includes(interaction.user.id)) return interaction.reply({ content: "ur not whitelisted", ephemeral: true });
      const all = [...new Set([...mgrs, ...(process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean)])];
      if (!all.length) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist managers').setColor(0x2b2d31).setDescription('no managers set')] });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist managers').setColor(0x2b2d31).setDescription(all.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')).setTimestamp()] });
    }
    if (!isWlManager(interaction.user.id)) return interaction.reply({ content: "ur not a whitelist manager", ephemeral: true });
    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (mgrs.includes(target.id)) return interaction.reply({ content: `**${target.tag}** is already a whitelist manager`, ephemeral: true });
      mgrs.push(target.id); saveWlManagers(mgrs);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist manager added').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (!mgrs.includes(target.id)) return interaction.reply({ content: `**${target.tag}** isn't a whitelist manager`, ephemeral: true });
      saveWlManagers(mgrs.filter(id => id !== target.id));
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist manager removed').setColor(0xed4245).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'removed by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
  }

  if (commandName === 'whitelist') {
    if (!isWlManager(interaction.user.id)) return interaction.reply({ content: "ur not allowed to manage the whitelist", ephemeral: true });
    const sub = interaction.options.getString('action');
    const wl  = loadWhitelist();
    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (wl.includes(target.id)) return interaction.reply({ content: `**${target.tag}** is already on the whitelist`, ephemeral: true });
      wl.push(target.id); saveWhitelist(wl);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelisted').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (!wl.includes(target.id)) return interaction.reply({ content: `**${target.tag}** isn't on the whitelist`, ephemeral: true });
      saveWhitelist(wl.filter(id => id !== target.id));
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('removed from whitelist').setColor(0xed4245).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'removed by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'list') {
      if (!wl.length) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist').setColor(0x2b2d31).setDescription('nobody on the whitelist rn')] });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('whitelist').setColor(0x2b2d31).setDescription(wl.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')).setTimestamp()] });
    }
  }
});

// ─── Prefix message handler ───────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // hush
  const hushed = loadHushed();
  if (hushed[message.author.id]) { try { await message.delete(); } catch {} return; }

  // autoreact
  const autoreactData = loadAutoreact();
  if (autoreactData[message.author.id]?.length) {
    for (const emoji of autoreactData[message.author.id]) { try { await message.react(emoji); } catch {} }
  }

  // afk notify
  if (message.mentions.users.size > 0) {
    const afkData   = loadAfk();
    const mentioned = message.mentions.users.first();
    if (afkData[mentioned?.id]) {
      const entry = afkData[mentioned.id];
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`**${mentioned.username}** is afk: ${entry.reason || 'no reason'}\n<t:${Math.floor(entry.since / 1000)}:R>`)] });
    }
  }

  const prefix  = getPrefix();
  const afkData = loadAfk();

  if (afkData[message.author.id] && message.content.startsWith(prefix)) {
    delete afkData[message.author.id];
    saveAfk(afkData);
    await message.reply({ content: "wb ur afk got removed", allowedMentions: { repliedUser: false } });
  }

  if (!message.content.startsWith(prefix)) return;

  const args    = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── Open-to-everyone prefix commands ─────────────────────────────────────────
  if (command === 'roblox') {
    const username = args[0];
    if (!username) return message.reply('give me a username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user lol");
      const userId = userBasic.id;
      const user   = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return message.reply({ embeds: [new EmbedBuilder().setTitle(`${user.displayName} (@${user.name})`).setURL(profileUrl).setColor(0x2b2d31)
        .addFields({ name: 'created', value: created, inline: true }, { name: 'user id', value: `${userId}`, inline: true }).setThumbnail(avatarUrl).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl), new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`))]
      });
    } catch { return message.reply("couldn't load that, try again"); }
  }

  if (command === 'gc') {
    const username = args[0];
    if (!username) return message.reply('give me a username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user lol");
      const userId = userBasic.id;
      const groups = ((await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json()).data ?? []).sort((a, b) => a.group.name.localeCompare(b.group.name));
      if (!groups.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle(`${userBasic.name}'s groups`).setDescription("they're not in any groups lol")] });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      gcCache.set(username.toLowerCase(), { displayName: userBasic.name, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);
      return message.reply({ embeds: [buildGcEmbed(userBasic.name, groups, avatarUrl, 0)], components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : [] });
    } catch { return message.reply("couldn't load their groups, try again"); }
  }

  if (command === 'help') return message.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });

  if (command === 'mhelp') return message.reply({ embeds: [buildMusicHelpEmbed(prefix)] });

  if (command === 'vmhelp') return message.reply({ embeds: [buildVmHelpEmbed(prefix)] });

  // ── VoiceMaster prefix commands ───────────────────────────────────────────────
  if (command === 'drag') {
    if (!message.guild) return;
    const target = message.mentions.members?.first();
    if (!target) return message.reply('mention a user to drag');
    const myVc = message.member?.voice?.channel;
    if (!myVc) return message.reply("you're not in a voice channel");
    try { await target.voice.setChannel(myVc); return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`dragged **${target.displayName}** to **${myVc.name}**`)] }); }
    catch { return message.reply("couldn't drag them — they might not be in a vc"); }
  }

  if (command === 'vm') {
    if (!message.guild) return;
    const sub = args[0]?.toLowerCase();
    if (sub === 'setup') {
      if (!loadWhitelist().includes(message.author.id)) return message.reply("you're not whitelisted for this");
      await message.reply('setting up voicemaster...');
      try {
        const category = await message.guild.channels.create({ name: 'Voice Master', type: ChannelType.GuildCategory });
        const createVc = await message.guild.channels.create({ name: '➕ Create VC', type: ChannelType.GuildVoice, parent: category.id });
        const iface    = await message.guild.channels.create({ name: 'interface', type: ChannelType.GuildText, parent: category.id });
        const ifaceMsg = await iface.send({ embeds: [buildVmInterfaceEmbed(message.guild)], components: buildVmInterfaceRows() });
        const vmConfig = loadVmConfig();
        vmConfig[message.guild.id] = { categoryId: category.id, createChannelId: createVc.id, interfaceChannelId: iface.id, interfaceMessageId: ifaceMsg.id };
        saveVmConfig(vmConfig);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ voicemaster set up! join **${createVc.name}** to create a vc.`)] });
      } catch (e) { return message.reply(`setup failed — ${e.message}`); }
    }
    const vc = message.member?.voice?.channel;
    if (!vc) return message.reply('you need to be in your voice channel');
    const vmChannels = loadVmChannels();
    const chData = vmChannels[vc.id];
    if (!chData) return message.reply("that's not a voicemaster channel");
    const isOwner = chData.ownerId === message.author.id;
    const everyone = message.guild.roles.everyone;

    if (sub === 'lock')   { if (!isOwner) return message.reply("you don't own this channel"); await vc.permissionOverwrites.edit(everyone, { Connect: false }); return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')] }); }
    if (sub === 'unlock') { if (!isOwner) return message.reply("you don't own this channel"); await vc.permissionOverwrites.edit(everyone, { Connect: null }); return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')] }); }
    if (sub === 'claim')  {
      if (vc.members.has(chData.ownerId)) return message.reply("the owner is still in the channel");
      chData.ownerId = message.author.id; vmChannels[vc.id] = chData; saveVmChannels(vmChannels);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`👑 you now own **${vc.name}**`)] });
    }
    if (sub === 'limit') {
      if (!isOwner) return message.reply("you don't own this channel");
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 0 || n > 99) return message.reply('give me a number between 0 and 99 (0 = no limit)');
      await vc.setUserLimit(n);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`limit set to **${n === 0 ? 'no limit' : n}**`)] });
    }
    if (sub === 'allow') {
      if (!isOwner) return message.reply("you don't own this channel");
      const target = message.mentions.members?.first();
      if (!target) return message.reply('mention a user');
      await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`allowed **${target.displayName}**`)] });
    }
    if (sub === 'deny') {
      if (!isOwner) return message.reply("you don't own this channel");
      const target = message.mentions.members?.first();
      if (!target) return message.reply('mention a user');
      await vc.permissionOverwrites.edit(target.id, { Connect: false });
      if (vc.members.has(target.id)) await target.voice.setChannel(null).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`denied **${target.displayName}**`)] });
    }
    if (sub === 'rename') {
      if (!isOwner) return message.reply("you don't own this channel");
      const newName = args.slice(1).join(' ');
      if (!newName) return message.reply('give me a name');
      await vc.setName(newName);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`renamed to **${newName}**`)] });
    }
    if (sub === 'reset') {
      if (!isOwner) return message.reply("you don't own this channel");
      await vc.setName(`${message.member.displayName}'s VC`);
      await vc.setUserLimit(0);
      await vc.permissionOverwrites.edit(everyone, { Connect: null, ViewChannel: null });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('channel reset to defaults')] });
    }
    return message.reply({ embeds: [buildVmHelpEmbed(prefix)] });
  }

  // ── Music prefix commands (open to everyone) ──────────────────────────────────
  if (command === 'play') {
    const query = args.join(' ');
    if (!query) return message.reply(`give me a song name, artist, or link\nexample: \`${prefix}play love sosa chief keef\``);
    if (!message.guild) return message.reply('this only works in a server');
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('you need to be in a vc first');

    const searching = await message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`searching for **${query}**...`)] });
    try {
      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: { metadata: { channel: message.channel }, volume: 80 },
        requestedBy: message.author
      });
      const queue = useQueue(message.guild.id);
      if (queue && queue.size > 1) {
        return searching.edit({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('added to queue').setDescription(`**${track.title}**`)
          .addFields({ name: 'duration', value: track.duration, inline: true }, { name: 'position', value: `#${queue.size}`, inline: true })
          .setFooter({ text: `requested by ${message.author.tag}` }).setThumbnail(track.thumbnail)] });
      }
      return searching.edit({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('now playing').setDescription(`**${track.title}**`)
        .addFields({ name: 'duration', value: track.duration, inline: true })
        .setFooter({ text: `requested by ${message.author.tag}` }).setThumbnail(track.thumbnail)] });
    } catch (err) {
      return searching.edit({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't play that — ${err.message}`)] });
    }
  }

  if (command === 'pause') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue?.currentTrack) return message.reply("nothing's playing");
    if (queue.node.isPaused()) { queue.node.resume(); return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('▶ resumed')] }); }
    queue.node.pause();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription('⏸ paused')] });
  }

  if (command === 'skip') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue?.currentTrack) return message.reply("nothing's playing");
    const skipped = queue.currentTrack.title;
    queue.node.skip();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`skipped **${skipped}**`)] });
  }

  if (command === 'queue') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue?.currentTrack) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('queue').setDescription('queue is empty rn')] });
    const lines = [`**now playing:** ${queue.currentTrack.title}`];
    if (queue.tracks.size) {
      lines.push('', '**up next:**');
      queue.tracks.toArray().slice(0, 10).forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
      if (queue.tracks.size > 10) lines.push(`...and ${queue.tracks.size - 10} more`);
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('queue').setDescription(lines.join('\n'))] });
  }

  if (command === 'nowplaying' || command === 'np') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue?.currentTrack) return message.reply("nothing's playing");
    const track = queue.currentTrack;
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('now playing').setDescription(`**${track.title}**`)
      .addFields({ name: 'duration', value: track.duration, inline: true }, { name: 'requested by', value: track.requestedBy?.tag ?? 'unknown', inline: true })
      .setThumbnail(track.thumbnail)] });
  }

  if (command === 'repeat') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue) return message.reply("not playing anything");
    const { QueueRepeatMode } = require('discord-player');
    const modeArg = args[0]?.toLowerCase();
    const modeMap = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE };
    let newMode;
    if (modeArg && modeMap[modeArg] !== undefined) {
      newMode = modeMap[modeArg];
    } else {
      newMode = queue.repeatMode === QueueRepeatMode.OFF ? QueueRepeatMode.TRACK : QueueRepeatMode.OFF;
    }
    queue.setRepeatMode(newMode);
    const modeLabel = { [QueueRepeatMode.OFF]: 'off', [QueueRepeatMode.TRACK]: 'track 🔂', [QueueRepeatMode.QUEUE]: 'queue 🔁' };
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`repeat is now **${modeLabel[newMode]}**`)] });
  }

  if (command === 'shuffle') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue?.tracks.size) return message.reply("queue is empty");
    queue.tracks.shuffle();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('🔀 queue shuffled')] });
  }

  if (command === 'volume' || command === 'vol') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (!queue) return message.reply("not playing anything");
    const input = parseInt(args[0], 10);
    if (isNaN(input) || input < 0 || input > 100) return message.reply("give me a number between **0** and **100**");
    queue.node.setVolume(input);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🔊 volume set to **${input}%**`)] });
  }

  if (command === 'leave' || command === 'stop') {
    if (!message.guild) return;
    const queue = useQueue(message.guild.id);
    if (queue) queue.delete();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('left the vc')] });
  }

  // ── Whitelist-required prefix commands ───────────────────────────────────────
  if (!loadWhitelist().includes(message.author.id)) return;

  if (command === 'hb') {
    const target = message.mentions.users.first();
    const rawId  = args[0];
    if (!target && !rawId) return message.reply('give me a user or id bro');
    const userId = target?.id ?? rawId;
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!/^\d{17,19}$/.test(userId)) return message.reply("that doesn't look like a real id");
    try {
      await message.guild.members.ban(userId, { reason: `hardban by ${message.author.tag}: ${reason}`, deleteMessageSeconds: 0 });
      let username = target?.tag ?? userId;
      if (!target) { try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {} }
      return message.reply({ embeds: [new EmbedBuilder().setTitle("hardban'd").setColor(0xed4245)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return message.reply(`couldn't ban — ${err.message}`); }
  }

  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.bannable) return message.reply("can't ban them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return message.reply({ embeds: [new EmbedBuilder().setTitle("they're gone").setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.kickable) return message.reply("can't kick them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.kick(reason); } catch { return message.reply("couldn't kick them"); }
    return message.reply({ embeds: [new EmbedBuilder().setTitle('kicked').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (command === 'unban') {
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply('give me a valid user id');
    try {
      await message.guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return message.reply({ embeds: [new EmbedBuilder().setTitle('unbanned').setColor(0x57f287)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return message.reply(`couldn't unban — ${err.message}`); }
  }

  if (command === 'timeout') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const minutes = parseInt(args[1]) || 5;
    if (minutes < 1 || minutes > 40320) return message.reply('has to be between 1 and 40320 mins');
    const reason = args.slice(2).join(' ') || 'no reason';
    try { await target.timeout(minutes * 60 * 1000, reason); } catch { return message.reply("couldn't time them out"); }
    return message.reply({ embeds: [new EmbedBuilder().setTitle('timed out').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'duration', value: `${minutes}m`, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (command === 'untimeout') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); } catch { return message.reply("couldn't remove their timeout"); }
    return message.reply({ embeds: [new EmbedBuilder().setTitle('timeout removed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'mute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); } catch { return message.reply("couldn't mute them"); }
    return message.reply({ embeds: [new EmbedBuilder().setTitle('muted').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); } catch { return message.reply("couldn't unmute them"); }
    return message.reply({ embeds: [new EmbedBuilder().setTitle('unmuted').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'hush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (hushedData[target.id]) return message.reply(`**${target.user.tag}** is already hushed — use \`${prefix}unhush\` to remove it`);
    hushedData[target.id] = { hushedBy: message.author.id, at: Date.now() };
    saveHushed(hushedData);
    return message.reply({ embeds: [new EmbedBuilder().setTitle('hushed').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL()).setDescription('every msg they send gets deleted lol')
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'unhush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (!hushedData[target.id]) return message.reply(`**${target.user.tag}** isn't hushed`);
    delete hushedData[target.id]; saveHushed(hushedData);
    return message.reply({ embeds: [new EmbedBuilder().setTitle('unhushed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'lock') {
    try { await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')] }); }
    catch { return message.reply("couldn't lock the channel, check my perms"); }
  }

  if (command === 'unlock') {
    try { await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }); return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')] }); }
    catch { return message.reply("couldn't unlock the channel, check my perms"); }
  }

  if (command === 'prefix') {
    const newPrefix = args[0];
    if (!newPrefix) return message.reply(`prefix is \`${prefix}\` rn`);
    if (newPrefix.length > 5) return message.reply("prefix can't be more than 5 chars");
    const cfg = loadConfig(); cfg.prefix = newPrefix; saveConfig(cfg);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)] });
  }

  if (command === 'status') {
    const validTypes = ['playing', 'watching', 'listening', 'competing', 'custom'];
    const type = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');
    if (!type || !validTypes.includes(type) || !text) return message.reply('do it like: status [playing/watching/listening/competing/custom] [text]');
    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig(); cfg.status = statusData; saveConfig(cfg);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)] });
  }

  if (command === 'afk') {
    const reason = args.join(' ') || null;
    const afk = loadAfk();
    afk[message.author.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ur afk now${reason ? `: ${reason}` : ''}`)], allowedMentions: { repliedUser: false } });
  }

  if (command === 'restart') {
    const sent = await message.reply('restarting rq...');
    saveJSON(REBOOT_FILE, { channelId: sent.channelId, messageId: sent.id });
    setTimeout(() => process.exit(0), 500);
  }

  if (command === 'say') {
    const text = args.join(' ');
    if (!text) return message.reply('say what?');
    try { await message.delete(); } catch {}
    return message.channel.send(text);
  }

  if (command === 'cs') {
    const had = snipeCache.has(message.channel.id);
    snipeCache.delete(message.channel.id);
    return message.reply(had ? 'snipe cleared' : 'nothing to clear');
  }

  if (command === 'tag') {
    const full = args.join(' ');
    if (full.includes('|')) {
      const pipeIdx = full.indexOf('|');
      const name    = full.slice(0, pipeIdx).trim().toLowerCase();
      const content = full.slice(pipeIdx + 1).trim();
      if (!name || !content) return message.reply('do it like: tag [name] | [content]');
      const tags = loadTags(); const isNew = !tags[name]; tags[name] = content; saveTags(tags);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)] });
    }
    const robloxUser = args[0];
    const tagName    = args.slice(1).join(' ').toLowerCase();
    if (!robloxUser || !tagName) return message.reply(`idk what u want, try:\n\`${prefix}tag [name] | [roleId]\` — make a tag\n\`${prefix}tag [robloxUsername] [tagname]\` — rank someone`);
    const tags = loadTags();
    if (!tags[tagName]) return message.reply(`no tag called **${tagName}** exists`);
    const roleId = tags[tagName].trim();
    if (isNaN(Number(roleId))) return message.reply(`tag **${tagName}** doesn't have a valid role id`);
    const status = await message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ranking **${robloxUser}**...`)] });
    try {
      const result = await rankRobloxUser(robloxUser, roleId);
      const embed  = new EmbedBuilder().setTitle('got em ranked').setColor(0x57f287)
        .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: tagName, inline: true }, { name: 'role id', value: roleId, inline: true })
        .setFooter({ text: `ranked by ${message.author.tag}` }).setTimestamp();
      if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
      await status.edit({ content: '', embeds: [embed] });
      const logEmbed = new EmbedBuilder().setTitle('rank log').setColor(0x5865f2)
        .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: tagName, inline: true }, { name: 'role id', value: roleId, inline: true },
          { name: 'ranked by', value: `<@${message.author.id}>`, inline: true }, { name: 'channel', value: `<#${message.channel.id}>`, inline: true })
        .setFooter({ text: `roblox id: ${result.userId}` }).setTimestamp();
      if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
      await sendLog(message.guild, logEmbed);
    } catch (err) { await status.edit({ content: '', embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't rank them - ${err.message}`)] }); }
    return;
  }

  if (command === 'grouproles') {
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isnt set');
    try {
      const data = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      if (!data.roles?.length) return message.reply('no roles found for this group');
      const lines = data.roles.sort((a, b) => a.rank - b.rank).map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return message.reply({ embeds: [new EmbedBuilder().setTitle('group roles').setColor(0x2b2d31).setDescription(lines.join('\n')).setFooter({ text: `group id: ${groupId}` }).setTimestamp()] });
    } catch { return message.reply("couldn't load group roles, try again"); }
  }

  if (command === 'setlog') {
    const ch = message.mentions.channels?.first();
    if (!ch?.isTextBased()) return message.reply('mention a text channel');
    const cfg2 = loadConfig(); cfg2.logChannelId = ch.id; saveConfig(cfg2);
    return message.reply({ embeds: [new EmbedBuilder().setTitle('log channel set').setColor(0x57f287).setDescription(`logs going to ${ch} now`).setTimestamp()] });
  }

  if (command === 'jail') {
    if (!message.guild) return;
    const target = message.mentions.members?.first();
    if (!target) return message.reply('mention someone to jail');
    const reason = args.slice(1).join(' ') || 'no reason';
    try { return message.reply({ embeds: [await jailMember(message.guild, target, reason, message.author.tag)] }); }
    catch (e) { return message.reply(e.message); }
  }

  if (command === 'unjail') {
    if (!message.guild) return;
    const target = message.mentions.members?.first();
    if (!target) return message.reply('mention someone to unjail');
    try { return message.reply({ embeds: [await unjailMember(message.guild, target, message.author.tag)] }); }
    catch (e) { return message.reply(e.message); }
  }

  if (command === 'whitelist') return message.reply('whitelist is slash-command only — use `/whitelist` instead');
});

client.login(process.env.DISCORD_TOKEN);

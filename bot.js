import { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionsBitField, ActivityType, ChannelType, REST, Routes,
  SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// bot client setup - need all these intents for dms and stuff to work
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ],
  // partials are needed so dms actually work
  partials: [Partials.Channel, Partials.Message]
})

// logo and stuff
const LOGO_URL = 'https://image2url.com/r2/default/images/1775266989420-d840fc51-b30b-42e5-8620-25540bc545d9.png'
const MOD_IMAGE_URL = 'https://i.imgur.com/CBDoIWa.png'
const FRAID_GROUP_ID = '489845165'
const FRAID_GROUP_LINK = 'https://www.roblox.com/communities/489845165/fraidfg#!/about'

// base embed that all embeds use
function baseEmbed() {
  return new EmbedBuilder().setThumbnail(LOGO_URL)
}

// json file paths for everything
const TAGS_FILE = path.join(__dirname, 'tags.json')
const HUSHED_FILE = path.join(__dirname, 'hushed.json')
const CONFIG_FILE = path.join(__dirname, 'config.json')
const AFK_FILE = path.join(__dirname, 'afk.json')
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json')
const REBOOT_FILE = path.join(__dirname, 'reboot_msg.json')
const VM_CONFIG_FILE = path.join(__dirname, 'vm_config.json')
const VM_CHANNELS_FILE = path.join(__dirname, 'vm_channels.json')
const JAIL_FILE = path.join(__dirname, 'jail.json')
const WL_MANAGERS_FILE = path.join(__dirname, 'wl_managers.json')
const AUTOREACT_FILE = path.join(__dirname, 'autoreact.json')
const HARDBANS_FILE = path.join(__dirname, 'hardbans.json')
const FLAGGED_GROUPS_FILE = path.join(__dirname, 'flagged_groups.json')
const VERIFY_CONFIG_FILE = path.join(__dirname, 'verify_config.json')
const VERIFY_WHITELIST_FILE = path.join(__dirname, 'verify_whitelist.json')
const SAVED_EMBEDS_FILE = path.join(__dirname, 'saved_embeds.json')
const ANNOY_FILE = path.join(__dirname, 'annoy.json')
const SKULL_FILE = path.join(__dirname, 'skull.json')
const ACTIVITY_CHECK_FILE = path.join(__dirname, 'activity_check.json')
const TAGGED_MEMBERS_FILE = path.join(__dirname, 'tagged_members.json')

// read/write json helpers
function loadJSON(file) {
  if (!fs.existsSync(file)) return {}
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)) }

// shortcut load/save functions for each file
const loadTags = () => loadJSON(TAGS_FILE)
const saveTags = t => saveJSON(TAGS_FILE, t)
const loadHushed = () => loadJSON(HUSHED_FILE)
const saveHushed = h => saveJSON(HUSHED_FILE, h)
const loadConfig = () => loadJSON(CONFIG_FILE)
const saveConfig = c => saveJSON(CONFIG_FILE, c)
const loadAfk = () => loadJSON(AFK_FILE)
const saveAfk = a => saveJSON(AFK_FILE, a)
const loadWhitelist = () => { const d = loadJSON(WHITELIST_FILE); return Array.isArray(d.ids) ? d.ids : [] }
const saveWhitelist = ids => saveJSON(WHITELIST_FILE, { ids })
const loadVmConfig = () => loadJSON(VM_CONFIG_FILE)
const saveVmConfig = c => saveJSON(VM_CONFIG_FILE, c)
const loadVmChannels = () => loadJSON(VM_CHANNELS_FILE)
const saveVmChannels = c => saveJSON(VM_CHANNELS_FILE, c)
const loadJail = () => loadJSON(JAIL_FILE)
const saveJail = j => saveJSON(JAIL_FILE, j)
const loadWlManagers = () => { const d = loadJSON(WL_MANAGERS_FILE); return Array.isArray(d.ids) ? d.ids : [] }
const saveWlManagers = ids => saveJSON(WL_MANAGERS_FILE, { ids })
const loadAutoreact = () => loadJSON(AUTOREACT_FILE)
const loadHardbans = () => loadJSON(HARDBANS_FILE)
const saveHardbans = h => saveJSON(HARDBANS_FILE, h)
const loadFlaggedGroups = () => { const d = loadJSON(FLAGGED_GROUPS_FILE); return Array.isArray(d.ids) ? d.ids : [] }
const saveFlaggedGroups = ids => saveJSON(FLAGGED_GROUPS_FILE, { ids })
const loadVerifyConfig = () => loadJSON(VERIFY_CONFIG_FILE)
const saveVerifyConfig = c => saveJSON(VERIFY_CONFIG_FILE, c)
const loadVerifyWhitelist = () => loadJSON(VERIFY_WHITELIST_FILE)
const saveVerifyWhitelist = v => saveJSON(VERIFY_WHITELIST_FILE, v)
const loadSavedEmbeds = () => loadJSON(SAVED_EMBEDS_FILE)
const saveSavedEmbeds = e => saveJSON(SAVED_EMBEDS_FILE, e)
const loadAnnoy = () => loadJSON(ANNOY_FILE)
const saveAnnoy = a => saveJSON(ANNOY_FILE, a)
const loadSkull = () => loadJSON(SKULL_FILE)
const saveSkull = s => saveJSON(SKULL_FILE, s)
const loadActivityCheck = () => loadJSON(ACTIVITY_CHECK_FILE)
const saveActivityCheck = a => saveJSON(ACTIVITY_CHECK_FILE, a)
const loadTaggedMembers = () => loadJSON(TAGGED_MEMBERS_FILE)
const saveTaggedMembers = t => saveJSON(TAGGED_MEMBERS_FILE, t)

// check if someone can manage the whitelist
function isWlManager(userId) {
  const mgrs = loadWlManagers()
  if (mgrs.includes(userId)) return true
  // also check the env var ones
  const envMgrs = (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean)
  return envMgrs.includes(userId)
}

// set up config files on startup
;(function initConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveJSON(CONFIG_FILE, { logChannelId: null, prefix: '.', status: null })
  } else {
    const cfg = loadConfig()
    let changed = false
    // migrate old whitelist format if needed
    if (Array.isArray(cfg.whitelist) && cfg.whitelist.length > 0) {
      const merged = [...new Set([...loadWhitelist(), ...cfg.whitelist])]
      saveWhitelist(merged)
      delete cfg.whitelist
      changed = true
    } else if ('whitelist' in cfg) {
      delete cfg.whitelist
      changed = true
    }
    if (!cfg.prefix) { cfg.prefix = '.'; changed = true }
    if (changed) saveConfig(cfg)
  }
  if (!fs.existsSync(WHITELIST_FILE)) saveWhitelist([])
  if (!fs.existsSync(TAGS_FILE)) saveJSON(TAGS_FILE, {})
  if (!fs.existsSync(WL_MANAGERS_FILE)) {
    const fromEnv = (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean)
    saveWlManagers(fromEnv)
  }
  if (!fs.existsSync(FLAGGED_GROUPS_FILE)) saveFlaggedGroups([])
  if (!fs.existsSync(VERIFY_CONFIG_FILE)) saveVerifyConfig({ roleId: null, groupId: null })
  if (!fs.existsSync(VERIFY_WHITELIST_FILE)) saveVerifyWhitelist({ roles: [], users: [] })
  if (!fs.existsSync(SAVED_EMBEDS_FILE)) saveSavedEmbeds({})
  if (!fs.existsSync(ANNOY_FILE)) saveAnnoy({})
  if (!fs.existsSync(SKULL_FILE)) saveSkull({})
  if (!fs.existsSync(HARDBANS_FILE)) saveHardbans({})
  if (!fs.existsSync(ACTIVITY_CHECK_FILE)) saveActivityCheck({})
  if (!fs.existsSync(TAGGED_MEMBERS_FILE)) saveTaggedMembers({})
})()

const getPrefix = () => loadConfig().prefix || '.'

// sends a log embed to the log channel if one is set
async function sendLog(guild, embed) {
  const cfg = loadConfig()
  if (!cfg.logChannelId) return
  try {
    const ch = await guild.channels.fetch(cfg.logChannelId)
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] })
  } catch (err) {
    console.error('log channel error:', err.message)
  }
}

// sends a log embed to the dedicated strip log channel if one is set, else falls back to main log
async function sendStripLog(guild, embed) {
  const cfg = loadConfig()
  const channelId = cfg.stripLogChannelId || cfg.logChannelId
  if (!channelId) return
  try {
    const ch = await guild.channels.fetch(channelId)
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] })
  } catch (err) {
    console.error('strip log channel error:', err.message)
  }
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
  return baseEmbed().setTitle('jailed').setColor(0xed4245).setThumbnail(member.user.displayAvatarURL())
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
  return baseEmbed().setTitle('unjailed').setColor(0x57f287).setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'user', value: member.user.tag, inline: true }, { name: 'mod', value: modTag, inline: true }).setTimestamp();
}

// ─── Help pages ───────────────────────────────────────────────────────────────
const HELP_SECTIONS = [
  {
    title: 'Moderation',
    commands: [
      '{p}hb @user [reason]',
      '{p}unhb [userId]',
      '{p}ban @user [reason]',
      '{p}unban [userId] [reason]',
      '{p}kick @user [reason]',
      '{p}timeout @user [minutes] [reason]',
      '{p}untimeout @user',
      '{p}mute @user [reason]',
    ]
  },
  {
    title: 'Moderation 2',
    commands: [
      '{p}unmute @user',
      '{p}hush @user',
      '{p}unhush @user',
      '{p}jail @user [reason]',
      '{p}unjail @user',
      '{p}lock',
      '{p}unlock',
      '{p}nuke',
    ]
  },
  {
    title: 'Verify System',
    commands: [
      '{p}verify @user',
      '{p}vstatus',
      '{p}setverifyrole [role]',
      '{p}vwl [role]',
      '{p}vwluser [user]',
      '{p}vunwl [role/user]',
    ]
  },
  {
    title: 'Special Actions',
    commands: [
      '{p}annoy @user',
      '{p}unannoy @user',
      '{p}skull @user',
      '{p}unskull @user',
    ]
  },
  {
    title: 'Info & Utility',
    commands: [
      '{p}about',
      '{p}activitycheck start [message]',
      '{p}activitycheck end',
      '{p}snipe',
      '{p}afk [reason]',
      '{p}cs',
      '{p}say [text]',
      '{p}dm @user/roleId/userId [msg]',
    ]
  },
  {
    title: 'Roblox',
    commands: [
      '{p}roblox [username]',
      '{p}gc [username]',
      '{p}grouproles',
      '{p}group [username] [action]',
      '{p}tag [name] | [roleId]',
      '{p}tag [robloxUser] [tagname]',
      '{p}strip [robloxUser] [reason]',
      '{p}striptag [tagname]',
    ]
  },
  {
    title: 'Admin',
    commands: [
      '{p}prefix [new prefix]',
      '{p}status [type] [text]',
      '{p}setlog #channel',
      '{p}tagstrip #channel',
      '{p}restart',
      '{p}config',
      '{p}whitelist add @user',
      '{p}whitelist remove @user',
      '{p}whitelist list',
    ]
  },
];

const GC_PER_PAGE = 10;

function buildHelpEmbed(page) {
  const p = getPrefix()
  const section = HELP_SECTIONS[page]
  const totalPages = HELP_SECTIONS.length
  return new EmbedBuilder()
    .setColor(0x1b6fe8)
    .setTitle(`Commands — ${section.title}`)
    .setThumbnail(LOGO_URL)
    .setDescription(section.commands.map(c => `\`${c.replace(/\{p\}/g, p)}\``).join('\n'))
    .setFooter({ text: `/fraid • Page ${page + 1} of ${totalPages}` })
}

function buildHelpRow(page) {
  const total = HELP_SECTIONS.length
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help_${page - 1}`).setLabel('‹ Back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`help_${page + 1}`).setLabel('Next ›').setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
  )
}

function buildGcEmbed(username, groups, avatarUrl, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  const slice = groups.slice(page * GC_PER_PAGE, page * GC_PER_PAGE + GC_PER_PAGE);
  const groupLines = slice.map(g => `• [${g.group.name}](https://www.roblox.com/communities/${g.group.id}/about)`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0x1b6fe8)
    .setTitle('Group Check')
    .setThumbnail(LOGO_URL)
    .setDescription(`${username}\n\n**Groups**\n${groupLines}`)
    .setFooter({ text: `/fraid • Page ${page + 1} of ${totalPages}` });
  if (avatarUrl) embed.setAuthor({ name: username, iconURL: avatarUrl });
  return embed;
}

function buildGcNotInGroupEmbed(displayName) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Join Group')
    .setThumbnail(LOGO_URL)
    .setAuthor({ name: displayName })
    .setDescription(`**${displayName}** has not joined the group, wait till they join to verify them.\n\n**Group ID**\n${FRAID_GROUP_ID}\n**Link**\n[Join Here](${FRAID_GROUP_LINK})`)
    .setFooter({ text: '/fraid' })
}

// shows when the user IS in the fraid group
function buildGcInGroupEmbed(displayName) {
  return new EmbedBuilder()
    .setColor(0x1b6fe8)
    .setTitle('Group Check')
    .setThumbnail(LOGO_URL)
    .setAuthor({ name: displayName })
    .setDescription(`**${displayName}** is able to get verified now`)
    .addFields(
      { name: 'Group ID', value: FRAID_GROUP_ID, inline: false },
      { name: 'Join Group', value: `[Join Here](${FRAID_GROUP_LINK})`, inline: false }
    )
    .setFooter({ text: '/fraid' })
}

function buildGcRow(username, groups, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gc_${page - 1}_${username}`).setLabel('back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`gc_${page + 1}_${username}`).setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
  );
}

function buildVmInterfaceEmbed(guild) {
  return baseEmbed().setColor(0x1b6fe8).setTitle('voicemaster')
    .setDescription('use the buttons below to manage your vc')
    .addFields({ name: 'buttons', value: [
      '🔒 — **lock** the vc', '🔓 — **unlock** the vc',
      '👻 — **ghost** the vc', '👁️ — **reveal** the vc',
      '✏️ — **rename**', '👑 — **claim** the vc',
      '➕ — **increase** user limit', '➖ — **decrease** user limit',
      '🗑️ — **delete**', '📋 — **view** channel info',
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
  return baseEmbed().setColor(0x1b6fe8).setTitle('voicemaster').setDescription([
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
const gcCache          = new Map();
const snipeCache       = new Map();
const striptagPending  = new Map(); // userId -> { tagName, members, rank2RoleId }

// ─── Slash commands ───────────────────────────────────────────────────────────
const GUILD_ONLY_COMMANDS = new Set(['ban', 'kick', 'unban', 'purge', 'snipe', 'timeout', 'mute', 'unmute', 'hush', 'lock', 'unlock', 'setlog', 'nuke']);

// contexts for commands that work everywhere (guilds, bot DMs, and user-install DMs)
const ALL_CONTEXTS = [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel];
// guild-only commands — only available inside servers
const GUILD_CONTEXTS = [InteractionContextType.Guild];
// both guild install and user install
const ALL_INSTALLS = [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall];
// guild install only
const GUILD_INSTALLS = [ApplicationIntegrationType.GuildInstall];

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('shows the command list')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('vmhelp').setDescription('voicemaster command list')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('afk').setDescription('set yourself as afk')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('roblox').setDescription('look up a roblox user')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('username').setDescription('roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('gc').setDescription('list roblox groups for a user')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('username').setDescription('roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('hb').setDescription('hardban a user')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to ban').setRequired(false))
    .addStringOption(o => o.setName('id').setDescription('user id if not in server').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('ban a member')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('kick a member')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unban').setDescription('unban a user by id')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addStringOption(o => o.setName('id').setDescription('user id to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('delete messages in bulk')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addIntegerOption(o => o.setName('amount').setDescription('how many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('snipe').setDescription('show the last deleted message')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS),
  new SlashCommandBuilder().setName('timeout').setDescription('timeout a member')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('duration in minutes').setRequired(false).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('untimeout').setDescription('remove a timeout')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('mute a member')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unmute').setDescription('remove a mute')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('hush').setDescription('auto-delete all messages from a user')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('unhush').setDescription('remove auto-delete from a user')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('nuke').setDescription('delete and recreate the channel (clears all messages)')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS),
  new SlashCommandBuilder().setName('lock').setDescription('lock the current channel')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS),
  new SlashCommandBuilder().setName('unlock').setDescription('unlock the current channel')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS),
  new SlashCommandBuilder().setName('say').setDescription('make the bot say something')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('text').setDescription('what to say').setRequired(true)),
  new SlashCommandBuilder().setName('cs').setDescription('clear the snipe cache')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('grouproles').setDescription('list roblox group roles')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('tag').setDescription('create a tag or rank someone')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('name').setDescription('tag name').setRequired(true))
    .addStringOption(o => o.setName('content').setDescription('role id for new tag').setRequired(false))
    .addStringOption(o => o.setName('robloxuser').setDescription('roblox username to rank').setRequired(false)),
  new SlashCommandBuilder().setName('restart').setDescription('restart the bot')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('wlmanager').setDescription('manage whitelist managers')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('action').setDescription('what to do').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }))
    .addUserOption(o => o.setName('user').setDescription('user (for add/remove)').setRequired(false)),
  new SlashCommandBuilder().setName('jail').setDescription('jail a user')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('unjail').setDescription('release a user from jail')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to unjail').setRequired(true)),
  new SlashCommandBuilder().setName('prefix').setDescription('change or view the bot prefix')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('new').setDescription('new prefix').setRequired(false)),
  new SlashCommandBuilder().setName('status').setDescription('change the bot status')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('type').setDescription('type').setRequired(true)
      .addChoices({ name: 'playing', value: 'playing' }, { name: 'watching', value: 'watching' }, { name: 'listening', value: 'listening' }, { name: 'competing', value: 'competing' }, { name: 'custom', value: 'custom' }))
    .addStringOption(o => o.setName('text').setDescription('status text').setRequired(true)),
  new SlashCommandBuilder().setName('setlog').setDescription('set the log channel')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addChannelOption(o => o.setName('channel').setDescription('channel').setRequired(true)),
  new SlashCommandBuilder().setName('whitelist').setDescription('manage the whitelist')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('action').setDescription('what to do').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }))
    .addUserOption(o => o.setName('user').setDescription('user (for add/remove)').setRequired(false)),
  // ── NEW COMMANDS ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('about').setDescription('show bot info and bio')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS),
  new SlashCommandBuilder().setName('activitycheck').setDescription('run or finish an activity check')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addStringOption(o => o.setName('action').setDescription('start or end the check').setRequired(true)
      .addChoices({ name: 'start', value: 'start' }, { name: 'end', value: 'end' }))
    .addStringOption(o => o.setName('message').setDescription('activity check message e.g. Activity check #1 (for start)').setRequired(false)),
  new SlashCommandBuilder().setName('annoy').setDescription('react to every message a user sends with 10 random emojis')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to annoy').setRequired(true)),
  new SlashCommandBuilder().setName('unannoy').setDescription('stop annoying a user')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to stop annoying').setRequired(true)),
  new SlashCommandBuilder().setName('skull').setDescription('react to every message a user sends with 💀')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to skull').setRequired(true)),
  new SlashCommandBuilder().setName('unskull').setDescription('stop skulling a user')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to stop skulling').setRequired(true)),
  new SlashCommandBuilder().setName('config').setDescription('customize embed settings for this server')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addStringOption(o => o.setName('setting').setDescription('what to configure').setRequired(true)
      .addChoices(
        { name: 'color', value: 'color' },
        { name: 'footer', value: 'footer' },
        { name: 'thumbnail', value: 'thumbnail' }
      ))
    .addStringOption(o => o.setName('value').setDescription('new value').setRequired(true)),
  new SlashCommandBuilder().setName('group').setDescription('all roblox group actions in one command')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('username').setDescription('roblox username').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('action to perform').setRequired(true)
      .addChoices(
        { name: 'check', value: 'check' },
        { name: 'rank', value: 'rank' },
        { name: 'exile', value: 'exile' }
      ))
    .addStringOption(o => o.setName('value').setDescription('role id for rank action').setRequired(false)),
  new SlashCommandBuilder().setName('unhb').setDescription('remove a hardban')
    .setIntegrationTypes(ALL_INSTALLS).setContexts(ALL_CONTEXTS)
    .addStringOption(o => o.setName('id').setDescription('user id to un-hardban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('setverifyrole').setDescription('set the role given on verification')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addRoleOption(o => o.setName('role').setDescription('role to give on verification').setRequired(true)),
  new SlashCommandBuilder().setName('verify').setDescription('verify a user and give them the member role')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to verify').setRequired(true)),
  new SlashCommandBuilder().setName('vstatus').setDescription('view the verify system status')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS),
  new SlashCommandBuilder().setName('vunwl').setDescription('remove a role or user from the verify whitelist')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addRoleOption(o => o.setName('role').setDescription('role to remove').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('user to remove').setRequired(false)),
  new SlashCommandBuilder().setName('vwl').setDescription('whitelist a role to use /verify')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addRoleOption(o => o.setName('role').setDescription('role to whitelist').setRequired(true)),
  new SlashCommandBuilder().setName('vwluser').setDescription('whitelist a user to use /verify')
    .setIntegrationTypes(GUILD_INSTALLS).setContexts(GUILD_CONTEXTS)
    .addUserOption(o => o.setName('user').setDescription('user to whitelist').setRequired(true)),
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
    try { const ch = await client.channels.fetch(channelId); const msg = await ch.messages.fetch(messageId); await msg.edit('Restarted successfully.'); } catch {}
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const guildId = process.env.GUILD_ID;
    // Always register globally so commands work in DMs
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('slash commands registered globally (DMs supported)');
    if (guildId) {
      // Also register to guild for instant availability in the server
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
      console.log('slash commands also registered to guild');
    }
  } catch (err) { console.error('failed to register slash commands:', err.message); }

  const startupChannelId = process.env.STARTUP_CHANNEL_ID;
  if (startupChannelId) {
    try {
      const ch = await client.channels.fetch(startupChannelId);
      await ch.send({
        embeds: [
          baseEmbed()
            .setColor(0x1b6fe8)
            .setTitle(`${client.user.username} is online`)
            .setDescription('online and ready')
            .setTimestamp()
        ]
      });
    } catch (err) { console.error('failed to send startup embed:', err.message); }
  }
});

// ─── Message delete snipe ─────────────────────────────────────────────────────
client.on('messageDelete', message => {
  if (message.author?.bot || !message.content) return;
  snipeCache.set(message.channel.id, { content: message.content, author: message.author?.tag ?? 'unknown', avatarUrl: message.author?.displayAvatarURL() ?? null, deletedAt: Date.now() });
});

// ─── guildMemberAdd: hardban rejoin + annoy ───────────────────────────────────
client.on('guildMemberAdd', async member => {
  const hardbans = loadHardbans();
  if (hardbans[member.guild.id]?.[member.id]) {
    try { await member.ban({ reason: 'hardban: rejoin detected' }); } catch {}
  }
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
      return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`✏️ renamed to **${newName}**`)], ephemeral: true });
    } catch (e) { return interaction.reply({ content: `couldn't rename — ${e.message}`, ephemeral: true }); }
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('help_')) {
      const page = parseInt(interaction.customId.split('_')[1]);
      return interaction.update({ embeds: [buildHelpEmbed(page)], components: [buildHelpRow(page)] });
    }
    if (interaction.customId === 'striptag_confirm' || interaction.customId === 'striptag_cancel') {
      const pending = striptagPending.get(interaction.user.id);
      if (!pending) return interaction.update({ content: 'this has expired, run the command again', embeds: [], components: [] });
      striptagPending.delete(interaction.user.id);
      if (interaction.customId === 'striptag_cancel') {
        return interaction.update({ embeds: [baseEmbed().setColor(0xed4245).setTitle('striptag cancelled').setDescription(`cancelled stripping tag **${pending.tagName}**`)], components: [] });
      }
      // confirmed — execute the strip
      await interaction.update({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`stripping **${pending.members.length}** user${pending.members.length !== 1 ? 's' : ''} from tag **${pending.tagName}**...`)], components: [] });
      const succeeded = [];
      const failed = [];
      for (const robloxUsername of pending.members) {
        try {
          const result = await rankRobloxUser(robloxUsername, pending.rank2RoleId);
          succeeded.push(result.displayName);
        } catch (err) {
          failed.push(`${robloxUsername} — ${err.message}`);
        }
      }
      const taggedMembers = loadTaggedMembers();
      delete taggedMembers[pending.tagName];
      saveTaggedMembers(taggedMembers);
      const desc = [];
      if (succeeded.length) desc.push(`**stripped (${succeeded.length}):** ${succeeded.join(', ')}`);
      if (failed.length) desc.push(`**failed (${failed.length}):**\n${failed.join('\n')}`);
      const resultEmbed = baseEmbed().setColor(succeeded.length ? 0x57f287 : 0xed4245).setTitle(`striptag — ${pending.tagName}`)
        .setDescription(desc.join('\n\n') || 'done').setTimestamp();
      await interaction.editReply({ embeds: [resultEmbed], components: [] });
      const logEmbed = baseEmbed().setTitle('striptag log').setColor(0xed4245)
        .addFields(
          { name: 'tag', value: pending.tagName, inline: true },
          { name: 'stripped by', value: `<@${interaction.user.id}>`, inline: true },
          { name: `stripped (${succeeded.length})`, value: succeeded.join(', ') || 'none' },
          ...(failed.length ? [{ name: `failed (${failed.length})`, value: failed.join('\n') }] : [])
        ).setTimestamp();
      if (interaction.guild) await sendStripLog(interaction.guild, logEmbed);
      return;
    }

    if (interaction.customId === 'ac_checkin') {
      if (!interaction.guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
      const checks = loadActivityCheck();
      const guildCheck = checks[interaction.guild.id];
      if (!guildCheck?.active) return interaction.reply({ content: "there's no active activity check right now", ephemeral: true });
      if (guildCheck.checkins.includes(interaction.user.id)) {
        return interaction.reply({ content: "you already checked in!", ephemeral: true });
      }
      guildCheck.checkins.push(interaction.user.id);
      saveActivityCheck(checks);
      try { await interaction.user.send('Thanks for reacting to the activity check I love youuuu!❤️😘'); } catch {}
      return interaction.reply({ content: "reacted.", ephemeral: true });
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
        return interaction.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('🔒 channel locked')], ephemeral: true });
      }
      if (interaction.customId === 'vm_unlock') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { Connect: null });
        return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('🔓 channel unlocked')], ephemeral: true });
      }
      if (interaction.customId === 'vm_ghost') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { ViewChannel: false });
        return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription('👻 channel hidden')], ephemeral: true });
      }
      if (interaction.customId === 'vm_reveal') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        await vc.permissionOverwrites.edit(everyone, { ViewChannel: null });
        return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('👁️ channel visible')], ephemeral: true });
      }
      if (interaction.customId === 'vm_claim') {
        if (vc.members.has(chData.ownerId)) return interaction.reply({ content: "the owner is still in the channel", ephemeral: true });
        chData.ownerId = interaction.user.id;
        vmChannels[vc.id] = chData;
        saveVmChannels(vmChannels);
        return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`👑 you now own **${vc.name}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_info') {
        const limit = vc.userLimit === 0 ? 'no limit' : vc.userLimit;
        const owner = await interaction.guild.members.fetch(chData.ownerId).catch(() => null);
        return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('📋 channel info')
          .addFields({ name: 'name', value: vc.name, inline: true }, { name: 'owner', value: owner?.displayName ?? 'unknown', inline: true },
            { name: 'members', value: `${vc.members.size}`, inline: true }, { name: 'limit', value: `${limit}`, inline: true })
        ], ephemeral: true });
      }
      if (interaction.customId === 'vm_limit_up') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const newLimit = Math.min((vc.userLimit || 0) + 1, 99);
        await vc.setUserLimit(newLimit);
        return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`➕ limit set to **${newLimit}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_limit_down') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const newLimit = Math.max((vc.userLimit || 1) - 1, 0);
        await vc.setUserLimit(newLimit);
        return interaction.reply({ embeds: [baseEmbed().setColor(0xfee75c).setDescription(`➖ limit set to **${newLimit === 0 ? 'no limit' : newLimit}**`)], ephemeral: true });
      }
      if (interaction.customId === 'vm_rename') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        const modal = new ModalBuilder().setCustomId('vm_rename_modal').setTitle('Rename Channel')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_rename_input').setLabel('New name').setStyle(TextInputStyle.Short).setRequired(true)
          ));
        return interaction.showModal(modal);
      }
      if (interaction.customId === 'vm_delete') {
        if (!isOwner) return interaction.reply({ content: "you don't own this channel", ephemeral: true });
        try { await vc.delete(); delete vmChannels[vc.id]; saveVmChannels(vmChannels); } catch (e) { return interaction.reply({ content: `couldn't delete — ${e.message}`, ephemeral: true }); }
        return;
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const guild = interaction.guild;
  const channel = interaction.channel;

  // ── Open-to-everyone commands ────────────────────────────────────────────────
  if (commandName === 'roblox') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user")
      const userId    = userBasic.id;
      const user      = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created   = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return interaction.editReply({ embeds: [baseEmbed().setTitle(`${user.displayName} (@${user.name})`).setURL(profileUrl).setColor(0x1b6fe8)
        .addFields({ name: 'created', value: created, inline: true }, { name: 'user id', value: `${userId}`, inline: true }).setThumbnail(avatarUrl).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl), new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`))]
      });
    } catch { return interaction.editReply("something went wrong loading their info, try again") }
  }

  if (commandName === 'gc') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user")
      const userId = userBasic.id;
      const groupsData = (await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json()).data ?? [];
      const displayName = userBasic.displayName || userBasic.name;
      const inFraidGroup = groupsData.some(g => String(g.group.id) === FRAID_GROUP_ID);
      const groups = groupsData.sort((a, b) => a.group.name.localeCompare(b.group.name));
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      gcCache.set(username.toLowerCase(), { displayName, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);
      if (!inFraidGroup) {
        return interaction.editReply({
          embeds: [buildGcEmbed(displayName, groups, avatarUrl, 0), buildGcNotInGroupEmbed(displayName)],
          components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : []
        });
      }
      return interaction.editReply({
        embeds: [buildGcEmbed(displayName, groups, avatarUrl, 0), buildGcInGroupEmbed(displayName)],
        components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : []
      });
    } catch { return interaction.editReply("couldn't load their groups, try again") }
  }

  if (commandName === 'vmhelp') return interaction.reply({ embeds: [buildVmHelpEmbed()] });

  if (commandName === 'help') return interaction.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });

  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || null;
    const afk = loadAfk();
    afk[interaction.user.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`you're now afk${reason ? `: ${reason}` : ''}`)], ephemeral: true })
  }

  if (commandName === 'snipe') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const sniped = snipeCache.get(channel.id);
    if (!sniped) return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription('nothing to snipe rn')] });
    return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('sniped')
      .setDescription(sniped.content)
      .addFields({ name: 'author', value: sniped.author, inline: true }, { name: 'deleted', value: `<t:${Math.floor(sniped.deletedAt / 1000)}:R>`, inline: true })
      .setThumbnail(sniped.avatarUrl)] });
  }

  if (commandName === 'purge') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const amount = interaction.options.getInteger('amount');
    try {
      const deleted = await channel.bulkDelete(amount, true);
      return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`deleted **${deleted.size}** messages`)], ephemeral: true });
    } catch (err) { return interaction.reply({ content: `couldn't purge — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'about') {
    return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle(`About ${client.user.username}`)
      .setDescription(`A custom Discord bot built for **fraidfg**.\n\nUse \`/help\` to see all commands.`)
      .addFields(
        { name: 'servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true }
      ).setThumbnail(client.user.displayAvatarURL()).setTimestamp()] });
  }

  if (commandName === 'vstatus') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const vc = loadVerifyConfig();
    const vwl = loadVerifyWhitelist();
    const roleId = vc[guild.id]?.roleId;
    const groupId = vc[guild.id]?.groupId;
    const wlRoles = (vwl[guild.id]?.roles || []).map(id => `<@&${id}>`).join(', ') || 'none';
    const wlUsers = (vwl[guild.id]?.users || []).map(id => `<@${id}>`).join(', ') || 'none';
    return interaction.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('Verify System Status')
      .addFields(
        { name: 'verify role', value: roleId ? `<@&${roleId}>` : 'not set', inline: true },
        { name: 'group id', value: groupId || 'not set', inline: true },
        { name: 'whitelisted roles', value: wlRoles },
        { name: 'whitelisted users', value: wlUsers }
      ).setTimestamp()] });
  }

  // ── Whitelist-required slash commands ────────────────────────────────────────
  if (!loadWhitelist().includes(interaction.user.id)) {
    const openCommands = new Set(['roblox', 'gc', 'help', 'vmhelp', 'afk', 'snipe', 'purge', 'about', 'vstatus']);
    if (!openCommands.has(commandName)) return interaction.reply({ content: "you're not whitelisted for that", ephemeral: true });
    return;
  }

  if (commandName === 'hb') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    const rawId  = interaction.options.getString('id');
    if (!target && !rawId) return interaction.reply({ content: "give a user mention or their id", ephemeral: true });
    const userId = target?.id ?? rawId;
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!/^\d{17,19}$/.test(userId)) return interaction.reply({ content: "that doesn't look like a real id", ephemeral: true });
    try {
      await guild.members.ban(userId, { reason: `hardban by ${interaction.user.tag}: ${reason}`, deleteMessageSeconds: 0 });
      let username = target?.tag ?? userId;
      if (!target) { try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {} }
      const hardbans = loadHardbans();
      if (!hardbans[guild.id]) hardbans[guild.id] = {};
      hardbans[guild.id][userId] = { reason, bannedBy: interaction.user.id, at: Date.now() };
      saveHardbans(hardbans);
      return interaction.reply({ embeds: [baseEmbed().setTitle("hardban'd").setColor(0xed4245).setDescription(`<@${userId}> has been hardbanned`)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return interaction.reply({ content: `couldn't ban — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'unhb') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!/^\d{17,19}$/.test(userId)) return interaction.reply({ content: "that's not a valid user id", ephemeral: true });
    try {
      await guild.members.unban(userId, reason);
      const hardbans = loadHardbans();
      if (hardbans[guild.id]) delete hardbans[guild.id][userId];
      saveHardbans(hardbans);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return interaction.reply({ embeds: [baseEmbed().setTitle('hardban removed').setColor(0x57f287)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return interaction.reply({ content: `couldn't remove hardban — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'ban') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: "can't ban them, they might be above me", ephemeral: true });
    const reason = interaction.options.getString('reason') || 'no reason';
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return interaction.reply({ embeds: [baseEmbed().setTitle("they're gone").setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been banned`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (commandName === 'kick') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: "can't kick them, they might be above me", ephemeral: true });
    const reason = interaction.options.getString('reason') || 'no reason';
    try { await target.kick(reason); } catch { return interaction.reply({ content: "couldn't kick them", ephemeral: true }); }
    return interaction.reply({ embeds: [baseEmbed().setTitle('kicked').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`<@${target.user.id}> has been kicked`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (commandName === 'unban') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!/^\d{17,19}$/.test(userId)) return interaction.reply({ content: "that's not a valid user id", ephemeral: true });
    try {
      await guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return interaction.reply({ embeds: [baseEmbed().setTitle('unbanned').setColor(0x57f287)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return interaction.reply({ content: `couldn't unban — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'timeout') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target  = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes') || 5;
    const reason  = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(minutes * 60 * 1000, reason); } catch { return interaction.reply({ content: "couldn't time them out", ephemeral: true }); }
    return interaction.reply({ embeds: [baseEmbed().setTitle('timed out').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been timed out for ${minutes}m`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'duration', value: `${minutes}m`, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (commandName === 'untimeout') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(null); } catch { return interaction.reply({ content: "couldn't remove their timeout", ephemeral: true }); }
    return interaction.reply({ embeds: [baseEmbed().setTitle('timeout removed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'mute') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); } catch { return interaction.reply({ content: "couldn't mute them", ephemeral: true }); }
    return interaction.reply({ embeds: [baseEmbed().setTitle('muted').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been muted`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (commandName === 'unmute') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(null); } catch { return interaction.reply({ content: "couldn't unmute them", ephemeral: true }); }
    return interaction.reply({ embeds: [baseEmbed().setTitle('unmuted').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'hush') {
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "couldn't find that user", ephemeral: true });
    const hushedData = loadHushed();
    if (hushedData[target.id]) return interaction.reply({ content: `**${target.tag}** is already hushed`, ephemeral: true });
    hushedData[target.id] = { hushedBy: interaction.user.id, at: Date.now() };
    saveHushed(hushedData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('hushed').setColor(0xfee75c).setThumbnail(target.displayAvatarURL()).setDescription(`@${target.username} has been hushed`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (commandName === 'unhush') {
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "couldn't find that user", ephemeral: true });
    const hushedData = loadHushed();
    if (!hushedData[target.id]) return interaction.reply({ content: `**${target.tag}** isn't hushed`, ephemeral: true });
    delete hushedData[target.id];
    saveHushed(hushedData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('unhushed').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'skull') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "mention someone to skull", ephemeral: true });
    const skullData = loadSkull();
    if (!skullData[guild.id]) skullData[guild.id] = [];
    if (skullData[guild.id].includes(target.id)) return interaction.reply({ content: `already skulling **${target.tag}**`, ephemeral: true });
    skullData[guild.id].push(target.id);
    saveSkull(skullData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('skull').setColor(0x1b6fe8).setThumbnail(target.displayAvatarURL())
      .setDescription(`now reacting to every message from **${target.tag}** with 💀`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'unskull') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "mention someone to unskull", ephemeral: true });
    const skullData = loadSkull();
    if (!skullData[guild.id]?.includes(target.id)) return interaction.reply({ content: `not skulling **${target.tag}**`, ephemeral: true });
    skullData[guild.id] = skullData[guild.id].filter(id => id !== target.id);
    saveSkull(skullData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('unskull').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .setDescription(`stopped skulling **${target.tag}**`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'annoy') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "couldn't find that user", ephemeral: true });
    const annoyData = loadAnnoy();
    if (!annoyData[guild.id]) annoyData[guild.id] = [];
    if (annoyData[guild.id].includes(target.id)) return interaction.reply({ content: `already annoying **${target.tag}**`, ephemeral: true });
    annoyData[guild.id].push(target.id);
    saveAnnoy(annoyData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('annoy').setColor(0xfee75c).setThumbnail(target.displayAvatarURL())
      .setDescription(`now reacting to every message from **${target.tag}** with 10 random emojis`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'unannoy') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    if (!target) return interaction.reply({ content: "couldn't find that user", ephemeral: true });
    const annoyData = loadAnnoy();
    if (!annoyData[guild.id]?.includes(target.id)) return interaction.reply({ content: `not annoying **${target.tag}**`, ephemeral: true });
    annoyData[guild.id] = annoyData[guild.id].filter(id => id !== target.id);
    saveAnnoy(annoyData);
    return interaction.reply({ embeds: [baseEmbed().setTitle('unannoy').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .setDescription(`stopped annoying **${target.tag}**`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'lock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('🔒 channel locked')] });
    } catch { return interaction.reply({ content: "couldn't lock the channel, check my perms", ephemeral: true }); }
  }

  if (commandName === 'unlock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('🔓 channel unlocked')] });
    } catch { return interaction.reply({ content: "couldn't unlock the channel, check my perms", ephemeral: true }); }
  }

  if (commandName === 'nuke') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    try {
      const ch = channel;
      const newCh = await ch.clone({
        name:     ch.name,
        topic:    ch.topic,
        nsfw:     ch.nsfw,
        parent:   ch.parentId,
        position: ch.rawPosition,
        permissionOverwrites: ch.permissionOverwrites.cache
      });
      await ch.delete();
      await newCh.send({
        embeds: [
          baseEmbed()
            .setColor(0x1b6fe8)
            .setTitle('channel nuked')
            .setDescription(`nuked by **${interaction.user.tag}**`)
            .setTimestamp()
        ]
      });
    } catch (err) {
      return interaction.reply({ content: `couldn't nuke — ${err.message}`, ephemeral: true }).catch(() => {});
    }
    return;
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
      return interaction.editReply({ embeds: [baseEmbed().setTitle('group roles').setColor(0x1b6fe8).setDescription(lines.join('\n')).setFooter({ text: `group id: ${groupId}` }).setTimestamp()] });
    } catch { return interaction.editReply("couldn't load group roles, try again"); }
  }

  if (commandName === 'tag') {
    const name = interaction.options.getString('name');
    const content = interaction.options.getString('content');
    const robloxUser = interaction.options.getString('robloxuser');
    if (content) {
      const tags = loadTags(); const isNew = !tags[name]; tags[name] = content; saveTags(tags);
      return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)] });
    }
    if (robloxUser) {
      const tags = loadTags();
      if (!tags[name]) return interaction.reply({ content: `no tag called **${name}** exists`, ephemeral: true });
      const roleId = tags[name].trim();
      if (isNaN(Number(roleId))) return interaction.reply({ content: `tag **${name}** doesn't have a valid role id`, ephemeral: true });
      await interaction.deferReply();
      try {
        const result = await rankRobloxUser(robloxUser, roleId);
        const embed = baseEmbed().setTitle('got em ranked').setColor(0x57f287)
          .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: name, inline: true }, { name: 'role id', value: roleId, inline: true })
          .setFooter({ text: `ranked by ${interaction.user.tag}` }).setTimestamp();
        if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
        return interaction.editReply({ embeds: [embed] });
      } catch (err) { return interaction.editReply({ embeds: [baseEmbed().setColor(0xed4245).setDescription(`couldn't rank them — ${err.message}`)] }); }
    }
    const tags = loadTags();
    if (!tags[name]) return interaction.reply({ content: `no tag called **${name}** exists`, ephemeral: true });
    return interaction.reply({ content: tags[name] });
  }

  if (commandName === 'restart') {
    const sent = await interaction.reply({ content: 'Restarting...', fetchReply: true });
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
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)] });
  }

  if (commandName === 'status') {
    const type = interaction.options.getString('type');
    const text = interaction.options.getString('text');
    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig(); cfg.status = statusData; saveConfig(cfg);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)] });
  }

  if (commandName === 'setlog') {
    const ch = interaction.options.getChannel('channel');
    if (!ch?.isTextBased()) return interaction.reply({ content: 'that needs to be a text channel', ephemeral: true });
    const cfg2 = loadConfig(); cfg2.logChannelId = ch.id; saveConfig(cfg2);
    return interaction.reply({ embeds: [baseEmbed().setTitle('log channel set').setColor(0x57f287).setDescription(`logs going to ${ch} now`).setTimestamp()] });
  }

  if (commandName === 'wlmanager') {
    const sub  = interaction.options.getString('action');
    const mgrs = loadWlManagers();
    if (sub === 'list') {
      const wl = loadWhitelist();
      if (!wl.includes(interaction.user.id)) return interaction.reply({ content: "you're not whitelisted for that", ephemeral: true });
      const all = [...new Set([...mgrs, ...(process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean)])];
      if (!all.length) return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist managers').setColor(0x1b6fe8).setDescription('no managers set')] });
      return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist managers').setColor(0x1b6fe8).setDescription(all.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')).setTimestamp()] });
    }
    if (!isWlManager(interaction.user.id)) return interaction.reply({ content: "ur not a whitelist manager", ephemeral: true });
    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: "give a user", ephemeral: true })
      if (mgrs.includes(target.id)) return interaction.reply({ content: `**${target.tag}** is already a whitelist manager`, ephemeral: true });
      mgrs.push(target.id); saveWlManagers(mgrs);
      return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist manager added').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: "give a user", ephemeral: true })
      if (!mgrs.includes(target.id)) return interaction.reply({ content: `**${target.tag}** isn't a whitelist manager`, ephemeral: true });
      saveWlManagers(mgrs.filter(id => id !== target.id));
      return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist manager removed').setColor(0xed4245).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'removed by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
  }

  if (commandName === 'whitelist') {
    if (!isWlManager(interaction.user.id)) return interaction.reply({ content: "ur not allowed to manage the whitelist", ephemeral: true });
    const sub = interaction.options.getString('action');
    const wl  = loadWhitelist();
    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: "give a user", ephemeral: true })
      if (wl.includes(target.id)) return interaction.reply({ content: `**${target.tag}** is already on the whitelist`, ephemeral: true });
      wl.push(target.id); saveWhitelist(wl);
      return interaction.reply({ embeds: [baseEmbed().setTitle('whitelisted').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: "give a user", ephemeral: true })
      if (!wl.includes(target.id)) return interaction.reply({ content: `**${target.tag}** isn't on the whitelist`, ephemeral: true });
      saveWhitelist(wl.filter(id => id !== target.id));
      return interaction.reply({ embeds: [baseEmbed().setTitle('removed from whitelist').setColor(0xed4245).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'removed by', value: interaction.user.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'list') {
      if (!wl.length) return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist').setColor(0x1b6fe8).setDescription('nobody on the whitelist rn')] });
      return interaction.reply({ embeds: [baseEmbed().setTitle('whitelist').setColor(0x1b6fe8).setDescription(wl.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')).setTimestamp()] });
    }
  }

  // ── NEW command handlers ──────────────────────────────────────────────────────

  if (commandName === 'activitycheck') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const action = interaction.options.getString('action');
    const checks = loadActivityCheck();
    if (!checks[guild.id]) checks[guild.id] = {};
    if (action === 'start') {
      const acMessage = interaction.options.getString('message') || 'Activity Check';
      checks[guild.id] = { startedBy: interaction.user.id, startedAt: Date.now(), active: true, checkins: [], acMessage };
      saveActivityCheck(checks);
      const acEmbed = baseEmbed().setColor(0x1b6fe8).setTitle(acMessage)
        .setDescription('Click react to react to activity check!')
        .addFields({ name: 'started by', value: interaction.user.tag, inline: true })
        .setTimestamp();
      const acRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ac_checkin').setLabel('React').setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [acEmbed], components: [acRow] });
    }
    if (action === 'end') {
      if (!checks[guild.id].active) return interaction.reply({ content: "no active activity check", ephemeral: true });
      const startedAt = checks[guild.id].startedAt;
      const startedBy = checks[guild.id].startedBy;
      const checkins = checks[guild.id].checkins || [];
      const acMessage = checks[guild.id].acMessage || 'Activity Check';
      checks[guild.id] = { active: false };
      saveActivityCheck(checks);
      const checkinList = checkins.length ? checkins.map(id => `<@${id}>`).join(', ') : 'nobody checked in';
      return interaction.reply({ embeds: [baseEmbed().setColor(0xed4245).setTitle(`${acMessage} — Ended`)
        .addFields(
          { name: 'ended by', value: interaction.user.tag, inline: true },
          { name: 'started by', value: `<@${startedBy}>`, inline: true },
          { name: 'started', value: `<t:${Math.floor(startedAt / 1000)}:R>`, inline: true },
          { name: `checked in (${checkins.length})`, value: checkinList }
        ).setTimestamp()] });
    }
  }

  if (commandName === 'config') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const setting = interaction.options.getString('setting');
    const value = interaction.options.getString('value');
    const cfg = loadConfig();
    if (!cfg.serverConfig) cfg.serverConfig = {};
    if (!cfg.serverConfig[guild.id]) cfg.serverConfig[guild.id] = {};
    cfg.serverConfig[guild.id][setting] = value;
    saveConfig(cfg);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Config Updated')
      .addFields({ name: setting, value: value, inline: true }).setTimestamp()] });
  }

  if (commandName === 'group') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    const action = interaction.options.getString('action');
    const value = interaction.options.getString('value');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user");
      const groupId = process.env.ROBLOX_GROUP_ID;
      if (action === 'check') {
        const groupsData = (await (await fetch(`https://groups.roblox.com/v1/users/${userBasic.id}/groups/roles`)).json()).data ?? [];
        const membership = groupsData.find(g => String(g.group.id) === String(groupId));
        return interaction.editReply({ embeds: [baseEmbed().setColor(membership ? 0x57f287 : 0xed4245).setTitle('Group Check')
          .addFields(
            { name: 'user', value: userBasic.name, inline: true },
            { name: 'in group', value: membership ? 'yes' : 'no', inline: true },
            { name: 'role', value: membership?.role?.name ?? 'n/a', inline: true }
          ).setTimestamp()] });
      }
      if (action === 'rank') {
        if (!value) return interaction.editReply("give a role id to rank them to");
        const result = await rankRobloxUser(username, value);
        return interaction.editReply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Ranked')
          .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'role id', value: value, inline: true }).setTimestamp()] });
      }
      if (action === 'exile') {
        const cookie = process.env.ROBLOX_COOKIE;
        if (!cookie || !groupId) return interaction.editReply('ROBLOX_COOKIE or ROBLOX_GROUP_ID not configured');
        const csrfRes = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
        const csrfToken = csrfRes.headers.get('x-csrf-token');
        const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userBasic.id}`, {
          method: 'DELETE', headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
        });
        if (!res.ok) return interaction.editReply(`couldn't exile — HTTP ${res.status}`);
        return interaction.editReply({ embeds: [baseEmbed().setColor(0xed4245).setTitle('Exiled')
          .addFields({ name: 'user', value: userBasic.name, inline: true }, { name: 'exiled by', value: interaction.user.tag, inline: true }).setTimestamp()] });
      }
    } catch (err) { return interaction.editReply(`something went wrong — ${err.message}`); }
  }

  if (commandName === 'setverifyrole') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const role = interaction.options.getRole('role');
    const vc = loadVerifyConfig();
    if (!vc[guild.id]) vc[guild.id] = {};
    vc[guild.id].roleId = role.id;
    saveVerifyConfig(vc);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Role Set')
      .addFields({ name: 'role', value: `${role}`, inline: true }, { name: 'set by', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'verify') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const vc = loadVerifyConfig();
    const vwl = loadVerifyWhitelist();
    const guildVc = vc[guild.id];
    if (!guildVc?.roleId) return interaction.reply({ content: "verify role isn't set — use `/setverifyrole` first", ephemeral: true });
    const guildVwl = vwl[guild.id] || { roles: [], users: [] };
    const member = interaction.member;
    const isAllowed = guildVwl.users.includes(interaction.user.id) ||
      member.roles.cache.some(r => guildVwl.roles.includes(r.id)) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!isAllowed) return interaction.reply({ content: "you're not allowed to verify users", ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try {
      await target.roles.add(guildVc.roleId, `verified by ${interaction.user.tag}`);
      return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verified')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: 'user', value: target.user.tag, inline: true },
          { name: 'verified by', value: interaction.user.tag, inline: true },
          { name: 'role given', value: `<@&${guildVc.roleId}>`, inline: true }
        ).setTimestamp()] });
    } catch (err) { return interaction.reply({ content: `couldn't verify — ${err.message}`, ephemeral: true }); }
  }

  if (commandName === 'vwl') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const role = interaction.options.getRole('role');
    const vwl = loadVerifyWhitelist();
    if (!vwl[guild.id]) vwl[guild.id] = { roles: [], users: [] };
    if (vwl[guild.id].roles.includes(role.id)) return interaction.reply({ content: `<@&${role.id}> is already whitelisted`, ephemeral: true });
    vwl[guild.id].roles.push(role.id);
    saveVerifyWhitelist(vwl);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Whitelist — Role Added')
      .addFields({ name: 'role', value: `${role}`, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'vwluser') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const target = interaction.options.getUser('user');
    const vwl = loadVerifyWhitelist();
    if (!vwl[guild.id]) vwl[guild.id] = { roles: [], users: [] };
    if (vwl[guild.id].users.includes(target.id)) return interaction.reply({ content: `**${target.tag}** is already whitelisted`, ephemeral: true });
    vwl[guild.id].users.push(target.id);
    saveVerifyWhitelist(vwl);
    return interaction.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Whitelist — User Added')
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }

  if (commandName === 'vunwl') {
    if (!guild) return interaction.reply({ content: "this only works in a server", ephemeral: true });
    const role = interaction.options.getRole('role');
    const target = interaction.options.getUser('user');
    if (!role && !target) return interaction.reply({ content: "give a role or user to remove", ephemeral: true });
    const vwl = loadVerifyWhitelist();
    if (!vwl[guild.id]) return interaction.reply({ content: "nothing is whitelisted", ephemeral: true });
    const lines = [];
    if (role) {
      if (!vwl[guild.id].roles.includes(role.id)) return interaction.reply({ content: `<@&${role.id}> isn't whitelisted`, ephemeral: true });
      vwl[guild.id].roles = vwl[guild.id].roles.filter(id => id !== role.id);
      lines.push(`role: ${role}`);
    }
    if (target) {
      if (!vwl[guild.id].users.includes(target.id)) return interaction.reply({ content: `**${target.tag}** isn't whitelisted`, ephemeral: true });
      vwl[guild.id].users = vwl[guild.id].users.filter(id => id !== target.id);
      lines.push(`user: ${target.tag}`);
    }
    saveVerifyWhitelist(vwl);
    return interaction.reply({ embeds: [baseEmbed().setColor(0xed4245).setTitle('Verify Whitelist — Removed')
      .setDescription(lines.join('\n'))
      .addFields({ name: 'removed by', value: interaction.user.tag, inline: true }).setTimestamp()] });
  }
});

// prefix command handler
client.on('messageCreate', async message => {
  // if message is partial (happens in dms) we gotta fetch the full thing first
  if (message.partial) {
    try { await message.fetch() } catch { return }
  }

  if (!message.author || message.author.bot) return

  // delete hushed people's messages
  const hushed = loadHushed()
  if (hushed[message.author.id]) {
    try { await message.delete() } catch {}
    return
  }

  // annoy: react to messages from annoyed users
  if (message.guild) {
    const annoyData = loadAnnoy()
    const annoyed = annoyData[message.guild.id] || []
    if (annoyed.includes(message.author.id)) {
      const RANDOM_EMOJIS = ['😂','💀','🔥','💯','🤡','😭','🤣','😱','🤔','💅','🥶','😤','🫡','🤩','🎉','🤯','🥴','😈','👀','🫠']
      const chosen = []
      while (chosen.length < 10) {
        const e = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)]
        if (!chosen.includes(e)) chosen.push(e)
      }
      for (const emoji of chosen) {
        try { await message.react(emoji) } catch {}
      }
    }
  }

  // skull: react to messages from skulled users with 💀
  if (message.guild) {
    const skullData = loadSkull()
    const skulled = skullData[message.guild.id] || []
    if (skulled.includes(message.author.id)) {
      try { await message.react('💀') } catch {}
    }
  }

  // autoreact stuff
  const autoreactData = loadAutoreact()
  if (autoreactData[message.author.id]?.length) {
    for (const emoji of autoreactData[message.author.id]) {
      try { await message.react(emoji) } catch {}
    }
  }

  // tell people when someone they pinged is afk
  if (message.mentions.users.size > 0) {
    const afkData = loadAfk()
    const mentioned = message.mentions.users.first()
    if (afkData[mentioned?.id]) {
      const e = afkData[mentioned.id]
      await message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`**${mentioned.username}** is afk: ${e.reason || 'no reason'}\n<t:${Math.floor(e.since / 1000)}:R>`)] })
    }
  }

  const prefix = getPrefix()
  const afkData = loadAfk()

  if (afkData[message.author.id] && message.content.startsWith(prefix)) {
    delete afkData[message.author.id];
    saveAfk(afkData);
    await message.reply({ content: "Welcome back — your AFK status has been removed.", allowedMentions: { repliedUser: false } });
  }

  if (!message.content.startsWith(prefix)) return;

  const args    = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── Open-to-everyone prefix commands ─────────────────────────────────────────
  if (command === 'roblox') {
    const username = args[0];
    if (!username) return message.reply('give a roblox username')
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user")
      const userId = userBasic.id;
      const user   = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return message.reply({ embeds: [baseEmbed().setTitle(`${user.displayName} (@${user.name})`).setURL(profileUrl).setColor(0x1b6fe8)
        .addFields({ name: 'created', value: created, inline: true }, { name: 'user id', value: `${userId}`, inline: true }).setThumbnail(avatarUrl).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl), new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`))]
      });
    } catch { return message.reply("something went wrong loading their info, try again") }
  }

  if (command === 'gc') {
    const username = args[0];
    if (!username) return message.reply('give a roblox username')
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user")
      const userId = userBasic.id;
      const groupsData = (await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json()).data ?? [];
      const displayName = userBasic.displayName || userBasic.name;
      const inFraidGroup = groupsData.some(g => String(g.group.id) === FRAID_GROUP_ID);
      const groups = groupsData.sort((a, b) => a.group.name.localeCompare(b.group.name));
      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      gcCache.set(username.toLowerCase(), { displayName, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);
      if (!inFraidGroup) {
        return message.reply({
          embeds: [buildGcEmbed(displayName, groups, avatarUrl, 0), buildGcNotInGroupEmbed(displayName)],
          components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : []
        });
      }
      return message.reply({
        embeds: [buildGcEmbed(displayName, groups, avatarUrl, 0), buildGcInGroupEmbed(displayName)],
        components: groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : []
      });
    } catch { return message.reply("couldn't load their groups, try again") }
  }

  if (command === 'help') return message.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });

  if (command === 'vmhelp') return message.reply({ embeds: [buildVmHelpEmbed(prefix)] });

  if (command === 'about') {
    return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle(`About ${client.user.username}`)
      .setDescription(`A custom Discord bot built for **fraidfg**.\n\nUse \`${prefix}help\` or \`/help\` to see all commands.`)
      .addFields(
        { name: 'servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true }
      ).setThumbnail(client.user.displayAvatarURL()).setTimestamp()] });
  }

  if (command === 'convert') {
    const username = args[0];
    if (!username) return message.reply('give a roblox username');
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user");
      return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('Roblox ID Lookup')
        .addFields({ name: 'username', value: userBasic.name, inline: true }, { name: 'display name', value: userBasic.displayName || userBasic.name, inline: true }, { name: 'user id', value: `\`${userBasic.id}\``, inline: true })
        .setFooter({ text: 'roblox user id' }).setTimestamp()] });
    } catch { return message.reply("something went wrong, try again"); }
  }

  if (command === 'snipe') {
    if (!message.guild) return;
    const sniped = snipeCache.get(message.channel.id);
    if (!sniped) return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription('nothing to snipe rn')] });
    return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('sniped')
      .setDescription(sniped.content)
      .addFields({ name: 'author', value: sniped.author, inline: true }, { name: 'deleted', value: `<t:${Math.floor(sniped.deletedAt / 1000)}:R>`, inline: true })
      .setThumbnail(sniped.avatarUrl)] });
  }

  // ── VoiceMaster prefix commands ───────────────────────────────────────────────
  if (command === 'drag') {
    if (!message.guild) return;
    const target = message.mentions.members?.first();
    if (!target) return message.reply('mention a user to drag');
    const myVc = message.member?.voice?.channel;
    if (!myVc) return message.reply("you're not in a voice channel");
    try { await target.voice.setChannel(myVc); return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`dragged **${target.displayName}** to **${myVc.name}**`)] }); }
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
        return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`✅ voicemaster set up! join **${createVc.name}** to create a vc.`)] });
      } catch (e) { return message.reply(`setup failed — ${e.message}`); }
    }
    const vc = message.member?.voice?.channel;
    if (!vc) return message.reply('you need to be in your voice channel');
    const vmChannels = loadVmChannels();
    const chData = vmChannels[vc.id];
    if (!chData) return message.reply("that's not a voicemaster channel");
    const isOwner = chData.ownerId === message.author.id;
    const everyone = message.guild.roles.everyone;

    if (sub === 'lock')   { if (!isOwner) return message.reply("you don't own this channel"); await vc.permissionOverwrites.edit(everyone, { Connect: false }); return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('🔒 channel locked')] }); }
    if (sub === 'unlock') { if (!isOwner) return message.reply("you don't own this channel"); await vc.permissionOverwrites.edit(everyone, { Connect: null }); return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('🔓 channel unlocked')] }); }
    if (sub === 'claim')  {
      if (vc.members.has(chData.ownerId)) return message.reply("the owner is still in the channel");
      chData.ownerId = message.author.id; vmChannels[vc.id] = chData; saveVmChannels(vmChannels);
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`👑 you now own **${vc.name}**`)] });
    }
    if (sub === 'limit') {
      if (!isOwner) return message.reply("you don't own this channel");
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 0 || n > 99) return message.reply('give a number between 0 and 99 (0 means no limit)')
      await vc.setUserLimit(n);
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`limit set to **${n === 0 ? 'no limit' : n}**`)] });
    }
    if (sub === 'allow') {
      if (!isOwner) return message.reply("you don't own this channel");
      const target = message.mentions.members?.first();
      if (!target) return message.reply('mention a user');
      await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`allowed **${target.displayName}**`)] });
    }
    if (sub === 'deny') {
      if (!isOwner) return message.reply("you don't own this channel");
      const target = message.mentions.members?.first();
      if (!target) return message.reply('mention a user');
      await vc.permissionOverwrites.edit(target.id, { Connect: false });
      if (vc.members.has(target.id)) await target.voice.setChannel(null).catch(() => {});
      return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription(`denied **${target.displayName}**`)] });
    }
    if (sub === 'rename') {
      if (!isOwner) return message.reply("you don't own this channel");
      const newName = args.slice(1).join(' ');
      if (!newName) return message.reply('type a name for the channel')
      await vc.setName(newName);
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`renamed to **${newName}**`)] });
    }
    if (sub === 'reset') {
      if (!isOwner) return message.reply("you don't own this channel");
      await vc.setName(`${message.member.displayName}'s VC`);
      await vc.setUserLimit(0);
      await vc.permissionOverwrites.edit(everyone, { Connect: null, ViewChannel: null });
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('channel reset to defaults')] });
    }
    return message.reply({ embeds: [buildVmHelpEmbed(prefix)] });
  }

  // ── Whitelist-required prefix commands ───────────────────────────────────────
  if (!loadWhitelist().includes(message.author.id)) return;

  if (command === 'hb') {
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can use `.hb`')] });
    const target = message.mentions.users.first();
    const rawId  = args[0];
    if (!target && !rawId) return message.reply("give a user mention or their id");
    const userId = target?.id ?? rawId;
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!/^\d{17,19}$/.test(userId)) return message.reply("that doesn't look like a real id");
    try {
      await message.guild.members.ban(userId, { reason: `hardban by ${message.author.tag}: ${reason}`, deleteMessageSeconds: 0 });
      let username = target?.tag ?? userId;
      if (!target) { try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {} }
      const hardbans = loadHardbans();
      if (!hardbans[message.guild.id]) hardbans[message.guild.id] = {};
      hardbans[message.guild.id][userId] = { reason, bannedBy: message.author.id, at: Date.now() };
      saveHardbans(hardbans);
      return message.reply({ embeds: [baseEmbed().setTitle("hardban'd").setColor(0xed4245).setDescription(`<@${userId}> has been hardbanned`)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return message.reply(`couldn't ban — ${err.message}`); }
  }

  if (command === 'unhb') {
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can use `.unhb`')] });
    if (!message.guild) return;
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply("that's not a valid user id");
    try {
      await message.guild.members.unban(userId, reason);
      const hardbans = loadHardbans();
      if (hardbans[message.guild.id]) delete hardbans[message.guild.id][userId];
      saveHardbans(hardbans);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return message.reply({ embeds: [baseEmbed().setTitle('hardban removed').setColor(0x57f287)
        .addFields({ name: 'user', value: username, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
    } catch (err) { return message.reply(`couldn't remove hardban — ${err.message}`); }
  }

  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.bannable) return message.reply("can't ban them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return message.reply({ embeds: [baseEmbed().setTitle("they're gone").setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been banned`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.kickable) return message.reply("can't kick them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.kick(reason); } catch { return message.reply("couldn't kick them"); }
    return message.reply({ embeds: [baseEmbed().setTitle('kicked').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`<@${target.user.id}> has been kicked`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setTimestamp()] });
  }

  if (command === 'unban') {
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply("that's not a valid user id");
    try {
      await message.guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return message.reply({ embeds: [baseEmbed().setTitle('unbanned').setColor(0x57f287)
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
    return message.reply({ embeds: [baseEmbed().setTitle('timed out').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been timed`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'duration', value: `${minutes}m`, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (command === 'untimeout') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); } catch { return message.reply("couldn't remove their timeout"); }
    return message.reply({ embeds: [baseEmbed().setTitle('timeout removed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'mute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); } catch { return message.reply("couldn't mute them"); }
    return message.reply({ embeds: [baseEmbed().setTitle('muted').setColor(0xed4245).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been muted`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }, { name: 'reason', value: reason }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); } catch { return message.reply("couldn't unmute them"); }
    return message.reply({ embeds: [baseEmbed().setTitle('unmuted').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'hush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (hushedData[target.id]) return message.reply(`**${target.user.tag}** is already hushed — use \`${prefix}unhush\` to remove it`);
    hushedData[target.id] = { hushedBy: message.author.id, at: Date.now() };
    saveHushed(hushedData);
    return message.reply({ embeds: [baseEmbed().setTitle('hushed').setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL()).setDescription(`@${target.user.username} has been hushed`)
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setImage(MOD_IMAGE_URL).setTimestamp()] });
  }

  if (command === 'unhush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (!hushedData[target.id]) return message.reply(`**${target.user.tag}** isn't hushed`);
    delete hushedData[target.id]; saveHushed(hushedData);
    return message.reply({ embeds: [baseEmbed().setTitle('unhushed').setColor(0x57f287).setThumbnail(target.user.displayAvatarURL())
      .addFields({ name: 'user', value: target.user.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'skull') {
    if (!message.guild) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('mention someone to skull');
    const skullData = loadSkull();
    if (!skullData[message.guild.id]) skullData[message.guild.id] = [];
    if (skullData[message.guild.id].includes(target.id)) return message.reply(`already skulling **${target.tag}**`);
    skullData[message.guild.id].push(target.id);
    saveSkull(skullData);
    return message.reply({ embeds: [baseEmbed().setTitle('skull').setColor(0x1b6fe8).setThumbnail(target.displayAvatarURL())
      .setDescription(`now reacting to every message from **${target.tag}** with 💀`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'unskull') {
    if (!message.guild) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('mention someone to unskull');
    const skullData = loadSkull();
    if (!skullData[message.guild.id]?.includes(target.id)) return message.reply(`not skulling **${target.tag}**`);
    skullData[message.guild.id] = skullData[message.guild.id].filter(id => id !== target.id);
    saveSkull(skullData);
    return message.reply({ embeds: [baseEmbed().setTitle('unskull').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .setDescription(`stopped skulling **${target.tag}**`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'annoy') {
    if (!message.guild) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('mention someone to annoy');
    const annoyData = loadAnnoy();
    if (!annoyData[message.guild.id]) annoyData[message.guild.id] = [];
    if (annoyData[message.guild.id].includes(target.id)) return message.reply(`already annoying **${target.tag}**`);
    annoyData[message.guild.id].push(target.id);
    saveAnnoy(annoyData);
    return message.reply({ embeds: [baseEmbed().setTitle('annoy').setColor(0xfee75c).setThumbnail(target.displayAvatarURL())
      .setDescription(`now reacting to every message from **${target.tag}** with 10 random emojis`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'unannoy') {
    if (!message.guild) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('mention someone to stop annoying');
    const annoyData = loadAnnoy();
    if (!annoyData[message.guild.id]?.includes(target.id)) return message.reply(`not annoying **${target.tag}**`);
    annoyData[message.guild.id] = annoyData[message.guild.id].filter(id => id !== target.id);
    saveAnnoy(annoyData);
    return message.reply({ embeds: [baseEmbed().setTitle('unannoy').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
      .setDescription(`stopped annoying **${target.tag}**`)
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'mod', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'lock') {
    try { await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('🔒 channel locked')] }); }
    catch { return message.reply("couldn't lock the channel, check my perms"); }
  }

  if (command === 'unlock') {
    try { await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }); return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription('🔓 channel unlocked')] }); }
    catch { return message.reply("couldn't unlock the channel, check my perms"); }
  }

  if (command === 'nuke') {
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can use `.nuke`')] });
    if (!message.guild) return;
    try {
      const ch = message.channel;
      const nuker = message.author.tag;
      const newCh = await ch.clone({
        name:     ch.name,
        topic:    ch.topic,
        nsfw:     ch.nsfw,
        parent:   ch.parentId,
        position: ch.rawPosition,
        permissionOverwrites: ch.permissionOverwrites.cache
      });
      await ch.delete();
      await newCh.send({
        embeds: [
          baseEmbed()
            .setColor(0x1b6fe8)
            .setTitle('channel nuked')
            .setDescription(`nuked by **${nuker}**`)
            .setTimestamp()
        ]
      });
    } catch (err) {
      return message.reply(`couldn't nuke — ${err.message}`);
    }
    return;
  }

  if (command === 'activitycheck') {
    if (!message.guild) return;
    const sub = args[0]?.toLowerCase();
    const checks = loadActivityCheck();
    if (!checks[message.guild.id]) checks[message.guild.id] = {};
    if (sub === 'start') {
      const acMessage = args.slice(1).join(' ') || 'Activity Check';
      checks[message.guild.id] = { startedBy: message.author.id, startedAt: Date.now(), active: true, checkins: [], acMessage };
      saveActivityCheck(checks);
      const acEmbed = baseEmbed().setColor(0x1b6fe8).setTitle(acMessage)
        .setDescription('Click react to react to activity check!')
        .addFields({ name: 'started by', value: message.author.tag, inline: true })
        .setTimestamp();
      const acRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ac_checkin').setLabel('React').setStyle(ButtonStyle.Primary)
      );
      return message.reply({ embeds: [acEmbed], components: [acRow] });
    }
    if (sub === 'end') {
      if (!checks[message.guild.id].active) return message.reply("no active activity check");
      const startedAt = checks[message.guild.id].startedAt;
      const startedBy = checks[message.guild.id].startedBy;
      const checkins = checks[message.guild.id].checkins || [];
      const acMessage = checks[message.guild.id].acMessage || 'Activity Check';
      checks[message.guild.id] = { active: false };
      saveActivityCheck(checks);
      const checkinList = checkins.length ? checkins.map(id => `<@${id}>`).join(', ') : 'nobody checked in';
      return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setTitle(`${acMessage} — Ended`)
        .addFields(
          { name: 'ended by', value: message.author.tag, inline: true },
          { name: 'started by', value: `<@${startedBy}>`, inline: true },
          { name: 'started', value: `<t:${Math.floor(startedAt / 1000)}:R>`, inline: true },
          { name: `checked in (${checkins.length})`, value: checkinList }
        ).setTimestamp()] });
    }
    return message.reply(`usage: \`${prefix}activitycheck start [message]\` or \`${prefix}activitycheck end\``);
  }

  if (command === 'prefix') {
    const newPrefix = args[0];
    if (!newPrefix) return message.reply(`prefix is \`${prefix}\` rn`);
    if (newPrefix.length > 5) return message.reply("prefix can't be more than 5 chars");
    const cfg = loadConfig(); cfg.prefix = newPrefix; saveConfig(cfg);
    return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)] });
  }

  if (command === 'status') {
    const validTypes = ['playing', 'watching', 'listening', 'competing', 'custom'];
    const type = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');
    if (!type || !validTypes.includes(type) || !text) return message.reply('do it like: status [playing/watching/listening/competing/custom] [text]');
    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig(); cfg.status = statusData; saveConfig(cfg);
    return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)] });
  }

  if (command === 'afk') {
    const reason = args.join(' ') || null;
    const afk = loadAfk();
    afk[message.author.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`You're now AFK${reason ? `: ${reason}` : '.'}`)], allowedMentions: { repliedUser: false } });
  }

  if (command === 'restart') {
    const sent = await message.reply('Restarting...');
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
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)] });
    }
    const robloxUser = args[0];
    const tagName    = args.slice(1).join(' ').toLowerCase();
    if (!robloxUser || !tagName) return message.reply(`idk what u want, try:\n\`${prefix}tag [name] | [roleId]\` — make a tag\n\`${prefix}tag [robloxUsername] [tagname]\` — rank someone`);
    const tags = loadTags();
    if (!tags[tagName]) return message.reply(`no tag called **${tagName}** exists`);
    const roleId = tags[tagName].trim();
    if (isNaN(Number(roleId))) return message.reply(`tag **${tagName}** doesn't have a valid role id`);
    const status = await message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`ranking **${robloxUser}**...`)] });
    try {
      const result = await rankRobloxUser(robloxUser, roleId);
      const embed  = baseEmbed().setTitle('got em ranked').setColor(0x57f287)
        .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: tagName, inline: true }, { name: 'role id', value: roleId, inline: true })
        .setFooter({ text: `ranked by ${message.author.tag}` }).setTimestamp();
      if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
      await status.edit({ content: '', embeds: [embed] });
      // track who got this tag so striptag can find them later
      const taggedMembers = loadTaggedMembers();
      if (!taggedMembers[tagName]) taggedMembers[tagName] = [];
      if (!taggedMembers[tagName].includes(result.displayName)) taggedMembers[tagName].push(result.displayName);
      saveTaggedMembers(taggedMembers);
      const logEmbed = baseEmbed().setTitle('rank log').setColor(0x1b6fe8)
        .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'tag', value: tagName, inline: true }, { name: 'role id', value: roleId, inline: true },
          { name: 'ranked by', value: `<@${message.author.id}>`, inline: true }, { name: 'channel', value: `<#${message.channel.id}>`, inline: true })
        .setFooter({ text: `roblox id: ${result.userId}` }).setTimestamp();
      if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
      await sendLog(message.guild, logEmbed);
    } catch (err) { await status.edit({ content: '', embeds: [baseEmbed().setColor(0xed4245).setDescription(`couldn't rank them - ${err.message}`)] }); }
    return;
  }

  if (command === 'strip') {
    if (!message.guild) return;
    if (!loadWhitelist().includes(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription("you're not whitelisted to use `.strip`")] });
    const robloxUser = args[0];
    const reason = args.slice(1).join(' ');
    if (!robloxUser) return message.reply(`usage: \`${prefix}strip [robloxUsername] [reason]\``);
    if (!reason) return message.reply('you need to provide a reason');
    // find which tag this user has
    const taggedMembers = loadTaggedMembers();
    let foundTag = null;
    for (const [tagName, members] of Object.entries(taggedMembers)) {
      if (members.map(m => m.toLowerCase()).includes(robloxUser.toLowerCase())) {
        foundTag = tagName;
        break;
      }
    }
    if (!foundTag) return message.reply(`**${robloxUser}** doesn't have any tracked tag`);
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isnt set');
    let rank2RoleId;
    try {
      const rolesData = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      const rank2 = rolesData.roles?.find(r => r.rank === 1);
      if (!rank2) return message.reply("couldn't find a rank 1 role in the group");
      rank2RoleId = String(rank2.id);
    } catch { return message.reply("couldn't fetch group roles, try again"); }
    const status = await message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`stripping **${robloxUser}** (tag: **${foundTag}**)...`)] });
    try {
      let result;
      let skipReason = null;
      try {
        result = await rankRobloxUser(robloxUser, rank2RoleId);
      } catch (rankErr) {
        const msg = rankErr.message?.toLowerCase() ?? '';
        if (msg.includes('same role')) {
          skipReason = 'already at rank 1 (balls)';
        } else if (msg.includes("isn't in the group")) {
          skipReason = 'not in group — tag removed only';
        }
        if (skipReason) {
          const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [robloxUser], excludeBannedUsers: false }) })).json()).data?.[0];
          result = { displayName: userBasic?.displayName || robloxUser, userId: userBasic?.id || 'unknown', avatarUrl: null };
        } else {
          throw rankErr;
        }
      }
      // remove from tagged members
      taggedMembers[foundTag] = taggedMembers[foundTag].filter(m => m.toLowerCase() !== robloxUser.toLowerCase());
      if (!taggedMembers[foundTag].length) delete taggedMembers[foundTag];
      saveTaggedMembers(taggedMembers);
      const embed = baseEmbed().setTitle('strip').setColor(0x57f287)
        .addFields(
          { name: 'user', value: result.displayName, inline: true },
          { name: 'tag removed', value: foundTag, inline: true },
          { name: 'stripped by', value: message.author.tag, inline: true },
          { name: 'reason', value: reason }
        )
        .setTimestamp();
      if (skipReason) embed.setFooter({ text: skipReason });
      if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
      await status.edit({ content: '', embeds: [embed] });
      const logEmbed = baseEmbed().setTitle('strip log').setColor(0xed4245)
        .addFields(
          { name: 'user', value: result.displayName, inline: true },
          { name: 'tag removed', value: foundTag, inline: true },
          { name: 'stripped by', value: `<@${message.author.id}>`, inline: true },
          { name: 'reason', value: reason }
        ).setFooter({ text: `roblox id: ${result.userId}${skipReason ? ` • ${skipReason}` : ''}` }).setTimestamp();
      if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
      await sendStripLog(message.guild, logEmbed);
    } catch (err) {
      await status.edit({ content: '', embeds: [baseEmbed().setColor(0xed4245).setDescription(`couldn't strip them — ${err.message}`)] });
      const failEmbed = baseEmbed().setTitle('strip failed').setColor(0xfee75c)
        .addFields(
          { name: 'user', value: robloxUser, inline: true },
          { name: 'tag', value: foundTag, inline: true },
          { name: 'attempted by', value: `<@${message.author.id}>`, inline: true },
          { name: 'reason', value: reason },
          { name: 'error', value: err.message }
        ).setTimestamp();
      await sendStripLog(message.guild, failEmbed);
    }
    return;
  }

  if (command === 'striptag') {
    if (!message.guild) return;
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can run `.striptag`')] });
    const tagName = args.join(' ').toLowerCase();
    if (!tagName) return message.reply(`usage: \`${prefix}striptag [tagname]\``);
    const tags = loadTags();
    if (!tags[tagName]) return message.reply(`no tag called **${tagName}** exists`);
    const taggedMembers = loadTaggedMembers();
    const members = taggedMembers[tagName] || [];
    if (!members.length) return message.reply(`nobody is tracked under tag **${tagName}**`);
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isnt set');
    let rank2RoleId;
    try {
      const rolesData = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      const rank2 = rolesData.roles?.find(r => r.rank === 1);
      if (!rank2) return message.reply("couldn't find a rank 1 role in the group");
      rank2RoleId = String(rank2.id);
    } catch { return message.reply("couldn't fetch group roles, try again"); }
    // store pending and ask for confirmation
    striptagPending.set(message.author.id, { tagName, members, rank2RoleId });
    setTimeout(() => striptagPending.delete(message.author.id), 60 * 1000); // expire after 60s
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('striptag_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('striptag_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    return message.reply({ embeds: [baseEmbed().setColor(0xfee75c).setTitle('confirm striptag')
      .setDescription(`are you sure you want to strip **${members.length}** user${members.length !== 1 ? 's' : ''} from tag **${tagName}** and rank them all to rank 2?\n\n**Users:** ${members.join(', ')}`)
      .setFooter({ text: 'this confirmation expires in 60 seconds' })], components: [confirmRow] });
  }

  if (command === 'grouproles') {
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isnt set');
    try {
      const data = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      if (!data.roles?.length) return message.reply('no roles found for this group');
      const lines = data.roles.sort((a, b) => a.rank - b.rank).map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return message.reply({ embeds: [baseEmbed().setTitle('group roles').setColor(0x1b6fe8).setDescription(lines.join('\n')).setFooter({ text: `group id: ${groupId}` }).setTimestamp()] });
    } catch { return message.reply("couldn't load group roles, try again"); }
  }

  if (command === 'setlog') {
    const ch = message.mentions.channels?.first();
    if (!ch?.isTextBased()) return message.reply('mention a text channel');
    const cfg2 = loadConfig(); cfg2.logChannelId = ch.id; saveConfig(cfg2);
    return message.reply({ embeds: [baseEmbed().setTitle('log channel set').setColor(0x57f287).setDescription(`logs going to ${ch} now`).setTimestamp()] });
  }

  if (command === 'tagstrip') {
    const ch = message.mentions.channels?.first();
    if (!ch?.isTextBased()) return message.reply('mention a text channel — e.g. `.tagstrip #strip-logs`');
    const cfg2 = loadConfig(); cfg2.stripLogChannelId = ch.id; saveConfig(cfg2);
    return message.reply({ embeds: [baseEmbed().setTitle('strip log channel set').setColor(0x57f287).setDescription(`.strip and .striptag logs will now go to ${ch}`).setTimestamp()] });
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

  if (command === 'dm') {
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can use `.dm`')] });
    // .dm @user/userId/roleId <message>
    const rawTarget = args[0];
    if (!rawTarget) return message.reply(`usage: \`${prefix}dm @user/roleId/userId message\``);
    const dmMsg = args.slice(1).join(' ');
    if (!dmMsg) return message.reply('include a message to send');

    // Resolve target: user mention, role mention, or raw ID
    const userMention = message.mentions.users.first();
    const roleMention = message.mentions.roles?.first();

    if (roleMention) {
      // DM everyone with the role (guild only)
      if (!message.guild) return message.reply("can't DM a role outside of a server");
      await message.guild.members.fetch();
      const members = roleMention.members;
      if (!members.size) return message.reply("no members have that role");
      let sent = 0, failed = 0;
      const status = await message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setDescription(`sending DMs to **${members.size}** members with ${roleMention}...`)] });
      for (const [, member] of members) {
        if (member.user.bot) continue;
        try {
          await member.send({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('Message').setDescription(dmMsg).setFooter({ text: `from ${message.author.tag}` }).setTimestamp()] });
          sent++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 500)); // rate limit buffer
      }
      return status.edit({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`done — sent: **${sent}**, failed: **${failed}**`)] });
    }

    // Single user: @mention or raw ID
    let targetUser = userMention;
    if (!targetUser) {
      const rawId = rawTarget.replace(/\D/g, '');
      if (!/^\d{17,19}$/.test(rawId)) return message.reply("that doesn't look like a valid user or role");
      try { targetUser = await client.users.fetch(rawId); } catch { return message.reply("couldn't find that user"); }
    }
    if (targetUser.bot) return message.reply("can't DM a bot");
    try {
      await targetUser.send({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('Message').setDescription(dmMsg).setFooter({ text: `from ${message.author.tag}` }).setTimestamp()] });
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setDescription(`DM sent to **${targetUser.tag}**`)] });
    } catch {
      return message.reply(`couldn't DM **${targetUser.tag}** — they might have DMs off`);
    }
  }

  if (command === 'vstatus') {
    if (!message.guild) return;
    const vc = loadVerifyConfig();
    const vwl = loadVerifyWhitelist();
    const roleId = vc[message.guild.id]?.roleId;
    const groupId = vc[message.guild.id]?.groupId;
    const wlRoles = (vwl[message.guild.id]?.roles || []).map(id => `<@&${id}>`).join(', ') || 'none';
    const wlUsers = (vwl[message.guild.id]?.users || []).map(id => `<@${id}>`).join(', ') || 'none';
    return message.reply({ embeds: [baseEmbed().setColor(0x1b6fe8).setTitle('Verify System Status')
      .addFields(
        { name: 'verify role', value: roleId ? `<@&${roleId}>` : 'not set', inline: true },
        { name: 'group id', value: groupId || 'not set', inline: true },
        { name: 'whitelisted roles', value: wlRoles },
        { name: 'whitelisted users', value: wlUsers }
      ).setTimestamp()] });
  }

  if (command === 'setverifyrole') {
    if (!message.guild) return;
    const role = message.mentions.roles?.first();
    if (!role) return message.reply('mention a role — e.g. `.setverifyrole @Member`');
    const vc = loadVerifyConfig();
    if (!vc[message.guild.id]) vc[message.guild.id] = {};
    vc[message.guild.id].roleId = role.id;
    saveVerifyConfig(vc);
    return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Role Set')
      .addFields({ name: 'role', value: `${role}`, inline: true }, { name: 'set by', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'verify') {
    if (!message.guild) return;
    const vc = loadVerifyConfig();
    const vwl = loadVerifyWhitelist();
    const guildVc = vc[message.guild.id];
    if (!guildVc?.roleId) return message.reply(`verify role isn't set — use \`${prefix}setverifyrole\` first`);
    const guildVwl = vwl[message.guild.id] || { roles: [], users: [] };
    const isAllowed = guildVwl.users.includes(message.author.id) ||
      message.member.roles.cache.some(r => guildVwl.roles.includes(r.id)) ||
      message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!isAllowed) return message.reply("you're not allowed to verify users");
    const target = message.mentions.members?.first();
    if (!target) return message.reply('mention a user to verify');
    try {
      await target.roles.add(guildVc.roleId, `verified by ${message.author.tag}`);
      return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verified')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: 'user', value: target.user.tag, inline: true },
          { name: 'verified by', value: message.author.tag, inline: true },
          { name: 'role given', value: `<@&${guildVc.roleId}>`, inline: true }
        ).setTimestamp()] });
    } catch (err) { return message.reply(`couldn't verify — ${err.message}`); }
  }

  if (command === 'vwl') {
    if (!message.guild) return;
    const role = message.mentions.roles?.first();
    if (!role) return message.reply('mention a role to whitelist');
    const vwl = loadVerifyWhitelist();
    if (!vwl[message.guild.id]) vwl[message.guild.id] = { roles: [], users: [] };
    if (vwl[message.guild.id].roles.includes(role.id)) return message.reply(`<@&${role.id}> is already whitelisted`);
    vwl[message.guild.id].roles.push(role.id);
    saveVerifyWhitelist(vwl);
    return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Whitelist — Role Added')
      .addFields({ name: 'role', value: `${role}`, inline: true }, { name: 'added by', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'vwluser') {
    if (!message.guild) return;
    const target = message.mentions.users?.first();
    if (!target) return message.reply('mention a user to whitelist');
    const vwl = loadVerifyWhitelist();
    if (!vwl[message.guild.id]) vwl[message.guild.id] = { roles: [], users: [] };
    if (vwl[message.guild.id].users.includes(target.id)) return message.reply(`**${target.tag}** is already whitelisted`);
    vwl[message.guild.id].users.push(target.id);
    saveVerifyWhitelist(vwl);
    return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Verify Whitelist — User Added')
      .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'vunwl') {
    if (!message.guild) return;
    const role = message.mentions.roles?.first();
    const target = message.mentions.users?.first();
    if (!role && !target) return message.reply('mention a role or user to remove from the verify whitelist');
    const vwl = loadVerifyWhitelist();
    if (!vwl[message.guild.id]) return message.reply('nothing is whitelisted');
    const lines = [];
    if (role) {
      if (!vwl[message.guild.id].roles.includes(role.id)) return message.reply(`<@&${role.id}> isn't whitelisted`);
      vwl[message.guild.id].roles = vwl[message.guild.id].roles.filter(id => id !== role.id);
      lines.push(`role: ${role}`);
    }
    if (target) {
      if (!vwl[message.guild.id].users.includes(target.id)) return message.reply(`**${target.tag}** isn't whitelisted`);
      vwl[message.guild.id].users = vwl[message.guild.id].users.filter(id => id !== target.id);
      lines.push(`user: ${target.tag}`);
    }
    saveVerifyWhitelist(vwl);
    return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setTitle('Verify Whitelist — Removed')
      .setDescription(lines.join('\n'))
      .addFields({ name: 'removed by', value: message.author.tag, inline: true }).setTimestamp()] });
  }

  if (command === 'group') {
    const username = args[0];
    const action = args[1]?.toLowerCase();
    const value = args[2];
    if (!username || !action) return message.reply(`usage: \`${prefix}group [username] [check/rank/exile] [roleId for rank]\``);
    try {
      const userBasic = (await (await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) })).json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user");
      const groupId = process.env.ROBLOX_GROUP_ID;
      if (action === 'check') {
        const groupsData = (await (await fetch(`https://groups.roblox.com/v1/users/${userBasic.id}/groups/roles`)).json()).data ?? [];
        const membership = groupsData.find(g => String(g.group.id) === String(groupId));
        return message.reply({ embeds: [baseEmbed().setColor(membership ? 0x57f287 : 0xed4245).setTitle('Group Check')
          .addFields(
            { name: 'user', value: userBasic.name, inline: true },
            { name: 'in group', value: membership ? 'yes' : 'no', inline: true },
            { name: 'role', value: membership?.role?.name ?? 'n/a', inline: true }
          ).setTimestamp()] });
      }
      if (action === 'rank') {
        if (!value) return message.reply('give a role id to rank them to');
        const result = await rankRobloxUser(username, value);
        return message.reply({ embeds: [baseEmbed().setColor(0x57f287).setTitle('Ranked')
          .addFields({ name: 'user', value: result.displayName, inline: true }, { name: 'role id', value: value, inline: true }).setTimestamp()] });
      }
      if (action === 'exile') {
        const cookie = process.env.ROBLOX_COOKIE;
        if (!cookie || !groupId) return message.reply('ROBLOX_COOKIE or ROBLOX_GROUP_ID not configured');
        const csrfRes = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
        const csrfToken = csrfRes.headers.get('x-csrf-token');
        const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userBasic.id}`, {
          method: 'DELETE', headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken }
        });
        if (!res.ok) return message.reply(`couldn't exile — HTTP ${res.status}`);
        return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setTitle('Exiled')
          .addFields({ name: 'user', value: userBasic.name, inline: true }, { name: 'exiled by', value: message.author.tag, inline: true }).setTimestamp()] });
      }
      return message.reply(`unknown action — use check, rank, or exile`);
    } catch (err) { return message.reply(`something went wrong — ${err.message}`); }
  }

  if (command === 'wlmanager') {
    const sub = args[0]?.toLowerCase();
    const mgrs = loadWlManagers();
    if (sub === 'list') {
      const all = [...new Set([...mgrs, ...(process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean)])];
      if (!all.length) return message.reply({ embeds: [baseEmbed().setTitle('whitelist managers').setColor(0x1b6fe8).setDescription('no managers set')] });
      return message.reply({ embeds: [baseEmbed().setTitle('whitelist managers').setColor(0x1b6fe8).setDescription(all.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')).setTimestamp()] });
    }
    if (!isWlManager(message.author.id)) return message.reply({ embeds: [baseEmbed().setColor(0xed4245).setDescription('only whitelist managers can manage wlmanager')] });
    if (sub === 'add') {
      const target = message.mentions.users?.first();
      if (!target) return message.reply('mention a user to add');
      if (mgrs.includes(target.id)) return message.reply(`**${target.tag}** is already a whitelist manager`);
      mgrs.push(target.id); saveWlManagers(mgrs);
      return message.reply({ embeds: [baseEmbed().setTitle('whitelist manager added').setColor(0x57f287).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'added by', value: message.author.tag, inline: true }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const target = message.mentions.users?.first();
      if (!target) return message.reply('mention a user to remove');
      if (!mgrs.includes(target.id)) return message.reply(`**${target.tag}** isn't a whitelist manager`);
      saveWlManagers(mgrs.filter(id => id !== target.id));
      return message.reply({ embeds: [baseEmbed().setTitle('whitelist manager removed').setColor(0xed4245).setThumbnail(target.displayAvatarURL())
        .addFields({ name: 'user', value: target.tag, inline: true }, { name: 'removed by', value: message.author.tag, inline: true }).setTimestamp()] });
    }
    return message.reply(`usage: \`${prefix}wlmanager [add/remove/list] [@user]\``);
  }

  if (command === 'whitelist') return message.reply('whitelist is slash-command only — use `/whitelist` instead');
});

client.login(process.env.DISCORD_TOKEN);

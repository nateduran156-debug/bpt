const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages
  ]
});

const TAGS_FILE      = path.join(__dirname, 'tags.json');
const HUSHED_FILE    = path.join(__dirname, 'hushed.json');
const CONFIG_FILE    = path.join(__dirname, 'config.json');
const AFK_FILE       = path.join(__dirname, 'afk.json');
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');
const REBOOT_FILE    = path.join(__dirname, 'reboot_msg.json');

function loadJSON(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadTags()      { return loadJSON(TAGS_FILE); }
function saveTags(t)     { saveJSON(TAGS_FILE, t); }
function loadHushed()    { return loadJSON(HUSHED_FILE); }
function saveHushed(h)   { saveJSON(HUSHED_FILE, h); }
function loadConfig()    { return loadJSON(CONFIG_FILE); }
function saveConfig(c)   { saveJSON(CONFIG_FILE, c); }
function loadAfk()       { return loadJSON(AFK_FILE); }
function saveAfk(a)      { saveJSON(AFK_FILE, a); }
function loadWhitelist() {
  const data = loadJSON(WHITELIST_FILE);
  return Array.isArray(data.ids) ? data.ids : [];
}
function saveWhitelist(ids) {
  saveJSON(WHITELIST_FILE, { ids });
}

(function initConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveJSON(CONFIG_FILE, { logChannelId: null, prefix: '.', status: null });
    console.log('created config.json');
  } else {
    const cfg = loadConfig();
    let changed = false;
    if (Array.isArray(cfg.whitelist) && cfg.whitelist.length > 0) {
      const existing = loadWhitelist();
      const merged = [...new Set([...existing, ...cfg.whitelist])];
      saveWhitelist(merged);
      delete cfg.whitelist;
      changed = true;
    } else if ('whitelist' in cfg) {
      delete cfg.whitelist;
      changed = true;
    }
    if (!cfg.prefix) { cfg.prefix = '.'; changed = true; }
    if (changed) saveConfig(cfg);
  }
  if (!fs.existsSync(WHITELIST_FILE)) {
    saveWhitelist([]);
    console.log('created whitelist.json');
  }
  if (!fs.existsSync(TAGS_FILE)) {
    saveJSON(TAGS_FILE, {});
    console.log('created tags.json');
  }
})();

function getPrefix() {
  return loadConfig().prefix || '.';
}

async function sendLog(guild, embed) {
  const cfg = loadConfig();
  if (!cfg.logChannelId) return;
  try {
    const ch = await guild.channels.fetch(cfg.logChannelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (err) {
    console.error('log channel error:', err.message);
  }
}

async function rankRobloxUser(robloxUsername, roleId) {
  const cookie  = process.env.ROBLOX_COOKIE;
  const groupId = process.env.ROBLOX_GROUP_ID;

  if (!cookie || !groupId)
    throw new Error('ROBLOX_COOKIE or ROBLOX_GROUP_ID is not configured.');

  const lookupRes = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: false })
  });
  const lookupData = await lookupRes.json();
  const userBasic  = lookupData.data?.[0];
  if (!userBasic) throw new Error(`Roblox user "${robloxUsername}" not found.`);

  const userId = userBasic.id;

  const memberRes  = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  const memberData = await memberRes.json();
  const isMember   = memberData.data?.some(g => String(g.group.id) === String(groupId));
  if (!isMember)
    throw new Error(`**${userBasic.name}** isn't in the group (ID: ${groupId}). They need to join first.`);

  const csrfRes = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    headers: { Cookie: `.ROBLOSECURITY=${cookie}` }
  });
  const csrfToken = csrfRes.headers.get('x-csrf-token');
  if (!csrfToken) throw new Error('Could not get CSRF token. Check your ROBLOX_COOKIE.');

  const rankRes = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `.ROBLOSECURITY=${cookie}`,
      'X-CSRF-TOKEN': csrfToken
    },
    body: JSON.stringify({ roleId: Number(roleId) })
  });

  if (!rankRes.ok) {
    const errData = await rankRes.json().catch(() => ({}));
    const code    = errData.errors?.[0]?.code;
    const msg     = errData.errors?.[0]?.message ?? `HTTP ${rankRes.status}`;
    if (code === 4) throw new Error(`Bot doesn't have permission to rank this user (they might outrank the bot).`);
    if (code === 2) throw new Error(`Role ID \`${roleId}\` doesn't exist.`);
    throw new Error(`Ranking failed: ${msg}`);
  }

  const avatarRes  = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
  const avatarData = await avatarRes.json();
  const avatarUrl  = avatarData.data?.[0]?.imageUrl ?? null;

  return { userId, displayName: userBasic.name, avatarUrl };
}

// ─── Help pages ────────────────────────────────────────────────────────────
// Page 1 — "perms" — moderation commands
// Page 2 — "rblx"  — roblox commands
// Page 3 — "perms" — bot-owner/config commands
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
    title: 'perms',
    cmds: [
      '{p}prefix [new prefix]',
      '{p}status [type] [text]',
      '{p}reboot',
      '{p}afk [reason]',
      '{p}say [text]',
      '{p}cs',
      '{p}whitelist add @user',
      '{p}whitelist remove @user',
      '{p}whitelist list',
      '{p}setlog #channel',
    ],
  },
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
  const totalPages = COMMAND_PAGES.length;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_${page - 1}`)
      .setLabel('back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`help_${page + 1}`)
      .setLabel('next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

function buildGcEmbed(username, groups, avatarUrl, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  const slice = groups.slice(page * GC_PER_PAGE, page * GC_PER_PAGE + GC_PER_PAGE);
  const lines = slice.map((g, i) => `${page * GC_PER_PAGE + i + 1}. **${g.group.name}**`);
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`${username}'s groups`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `page ${page + 1}/${totalPages} · ${groups.length} groups` });
  if (page === 0 && avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function buildGcRow(username, groups, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gc_${page - 1}_${username}`)
      .setLabel('back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`gc_${page + 1}_${username}`)
      .setLabel('next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

const gcCache    = new Map();
const snipeCache = new Map();

const GUILD_ONLY_COMMANDS = new Set([
  'ban', 'kick', 'unban', 'purge', 'snipe', 'timeout', 'mute', 'unmute', 'hush',
  'lock', 'unlock', 'setlog'
]);

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('shows the command list').setDMPermission(true),
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
  new SlashCommandBuilder().setName('snipe').setDescription('show the last deleted message in this channel').setDMPermission(false),
  new SlashCommandBuilder().setName('timeout').setDescription('timeout a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('how long in minutes').setRequired(false).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('reason').setRequired(false)),
  new SlashCommandBuilder().setName('untimeout').setDescription('remove a timeout from a member').setDMPermission(true)
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('mute a member indefinitely').setDMPermission(true)
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
  new SlashCommandBuilder().setName('cs').setDescription('show and clear the snipe').setDMPermission(true),
  new SlashCommandBuilder().setName('grouproles').setDescription('list roblox group roles').setDMPermission(true),
  new SlashCommandBuilder().setName('tag').setDescription('create a tag or rank someone').setDMPermission(true)
    .addStringOption(o => o.setName('name').setDescription('tag name').setRequired(true))
    .addStringOption(o => o.setName('content').setDescription('role id for new tag').setRequired(false))
    .addStringOption(o => o.setName('robloxuser').setDescription('roblox username to rank using this tag').setRequired(false)),
  new SlashCommandBuilder().setName('reboot').setDescription('restart the bot').setDMPermission(true),
  new SlashCommandBuilder().setName('prefix').setDescription('change or view the bot prefix').setDMPermission(true)
    .addStringOption(o => o.setName('new').setDescription('new prefix').setRequired(false)),
  new SlashCommandBuilder().setName('status').setDescription('change the bot status').setDMPermission(true)
    .addStringOption(o => o.setName('type').setDescription('type').setRequired(true)
      .addChoices(
        { name: 'playing',   value: 'playing'   },
        { name: 'watching',  value: 'watching'  },
        { name: 'listening', value: 'listening' },
        { name: 'competing', value: 'competing' },
        { name: 'custom',    value: 'custom'    }
      ))
    .addStringOption(o => o.setName('text').setDescription('status text').setRequired(true)),
  new SlashCommandBuilder().setName('setlog').setDescription('set the log channel').setDMPermission(true)
    .addChannelOption(o => o.setName('channel').setDescription('channel').setRequired(true)),
  new SlashCommandBuilder().setName('whitelist').setDescription('manage the whitelist').setDMPermission(true)
    .addStringOption(o => o.setName('action').setDescription('what to do').setRequired(true)
      .addChoices(
        { name: 'add',    value: 'add'    },
        { name: 'remove', value: 'remove' },
        { name: 'list',   value: 'list'   }
      ))
    .addUserOption(o => o.setName('user').setDescription('user (for add/remove)').setRequired(false)),
].map(c => c.toJSON());

function applyStatus(statusData) {
  const typeMap = {
    playing:   ActivityType.Playing,
    streaming: ActivityType.Streaming,
    listening: ActivityType.Listening,
    watching:  ActivityType.Watching,
    competing: ActivityType.Competing,
    custom:    ActivityType.Custom
  };
  const type = typeMap[statusData.type] ?? ActivityType.Playing;
  client.user.setActivity({ name: statusData.text, type });
}

client.once('clientReady', async () => {
  console.log(`logged in as ${client.user.tag}`);
  const cfg = loadConfig();
  if (cfg.status) applyStatus(cfg.status);

  if (fs.existsSync(REBOOT_FILE)) {
    const { channelId, messageId } = loadJSON(REBOOT_FILE);
    fs.unlinkSync(REBOOT_FILE);
    try {
      const ch  = await client.channels.fetch(channelId);
      const msg = await ch.messages.fetch(messageId);
      await msg.edit('reboot successful ✅');
    } catch {}
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
      console.log('slash commands registered to guild');
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
      console.log('slash commands registered globally (may take up to an hour to show)');
    }
  } catch (err) {
    console.error('failed to register slash commands:', err.message);
  }
});

client.on('messageDelete', message => {
  if (message.author?.bot) return;
  if (!message.content) return;
  snipeCache.set(message.channel.id, {
    content:   message.content,
    author:    message.author?.tag ?? 'unknown',
    avatarUrl: message.author?.displayAvatarURL() ?? null,
    deletedAt: Date.now()
  });
});

// ─── Interaction handler ────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('help_')) {
      const page = parseInt(interaction.customId.split('_')[1]);
      return interaction.update({ embeds: [buildHelpEmbed(page)], components: [buildHelpRow(page)] });
    }
    if (interaction.customId.startsWith('gc_')) {
      const parts    = interaction.customId.split('_');
      const page     = parseInt(parts[1]);
      const username = parts.slice(2).join('_');
      const cached   = gcCache.get(username.toLowerCase());
      if (!cached) return interaction.reply({ content: 'that expired, run it again', ephemeral: true });
      return interaction.update({
        embeds: [buildGcEmbed(cached.displayName, cached.groups, cached.avatarUrl, page)],
        components: cached.groups.length > GC_PER_PAGE ? [buildGcRow(username, cached.groups, page)] : []
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild, channel } = interaction;
  const inDM = !guild;

  // roblox and gc open to everyone
  if (commandName === 'roblox') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const lookup    = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const userBasic = (await lookup.json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user lol");
      const userId     = userBasic.id;
      const user       = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created    = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl  = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${user.displayName} (@${user.name})`)
            .setURL(profileUrl)
            .setColor(0x2b2d31)
            .addFields(
              { name: 'created', value: created,     inline: true },
              { name: 'user id', value: `${userId}`, inline: true }
            )
            .setThumbnail(avatarUrl)
            .setTimestamp()
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl),
          new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`)
        )]
      });
    } catch { return interaction.editReply("couldn't load that, try again"); }
  }

  if (commandName === 'gc') {
    await interaction.deferReply();
    const username = interaction.options.getString('username');
    try {
      const lookup    = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const userBasic = (await lookup.json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user lol");
      const userId    = userBasic.id;

      const groupsData = await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json();
      const groups     = (groupsData.data ?? []).sort((a, b) => a.group.name.localeCompare(b.group.name));

      if (!groups.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2b2d31)
              .setTitle(`${userBasic.name}'s groups`)
              .setDescription("they're not in any groups lol")
          ]
        });
      }

      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;

      gcCache.set(username.toLowerCase(), { displayName: userBasic.name, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);

      const components = groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : [];
      return interaction.editReply({
        embeds: [buildGcEmbed(userBasic.name, groups, avatarUrl, 0)],
        components
      });
    } catch { return interaction.editReply("couldn't load their groups, try again"); }
  }

  // all other commands require whitelist
  const whitelist     = loadWhitelist();
  const isWhitelisted = whitelist.includes(interaction.user.id);

  if (!isWhitelisted) {
    return interaction.reply({ content: "ur not whitelisted for this bot lol", ephemeral: true });
  }

  if (inDM && GUILD_ONLY_COMMANDS.has(commandName)) {
    return interaction.reply({ content: "that command only works in a server, not dms", ephemeral: true });
  }

  if (commandName === 'help') {
    return interaction.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });
  }

  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || null;
    const afk    = loadAfk();
    afk[interaction.user.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ur afk now${reason ? `: ${reason}` : ''}`)],
      ephemeral: true
    });
  }

  if (commandName === 'hb') {
    const targetUser = interaction.options.getUser('user');
    const rawId      = interaction.options.getString('id');
    const reason     = interaction.options.getString('reason') || 'no reason';

    if (!targetUser && !rawId)
      return interaction.reply({ content: 'give me a user or an id', ephemeral: true });

    const userId = targetUser?.id ?? rawId;
    if (!/^\d{17,19}$/.test(userId))
      return interaction.reply({ content: "that doesn't look like a real id", ephemeral: true });

    await interaction.deferReply();
    try {
      const banGuild = guild ?? (process.env.GUILD_ID ? await client.guilds.fetch(process.env.GUILD_ID).catch(() => null) : null);
      if (!banGuild)
        return interaction.editReply("can't ban from dms without GUILD_ID being set");
      await banGuild.members.ban(userId, { reason: `hardban by ${interaction.user.tag}: ${reason}`, deleteMessageSeconds: 0 });
      let username = targetUser?.tag ?? userId;
      if (!targetUser) {
        try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      }
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("hardban'd")
            .setColor(0xed4245)
            .addFields(
              { name: 'user',   value: username,             inline: true },
              { name: 'mod',    value: interaction.user.tag, inline: true },
              { name: 'reason', value: reason }
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      return interaction.editReply(`couldn't ban — ${err.message}`);
    }
  }

  if (commandName === 'ban') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';

    if (!target) return interaction.reply({ content: 'that user isnt in this server', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: "can't ban them, they might be above me", ephemeral: true });

    await interaction.deferReply();
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("they're gone")
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,       inline: true },
            { name: 'mod',    value: interaction.user.tag,  inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'kick') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';

    if (!target) return interaction.reply({ content: 'that user isnt in this server', ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: "can't kick them, they might be above me", ephemeral: true });

    await interaction.deferReply();
    await target.kick(reason);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('kicked')
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,      inline: true },
            { name: 'mod',    value: interaction.user.tag, inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'unban') {
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'no reason';

    if (!/^\d{17,19}$/.test(userId))
      return interaction.reply({ content: "that doesn't look like a real id", ephemeral: true });

    await interaction.deferReply();
    try {
      await guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('unbanned')
            .setColor(0x57f287)
            .addFields(
              { name: 'user',   value: username,             inline: true },
              { name: 'mod',    value: interaction.user.tag, inline: true },
              { name: 'reason', value: reason }
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      return interaction.editReply(`couldn't unban — ${err.message}`);
    }
  }

  if (commandName === 'purge') {
    const amount = interaction.options.getInteger('amount');
    await interaction.deferReply({ ephemeral: true });
    try {
      const deleted = await channel.bulkDelete(amount, true);
      return interaction.editReply({ content: `deleted ${deleted.size} message${deleted.size !== 1 ? 's' : ''}` });
    } catch (err) {
      return interaction.editReply({ content: `couldn't purge — ${err.message}` });
    }
  }

  if (commandName === 'snipe') {
    const snipe = snipeCache.get(channel.id);
    if (!snipe) return interaction.reply({ content: 'nothing to snipe rn', ephemeral: true });
    const deletedAgo = Math.floor((Date.now() - snipe.deletedAt) / 1000);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({ name: snipe.author, iconURL: snipe.avatarUrl ?? undefined })
          .setDescription(snipe.content)
          .setFooter({ text: `deleted ${deletedAgo}s ago` })
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'timeout') {
    const target  = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes') ?? 5;
    const reason  = interaction.options.getString('reason') || 'no reason';

    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    await interaction.deferReply();
    try { await target.timeout(minutes * 60 * 1000, reason); }
    catch { return interaction.editReply("couldn't time them out, they might be above me"); }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('timed out')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',     value: target.user.tag,      inline: true },
            { name: 'duration', value: `${minutes}m`,        inline: true },
            { name: 'mod',      value: interaction.user.tag, inline: true },
            { name: 'reason',   value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'untimeout') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    await interaction.deferReply();
    try { await target.timeout(null); }
    catch { return interaction.editReply("couldn't remove their timeout"); }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('timeout removed')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,      inline: true },
            { name: 'mod',  value: interaction.user.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'mute') {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'no reason';

    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    await interaction.deferReply();
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); }
    catch { return interaction.editReply("couldn't mute them"); }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('muted')
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,      inline: true },
            { name: 'mod',    value: interaction.user.tag, inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'unmute') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    await interaction.deferReply();
    try { await target.timeout(null); }
    catch { return interaction.editReply("couldn't unmute them"); }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('unmuted')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,      inline: true },
            { name: 'mod',  value: interaction.user.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'hush') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    const hushedData = loadHushed();
    if (hushedData[target.id])
      return interaction.reply({ content: `**${target.user.tag}** is already hushed — use \`/unhush\` to remove it`, ephemeral: true });

    hushedData[target.id] = { hushedBy: interaction.user.id, at: Date.now() };
    saveHushed(hushedData);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('hushed')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .setDescription('every msg they send gets deleted lol')
          .addFields(
            { name: 'user', value: target.user.tag,      inline: true },
            { name: 'mod',  value: interaction.user.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'unhush') {
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: 'that user isnt here', ephemeral: true });

    const hushedData = loadHushed();
    if (!hushedData[target.id])
      return interaction.reply({ content: `**${target.user.tag}** isn't hushed`, ephemeral: true });

    delete hushedData[target.id];
    saveHushed(hushedData);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('unhushed')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,      inline: true },
            { name: 'mod',  value: interaction.user.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'lock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')]
      });
    } catch {
      return interaction.reply({ content: "couldn't lock the channel, check my perms", ephemeral: true });
    }
  }

  if (commandName === 'unlock') {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')]
      });
    } catch {
      return interaction.reply({ content: "couldn't unlock the channel, check my perms", ephemeral: true });
    }
  }

  if (commandName === 'say') {
    const text = interaction.options.getString('text');
    await interaction.reply({ content: 'sent', ephemeral: true });
    return channel.send(text);
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
      const lines = data.roles
        .sort((a, b) => a.rank - b.rank)
        .map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('group roles')
            .setColor(0x2b2d31)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `group id: ${groupId}` })
            .setTimestamp()
        ]
      });
    } catch { return interaction.editReply("couldn't load group roles, try again"); }
  }

  if (commandName === 'tag') {
    const name       = interaction.options.getString('name');
    const content    = interaction.options.getString('content');
    const robloxUser = interaction.options.getString('robloxuser');

    if (content) {
      const tags  = loadTags();
      const isNew = !tags[name.toLowerCase()];
      tags[name.toLowerCase()] = content;
      saveTags(tags);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)]
      });
    }

    if (robloxUser) {
      const tags = loadTags();
      if (!tags[name.toLowerCase()])
        return interaction.reply({ content: `no tag called **${name}** exists`, ephemeral: true });

      const roleId = tags[name.toLowerCase()].trim();
      if (isNaN(Number(roleId)))
        return interaction.reply({ content: `tag **${name}** doesn't have a valid role id`, ephemeral: true });

      await interaction.deferReply();
      try {
        const result = await rankRobloxUser(robloxUser, roleId);
        const embed  = new EmbedBuilder()
          .setTitle('got em ranked')
          .setColor(0x57f287)
          .addFields(
            { name: 'user',    value: result.displayName, inline: true },
            { name: 'tag',     value: name,               inline: true },
            { name: 'role id', value: roleId,             inline: true }
          )
          .setFooter({ text: `ranked by ${interaction.user.tag}` })
          .setTimestamp();
        if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
        await interaction.editReply({ embeds: [embed] });

        if (!inDM) {
          const logEmbed = new EmbedBuilder()
            .setTitle('rank log')
            .setColor(0x5865f2)
            .addFields(
              { name: 'user',      value: result.displayName,          inline: true },
              { name: 'tag',       value: name,                        inline: true },
              { name: 'role id',   value: roleId,                      inline: true },
              { name: 'ranked by', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'channel',   value: `<#${channel.id}>`,          inline: true }
            )
            .setFooter({ text: `roblox id: ${result.userId}` })
            .setTimestamp();
          if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
          await sendLog(guild, logEmbed);
        }
      } catch (err) {
        console.error(err);
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't rank them - ${err.message}`)]
        });
      }
      return;
    }

    return interaction.reply({ content: 'give me a content (to create tag) or a robloxuser (to rank)', ephemeral: true });
  }

  if (commandName === 'reboot') {
    await interaction.reply({ content: 'rebooting rq...' });
    const sent = await interaction.fetchReply();
    saveJSON(REBOOT_FILE, { channelId: sent.channelId, messageId: sent.id });
    setTimeout(() => {
      const child = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio:    'inherit',
        env:      process.env
      });
      child.unref();
      process.exit(0);
    }, 500);
  }

  if (commandName === 'prefix') {
    const newPrefix = interaction.options.getString('new');
    const prefix    = getPrefix();
    if (!newPrefix)
      return interaction.reply({ content: `prefix is \`${prefix}\` rn`, ephemeral: true });
    if (newPrefix.length > 5)
      return interaction.reply({ content: "prefix can't be more than 5 chars", ephemeral: true });

    const cfg2 = loadConfig();
    cfg2.prefix = newPrefix;
    saveConfig(cfg2);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)]
    });
  }

  if (commandName === 'status') {
    const type       = interaction.options.getString('type');
    const text       = interaction.options.getString('text');
    const statusData = { type, text };
    applyStatus(statusData);
    const cfg2 = loadConfig();
    cfg2.status = statusData;
    saveConfig(cfg2);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)]
    });
  }

  if (commandName === 'setlog') {
    const ch = interaction.options.getChannel('channel');
    if (!ch?.isTextBased()) return interaction.reply({ content: 'that needs to be a text channel', ephemeral: true });

    const cfg2 = loadConfig();
    cfg2.logChannelId = ch.id;
    saveConfig(cfg2);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('log channel set')
          .setColor(0x57f287)
          .setDescription(`logs going to ${ch} now`)
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'whitelist') {
    const WHITELIST_MANAGERS = (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean);
    if (WHITELIST_MANAGERS.length && !WHITELIST_MANAGERS.includes(interaction.user.id))
      return interaction.reply({ content: "ur not allowed to manage the whitelist", ephemeral: true });

    const sub = interaction.options.getString('action');
    const wl  = loadWhitelist();

    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (wl.includes(target.id))
        return interaction.reply({ content: `**${target.tag}** is already on the whitelist`, ephemeral: true });
      wl.push(target.id);
      saveWhitelist(wl);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelisted')
            .setColor(0x57f287)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
              { name: 'user',     value: target.tag,            inline: true },
              { name: 'added by', value: interaction.user.tag,  inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply({ content: 'give me a user', ephemeral: true });
      if (!wl.includes(target.id))
        return interaction.reply({ content: `**${target.tag}** isn't on the whitelist`, ephemeral: true });
      saveWhitelist(wl.filter(id => id !== target.id));
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('removed from whitelist')
            .setColor(0xed4245)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
              { name: 'user',       value: target.tag,            inline: true },
              { name: 'removed by', value: interaction.user.tag,  inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'list') {
      if (!wl.length) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('whitelist')
              .setColor(0x2b2d31)
              .setDescription('nobody on the whitelist rn')
          ]
        });
      }
      const lines = wl.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelist')
            .setColor(0x2b2d31)
            .setDescription(lines.join('\n'))
            .setTimestamp()
        ]
      });
    }
  }
});

// ─── Prefix command handler ────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // hush — delete messages from hushed users
  const hushed = loadHushed();
  if (hushed[message.author.id]) {
    try { await message.delete(); } catch {}
    return;
  }

  // afk — notify if mentioned user is afk
  if (message.mentions.users.size > 0) {
    const afkData   = loadAfk();
    const mentioned = message.mentions.users.first();
    if (afkData[mentioned?.id]) {
      const entry = afkData[mentioned.id];
      const since = Math.floor(entry.since / 1000);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`**${mentioned.username}** is afk: ${entry.reason || 'no reason'}\n<t:${since}:R>`)
        ]
      });
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

  // roblox and gc are open to everyone
  if (command === 'roblox') {
    const username = args[0];
    if (!username) return message.reply('give me a username');
    try {
      const lookup    = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const userBasic = (await lookup.json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user lol");
      const userId     = userBasic.id;
      const user       = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created    = new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl  = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${user.displayName} (@${user.name})`)
            .setURL(profileUrl)
            .setColor(0x2b2d31)
            .addFields(
              { name: 'created', value: created,     inline: true },
              { name: 'user id', value: `${userId}`, inline: true }
            )
            .setThumbnail(avatarUrl)
            .setTimestamp()
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('profile').setStyle(ButtonStyle.Link).setURL(profileUrl),
          new ButtonBuilder().setLabel('games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`)
        )]
      });
    } catch { return message.reply("couldn't load that, try again"); }
  }

  if (command === 'gc') {
    const username = args[0];
    if (!username) return message.reply('give me a username');
    try {
      const lookup    = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const userBasic = (await lookup.json()).data?.[0];
      if (!userBasic) return message.reply("couldn't find that user lol");
      const userId    = userBasic.id;

      const groupsData = await (await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`)).json();
      const groups     = (groupsData.data ?? []).sort((a, b) => a.group.name.localeCompare(b.group.name));

      if (!groups.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2b2d31)
              .setTitle(`${userBasic.name}'s groups`)
              .setDescription("they're not in any groups lol")
          ]
        });
      }

      const avatarUrl = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;

      gcCache.set(username.toLowerCase(), { displayName: userBasic.name, groups, avatarUrl });
      setTimeout(() => gcCache.delete(username.toLowerCase()), 10 * 60 * 1000);

      const components = groups.length > GC_PER_PAGE ? [buildGcRow(username, groups, 0)] : [];
      return message.reply({
        embeds: [buildGcEmbed(userBasic.name, groups, avatarUrl, 0)],
        components
      });
    } catch { return message.reply("couldn't load their groups, try again"); }
  }

  if (command === 'help') {
    return message.reply({ embeds: [buildHelpEmbed(0)], components: [buildHelpRow(0)] });
  }

  // all other prefix commands require whitelist
  if (!loadWhitelist().includes(message.author.id)) return;

  if (command === 'hb') {
    const target = message.mentions.users.first();
    const rawId  = args[0];

    if (!target && !rawId)
      return message.reply('give me a user or id bro');

    const userId = target?.id ?? rawId;
    const reason = args.slice(1).join(' ') || 'no reason';

    if (!/^\d{17,19}$/.test(userId))
      return message.reply("that doesn't look like a real id");

    try {
      await message.guild.members.ban(userId, {
        reason: `hardban by ${message.author.tag}: ${reason}`,
        deleteMessageSeconds: 0
      });
      let username = target?.tag ?? userId;
      if (!target) {
        try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("hardban'd")
            .setColor(0xed4245)
            .addFields(
              { name: 'user',   value: username,           inline: true },
              { name: 'mod',    value: message.author.tag, inline: true },
              { name: 'reason', value: reason }
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      return message.reply(`couldn't ban — ${err.message}`);
    }
  }

  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.bannable) return message.reply("can't ban them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("they're gone")
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,    inline: true },
            { name: 'mod',    value: message.author.tag, inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    if (!target.kickable) return message.reply("can't kick them, they might be above me");
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.kick(reason); } catch { return message.reply("couldn't kick them"); }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('kicked')
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,    inline: true },
            { name: 'mod',    value: message.author.tag, inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'unban') {
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'no reason';
    if (!userId || !/^\d{17,19}$/.test(userId))
      return message.reply('give me a valid user id');
    try {
      await message.guild.members.unban(userId, reason);
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('unbanned')
            .setColor(0x57f287)
            .addFields(
              { name: 'user',   value: username,           inline: true },
              { name: 'mod',    value: message.author.tag, inline: true },
              { name: 'reason', value: reason }
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      return message.reply(`couldn't unban — ${err.message}`);
    }
  }

  if (command === 'timeout') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const minutes = parseInt(args[1]) || 5;
    if (minutes < 1 || minutes > 40320) return message.reply('has to be between 1 and 40320 mins');
    const reason = args.slice(2).join(' ') || 'no reason';
    try { await target.timeout(minutes * 60 * 1000, reason); }
    catch { return message.reply("couldn't time them out, they might be above me"); }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('timed out')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',     value: target.user.tag,    inline: true },
            { name: 'duration', value: `${minutes}m`,      inline: true },
            { name: 'mod',      value: message.author.tag, inline: true },
            { name: 'reason',   value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'untimeout') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); }
    catch { return message.reply("couldn't remove their timeout"); }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('timeout removed')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,    inline: true },
            { name: 'mod',  value: message.author.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'mute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const reason = args.slice(1).join(' ') || 'no reason';
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); }
    catch { return message.reply("couldn't mute them"); }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('muted')
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag,    inline: true },
            { name: 'mod',    value: message.author.tag, inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    try { await target.timeout(null); }
    catch { return message.reply("couldn't unmute them"); }
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('unmuted')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,    inline: true },
            { name: 'mod',  value: message.author.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'hush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (hushedData[target.id])
      return message.reply(`**${target.user.tag}** is already hushed — use \`${prefix}unhush\` to remove it`);
    hushedData[target.id] = { hushedBy: message.author.id, at: Date.now() };
    saveHushed(hushedData);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('hushed')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .setDescription('every msg they send gets deleted lol')
          .addFields(
            { name: 'user', value: target.user.tag,    inline: true },
            { name: 'mod',  value: message.author.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'unhush') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('mention someone');
    const hushedData = loadHushed();
    if (!hushedData[target.id])
      return message.reply(`**${target.user.tag}** isn't hushed`);
    delete hushedData[target.id];
    saveHushed(hushedData);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('unhushed')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag,    inline: true },
            { name: 'mod',  value: message.author.tag, inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === 'lock') {
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('🔒 channel locked')]
      });
    } catch {
      return message.reply("couldn't lock the channel, check my perms");
    }
  }

  if (command === 'unlock') {
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('🔓 channel unlocked')]
      });
    } catch {
      return message.reply("couldn't unlock the channel, check my perms");
    }
  }

  if (command === 'prefix') {
    const newPrefix = args[0];
    if (!newPrefix)
      return message.reply(`prefix is \`${prefix}\` rn`);
    if (newPrefix.length > 5)
      return message.reply("prefix can't be more than 5 chars");

    const cfg = loadConfig();
    cfg.prefix = newPrefix;
    saveConfig(cfg);

    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is \`${newPrefix}\` now`)]
    });
  }

  if (command === 'status') {
    const validTypes = ['playing', 'watching', 'listening', 'competing', 'custom'];
    const type = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');

    if (!type || !validTypes.includes(type) || !text)
      return message.reply('do it like: status [playing/watching/listening/competing/custom] [text]');

    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig();
    cfg.status = statusData;
    saveConfig(cfg);

    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** ${text}`)]
    });
  }

  if (command === 'afk') {
    const reason = args.join(' ') || null;
    const afk    = loadAfk();
    afk[message.author.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ur afk now${reason ? `: ${reason}` : ''}`)],
      allowedMentions: { repliedUser: false }
    });
  }

  if (command === 'reboot') {
    const sent = await message.reply('rebooting rq...');
    saveJSON(REBOOT_FILE, { channelId: sent.channelId, messageId: sent.id });
    setTimeout(() => {
      const child = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio:    'inherit',
        env:      process.env
      });
      child.unref();
      process.exit(0);
    }, 500);
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
      const tags  = loadTags();
      const isNew = !tags[name];
      tags[name]  = content;
      saveTags(tags);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}`)]
      });
    }

    const robloxUser = args[0];
    const tagName    = args.slice(1).join(' ').toLowerCase();

    if (!robloxUser || !tagName)
      return message.reply(`idk what u want, try:\n\`${prefix}tag [name] | [roleId]\` — make a tag\n\`${prefix}tag [robloxUsername] [tagname]\` — rank someone`);

    const tags = loadTags();
    if (!tags[tagName])
      return message.reply(`no tag called **${tagName}** exists`);

    const roleId = tags[tagName].trim();
    if (isNaN(Number(roleId)))
      return message.reply(`tag **${tagName}** doesn't have a valid role id`);

    const status = await message.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`ranking **${robloxUser}**...`)]
    });

    try {
      const result = await rankRobloxUser(robloxUser, roleId);
      const embed  = new EmbedBuilder()
        .setTitle('got em ranked')
        .setColor(0x57f287)
        .addFields(
          { name: 'user',    value: result.displayName, inline: true },
          { name: 'tag',     value: tagName,            inline: true },
          { name: 'role id', value: roleId,             inline: true }
        )
        .setFooter({ text: `ranked by ${message.author.tag}` })
        .setTimestamp();
      if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
      await status.edit({ content: '', embeds: [embed] });

      const logEmbed = new EmbedBuilder()
        .setTitle('rank log')
        .setColor(0x5865f2)
        .addFields(
          { name: 'user',      value: result.displayName,        inline: true },
          { name: 'tag',       value: tagName,                   inline: true },
          { name: 'role id',   value: roleId,                    inline: true },
          { name: 'ranked by', value: `<@${message.author.id}>`, inline: true },
          { name: 'channel',   value: `<#${message.channel.id}>`,inline: true }
        )
        .setFooter({ text: `roblox id: ${result.userId}` })
        .setTimestamp();
      if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
      await sendLog(message.guild, logEmbed);
    } catch (err) {
      console.error(err);
      await status.edit({ content: '', embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't rank them - ${err.message}`)] });
    }
    return;
  }

  if (command === 'grouproles') {
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isnt set');
    try {
      const data = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      if (!data.roles?.length) return message.reply('no roles found for this group');
      const lines = data.roles
        .sort((a, b) => a.rank - b.rank)
        .map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('group roles')
            .setColor(0x2b2d31)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `group id: ${groupId}` })
            .setTimestamp()
        ]
      });
    } catch { return message.reply("couldn't load group roles, try again"); }
  }

  if (command === 'purge') {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply('give me a number between 1 and 100');
    try {
      await message.delete();
      const deleted = await message.channel.bulkDelete(amount, true);
      const reply = await message.channel.send(`deleted ${deleted.size} message${deleted.size !== 1 ? 's' : ''}`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (err) {
      return message.channel.send(`couldn't purge — ${err.message}`);
    }
    return;
  }

  if (command === 'snipe') {
    const snipe = snipeCache.get(message.channel.id);
    if (!snipe) return message.reply('nothing to snipe rn');
    const deletedAgo = Math.floor((Date.now() - snipe.deletedAt) / 1000);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({ name: snipe.author, iconURL: snipe.avatarUrl ?? undefined })
          .setDescription(snipe.content)
          .setFooter({ text: `deleted ${deletedAgo}s ago` })
          .setTimestamp()
      ]
    });
  }

  if (command === 'whitelist') {
    const WHITELIST_MANAGERS = (process.env.WHITELIST_MANAGERS || '').split(',').filter(Boolean);
    if (WHITELIST_MANAGERS.length && !WHITELIST_MANAGERS.includes(message.author.id))
      return message.reply("ur not allowed to manage the whitelist");

    const sub = args[0]?.toLowerCase();
    const wl  = loadWhitelist();

    if (sub === 'add') {
      const target = message.mentions.members.first();
      if (!target) return message.reply('mention someone');
      if (wl.includes(target.id)) return message.reply(`**${target.user.tag}** is already on the whitelist`);
      wl.push(target.id);
      saveWhitelist(wl);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelisted')
            .setColor(0x57f287)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: 'user',     value: target.user.tag,    inline: true },
              { name: 'added by', value: message.author.tag, inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'remove') {
      const target = message.mentions.members.first();
      if (!target) return message.reply('mention someone');
      if (!wl.includes(target.id)) return message.reply(`**${target.user.tag}** isn't on the whitelist`);
      saveWhitelist(wl.filter(id => id !== target.id));
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('removed from whitelist')
            .setColor(0xed4245)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: 'user',       value: target.user.tag,    inline: true },
              { name: 'removed by', value: message.author.tag, inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'list') {
      if (!wl.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('whitelist')
              .setColor(0x2b2d31)
              .setDescription('nobody on the whitelist rn')
          ]
        });
      }
      const lines = wl.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelist')
            .setColor(0x2b2d31)
            .setDescription(lines.join('\n'))
            .setTimestamp()
        ]
      });
    }

    return message.reply(`do: \`${prefix}whitelist add/remove/list\``);
  }

  if (command === 'setlog') {
    const ch = message.mentions.channels.first();
    if (!ch || !ch.isTextBased()) return message.reply('mention a channel');
    const cfg = loadConfig();
    cfg.logChannelId = ch.id;
    saveConfig(cfg);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('log channel set')
          .setColor(0x57f287)
          .setDescription(`logs going to ${ch} now`)
          .setTimestamp()
      ]
    });
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is not set. Please set it in your environment variables.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

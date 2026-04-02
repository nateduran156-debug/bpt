const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ActivityType,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

const TAGS_FILE   = path.join(__dirname, 'tags.json');
const HUSHED_FILE = path.join(__dirname, 'hushed.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const AFK_FILE    = path.join(__dirname, 'afk.json');

function loadJSON(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadTags()   { return loadJSON(TAGS_FILE); }
function saveTags(t)  { saveJSON(TAGS_FILE, t); }
function loadHushed() { return loadJSON(HUSHED_FILE); }
function saveHushed(h){ saveJSON(HUSHED_FILE, h); }
function loadConfig() { return loadJSON(CONFIG_FILE); }
function saveConfig(c){ saveJSON(CONFIG_FILE, c); }
function loadAfk()    { return loadJSON(AFK_FILE); }
function saveAfk(a)   { saveJSON(AFK_FILE, a); }

(function initConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveJSON(CONFIG_FILE, { whitelist: [], logChannelId: null, prefix: '.', status: null });
    console.log('created config.json');
  } else {
    const cfg = loadConfig();
    let changed = false;
    if (!Array.isArray(cfg.whitelist)) { cfg.whitelist = []; changed = true; }
    if (!cfg.prefix) { cfg.prefix = '.'; changed = true; }
    if (changed) saveConfig(cfg);
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
    if (code === 2) throw new Error(`Role ID \`${roleId}\` doesn't exist. Run \`${getPrefix()}grouproles\` to check.`);
    throw new Error(`Ranking failed: ${msg}`);
  }

  const avatarRes  = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`);
  const avatarData = await avatarRes.json();
  const avatarUrl  = avatarData.data?.[0]?.imageUrl ?? null;

  return { userId, displayName: userBasic.name, avatarUrl };
}

const GC_PER_PAGE = 10;

function buildGcEmbed(username, groups, avatarUrl, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  const slice = groups.slice(page * GC_PER_PAGE, page * GC_PER_PAGE + GC_PER_PAGE);
  const lines = slice.map((g, i) => `${page * GC_PER_PAGE + i + 1}. **${g.group.name}**`);
  const embed = new EmbedBuilder()
    .setColor(0x2c2f33)
    .setTitle(`${username}'s Groups`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Page ${page + 1} of ${totalPages}  ·  ${groups.length} groups total` });
  if (page === 0 && avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function buildGcRow(username, groups, page) {
  const totalPages = Math.ceil(groups.length / GC_PER_PAGE);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gc_${page - 1}_${username}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`gc_${page + 1}_${username}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

const gcCache = new Map();

const slashCommandDefs = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and their usage'),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member — requires Ban Members')
    .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban')),

  new SlashCommandBuilder()
    .setName('hb')
    .setDescription('Hardban a user by mention or ID — requires Ban Members')
    .addStringOption(o => o.setName('user').setDescription('User mention or ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the hardban')),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member — requires Moderate Members')
    .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes (default 5)').setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the timeout')),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member indefinitely — requires Moderate Members')
    .addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the mute')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove a mute from a member — requires Moderate Members')
    .addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true)),

  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself as AFK with an optional reason')
    .addStringOption(o => o.setName('reason').setDescription('AFK reason')),

  new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Look up a Roblox profile by username')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)),

  new SlashCommandBuilder()
    .setName('gc')
    .setDescription('List all Roblox groups a user is in')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)),

  new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Create a tag or rank a Roblox user with one — requires Manage Messages')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create or update a tag')
        .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('Tag content (role ID)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('use')
        .setDescription('Rank a Roblox user using a saved tag')
        .addStringOption(o => o.setName('roblox_user').setDescription('Roblox username').setRequired(true))
        .addStringOption(o => o.setName('tag_name').setDescription('Tag name').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Change the bot\'s command prefix — requires Administrator')
    .addStringOption(o => o.setName('new_prefix').setDescription('New prefix (max 5 chars)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Change the bot\'s activity status — requires Administrator')
    .addStringOption(o =>
      o.setName('type')
        .setDescription('Activity type')
        .setRequired(true)
        .addChoices(
          { name: 'playing',   value: 'playing' },
          { name: 'watching',  value: 'watching' },
          { name: 'listening', value: 'listening' },
          { name: 'competing', value: 'competing' },
          { name: 'custom',    value: 'custom' }
        )
    )
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),

  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the bot whitelist — requires Administrator')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the whitelist')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all whitelisted users')
    ),

  new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Set the channel for rank logs — requires Administrator')
    .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('grouproles')
    .setDescription('List all roles in your Roblox group with their IDs'),

  new SlashCommandBuilder()
    .setName('hush')
    .setDescription('Toggle message auto-delete on a user — requires Manage Messages')
    .addUserOption(o => o.setName('user').setDescription('User to hush/unhush').setRequired(true)),
].map(cmd => cmd.toJSON());

client.once('clientReady', async () => {
  console.log(`logged in as ${client.user.tag}`);
  const cfg = loadConfig();
  if (cfg.status) applyStatus(cfg.status);

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommandDefs });
    console.log('slash commands registered globally');
  } catch (err) {
    console.error('failed to register slash commands:', err.message);
  }
});

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

client.on('interactionCreate', async interaction => {
  // ── Button interactions ──────────────────────────────────────────────────
  if (interaction.isButton()) {
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

  // ── Slash command interactions ───────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild, user, channel } = interaction;

  // Whitelist gate — all slash commands require whitelist membership
  const cfg        = loadConfig();
  const whitelist  = cfg.whitelist ?? [];
  if (!whitelist.includes(user.id)) {
    return interaction.reply({ content: "you're not on the whitelist", ephemeral: true });
  }

  // ── /help ────────────────────────────────────────────────────────────────
  if (commandName === 'help') {
    const p = getPrefix();
    const lines = [
      `\`${p}ban @user [reason]\` — ban a member *(Ban Members)*`,
      `\`${p}hb @user|id [reason]\` — hardban by mention or ID *(Ban Members)*`,
      `\`${p}timeout @user [min] [reason]\` — timeout a member *(Moderate Members)*`,
      `\`${p}mute @user [reason]\` — mute indefinitely *(Moderate Members)*`,
      `\`${p}unmute @user\` — remove a mute *(Moderate Members)*`,
      `\`${p}hush @user\` — toggle message auto-delete *(Manage Messages)*`,
      `\`${p}afk [reason]\` — set yourself as AFK`,
      `\`${p}roblox [username]\` — look up a Roblox profile`,
      `\`${p}gc [username]\` — list a user's Roblox groups`,
      `\`${p}tag [name] | [roleId]\` — create/update a tag *(Manage Messages)*`,
      `\`${p}tag [robloxUser] [tagname]\` — rank a user with a tag *(Manage Messages)*`,
      `\`${p}grouproles\` — list group roles with IDs`,
      `\`${p}setlog #channel\` — set rank log channel *(Administrator)*`,
      `\`${p}whitelist add|remove|list\` — manage whitelist *(Administrator)*`,
      `\`${p}prefix [new]\` — change command prefix *(Administrator)*`,
      `\`${p}status [type] [text]\` — change bot status *(Administrator)*`,
      `\`${p}reboot\` — restart the bot *(Administrator)*`,
      '',
      'All commands are also available as slash commands.',
    ];
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('commands')
          .setColor(0x2c2f33)
          .setDescription(lines.join('\n'))
          .setFooter({ text: `prefix: ${p}` })
      ],
      ephemeral: true
    });
  }

  // ── /ban ─────────────────────────────────────────────────────────────────
  if (commandName === 'ban') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: 'you need ban perms for this', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: "can't ban that member (they might outrank me)", ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.ban({ reason, deleteMessageSeconds: 86400 });
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("they're gone")
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag, inline: true },
            { name: 'mod',    value: user.tag,         inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  // ── /hb ──────────────────────────────────────────────────────────────────
  if (commandName === 'hb') {
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: 'you need ban perms for this', ephemeral: true });

    const raw    = interaction.options.getString('user', true);
    const userId = raw.replace(/[<@!>]/g, '');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,19}$/.test(userId))
      return interaction.reply({ content: "that doesn't look like a valid user ID or mention", ephemeral: true });

    try {
      await guild.members.ban(userId, {
        reason: `Hardban by ${user.tag}: ${reason}`,
        deleteMessageSeconds: 0
      });
      let username = userId;
      try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("hardban'd")
            .setColor(0xed4245)
            .addFields(
              { name: 'user',   value: username, inline: true },
              { name: 'mod',    value: user.tag, inline: true },
              { name: 'reason', value: reason }
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      return interaction.reply({ content: `couldn't ban that user — ${err.message}`, ephemeral: true });
    }
  }

  // ── /timeout ─────────────────────────────────────────────────────────────
  if (commandName === 'timeout') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: 'you need moderate members perms for this', ephemeral: true });
    const target  = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    const minutes = interaction.options.getInteger('minutes') ?? 5;
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    try { await target.timeout(minutes * 60 * 1000, reason); }
    catch { return interaction.reply({ content: "couldn't timeout that member (they might outrank me)", ephemeral: true }); }
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('timed out')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',     value: target.user.tag, inline: true },
            { name: 'duration', value: `${minutes}m`,   inline: true },
            { name: 'mod',      value: user.tag,         inline: true },
            { name: 'reason',   value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  // ── /mute ────────────────────────────────────────────────────────────────
  if (commandName === 'mute') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: 'you need moderate members perms for this', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); }
    catch { return interaction.reply({ content: "couldn't mute that member", ephemeral: true }); }
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('muted')
          .setColor(0xed4245)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user',   value: target.user.tag, inline: true },
            { name: 'mod',    value: user.tag,         inline: true },
            { name: 'reason', value: reason }
          )
          .setTimestamp()
      ]
    });
  }

  // ── /unmute ──────────────────────────────────────────────────────────────
  if (commandName === 'unmute') {
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: 'you need moderate members perms for this', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    try { await target.timeout(null); }
    catch { return interaction.reply({ content: "couldn't unmute that member", ephemeral: true }); }
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('unmuted')
          .setColor(0x57f287)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: 'user', value: target.user.tag, inline: true },
            { name: 'mod',  value: user.tag,         inline: true }
          )
          .setTimestamp()
      ]
    });
  }

  // ── /hush ────────────────────────────────────────────────────────────────
  if (commandName === 'hush') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: 'you need manage messages perms for this', ephemeral: true });
    const target     = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
    const hushedData = loadHushed();
    if (hushedData[target.id]) {
      delete hushedData[target.id];
      saveHushed(hushedData);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('unhushed')
            .setColor(0x57f287)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: 'user', value: target.user.tag, inline: true },
              { name: 'mod',  value: user.tag,         inline: true }
            )
            .setTimestamp()
        ]
      });
    } else {
      hushedData[target.id] = { hushedBy: user.id, at: Date.now() };
      saveHushed(hushedData);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('hushed')
            .setColor(0xfee75c)
            .setThumbnail(target.user.displayAvatarURL())
            .setDescription('every message they send will be deleted lol')
            .addFields(
              { name: 'user', value: target.user.tag, inline: true },
              { name: 'mod',  value: user.tag,         inline: true }
            )
            .setTimestamp()
        ]
      });
    }
  }

  // ── /afk ─────────────────────────────────────────────────────────────────
  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || null;
    const afk    = loadAfk();
    afk[user.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2c2f33).setDescription(`you're afk now${reason ? `: ${reason}` : ''}`)],
      allowedMentions: { repliedUser: false }
    });
  }

  // ── /roblox ──────────────────────────────────────────────────────────────
  if (commandName === 'roblox') {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();
    try {
      const lookup    = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const userBasic = (await lookup.json()).data?.[0];
      if (!userBasic) return interaction.editReply("couldn't find that user lol");
      const userId     = userBasic.id;
      const rUser      = await (await fetch(`https://users.roblox.com/v1/users/${userId}`)).json();
      const created    = new Date(rUser.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const avatarUrl  = (await (await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`)).json()).data?.[0]?.imageUrl;
      const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${rUser.displayName} (@${rUser.name})`)
            .setURL(profileUrl)
            .setColor(0x2c2f33)
            .addFields(
              { name: 'Created', value: created,     inline: true },
              { name: 'User ID', value: `${userId}`, inline: true }
            )
            .setThumbnail(avatarUrl)
            .setTimestamp()
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Profile').setStyle(ButtonStyle.Link).setURL(profileUrl),
          new ButtonBuilder().setLabel('Games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`)
        )]
      });
    } catch { return interaction.editReply("couldn't load that profile, try again"); }
  }

  // ── /gc ──────────────────────────────────────────────────────────────────
  if (commandName === 'gc') {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();
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
              .setColor(0x2c2f33)
              .setTitle(`${userBasic.name}'s Groups`)
              .setDescription("they're not in any roblox groups lol")
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

  // ── /tag ─────────────────────────────────────────────────────────────────
  if (commandName === 'tag') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: 'you need manage messages perms for this', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name    = interaction.options.getString('name', true).toLowerCase();
      const content = interaction.options.getString('content', true);
      const tags    = loadTags();
      const isNew   = !tags[name];
      tags[name]    = content;
      saveTags(tags);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}!`)]
      });
    }

    if (sub === 'use') {
      const robloxUser = interaction.options.getString('roblox_user', true);
      const tagName    = interaction.options.getString('tag_name', true).toLowerCase();
      const tags       = loadTags();
      if (!tags[tagName])
        return interaction.reply({ content: `no tag named **${tagName}**`, ephemeral: true });
      const roleId = tags[tagName].trim();
      if (isNaN(Number(roleId)))
        return interaction.reply({ content: `tag **${tagName}** doesn't have a valid role ID (got: \`${roleId}\`)`, ephemeral: true });

      await interaction.deferReply();
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
          .setFooter({ text: `ranked by ${user.tag}` })
          .setTimestamp();
        if (result.avatarUrl) embed.setThumbnail(result.avatarUrl);
        await interaction.editReply({ embeds: [embed] });

        const logEmbed = new EmbedBuilder()
          .setTitle('rank log')
          .setColor(0x5865f2)
          .addFields(
            { name: 'user',      value: result.displayName,    inline: true },
            { name: 'tag',       value: tagName,               inline: true },
            { name: 'role id',   value: roleId,                inline: true },
            { name: 'ranked by', value: `<@${user.id}>`,       inline: true },
            { name: 'channel',   value: `<#${channel.id}>`,    inline: true }
          )
          .setFooter({ text: `roblox id: ${result.userId}` })
          .setTimestamp();
        if (result.avatarUrl) logEmbed.setThumbnail(result.avatarUrl);
        await sendLog(guild, logEmbed);
      } catch (err) {
        console.error(err);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`couldn't rank them - ${err.message}`)] });
      }
      return;
    }
  }

  // ── /prefix ──────────────────────────────────────────────────────────────
  if (commandName === 'prefix') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'you need admin perms to change the prefix', ephemeral: true });
    const newPrefix = interaction.options.getString('new_prefix', true);
    if (newPrefix.length > 5)
      return interaction.reply({ content: "prefix can't be longer than 5 characters", ephemeral: true });
    const c = loadConfig();
    c.prefix = newPrefix;
    saveConfig(c);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is now \`${newPrefix}\` btw`)]
    });
  }

  // ── /status ──────────────────────────────────────────────────────────────
  if (commandName === 'status') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'you need admin perms for that', ephemeral: true });
    const type       = interaction.options.getString('type', true);
    const text       = interaction.options.getString('text', true);
    const statusData = { type, text };
    applyStatus(statusData);
    const c = loadConfig();
    c.status = statusData;
    saveConfig(c);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** - ${text}`)]
    });
  }

  // ── /whitelist ───────────────────────────────────────────────────────────
  if (commandName === 'whitelist') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'you need admin perms for that', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const c   = loadConfig();
    c.whitelist = c.whitelist ?? [];

    if (sub === 'add') {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
      if (c.whitelist.includes(target.id))
        return interaction.reply({ content: `**${target.user.tag}** is already on the whitelist`, ephemeral: true });
      c.whitelist.push(target.id);
      saveConfig(c);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelisted')
            .setColor(0x57f287)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: 'user',     value: target.user.tag, inline: true },
              { name: 'added by', value: user.tag,         inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'remove') {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ content: "couldn't find that member", ephemeral: true });
      if (!c.whitelist.includes(target.id))
        return interaction.reply({ content: `**${target.user.tag}** isn't on the whitelist`, ephemeral: true });
      c.whitelist = c.whitelist.filter(id => id !== target.id);
      saveConfig(c);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('removed from whitelist')
            .setColor(0xed4245)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: 'user',       value: target.user.tag, inline: true },
              { name: 'removed by', value: user.tag,         inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'list') {
      if (!c.whitelist.length) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('whitelist')
              .setColor(0x2c2f33)
              .setDescription('nobody on the whitelist rn')
          ],
          ephemeral: true
        });
      }
      const lines = c.whitelist.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelist')
            .setColor(0x2c2f33)
            .setDescription(lines.join('\n'))
            .setTimestamp()
        ],
        ephemeral: true
      });
    }
  }

  // ── /setlog ──────────────────────────────────────────────────────────────
  if (commandName === 'setlog') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: 'you need admin perms for that', ephemeral: true });
    const ch = interaction.options.getChannel('channel', true);
    if (!ch.isTextBased()) return interaction.reply({ content: 'that channel needs to be a text channel', ephemeral: true });
    const c = loadConfig();
    c.logChannelId = ch.id;
    saveConfig(c);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('log channel set')
          .setColor(0x57f287)
          .setDescription(`rank logs will go to ${ch} now`)
          .setTimestamp()
      ]
    });
  }

  // ── /grouproles ──────────────────────────────────────────────────────────
  if (commandName === 'grouproles') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: 'you need manage messages perms for this', ephemeral: true });
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return interaction.reply({ content: '`ROBLOX_GROUP_ID` isn\'t configured', ephemeral: true });
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
            .setColor(0x2c2f33)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `group id: ${groupId}  ·  use the role id in tags` })
            .setTimestamp()
        ]
      });
    } catch { return interaction.editReply("couldn't load group roles, try again"); }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const hushed = loadHushed();
  if (hushed[message.author.id]) {
    try { await message.delete(); } catch {}
    return;
  }

  if (message.mentions.users.size > 0) {
    const afkData  = loadAfk();
    const mentioned = message.mentions.users.first();
    if (afkData[mentioned?.id]) {
      const entry = afkData[mentioned.id];
      const since = Math.floor(entry.since / 1000);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2c2f33)
            .setDescription(`**${mentioned.username}** is AFK: ${entry.reason || 'no reason'}\n<t:${since}:R>`)
        ]
      });
    }
  }

  const prefix  = getPrefix();
  const afkData = loadAfk();

  if (afkData[message.author.id] && message.content.startsWith(prefix)) {
    delete afkData[message.author.id];
    saveAfk(afkData);
    await message.reply({ content: "yo you're back, removed ur afk", allowedMentions: { repliedUser: false } });
  }

  if (!message.content.startsWith(prefix)) return;

  const cfg2      = loadConfig();
  const whitelist = cfg2.whitelist ?? [];
  if (!whitelist.includes(message.author.id)) return;

  const args    = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'hb') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply('you need ban perms for this');

    const target = message.mentions.users.first();
    const rawId  = args[0];

    if (!target && !rawId)
      return message.reply(`Usage: \`${prefix}hb @user [reason]\` or \`${prefix}hb [user id] [reason]\``);

    const userId = target?.id ?? rawId;
    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (!/^\d{17,19}$/.test(userId))
      return message.reply('That doesn\'t look like a valid user ID.');

    try {
      await message.guild.members.ban(userId, {
        reason: `Hardban by ${message.author.tag}: ${reason}`,
        deleteMessageSeconds: 0
      });

      let username = target?.tag ?? userId;
      if (!target) {
        try { const fetched = await client.users.fetch(userId); username = fetched.tag; } catch {}
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('hardban\'d')
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
      return message.reply(`couldn't ban that user — ${err.message}`);
    }
  }

  if (command === 'prefix') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('you need admin perms to change the prefix');

    const newPrefix = args[0];
    if (!newPrefix)
      return message.reply(`Current prefix is \`${prefix}\`. To change it: \`${prefix}prefix [new prefix]\``);
    if (newPrefix.length > 5)
      return message.reply('Prefix can\'t be longer than 5 characters.');

    const cfg = loadConfig();
    cfg.prefix = newPrefix;
    saveConfig(cfg);

    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`prefix is now \`${newPrefix}\` btw`)]
    });
  }

  if (command === 'status') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('you need admin perms for that');

    const validTypes = ['playing', 'watching', 'listening', 'competing', 'custom'];
    const type = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');

    if (!type || !validTypes.includes(type) || !text)
      return message.reply(`Usage: \`${prefix}status [playing/watching/listening/competing/custom] [text]\``);

    const statusData = { type, text };
    applyStatus(statusData);
    const cfg = loadConfig();
    cfg.status = statusData;
    saveConfig(cfg);

    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`status changed to **${type}** - ${text}`)]
    });
  }

  if (command === 'afk') {
    const reason = args.join(' ') || null;
    const afk    = loadAfk();
    afk[message.author.id] = { reason, since: Date.now() };
    saveAfk(afk);
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x2c2f33).setDescription(`you're afk now${reason ? `: ${reason}` : ''}`)],
      allowedMentions: { repliedUser: false }
    });
  }

  if (command === 'reboot') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('you need admin perms for that');
    await message.reply('rebooting...');
    process.exit(0);
  }

  if (command === 'tag') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply('you need manage messages perms for this');

    const full = args.join(' ');

    if (full.includes('|')) {
      const pipeIdx = full.indexOf('|');
      const name    = full.slice(0, pipeIdx).trim().toLowerCase();
      const content = full.slice(pipeIdx + 1).trim();
      if (!name || !content) return message.reply(`Usage: \`${prefix}tag [name] | [content]\``);
      const tags = loadTags();
      const isNew = !tags[name];
      tags[name] = content;
      saveTags(tags);
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`tag **${name}** ${isNew ? 'created' : 'updated'}!`)]
      });
    }

    const robloxUser = args[0];
    const tagName    = args.slice(1).join(' ').toLowerCase();

    if (!robloxUser || !tagName)
      return message.reply(`Usage:\n\`${prefix}tag [name] | [roleId]\` — create a tag\n\`${prefix}tag [robloxUsername] [tagname]\` — rank a user`);

    const tags = loadTags();
    if (!tags[tagName])
      return message.reply(`No tag named **${tagName}**. Create it with \`${prefix}tag ${tagName} | [roleId]\``);

    const roleId = tags[tagName].trim();
    if (isNaN(Number(roleId)))
      return message.reply(`Tag **${tagName}** doesn't have a valid role ID (got: \`${roleId}\`).`);

    const status = await message.reply({
      embeds: [new EmbedBuilder().setColor(0x2c2f33).setDescription(`ranking **${robloxUser}**...`)]
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
          { name: 'user',    value: result.displayName,        inline: true },
          { name: 'tag',     value: tagName,                    inline: true },
          { name: 'role id', value: roleId,                     inline: true },
          { name: 'ranked by', value: `<@${message.author.id}>`,  inline: true },
          { name: 'channel',   value: `<#${message.channel.id}>`, inline: true }
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

  if (command === 'roblox') {
    const username = args[0];
    if (!username) return message.reply(`Usage: \`${prefix}roblox [username]\``);
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
            .setColor(0x2c2f33)
            .addFields(
              { name: 'Created', value: created,     inline: true },
              { name: 'User ID', value: `${userId}`, inline: true }
            )
            .setThumbnail(avatarUrl)
            .setTimestamp()
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Profile').setStyle(ButtonStyle.Link).setURL(profileUrl),
          new ButtonBuilder().setLabel('Games').setStyle(ButtonStyle.Link).setURL(`${profileUrl}#sortName=Games`)
        )]
      });
    } catch { return message.reply("couldn't load that profile, try again"); }
  }

  if (command === 'gc') {
    const username = args[0];
    if (!username) return message.reply(`Usage: \`${prefix}gc [username]\``);
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
              .setColor(0x2c2f33)
              .setTitle(`${userBasic.name}'s Groups`)
              .setDescription("they're not in any roblox groups lol")
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

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply('you need ban perms for this');
    const target = message.mentions.members.first();
    if (!target) return message.reply(`Usage: \`${prefix}ban @user [reason]\``);
    if (!target.bannable) return message.reply('Can\'t ban that member (they might outrank me).');
    const reason = args.slice(1).join(' ') || 'No reason provided';
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

  if (command === 'grouproles') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply('you need manage messages perms for this');
    const groupId = process.env.ROBLOX_GROUP_ID;
    if (!groupId) return message.reply('`ROBLOX_GROUP_ID` isn\'t configured.');
    try {
      const data = await (await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`)).json();
      if (!data.roles?.length) return message.reply('No roles found for this group.');
      const lines = data.roles
        .sort((a, b) => a.rank - b.rank)
        .map(r => `\`${String(r.rank).padStart(3, '0')}\`  **${r.name}**  —  ID: \`${r.id}\``);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('group roles')
            .setColor(0x2c2f33)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `group id: ${groupId}  ·  use the role id in tags` })
            .setTimestamp()
        ]
      });
    } catch { return message.reply("couldn't load group roles, try again"); }
  }

  if (command === 'hush') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply('you need manage messages perms for this');
    const target = message.mentions.members.first();
    if (!target) return message.reply(`Usage: \`${prefix}hush @user\``);
    const hushedData = loadHushed();
    if (hushedData[target.id]) {
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
    } else {
      hushedData[target.id] = { hushedBy: message.author.id, at: Date.now() };
      saveHushed(hushedData);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('hushed')
            .setColor(0xfee75c)
            .setThumbnail(target.user.displayAvatarURL())
            .setDescription('every message they send will be deleted lol')
            .addFields(
              { name: 'user', value: target.user.tag,    inline: true },
              { name: 'mod',  value: message.author.tag, inline: true }
            )
            .setTimestamp()
        ]
      });
    }
  }

  if (command === 'timeout') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply('you need moderate members perms for this');
    const target = message.mentions.members.first();
    if (!target) return message.reply(`Usage: \`${prefix}timeout @user [minutes] [reason]\``);
    const minutes = parseInt(args[1]) || 5;
    if (minutes < 1 || minutes > 40320) return message.reply('Duration must be between 1 and 40320 minutes.');
    const reason = args.slice(2).join(' ') || 'No reason provided';
    try { await target.timeout(minutes * 60 * 1000, reason); }
    catch { return message.reply("couldn't timeout that member (they might outrank me)"); }
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

  if (command === 'mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply('you need moderate members perms for this');
    const target = message.mentions.members.first();
    if (!target) return message.reply(`Usage: \`${prefix}mute @user [reason]\``);
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try { await target.timeout(28 * 24 * 60 * 60 * 1000, reason); }
    catch { return message.reply("couldn't mute that member"); }
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply('you need moderate members perms for this');
    const target = message.mentions.members.first();
    if (!target) return message.reply(`Usage: \`${prefix}unmute @user\``);
    try { await target.timeout(null); }
    catch { return message.reply("couldn't unmute that member"); }
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

  if (command === 'whitelist') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('you need admin perms for that');
    const sub = args[0]?.toLowerCase();
    const cfg = loadConfig();
    cfg.whitelist = cfg.whitelist ?? [];

    if (sub === 'add') {
      const target = message.mentions.members.first();
      if (!target) return message.reply(`Usage: \`${prefix}whitelist add @user\``);
      if (cfg.whitelist.includes(target.id)) return message.reply(`**${target.user.tag}** is already on the whitelist`);
      cfg.whitelist.push(target.id);
      saveConfig(cfg);
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
      if (!target) return message.reply(`Usage: \`${prefix}whitelist remove @user\``);
      if (!cfg.whitelist.includes(target.id)) return message.reply(`**${target.user.tag}** isn't on the whitelist`);
      cfg.whitelist = cfg.whitelist.filter(id => id !== target.id);
      saveConfig(cfg);
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
      if (!cfg.whitelist.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('whitelist')
              .setColor(0x2c2f33)
              .setDescription('nobody on the whitelist rn')
          ]
        });
      }
      const lines = cfg.whitelist.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('whitelist')
            .setColor(0x2c2f33)
            .setDescription(lines.join('\n'))
            .setTimestamp()
        ]
      });
    }

    return message.reply(`Usage: \`${prefix}whitelist add @user\` · \`${prefix}whitelist remove @user\` · \`${prefix}whitelist list\``);
  }

  if (command === 'setlog') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('you need admin perms for that');
    const channel = message.mentions.channels.first();
    if (!channel || !channel.isTextBased()) return message.reply(`Usage: \`${prefix}setlog #channel\``);
    const cfg = loadConfig();
    cfg.logChannelId = channel.id;
    saveConfig(cfg);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('log channel set')
          .setColor(0x57f287)
          .setDescription(`rank logs will go to ${channel} now`)
          .setTimestamp()
      ]
    });
  }

});

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('DISCORD_TOKEN is not set'); process.exit(1); }

client.login(token);

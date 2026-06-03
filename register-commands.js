require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Setup the verification system'),
  new SlashCommandBuilder()
    .setName('send-verify')
    .setDescription('Send the verification message'),
  new SlashCommandBuilder()
    .setName('add-to-server')
    .setDescription('Add all verified users to a server')
    .addStringOption(opt => 
      opt.setName('serverid')
        .setDescription('Target server ID')
        .setRequired(true)
    )
];

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands('1426995257609814209'),
      { body: commands }
    );
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error(error);
  }
})();

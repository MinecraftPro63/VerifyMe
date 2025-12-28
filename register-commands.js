const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Setup the verification system'),
  new SlashCommandBuilder()
    .setName('send-verify')
    .setDescription('Send the verification message')
];

const rest = new REST().setToken('MTQyNjk5NTI1NzYwOTgxNDIwOQ.GJKEEN.nimiDtu4fpgWgdwqvSdpJ9t5XDLbP0KhRlaJe0');

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
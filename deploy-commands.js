const { REST, Routes, SlashCommandBuilder } = require('discord.js');

let localConfig = {};
try {
  localConfig = require('./config.json');
} catch (_) {}

const token = process.env.DISCORD_TOKEN || localConfig.token;
const clientId = process.env.DISCORD_CLIENT_ID || localConfig.clientId;
const guildId = process.env.DISCORD_GUILD_ID || localConfig.guildId;

for (const [key, value] of Object.entries({
  DISCORD_TOKEN: token,
  DISCORD_CLIENT_ID: clientId,
  DISCORD_GUILD_ID: guildId,
})) {
  if (!value) {
    throw new Error(`Missing required config value: ${key}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('pawinfo')
    .setDescription('Show a linked paw info')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose paw you want to check')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('linkpaw')
    .setDescription('Open the site and link your paw to Discord')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Paw Bot is online')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('pawhelp')
    .setDescription('Show Paw Bot help')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('pawstats')
    .setDescription('Show paw stats')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('pawmessage')
    .setDescription('Update your paw message from Discord')
    .addStringOption(option =>
      option
        .setName('text')
        .setDescription('Your new paw message (max 60 characters)')
        .setRequired(true)
        .setMaxLength(60)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

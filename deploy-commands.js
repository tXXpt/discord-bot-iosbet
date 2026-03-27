const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!clientId || !token) {
  console.error("❌ BOT_TOKEN or CLIENT_ID is missing in environment variables");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance'),

  new SlashCommandBuilder()
    .setName('addmatch')
    .setDescription('Add a new match (admin only)')
    .addStringOption(option =>
      option.setName('team1')
        .setDescription('Team 1 name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('team2')
        .setDescription('Team 2 name')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('odds1')
        .setDescription('Team 1 odds')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('odds2')
        .setDescription('Team 2 odds')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('View all current matches'),

  new SlashCommandBuilder()
    .setName('bet')
    .setDescription('Place a bet on a match')
    .addIntegerOption(option =>
      option.setName('match_id')
        .setDescription('Match ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team to bet on')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of coins to bet')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('setresult')
    .setDescription('Set the result of a match (admin only)')
    .addIntegerOption(option =>
      option.setName('match_id')
        .setDescription('Match ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('winner')
        .setDescription('Winning team name')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top users globally'),

  new SlashCommandBuilder()
    .setName('deletematch')
    .setDescription('Delete a match (admin only)')
    .addIntegerOption(option =>
      option.setName('match_id')
        .setDescription('ID of the match to delete')
        .setRequired(true))
].map(command => command.toJSON());

// --- Register commands globally ---
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🚀 Started refreshing application (/) commands globally...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('✅ Successfully registered application commands globally!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
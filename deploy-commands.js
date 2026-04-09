require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance'),

  new SlashCommandBuilder()
    .setName('mybets')
    .setDescription('View your current active bets'),

  new SlashCommandBuilder()
    .setName('addmatch')
    .setDescription('Add a match')
    .addStringOption(o =>
      o.setName('team1')
        .setDescription('Name of first team')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('team2')
        .setDescription('Name of second team')
        .setRequired(true)
    )
    .addNumberOption(o =>
      o.setName('odds1')
        .setDescription('Odds for first team')
        .setRequired(true)
    )
    .addNumberOption(o =>
      o.setName('odds2')
        .setDescription('Odds for second team')
        .setRequired(true)
    )
    .addNumberOption(o =>
      o.setName('oddsdraw')
        .setDescription('Odds for draw')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('View matches'),

  new SlashCommandBuilder()
    .setName('bet')
    .setDescription('Open the interactive betting menu'),

  new SlashCommandBuilder()
    .setName('closebets')
    .setDescription('Close betting for a match')
    .addIntegerOption(o =>
      o.setName('match_id')
        .setDescription('ID of the match')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('openbets')
    .setDescription('Reopen betting for a match')
    .addIntegerOption(o =>
      o.setName('match_id')
        .setDescription('ID of the match')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('matchbets')
    .setDescription('View all bets for a specific match')
    .addIntegerOption(o =>
      o.setName('match_id')
        .setDescription('ID of the match')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setresult')
    .setDescription('Set match result')
    .addIntegerOption(o =>
      o.setName('match_id')
        .setDescription('ID of the match')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('winner')
        .setDescription('Winning team or Draw')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top users by balance'),

  new SlashCommandBuilder()
    .setName('winsleaderboard')
    .setDescription('Top 10 users by bets won'),

  new SlashCommandBuilder()
    .setName('deletematch')
    .setDescription('Delete a match')
    .addIntegerOption(o =>
      o.setName('match_id')
        .setDescription('ID of the match to delete')
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🚀 Registering commands...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('✅ Commands registered!');
  } catch (error) {
    console.error(error);
  }
})();
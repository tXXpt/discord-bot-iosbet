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
      .addStringOption(o => o.setName('team1').setRequired(true))
      .addStringOption(o => o.setName('team2').setRequired(true))
      .addNumberOption(o => o.setName('odds1').setRequired(true))
      .addNumberOption(o => o.setName('odds2').setRequired(true))
      .addNumberOption(o => o.setName('oddsdraw').setRequired(true)),

    new SlashCommandBuilder()
      .setName('fixtures')
      .setDescription('View matches'),

    new SlashCommandBuilder()
      .setName('bet')
      .setDescription('Place a bet')
      .addIntegerOption(o => o.setName('match_id').setRequired(true))
      .addStringOption(o => o.setName('team').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setresult')
      .setDescription('Set match result')
      .addIntegerOption(o => o.setName('match_id').setRequired(true))
      .addStringOption(o => o.setName('winner').setRequired(true)),

    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Top users'),

    new SlashCommandBuilder()
      .setName('deletematch')
      .setDescription('Delete match')
      .addIntegerOption(o => o.setName('match_id').setRequired(true))

  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  (async () => {
    try {
      console.log('🚀 Registering commands...');
      await rest.put(
        Routes.applicationCommands(clientId), // GLOBAL
        { body: commands }
      );
      console.log('✅ Commands registered!');
    } catch (error) {
      console.error(error);
    }
  })();
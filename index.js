require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// --- Config ---
const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => id.trim())
  : [];

const ALLOWED_CHANNEL_NAME = 'iosbet';

// --- Check token ---
if (!token || token.length < 50) {
  console.error('❌ Invalid or missing BOT_TOKEN in .env');
  process.exit(1);
}

// --- Initialize client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// --- Load or initialize data ---
let data = { users: {}, matches: [] };
const DATA_FILE = './data.json';
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('⚠️ Failed to parse data.json, initializing empty data.');
    data = { users: {}, matches: [] };
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(userId) {
  if (!data.users[userId]) data.users[userId] = { balance: 0, lastDaily: 0 };
}

// --- Broadcast to all servers ---
async function broadcastMessage(message) {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      ch =>
        ch.name === ALLOWED_CHANNEL_NAME &&
        ch.isTextBased() &&
        ch.permissionsFor(guild.members.me).has('SendMessages')
    );
    if (channel) {
      channel.send(message).catch(console.error);
    }
  }
}

// --- Auto-create allowed channel on join ---
client.on('guildCreate', async guild => {
  let channel = guild.channels.cache.find(
    ch => ch.name === ALLOWED_CHANNEL_NAME && ch.isTextBased()
  );
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: ALLOWED_CHANNEL_NAME,
        type: 0, // text channel
        reason: 'Channel for iosbet bot commands',
      });
      console.log(`✅ Created channel #${ALLOWED_CHANNEL_NAME} in ${guild.name}`);
    } catch (err) {
      console.error(`❌ Failed to create channel in ${guild.name}:`, err);
    }
  }
});

// --- Ready event ---
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// --- Command handler ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Only allow commands in allowed channel
  if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
    return interaction.reply({
      content: `⚠️ This bot only works in the #${ALLOWED_CHANNEL_NAME} channel!`,
      ephemeral: true,
    }).catch(console.error);
  }

  const userId = interaction.user.id;
  ensureUser(userId);

  try {
    switch (interaction.commandName) {

      case 'daily': {
        const now = Date.now();
        if (now - data.users[userId].lastDaily < 24 * 60 * 60 * 1000) {
          return interaction.reply({
            content: '⏳ You can claim your daily again in 24 hours.',
            ephemeral: true,
          });
        }
        const amount = 100;
        data.users[userId].balance += amount;
        data.users[userId].lastDaily = now;
        saveData();
        return interaction.reply(`🎁 You claimed your daily ${amount} coins!`);
      }

      case 'balance':
        return interaction.reply(`💰 Your balance: ${data.users[userId].balance} coins`);

      case 'addmatch': {
        if (!ADMIN_IDS.includes(userId)) return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');
        const odds1 = interaction.options.getNumber('odds1');
        const odds2 = interaction.options.getNumber('odds2');
        const matchId = data.matches.length + 1;
        data.matches.push({ id: matchId, team1, team2, odds1, odds2, result: null });
        saveData();
        return interaction.reply(`✅ Match added: ${team1} vs ${team2} (ID: ${matchId})`);
      }

      case 'deletematch': {
        if (!ADMIN_IDS.includes(userId)) return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
        const matchId = interaction.options.getInteger('match_id');
        const index = data.matches.findIndex(m => m.id === matchId);
        if (index === -1) return interaction.reply(`❌ Match ID ${matchId} not found.`);
        data.matches.splice(index, 1);
        saveData();
        return interaction.reply(`✅ Match ID ${matchId} deleted.`);
      }

      case 'setresult': {
        if (!ADMIN_IDS.includes(userId)) return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
        const matchId = interaction.options.getInteger('match_id');
        const winner = interaction.options.getString('winner');
        const match = data.matches.find(m => m.id === matchId);
        if (!match) return interaction.reply(`❌ Match ID ${matchId} not found.`);
        match.result = winner;
        saveData();
        return interaction.reply(`✅ Result set for match ${matchId}: winner is ${winner}`);
      }

      case 'fixtures': {
        if (interaction.commandName === 'fixtures') {
  const { EmbedBuilder } = require('discord.js');

  if (data.matches.length === 0) {
    return interaction.reply('⚠️ No matches available.');
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Current Matches')
    .setColor(0x00AE86);

  data.matches.forEach(match => {
    const resultText = match.result ? ` (Winner: ${match.result})` : '';
    embed.addFields({
      name: `ID: ${match.id} - ${match.team1} vs ${match.team2}`,
      value: `Odds: ${match.team1} (${match.odds1}) vs ${match.team2} (${match.odds2})${resultText}`,
      inline: false
    });
  });

  return interaction.reply({ embeds: [embed] });
}
      }

      case 'bet': {
        const matchId = interaction.options.getInteger('match_id');
        const team = interaction.options.getString('team');
        const amount = interaction.options.getInteger('amount');

        if (data.users[userId].balance < amount) return interaction.reply('❌ Not enough coins.');

        const match = data.matches.find(m => m.id === matchId);
        if (!match) return interaction.reply('❌ Match not found.');
        if (match.result) return interaction.reply('⚠️ Match already finished.');

        data.users[userId].balance -= amount;
        if (!match.bets) match.bets = [];
        match.bets.push({ userId, team, amount });
        saveData();
        return interaction.reply(`✅ You bet ${amount} coins on ${team} for match ID ${matchId}`);
      }

      case 'leaderboard': {
        const leaderboard = Object.entries(data.users)
          .sort((a, b) => b[1].balance - a[1].balance)
          .map(([id, u], idx) => `${idx + 1}. <@${id}> - ${u.balance} coins`)
          .slice(0, 10)
          .join('\n');
        return interaction.reply(`🏆 Top users:\n${leaderboard || 'No users yet.'}`);
      }

      default:
        return interaction.reply('❌ Unknown command.');
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply('❌ Something went wrong.');
  }
});

// --- Login ---
client.login(token).catch(err => {
  console.error('❌ Failed to login. Check your BOT_TOKEN in .env');
  console.error(err);
});
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

  // --- /daily command ---
  if (interaction.commandName === 'daily') {
    const now = Date.now();
    if (now - data.users[userId].lastDaily < 24 * 60 * 60 * 1000) {
      return interaction.reply({
        content: '⏳ You can claim your daily again in 24 hours.',
        ephemeral: true,
      }).catch(console.error);
    }
    const amount = 100;
    data.users[userId].balance += amount;
    data.users[userId].lastDaily = now;
    saveData();
    return interaction.reply(`🎁 You claimed your daily ${amount} coins!`).catch(console.error);
  }

  // --- /balance command ---
  if (interaction.commandName === 'balance') {
    return interaction.reply(`💰 Your balance: ${data.users[userId].balance} coins`).catch(console.error);
  }

  // --- Admin-only commands ---
  const adminOnly = ['addmatch', 'deletematch', 'setresult'];
  if (adminOnly.includes(interaction.commandName) && !ADMIN_IDS.includes(userId)) {
    return interaction.reply({ content: '❌ Not authorized.', ephemeral: true }).catch(console.error);
  }

  // TODO: implement addmatch, deletematch, setresult, fixtures, bet, leaderboard commands
});

// --- Login ---
client.login(token).catch(err => {
  console.error('❌ Failed to login. Check your BOT_TOKEN in .env');
  console.error(err);
});
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const { token, ADMIN_IDS } = require('./config.json');

const ALLOWED_CHANNEL_NAME = 'iosbet'; // bot only works in this channel

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- Load or initialize data ---
let data = { users: {}, matches: [] };
const DATA_FILE = './data.json';
if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Ensure user exists ---
function ensureUser(userId) {
  if (!data.users[userId]) data.users[userId] = { balance: 0, lastDaily: 0 };
}

// --- Broadcast to all servers (only in allowed channel) ---
async function broadcastMessage(message) {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      ch => ch.name === ALLOWED_CHANNEL_NAME && ch.isTextBased() &&
            ch.permissionsFor(guild.members.me).has('SendMessages')
    );
    if (channel) {
      channel.send(message).catch(console.error);
    }
  }
}

// --- Auto-create allowed channel when bot joins server ---
client.on('guildCreate', async guild => {
  let channel = guild.channels.cache.find(
    ch => ch.name === ALLOWED_CHANNEL_NAME && ch.isTextBased()
  );
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: ALLOWED_CHANNEL_NAME,
        type: 0, // text channel
        reason: 'Channel for iosbet bot commands'
      });
      console.log(`Created channel #${ALLOWED_CHANNEL_NAME} in ${guild.name}`);
    } catch (err) {
      console.error(`Failed to create channel in ${guild.name}:`, err);
    }
  } else {
    console.log(`Found existing #${ALLOWED_CHANNEL_NAME} in ${guild.name}`);
  }
});

// --- Ready ---
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// --- Commands ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Only allow commands in allowed channel
  if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
    return interaction.reply({
      content: `⚠️ This bot only works in the #${ALLOWED_CHANNEL_NAME} channel!`,
      ephemeral: true
    });
  }

  const userId = interaction.user.id;
  ensureUser(userId);

  // --- /daily ---
  if (interaction.commandName === 'daily') {
    const now = Date.now();
    if (now - data.users[userId].lastDaily < 24 * 60 * 60 * 1000) {
      return interaction.reply({ content: '⏳ You can claim your daily again in 24 hours.', ephemeral: true });
    }
    const amount = 100;
    data.users[userId].balance += amount;
    data.users[userId].lastDaily = now;
    saveData();
    return interaction.reply(`🎁 You claimed your daily ${amount} coins!`);
  }

  // --- /balance ---
  if (interaction.commandName === 'balance') {
    return interaction.reply(`💰 Your balance: ${data.users[userId].balance} coins`);
  }

  // --- /addmatch ---
if (interaction.commandName === 'addmatch') {
  if (!ADMIN_IDS.includes(userId)) 
    return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });

  const team1 = interaction.options.getString('team1');
  const team2 = interaction.options.getString('team2');
  const odds1 = interaction.options.getNumber('odds1');
  const odds2 = interaction.options.getNumber('odds2');

  const match = {
    id: data.matches.length ? Math.max(...data.matches.map(m => m.id)) + 1 : 1,
    team1, team2, odds1, odds2, bets: [], result: null
  };
  data.matches.push(match);
  saveData();

  // Reply in current server
  interaction.reply(`✅ Match added: ${team1} vs ${team2}`);

  // --- GLOBAL UPDATE ---
  broadcastMessage(`📣 Global Update: New match added → **${team1} vs ${team2}**!`);
}

  // --- /deletematch ---
  if (interaction.commandName === 'deletematch') {
    if (!ADMIN_IDS.includes(userId)) return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
    const matchId = interaction.options.getInteger('match_id');
    const idx = data.matches.findIndex(m => m.id === matchId);
    if (idx === -1) return interaction.reply({ content: `❌ Match ${matchId} not found.`, ephemeral: true });
    const removed = data.matches.splice(idx, 1)[0];
    saveData();
    interaction.reply(`🗑️ Match ${removed.team1} vs ${removed.team2} deleted.`);
    broadcastMessage(`🗑️ Global Update: Match **${removed.team1} vs ${removed.team2}** has been removed!`);
  }

  // --- /fixtures ---
  if (interaction.commandName === 'fixtures') {
    if (!data.matches.length) return interaction.reply('No matches currently.');
    let text = '⚽ Current Matches:\n';
    data.matches.forEach(m => {
      text += `ID:${m.id} → ${m.team1} vs ${m.team2} | Odds: ${m.odds1}/${m.odds2}\n`;
    });
    return interaction.reply(text);
  }

  // --- /bet ---
  if (interaction.commandName === 'bet') {
    const matchId = interaction.options.getInteger('match_id');
    const team = interaction.options.getString('team');
    const amount = interaction.options.getInteger('amount');
    const match = data.matches.find(m => m.id === matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (amount > data.users[userId].balance) return interaction.reply({ content: '❌ Not enough coins.', ephemeral: true });
    if (![match.team1, match.team2].includes(team)) return interaction.reply({ content: '❌ Invalid team.', ephemeral: true });
    match.bets.push({ userId, team, amount });
    data.users[userId].balance -= amount;
    saveData();
    return interaction.reply(`✅ Bet placed: ${amount} on ${team}`);
  }

  // --- /setresult ---
  if (interaction.commandName === 'setresult') {
    if (!ADMIN_IDS.includes(userId)) return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
    const matchId = interaction.options.getInteger('match_id');
    const winner = interaction.options.getString('winner');
    const match = data.matches.find(m => m.id === matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (![match.team1, match.team2].includes(winner)) return interaction.reply({ content: '❌ Invalid winner.', ephemeral: true });

    match.result = winner;

    // Pay out winners
    let payoutMessage = `🏆 Result: ${match.team1} vs ${match.team2} → Winner: ${winner}\n`;
    match.bets.forEach(b => {
      if (b.team === winner) {
        const odds = (b.team === match.team1) ? match.odds1 : match.odds2;
        const winnings = Math.floor(b.amount * odds);
        ensureUser(b.userId);
        data.users[b.userId].balance += winnings;
        payoutMessage += `<@${b.userId}> won ${winnings} coins!\n`;
      }
    });

    saveData();
    interaction.reply(payoutMessage || 'No bets placed.');
    broadcastMessage(`📣 Global Update: **${match.team1} vs ${match.team2}** → Winner: **${winner}**!`);
  }

  // --- /leaderboard ---
  if (interaction.commandName === 'leaderboard') {
    const top = Object.entries(data.users)
      .sort(([, a], [, b]) => b.balance - a.balance)
      .slice(0, 10);
    let text = '🏅 Top Users:\n';
    top.forEach(([uid, u], i) => text += `${i+1}. <@${uid}> → ${u.balance} coins\n`);
    return interaction.reply(text);
  }
});

client.login(token);
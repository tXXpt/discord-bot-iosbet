require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// --- Config ---
const token = process.env.BOT_TOKEN;
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
  } catch {
    data = { users: {}, matches: [] };
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = { balance: 0, lastDaily: 0 };
  }
}

// --- Ready ---
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// --- Command handler ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
    return interaction.reply({
      content: `⚠️ This bot only works in #${ALLOWED_CHANNEL_NAME}`,
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  ensureUser(userId);

  try {
    switch (interaction.commandName) {

      // --- DAILY ---
      case 'daily': {
        const now = Date.now();
        if (now - data.users[userId].lastDaily < 86400000) {
          return interaction.reply('⏳ Come back in 24h.');
        }

        data.users[userId].balance += 100;
        data.users[userId].lastDaily = now;
        saveData();

        return interaction.reply('🎁 You got 100 coins!');
      }

      // --- BALANCE ---
      case 'balance':
        return interaction.reply(`💰 Balance: ${data.users[userId].balance}`);

      // --- ADD MATCH ---
      case 'addmatch': {
        if (!ADMIN_IDS.includes(userId))
          return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });

        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');
        const odds1 = interaction.options.getNumber('odds1');
        const odds2 = interaction.options.getNumber('odds2');
        const oddsDraw = interaction.options.getNumber('oddsdraw');

        const matchId = data.matches.length + 1;

        data.matches.push({
          id: matchId,
          team1,
          team2,
          odds1,
          odds2,
          oddsDraw,
          result: null,
          bets: []
        });

        saveData();

        return interaction.reply(`✅ ${team1} vs ${team2} (ID ${matchId})`);
      }

      // --- FIXTURES ---
      case 'fixtures': {
  const { EmbedBuilder } = require('discord.js');

  if (data.matches.length === 0) {
    return interaction.reply('⚠️ No matches available.');
  }

  const embeds = data.matches.map(match => {
    return new EmbedBuilder()
      .setTitle('📋 Current Matches')
      .setColor(0x00AE86)
      .setDescription(
        `ID: ${match.id} - ${match.team1} vs ${match.team2}\n` +
        `Odds: ${match.team1} (${match.odds1}) | Draw (${match.oddsDraw}) | ${match.team2} (${match.odds2})`
      );
  });

  return interaction.reply({ embeds });
}

      // --- BET ---
      case 'bet': {
        const matchId = interaction.options.getInteger('match_id');
        const team = interaction.options.getString('team');
        const amount = interaction.options.getInteger('amount');

        if (data.users[userId].balance < amount)
          return interaction.reply('❌ Not enough coins.');

        const match = data.matches.find(m => m.id === matchId);
        if (!match) return interaction.reply('❌ Match not found.');

        if (![match.team1, match.team2, 'Draw'].includes(team)) {
          return interaction.reply('❌ Invalid team. Use team name or "Draw".');
        }

        data.users[userId].balance -= amount;

        match.bets.push({ userId, team, amount });

        saveData();

        return interaction.reply(`✅ Bet placed on ${team}`);
      }

      // --- MY BETS ---
      case 'mybets': {
        const bets = [];

        data.matches.forEach(match => {
          match.bets.forEach(bet => {
            if (bet.userId === userId) {
              bets.push({
                match,
                bet
              });
            }
          });
        });

        if (bets.length === 0) {
          return interaction.reply('📭 No active bets.');
        }

        let msg = '🎯 **Your Bets:**\n\n';

        bets.forEach(({ match, bet }) => {
          let odds =
            bet.team === match.team1 ? match.odds1 :
            bet.team === match.team2 ? match.odds2 :
            match.oddsDraw;

          let potential = Math.floor(bet.amount * odds);

          msg += `ID ${match.id}: ${match.team1} vs ${match.team2}\n`;
          msg += `➡️ ${bet.team} | 💰 ${bet.amount} | 🎯 Win: ${potential}\n\n`;
        });

        return interaction.reply(msg);
      }

      // --- SET RESULT ---
      case 'setresult': {
        if (!ADMIN_IDS.includes(userId))
          return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });

        const matchId = interaction.options.getInteger('match_id');
        const winner = interaction.options.getString('winner');

        const index = data.matches.findIndex(m => m.id === matchId);
        if (index === -1) return interaction.reply('❌ Match not found.');

        const match = data.matches[index];

        let msg = `🏁 ${match.team1} vs ${match.team2}\nWinner: ${winner}\n\n`;

        match.bets.forEach(bet => {
          let win = false;
          let odds = 0;

          if (bet.team === match.team1 && winner === match.team1) {
            win = true; odds = match.odds1;
          } else if (bet.team === match.team2 && winner === match.team2) {
            win = true; odds = match.odds2;
          } else if (bet.team === 'Draw' && winner === 'Draw') {
            win = true; odds = match.oddsDraw;
          }

          if (win) {
            const winAmount = Math.floor(bet.amount * odds);
            data.users[bet.userId].balance += winAmount;
            msg += `✅ <@${bet.userId}> won ${winAmount}\n`;
          } else {
            msg += `❌ <@${bet.userId}> lost ${bet.amount}\n`;
          }
        });

        data.matches.splice(index, 1);
        saveData();

        return interaction.reply(msg);
      }

      default:
        return interaction.reply('❌ Unknown command.');
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied)
      await interaction.reply('❌ Error occurred.');
  }
});

// --- Login ---
client.login(token);
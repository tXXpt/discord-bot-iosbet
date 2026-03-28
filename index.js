  require('dotenv').config();
  const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
    intents: [GatewayIntentBits.Guilds],
  });

  // --- Data ---
  let data = { users: {}, matches: [] };
  const DATA_FILE = '/data/data.json';

  // ✅ Create file if it doesn't exist (IMPORTANT)
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } else {
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

  // --- Commands ---
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
      return interaction.reply({
        content: `⚠️ Use commands in #${ALLOWED_CHANNEL_NAME}`,
        ephemeral: true,
      });
    }

    const userId = interaction.user.id;
    ensureUser(userId);

    try {
      // ✅ Prevent "Unknown interaction"
      await interaction.deferReply();

      switch (interaction.commandName) {

        case 'daily': {
          const now = Date.now();
          if (now - data.users[userId].lastDaily < 86400000) {
            return interaction.editReply('⏳ Come back in 24h.');
          }

          data.users[userId].balance += 100;
          data.users[userId].lastDaily = now;
          saveData();

          return interaction.editReply('🎁 You got 100 coins!');
        }

        case 'balance':
          return interaction.editReply(`💰 Balance: ${data.users[userId].balance}`);

        case 'addmatch': {
          if (!ADMIN_IDS.includes(userId))
            return interaction.editReply('❌ Not authorized.');

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

          return interaction.editReply(`✅ ${team1} vs ${team2} (ID ${matchId})`);
        }

        case 'deletematch': {
          if (!ADMIN_IDS.includes(userId))
            return interaction.editReply('❌ Not authorized.');

          const matchId = interaction.options.getInteger('match_id');
          const index = data.matches.findIndex(m => m.id === matchId);
          if (index === -1) return interaction.editReply('❌ Match not found.');

          const removed = data.matches.splice(index, 1)[0];

          // Refund bets
          (removed.bets || []).forEach(bet => {
            ensureUser(bet.userId);
            data.users[bet.userId].balance += bet.amount;
          });

          saveData();

          return interaction.editReply(`🗑️ Match deleted: ${removed.team1} vs ${removed.team2} (ID ${removed.id}) and bets refunded`);
        }

        case 'fixtures': {
          if (data.matches.length === 0) {
            return interaction.editReply('⚠️ No matches available.');
          }

          const embed = new EmbedBuilder()
            .setTitle('📋 Current Matches')
            .setColor(0x00AE86);

          data.matches.forEach(match => {
            embed.addFields({
              name: `ID ${match.id}: ${match.team1} vs ${match.team2}`,
              value: `Odds: ${match.team1} (${match.odds1}) | Draw (${match.oddsDraw}) | ${match.team2} (${match.odds2})`,
              inline: false
            });
          });

          return interaction.editReply({ embeds: [embed] });
        }

        case 'bet': {
          const matchId = interaction.options.getInteger('match_id');
          const teamInput = interaction.options.getString('team');
          const amount = interaction.options.getInteger('amount');

          if (data.users[userId].balance < amount)
            return interaction.editReply('❌ Not enough coins.');

          const match = data.matches.find(m => m.id === matchId);
          if (!match) return interaction.editReply('❌ Match not found.');

          if (![match.team1, match.team2, 'draw', 'Draw'].includes(teamInput)) {
            return interaction.editReply('❌ Invalid team.');
          }

          // Normalize input
          const team = teamInput.toLowerCase() === 'draw' ? 'Draw' : teamInput;

          if (!match.bets) match.bets = [];
          match.bets.push({ userId, team, amount });

          data.users[userId].balance -= amount;
          saveData();

          // ✅ New message format
          return interaction.editReply(`✅ ${interaction.user.username} bet ${amount} coins on ${team} (ID ${match.id})`);
        }

        case 'leaderboard': {
  const sorted = Object.entries(data.users)
    .sort((a, b) => b[1].balance - a[1].balance)
    .slice(0, 10);

  if (sorted.length === 0)
    return interaction.editReply({ content: '📭 No users yet.', ephemeral: true });

  let msg = '🏆 **Leaderboard**\n\n';

  sorted.forEach(([id, user], i) => {
    msg += `${i + 1}. <@${id}> — 💰 ${user.balance}\n`;
  });

  return interaction.editReply({ content: msg, ephemeral: true });
}

        case 'mybets': {
          const bets = [];

          data.matches.forEach(match => {
            if (!match.bets) return;

            match.bets.forEach(bet => {
              if (bet.userId === userId) {
                bets.push({ match, bet });
              }
            });
          });

          if (bets.length === 0) {
            return interaction.editReply('📭 No active bets.');
          }

          let msg = '🎯 **Your Bets:**\n\n';

          bets.forEach(({ match, bet }) => {
            let odds =
              bet.team === match.team1 ? match.odds1 :
              bet.team === match.team2 ? match.odds2 :
              match.oddsDraw;

            let potential = Math.floor(bet.amount * odds);

            msg += `✅ ${interaction.user.username} bet ${bet.amount} coins on ${bet.team} (ID ${match.id}) — 🎯 Potential win: ${potential}\n`;
          });

          return interaction.editReply(msg);
        }

        case 'setresult': {
          if (!ADMIN_IDS.includes(userId))
            return interaction.editReply('❌ Not authorized.');

          const matchId = interaction.options.getInteger('match_id');
          const winner = interaction.options.getString('winner');

          const index = data.matches.findIndex(m => m.id === matchId);
          if (index === -1) return interaction.editReply('❌ Match not found.');

          const match = data.matches[index];

          let msg = `🏁 ${match.team1} vs ${match.team2}\nWinner: ${winner}\n\n`;

          (match.bets || []).forEach(bet => {
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
              ensureUser(bet.userId);
              data.users[bet.userId].balance += winAmount;
              msg += `✅ <@${bet.userId}> won ${winAmount}\n`;
            } else {
              msg += `❌ <@${bet.userId}> lost ${bet.amount}\n`;
            }
          });

          data.matches.splice(index, 1);
          saveData();

          return interaction.editReply(msg);
        }

        default:
          return interaction.editReply('❌ Unknown command.');
      }

    } catch (err) {
      console.error(err);
      if (!interaction.replied)
        await interaction.editReply('❌ Error occurred.');
    }
  });

  client.login(token);
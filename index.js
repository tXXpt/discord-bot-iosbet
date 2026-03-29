require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
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

// ✅ Create file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
} else {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    data = { users: {}, matches: [] };
  }
}

function normalizeMatches() {
  for (const match of data.matches) {
    if (typeof match.isOpen !== 'boolean') {
      match.isOpen = true;
    }
    if (!Array.isArray(match.bets)) {
      match.bets = [];
    }
  }
}

normalizeMatches();
fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = { balance: 0, lastDaily: 0 };
  }
}

function getNextMatchId() {
  if (data.matches.length === 0) return 1;
  return Math.max(...data.matches.map(m => m.id)) + 1;
}

function getTeamFromPick(match, pick) {
  if (pick === 'team1') return match.team1;
  if (pick === 'team2') return match.team2;
  if (pick === 'draw') return 'Draw';
  return null;
}

function getOddsFromPick(match, pick) {
  if (pick === 'team1') return match.odds1;
  if (pick === 'team2') return match.odds2;
  if (pick === 'draw') return match.oddsDraw;
  return null;
}

// --- Ready ---
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// --- Interactions ---
client.on('interactionCreate', async interaction => {
  try {
    // =========================
    // BUTTONS
    // =========================
    if (interaction.isButton()) {
      if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
        return interaction.reply({
          content: `⚠️ Use commands in #${ALLOWED_CHANNEL_NAME}`,
          ephemeral: true,
        });
      }

      const parts = interaction.customId.split(':');

      if (parts[0] === 'betpick') {
        const matchId = Number(parts[1]);
        const pick = parts[2];

        const match = data.matches.find(m => m.id === matchId);
        if (!match) {
          return interaction.reply({
            content: '❌ Match not found or no longer available.',
            ephemeral: true,
          });
        }

        if (!match.isOpen) {
          return interaction.reply({
            content: '🔒 Betting is closed for this match.',
            ephemeral: true,
          });
        }

        const selectedTeam = getTeamFromPick(match, pick);
        const selectedOdds = getOddsFromPick(match, pick);

        if (!selectedTeam || selectedOdds === null) {
          return interaction.reply({
            content: '❌ Invalid selection.',
            ephemeral: true,
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`betmodal:${match.id}:${pick}`)
          .setTitle(`Bet on ${selectedTeam}`);

        const amountInput = new TextInputBuilder()
          .setCustomId('bet_amount')
          .setLabel(`How many coins? (Odds: ${selectedOdds})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Example: 50')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      return;
    }

    // =========================
    // MODALS
    // =========================
    if (interaction.isModalSubmit()) {
      if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
        return interaction.reply({
          content: `⚠️ Use commands in #${ALLOWED_CHANNEL_NAME}`,
          ephemeral: true,
        });
      }

      const parts = interaction.customId.split(':');

      if (parts[0] === 'betmodal') {
        const matchId = Number(parts[1]);
        const pick = parts[2];
        const userId = interaction.user.id;

        ensureUser(userId);

        const match = data.matches.find(m => m.id === matchId);
        if (!match) {
          return interaction.reply({
            content: '❌ Match not found or no longer available.',
            ephemeral: true,
          });
        }

        if (!match.isOpen) {
          return interaction.reply({
            content: '🔒 Betting is closed for this match.',
            ephemeral: true,
          });
        }

        const selectedTeam = getTeamFromPick(match, pick);
        if (!selectedTeam) {
          return interaction.reply({
            content: '❌ Invalid team.',
            ephemeral: true,
          });
        }

        const rawAmount = interaction.fields.getTextInputValue('bet_amount').trim();
        const amount = Number(rawAmount);

        if (!Number.isInteger(amount) || amount <= 0) {
          return interaction.reply({
            content: '❌ Please enter a valid whole number greater than 0.',
            ephemeral: true,
          });
        }

        if (data.users[userId].balance < amount) {
          return interaction.reply({
            content: `❌ Not enough coins. Your balance is ${data.users[userId].balance}.`,
            ephemeral: true,
          });
        }

        if (!match.bets) match.bets = [];

        data.users[userId].balance -= amount;
        match.bets.push({
          userId,
          team: selectedTeam,
          amount,
        });

        saveData();

        await interaction.reply({
          content: `✅ You bet ${amount} coins on ${selectedTeam} (ID ${match.id})`,
          ephemeral: true,
        });

        const publicEmbed = new EmbedBuilder()
          .setTitle('🎯 New Bet Placed')
          .setColor(0x00AE86)
          .addFields(
            { name: 'User', value: interaction.user.username, inline: true },
            { name: 'Amount', value: `${amount} coins`, inline: true },
            { name: 'Pick', value: selectedTeam, inline: true },
            {
              name: 'Match',
              value: `${match.team1} vs ${match.team2} (ID ${match.id})`,
              inline: false,
            }
          );

        await interaction.channel.send({ embeds: [publicEmbed] });
        return;
      }

      return;
    }

    // =========================
    // SLASH COMMANDS
    // =========================
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.channel || interaction.channel.name !== ALLOWED_CHANNEL_NAME) {
      return interaction.reply({
        content: `⚠️ Use commands in #${ALLOWED_CHANNEL_NAME}`,
        ephemeral: true,
      });
    }

    const userId = interaction.user.id;
    ensureUser(userId);

    switch (interaction.commandName) {
      case 'daily': {
        await interaction.deferReply({ ephemeral: true });

        const now = Date.now();
        if (now - data.users[userId].lastDaily < 86400000) {
          return interaction.editReply('⏳ Come back in 24h.');
        }

        data.users[userId].balance += 100;
        data.users[userId].lastDaily = now;
        saveData();

        return interaction.editReply('🎁 You got 100 coins!');
      }

      case 'balance': {
        await interaction.deferReply({ ephemeral: true });
        return interaction.editReply(`💰 Balance: ${data.users[userId].balance}`);
      }

      case 'addmatch': {
  await interaction.deferReply();

  if (!ADMIN_IDS.includes(userId)) {
    return interaction.editReply('❌ Not authorized.');
  }

  const team1 = interaction.options.getString('team1');
  const team2 = interaction.options.getString('team2');
  const odds1 = interaction.options.getNumber('odds1');
  const odds2 = interaction.options.getNumber('odds2');
  const oddsDraw = interaction.options.getNumber('oddsdraw');

  const matchId = getNextMatchId();

  const newMatch = {
    id: matchId,
    team1,
    team2,
    odds1,
    odds2,
    oddsDraw,
    result: null,
    bets: [],
    isOpen: true,
  };

  data.matches.push(newMatch);
  saveData();

  // ✅ Reply to admin
  await interaction.editReply(`✅ Match added: ${team1} vs ${team2} (ID ${matchId})`);

  // ✅ PUBLIC ANNOUNCEMENT
  const embed = new EmbedBuilder()
    .setTitle('📢 New Match Available')
    .setColor(0x00AE86)
    .addFields(
      {
        name: 'Match',
        value: `${team1} vs ${team2}`,
        inline: false,
      },
      {
        name: 'Odds',
        value: `${team1} (${odds1}) | Draw (${oddsDraw}) | ${team2} (${odds2})`,
        inline: false,
      },
      {
        name: 'Match ID',
        value: `${matchId}`,
        inline: true,
      },
      {
        name: 'Status',
        value: '🟢 Open for betting',
        inline: true,
      }
    );

  await interaction.channel.send({ embeds: [embed] });

  return;
}

      case 'closebets': {
        await interaction.deferReply();

        if (!ADMIN_IDS.includes(userId)) {
          return interaction.editReply('❌ Not authorized.');
        }

        const matchId = interaction.options.getInteger('match_id');
        const match = data.matches.find(m => m.id === matchId);

        if (!match) {
          return interaction.editReply('❌ Match not found.');
        }

        if (!match.isOpen) {
          return interaction.editReply(`⚠️ Betting is already closed for ${match.team1} vs ${match.team2} (ID ${match.id}).`);
        }

        match.isOpen = false;
        saveData();

        return interaction.editReply(`🔒 Betting closed for ${match.team1} vs ${match.team2} (ID ${match.id}).`);
      }

      case 'openbets': {
        await interaction.deferReply();

        if (!ADMIN_IDS.includes(userId)) {
          return interaction.editReply('❌ Not authorized.');
        }

        const matchId = interaction.options.getInteger('match_id');
        const match = data.matches.find(m => m.id === matchId);

        if (!match) {
          return interaction.editReply('❌ Match not found.');
        }

        if (match.isOpen) {
          return interaction.editReply(`⚠️ Betting is already open for ${match.team1} vs ${match.team2} (ID ${match.id}).`);
        }

        match.isOpen = true;
        saveData();

        return interaction.editReply(`🔓 Betting reopened for ${match.team1} vs ${match.team2} (ID ${match.id}).`);
      }

      case 'deletematch': {
        await interaction.deferReply();

        if (!ADMIN_IDS.includes(userId)) {
          return interaction.editReply('❌ Not authorized.');
        }

        const matchId = interaction.options.getInteger('match_id');
        const index = data.matches.findIndex(m => m.id === matchId);

        if (index === -1) {
          return interaction.editReply('❌ Match not found.');
        }

        const removed = data.matches.splice(index, 1)[0];

        for (const bet of removed.bets || []) {
          ensureUser(bet.userId);
          data.users[bet.userId].balance += bet.amount;
        }

        saveData();

        return interaction.editReply(
          `🗑️ Match deleted: ${removed.team1} vs ${removed.team2} (ID ${removed.id}) and bets refunded`
        );
      }

      case 'fixtures': {
        await interaction.deferReply({ ephemeral: true });

        if (data.matches.length === 0) {
          return interaction.editReply('⚠️ No matches available.');
        }

        const embed = new EmbedBuilder()
          .setTitle('📋 Current Matches')
          .setColor(0x00AE86);

        for (const match of data.matches) {
          embed.addFields({
            name: `ID ${match.id}: ${match.team1} vs ${match.team2}`,
            value: `Odds: ${match.team1} (${match.odds1}) | Draw (${match.oddsDraw}) | ${match.team2} (${match.odds2})\nStatus: ${match.isOpen ? '🟢 Open' : '🔴 Closed'}`,
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      case 'bet': {
        await interaction.deferReply({ ephemeral: true });

        const openMatches = data.matches.filter(m => m.isOpen);

        if (openMatches.length === 0) {
          return interaction.editReply('⚠️ No matches currently open for betting.');
        }

        await interaction.editReply('🎯 **Choose a team below to place your bet.**');

        for (const match of openMatches) {
          const embed = new EmbedBuilder()
            .setTitle(`Match ID ${match.id}`)
            .setColor(0x00AE86)
            .addFields({
              name: `${match.team1} vs ${match.team2}`,
              value: `**Odds:** ${match.team1} (${match.odds1}) | Draw (${match.oddsDraw}) | ${match.team2} (${match.odds2})`,
              inline: false,
            });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`betpick:${match.id}:team1`)
              .setLabel(`${match.team1} (${match.odds1})`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`betpick:${match.id}:draw`)
              .setLabel(`Draw (${match.oddsDraw})`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`betpick:${match.id}:team2`)
              .setLabel(`${match.team2} (${match.odds2})`)
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.followUp({
            embeds: [embed],
            components: [row],
            ephemeral: true,
          });
        }

        return;
      }

      case 'leaderboard': {
        await interaction.deferReply({ ephemeral: true });

        const sorted = Object.entries(data.users)
          .sort((a, b) => b[1].balance - a[1].balance)
          .slice(0, 10);

        if (sorted.length === 0) {
          return interaction.editReply('📭 No users yet.');
        }

        let description = '';

        for (let i = 0; i < sorted.length; i++) {
          const [id, user] = sorted[i];
          let username = 'Unknown User';

          try {
            const fetchedUser = await client.users.fetch(id);
            username = fetchedUser.username;
          } catch {}

          description += `${i + 1}. ${username} — 💰 ${user.balance}\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle('🏆 Leaderboard')
          .setColor(0xFFD700)
          .setDescription(description);

        return interaction.editReply({ embeds: [embed] });
      }

      case 'mybets': {
        await interaction.deferReply({ ephemeral: true });

        const bets = [];

        for (const match of data.matches) {
          if (!match.bets) continue;

          for (const bet of match.bets) {
            if (bet.userId === userId) {
              bets.push({ match, bet });
            }
          }
        }

        if (bets.length === 0) {
          return interaction.editReply('📭 No active bets.');
        }

        const embed = new EmbedBuilder()
          .setTitle('🎯 Your Active Bets')
          .setColor(0x00AE86);

        for (const { match, bet } of bets) {
          let odds = match.oddsDraw;

          if (bet.team === match.team1) odds = match.odds1;
          if (bet.team === match.team2) odds = match.odds2;

          const potential = Math.floor(bet.amount * odds);

          embed.addFields({
            name: `ID ${match.id}: ${match.team1} vs ${match.team2}`,
            value: `**Pick:** ${bet.team}\n**Amount:** ${bet.amount}\n**Potential Win:** ${potential}`,
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      case 'setresult': {
        await interaction.deferReply();

        if (!ADMIN_IDS.includes(userId)) {
          return interaction.editReply('❌ Not authorized.');
        }

        const matchId = interaction.options.getInteger('match_id');
        const winner = interaction.options.getString('winner');

        const index = data.matches.findIndex(m => m.id === matchId);
        if (index === -1) {
          return interaction.editReply('❌ Match not found.');
        }

        const match = data.matches[index];

        if (![match.team1, match.team2, 'Draw'].includes(winner)) {
          return interaction.editReply('❌ Invalid winner. Must be team1, team2, or Draw.');
        }

        let msg = `🏁 ${match.team1} vs ${match.team2}\nWinner: ${winner}\n\n`;

        for (const bet of match.bets || []) {
          let win = false;
          let odds = 0;

          if (bet.team === match.team1 && winner === match.team1) {
            win = true;
            odds = match.odds1;
          } else if (bet.team === match.team2 && winner === match.team2) {
            win = true;
            odds = match.odds2;
          } else if (bet.team === 'Draw' && winner === 'Draw') {
            win = true;
            odds = match.oddsDraw;
          }

          if (win) {
            const winAmount = Math.floor(bet.amount * odds);
            ensureUser(bet.userId);
            data.users[bet.userId].balance += winAmount;
            msg += `✅ <@${bet.userId}> won ${winAmount}\n`;
          } else {
            msg += `❌ <@${bet.userId}> lost ${bet.amount}\n`;
          }
        }

        data.matches.splice(index, 1);
        saveData();

        return interaction.editReply(msg);
      }

      default: {
        return interaction.reply({
          content: '❌ Unknown command.',
          ephemeral: true,
        });
      }
    }
  } catch (err) {
    console.error(err);

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply('❌ Error occurred.');
      }

      return interaction.reply({
        content: '❌ Error occurred.',
        ephemeral: true,
      });
    }
  }
});

client.login(token);
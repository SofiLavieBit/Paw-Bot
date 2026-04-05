const {
  Client,
  GatewayIntentBits,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');

let localConfig = {};
try {
  localConfig = require('./config.json');
} catch (_) {}

const token = process.env.DISCORD_TOKEN || localConfig.token;
const supabaseUrl = process.env.SUPABASE_URL || localConfig.supabaseUrl;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || localConfig.supabaseAnonKey;

for (const [key, value] of Object.entries({
  DISCORD_TOKEN: token,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
})) {
  if (!value) {
    throw new Error(`Missing required config value: ${key}`);
  }
}

const ARCANE_BOT_ID = '437808476106784770';
const SYBAU_STICKER_ID = '1476087272075165789';
const LINKED_ROLE_ID = '1489913288648032317';
const LINK_PAW_URL = 'https://sofilaviebit.carrd.co/?start_discord_link=1';
const SERVER_INVITE_URL = 'https://discord.gg/4n8BG6gQsR';
const EMBED_COLOR = 0x8A6BFF;

let lastLinkedCheck = new Date(Date.now() - 60_000).toISOString();
let isRecentLinkSyncRunning = false;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function pawAuth(body) {
  const res = await fetch(`${supabaseUrl}/functions/v1/paw-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed: ${res.status}`);
  }

  return data;
}

async function sendDM(discordUserId, content) {
  try {
    const user = await client.users.fetch(discordUserId);
    if (!user) return false;
    await user.send(content);
    return true;
  } catch (err) {
    console.warn(`Could not DM ${discordUserId}:`, err.message || err);
    return false;
  }
}

async function giveLinkedRoleIfMissing(guild, discordUserId) {
  try {
    const role = await guild.roles.fetch(LINKED_ROLE_ID).catch(() => null);
    if (!role) {
      return {
        guildChecked: true,
        memberFound: false,
        roleAdded: false,
      };
    }

    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      return {
        guildChecked: true,
        memberFound: false,
        roleAdded: false,
      };
    }

    if (member.user.bot) {
      return {
        guildChecked: true,
        memberFound: true,
        roleAdded: false,
      };
    }

    if (!member.roles.cache.has(LINKED_ROLE_ID)) {
      await member.roles.add(LINKED_ROLE_ID);
      console.log(`Gave linked role to ${member.user.tag} in ${guild.name}`);
      return {
        guildChecked: true,
        memberFound: true,
        roleAdded: true,
        member,
      };
    }

    return {
      guildChecked: true,
      memberFound: true,
      roleAdded: false,
      member,
    };
  } catch (err) {
    console.error(`Failed to process linked role for ${discordUserId}:`, err.message || err);
    return {
      guildChecked: true,
      memberFound: false,
      roleAdded: false,
    };
  }
}

async function syncRecentlyLinkedUsers() {
  if (isRecentLinkSyncRunning) return;
  isRecentLinkSyncRunning = true;

  try {
    const data = await pawAuth({
      action: 'recently-linked',
      linkedAfter: lastLinkedCheck,
    });

    const rows = data?.rows || [];
    if (!rows.length) return;

    for (const row of rows) {
      const visitor = row.visitor;
      const linkedAt = row.discordLinkedAt;

      if (linkedAt) {
        lastLinkedCheck = linkedAt;
      }

      if (!visitor?.discordUserId) continue;

      let foundInServer = false;
      let gotRoleSomewhere = false;

      for (const [, guild] of client.guilds.cache) {
        const result = await giveLinkedRoleIfMissing(guild, visitor.discordUserId);

        if (result.memberFound) {
          foundInServer = true;
        }

        if (result.roleAdded) {
          gotRoleSomewhere = true;
        }
      }

      if (foundInServer) {
        await sendDM(
          visitor.discordUserId,
          'Your paw is now linked to your Discord account :3\n\nYou received the linked role in the server.'
        );
      } else {
        await sendDM(
          visitor.discordUserId,
          `Your paw is now linked to your Discord account :3\n\nYou are not in the server yet, but if you join it you will be able to receive perks there because your paw is already linked.\n${SERVER_INVITE_URL}`
        );
      }

      if (gotRoleSomewhere) {
        console.log(`Finished link processing for ${visitor.discordUserId}`);
      }
    }
  } catch (err) {
    console.error('recently-linked sync failed:', err.message || err);
  } finally {
    isRecentLinkSyncRunning = false;
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'linked paws :3',
        type: ActivityType.Watching,
      },
    ],
  });

  await syncRecentlyLinkedUsers();
  setInterval(syncRecentlyLinkedUsers, 15_000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Paw Bot')
      .setDescription('Paw Bot is online :3');

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === 'pawhelp') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Paw Bot Commands')
      .addFields(
        { name: '/pawinfo', value: 'Show your paw info, or someone else\'s if you @ them.', inline: false },
        { name: '/linkpaw', value: 'Open the site and link your paw to Discord.', inline: false },
        { name: '/pawstats', value: 'Show paw stats.', inline: false },
        { name: '/pawmessage', value: 'Update your paw message from Discord.', inline: false },
        { name: '/ping', value: 'Check if the bot is alive.', inline: false },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'pawstats') {
    try {
      await interaction.deferReply();

      const data = await pawAuth({ action: 'stats' });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Paw Stats')
        .addFields(
          { name: 'Total paws', value: String(data.totalPaws ?? 0), inline: true },
          { name: 'Linked paws', value: String(data.linkedPaws ?? 0), inline: true },
          { name: 'Paws with messages', value: String(data.pawsWithMessages ?? 0), inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('pawstats failed:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Something went wrong while loading paw stats.');
      } else {
        await interaction.reply('Something went wrong while loading paw stats.');
      }
    }
    return;
  }

  if (interaction.commandName === 'pawmessage') {
    try {
      const text = interaction.options.getString('text', true).trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const data = await pawAuth({
        action: 'discord-set-message',
        discordUserId: interaction.user.id,
        message: text,
      });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Paw Message Updated')
        .setDescription(data?.visitor?.message || text);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('pawmessage failed:', err);
      const msg = err?.message || 'Something went wrong while updating your paw message.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (interaction.commandName === 'pawinfo') {
    try {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser('user') || interaction.user;

      const data = await pawAuth({
        action: 'discord-info',
        discordUserId: targetUser.id,
      });

      if (!data?.linked || !data?.visitor || !data.visitor.discordLinked) {
        if (targetUser.id === interaction.user.id) {
          await interaction.editReply(
            'Your paw is not linked to you discord account. Use /linkpaw to link your discord account to your paw.'
          );
        } else {
          await interaction.editReply(
            `${targetUser} does not have a paw linked to their discord account.`
          );
        }
        return;
      }

      if (interaction.guild && targetUser.id === interaction.user.id) {
        await giveLinkedRoleIfMissing(interaction.guild, interaction.user.id);
      }

      const visitor = data.visitor;
      const joinDate = visitor.joinDate
        ? new Date(visitor.joinDate).toLocaleDateString()
        : 'Unknown';

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`Paw Info for ${targetUser.username}`)
        .addFields(
          { name: 'Visitor #', value: String(visitor.visitorNumber), inline: true },
          { name: 'Site join date', value: joinDate, inline: true },
          {
            name: 'Message',
            value: visitor.message && visitor.message.trim()
              ? visitor.message
              : 'No message set',
            inline: false,
          },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('pawinfo failed:', err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Something went wrong while checking paw info.');
      } else {
        await interaction.reply('Something went wrong while checking paw info.');
      }
    }
    return;
  }

  if (interaction.commandName === 'linkpaw') {
    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Link Paw')
          .setStyle(ButtonStyle.Link)
          .setURL(LINK_PAW_URL)
      );

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Link Your Paw')
        .setDescription('Open this link to connect your paw to Discord. You can use /linkpaw any time to start the linking process again.');

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('linkpaw failed:', err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Something went wrong while opening the link.');
      } else {
        await interaction.reply({
          content: 'Something went wrong while opening the link.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }
});

client.on('messageCreate', async (message) => {
  console.log('Message seen:', message.content);

  if (message.author.id === ARCANE_BOT_ID) {
    if (Math.random() < 0.1) {
      try {
        await message.reply('Yo, SYBAU');
        await message.channel.send({
          stickers: [SYBAU_STICKER_ID],
        });
        console.log('SYBAU response sent');
      } catch (err) {
        console.error('SYBAU response failed:', err);
      }
    }
  }

  if (!message.author.bot) {
    const text = message.content.toLowerCase();

    if (text.includes('bleh')) {
      try {
        await message.reply('Blehhhh <:InnocentSofi:1476468886848147486>');
        console.log('Replied successfully');
      } catch (err) {
        console.error('Reply failed:', err);
      }
    }
  }
});

client.login(token);

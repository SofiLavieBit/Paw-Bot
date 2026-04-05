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

function logStep(message, extra) {
  const timestamp = new Date().toISOString();
  if (typeof extra === 'undefined') {
    console.log(`[${timestamp}] ${message}`);
  } else {
    console.log(`[${timestamp}] ${message}`, extra);
  }
}

logStep('Booting Paw Bot...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function pawAuth(body) {
  logStep('Calling paw-auth function with body:', body);

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
  } catch (_) {
    logStep('paw-auth returned a response that could not be parsed as JSON');
  }

  logStep(`paw-auth responded with HTTP ${res.status}`);

  if (!res.ok) {
    logStep('paw-auth request failed with body:', data);
    throw new Error((data && data.error) || `Request failed: ${res.status}`);
  }

  logStep('paw-auth request succeeded with body:', data);
  return data;
}

async function sendDM(discordUserId, content) {
  try {
    logStep(`Trying to DM user ${discordUserId}`);
    const user = await client.users.fetch(discordUserId);
    if (!user) {
      logStep(`Could not fetch user ${discordUserId} for DM`);
      return false;
    }

    await user.send(content);
    logStep(`DM sent successfully to ${user.tag}`);
    return true;
  } catch (err) {
    logStep(`Could not DM ${discordUserId}: ${err.message || err}`);
    return false;
  }
}

async function giveLinkedRoleIfMissing(guild, discordUserId) {
  try {
    logStep(`Checking linked role in guild "${guild.name}" for user ${discordUserId}`);

    const role = await guild.roles.fetch(LINKED_ROLE_ID).catch(() => null);
    if (!role) {
      logStep(`Role ${LINKED_ROLE_ID} was not found in guild "${guild.name}"`);
      return {
        guildChecked: true,
        memberFound: false,
        roleAdded: false,
      };
    }

    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      logStep(`User ${discordUserId} is not in guild "${guild.name}"`);
      return {
        guildChecked: true,
        memberFound: false,
        roleAdded: false,
      };
    }

    if (member.user.bot) {
      logStep(`Skipping bot user ${member.user.tag} while checking linked role`);
      return {
        guildChecked: true,
        memberFound: true,
        roleAdded: false,
      };
    }

    if (!member.roles.cache.has(LINKED_ROLE_ID)) {
      logStep(`User ${member.user.tag} does not have linked role yet. Adding it now.`);
      await member.roles.add(LINKED_ROLE_ID);
      logStep(`Gave linked role to ${member.user.tag} in ${guild.name}`);
      return {
        guildChecked: true,
        memberFound: true,
        roleAdded: true,
        member,
      };
    }

    logStep(`User ${member.user.tag} already has the linked role in ${guild.name}`);
    return {
      guildChecked: true,
      memberFound: true,
      roleAdded: false,
      member,
    };
  } catch (err) {
    logStep(`Failed to process linked role for ${discordUserId}: ${err.message || err}`);
    return {
      guildChecked: true,
      memberFound: false,
      roleAdded: false,
    };
  }
}

async function syncRecentlyLinkedUsers() {
  if (isRecentLinkSyncRunning) {
    logStep('Skipped recent-link sync because one is already running');
    return;
  }

  isRecentLinkSyncRunning = true;
  logStep(`Starting recent-link sync from timestamp ${lastLinkedCheck}`);

  try {
    const data = await pawAuth({
      action: 'recently-linked',
      linkedAfter: lastLinkedCheck,
    });

    const rows = data?.rows || [];
    logStep(`recently-linked returned ${rows.length} row(s)`);

    if (!rows.length) return;

    for (const row of rows) {
      const visitor = row.visitor;
      const linkedAt = row.discordLinkedAt;

      logStep('Processing recently-linked row:', row);

      if (linkedAt) {
        lastLinkedCheck = linkedAt;
        logStep(`Updated lastLinkedCheck to ${lastLinkedCheck}`);
      }

      if (!visitor?.discordUserId) {
        logStep('Skipping row because it has no discordUserId');
        continue;
      }

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

      if (gotRoleSomewhere) {
        logStep(`User ${visitor.discordUserId} got the linked role somewhere. Sending success DM.`);
        await sendDM(
          visitor.discordUserId,
          'Your paw is now linked to your Discord account :3\n\nYou received the linked role in the server.'
        );
        logStep(`Finished link processing for ${visitor.discordUserId}`);
      } else if (!foundInServer) {
        logStep(`User ${visitor.discordUserId} was not found in any current server. Sending invite DM.`);
        await sendDM(
          visitor.discordUserId,
          `Your paw is now linked to your Discord account :3\n\nYou are not in the server yet, but if you join it you will be able to receive perks there because your paw is already linked.\n${SERVER_INVITE_URL}`
        );
      } else {
        logStep(`User ${visitor.discordUserId} is already in the server and already has the role, so no DM was sent.`);
      }
    }
  } catch (err) {
    logStep(`recently-linked sync failed: ${err.message || err}`);
  } finally {
    isRecentLinkSyncRunning = false;
    logStep('Finished recent-link sync');
  }
}

client.once('clientReady', async () => {
  logStep(`Logged in as ${client.user.tag}`);
  logStep(`Bot is in ${client.guilds.cache.size} guild(s)`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'linked paws :3',
        type: ActivityType.Watching,
      },
    ],
  });

  logStep('Set bot presence to online / watching linked paws :3');

  await syncRecentlyLinkedUsers();
  setInterval(syncRecentlyLinkedUsers, 15_000);
  logStep('Started 15 second recent-link sync interval');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  logStep(`Slash command used: /${interaction.commandName} by ${interaction.user.tag}`);

  if (interaction.commandName === 'ping') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Paw Bot')
      .setDescription('Paw Bot is online :3');

    await interaction.reply({ embeds: [embed] });
    logStep('Replied to /ping');
    return;
  }

  if (interaction.commandName === 'pawhelp') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Paw Bot Commands')
      .addFields(
        { name: '/pawinfo', value: 'Show your paw info, or someone else\\'s if you @ them.', inline: false },
        { name: '/linkpaw', value: 'Open the site and link your paw to Discord.', inline: false },
        { name: '/pawstats', value: 'Show paw stats.', inline: false },
        { name: '/pawmessage', value: 'Update your paw message from Discord.', inline: false },
        { name: '/ping', value: 'Check if the bot is alive.', inline: false },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logStep('Replied to /pawhelp');
    return;
  }

  if (interaction.commandName === 'pawstats') {
    try {
      logStep('Handling /pawstats');
      await interaction.deferReply();
      logStep('/pawstats reply deferred');

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
      logStep('Replied to /pawstats with embed');
    } catch (err) {
      logStep(`pawstats failed: ${err.message || err}`);
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
      logStep(`/pawmessage requested with text: ${text}`);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      logStep('/pawmessage reply deferred');

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
      logStep('Replied to /pawmessage with embed');
    } catch (err) {
      logStep(`pawmessage failed: ${err.message || err}`);
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
      logStep('Handling /pawinfo');
      await interaction.deferReply();
      logStep('/pawinfo reply deferred');

      const targetUser = interaction.options.getUser('user') || interaction.user;
      logStep(`/pawinfo target user is ${targetUser.tag}`);

      const data = await pawAuth({
        action: 'discord-info',
        discordUserId: targetUser.id,
      });

      if (!data?.linked || !data?.visitor || !data.visitor.discordLinked) {
        logStep(`/pawinfo found no linked paw for ${targetUser.tag}`);
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
        logStep(`/pawinfo is checking linked role for self user ${interaction.user.tag}`);
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
      logStep(`Replied to /pawinfo for ${targetUser.tag}`);
    } catch (err) {
      logStep(`pawinfo failed: ${err.message || err}`);

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
      logStep('Handling /linkpaw');

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

      logStep('Replied to /linkpaw with button and embed');
    } catch (err) {
      logStep(`linkpaw failed: ${err.message || err}`);

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
  logStep(`Message seen from ${message.author.tag}: ${message.content}`);

  if (message.author.id === ARCANE_BOT_ID) {
    logStep('Arcane message detected. Rolling 1/10 response chance...');
    if (Math.random() < 0.1) {
      try {
        logStep('Arcane response triggered. Sending reply and sticker.');
        await message.reply('Yo, SYBAU');
        await message.channel.send({
          stickers: [SYBAU_STICKER_ID],
        });
        logStep('SYBAU response sent successfully');
      } catch (err) {
        logStep(`SYBAU response failed: ${err.message || err}`);
      }
    } else {
      logStep('Arcane response chance did not trigger this time');
    }
  }

  if (!message.author.bot) {
    const text = message.content.toLowerCase();

    if (text.includes('bleh')) {
      try {
        logStep('Detected "bleh" in message. Sending response.');
        await message.reply('Blehhhh <:InnocentSofi:1476468886848147486>');
        logStep('Bleh response sent successfully');
      } catch (err) {
        logStep(`Bleh response failed: ${err.message || err}`);
      }
    }
  }
});

client.login(token);

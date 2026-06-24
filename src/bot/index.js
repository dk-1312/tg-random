import { Telegraf, Markup } from "telegraf";
import { config } from "./config.js";
import {
  addManualPlayers,
  cancelGame,
  createGame,
  getActiveGame,
  getLatestDrawnGame,
  joinGame,
  leaveGame,
  parseGameDateTime,
  removeManualPlayer,
} from "./gameService.js";
import {
  formatDrawResults,
  formatNewGameMessage,
  formatRegistrationMessage,
  helpText,
} from "./messages.js";
import { drawAndNotify, startScheduler } from "./scheduler.js";
import {
  canAccessPrivateChat,
  privateAccessDeniedMessage,
  registerGroupChat,
} from "./groupAccess.js";
import {
  isPrivateChat,
  parseCommandArgs,
  publishGameToGroup,
  resolveAdminChatId,
} from "./adminContext.js";
import {
  formatJoinPrivateMessage,
  formatJoinToast,
  formatLeavePrivateMessage,
  formatLeaveToast,
  notifyUserError,
  notifyUserOnly,
} from "./notify.js";

const bot = new Telegraf(config.botToken);
let botUsername = null;

bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== "private") {
    return next();
  }

  if (await canAccessPrivateChat(ctx)) {
    return next();
  }

  if (!botUsername) {
    try {
      const me = await ctx.telegram.getMe();
      botUsername = me.username;
    } catch {
      // ignore
    }
  }

  await ctx.reply(privateAccessDeniedMessage(botUsername));
});

function getChatId(ctx) {
  return ctx.chat?.id;
}

function requireGroup(ctx) {
  if (ctx.chat?.type === "private") {
    ctx.reply("Эту команду нужно вызывать в групповом чате с командой.");
    return false;
  }
  return true;
}

bot.start((ctx) => {
  ctx.reply(helpText());
});

bot.help((ctx) => {
  ctx.reply(helpText());
});

bot.command("newgame", async (ctx) => {
  const chatId = await resolveAdminChatId(ctx);
  if (!chatId) return;

  const args = parseCommandArgs(ctx.message.text, "newgame");

  if (!args) {
    await ctx.reply(
      [
        "Формат:",
        "/newgame 19:00",
        "/newgame 22.06 19:00",
        "",
        "По умолчанию:",
        "Название: Воскресный футбол",
        "Команды: Зеленые vs Красные",
        "Размер: 7 на команду",
      ].join("\n")
    );
    return;
  }

  const gameAt = parseGameDateTime(args);
  if (!gameAt) {
    await ctx.reply("Не понял время. Пример: /newgame 19:00 или /newgame 22.06 19:00");
    return;
  }

  try {
    const game = createGame({
      chatId,
      title: "Воскресный футбол",
      teamAName: "Зеленые",
      teamBName: "Красные",
      teamSize: 7,
      gameAtIso: gameAt.toISO(),
    });

    if (isPrivateChat(ctx)) {
      await publishGameToGroup(bot, chatId, game);
      await ctx.reply(
        `Игра создана и опубликована в группе.\n\n${formatNewGameMessage(game)}`
      );
    } else {
      await ctx.reply(formatNewGameMessage(game), Markup.inlineKeyboard([
        Markup.button.callback("Записаться", "join"),
        Markup.button.callback("Список игроков", "players"),
      ]));
    }
  } catch (error) {
    if (error.message === "ACTIVE_GAME_EXISTS") {
      await ctx.reply("В этом чате уже есть активная игра. Сначала /cancel");
      return;
    }
    throw error;
  }
});

bot.command("join", async (ctx) => {
  if (!requireGroup(ctx)) return;

  try {
    const { game, already } = joinGame(getChatId(ctx), ctx.from);

    await notifyUserOnly(ctx, {
      privateText: formatJoinPrivateMessage(game, ctx.from.first_name, already),
      toastText: formatJoinToast(game, already),
      alertText: `${formatJoinToast(game, already)}\n\n${formatJoinPrivateMessage(game, ctx.from.first_name, already)}`,
    });
  } catch (error) {
    const messages = {
      NO_ACTIVE_GAME: "Сейчас нет открытой игры. Админ может создать её через /newgame 19:00",
      REGISTRATION_CLOSED: "Запись закрыта — скоро будет жеребьёвка.",
      GAME_FULL: "Все места заняты.",
    };
    await notifyUserError(ctx, messages[error.message] ?? "Не удалось записаться.");
  }
});

bot.command("leave", async (ctx) => {
  if (!requireGroup(ctx)) return;

  try {
    const game = leaveGame(getChatId(ctx), ctx.from.id);
    await notifyUserOnly(ctx, {
      privateText: formatLeavePrivateMessage(game),
      toastText: formatLeaveToast(game),
      alertText: `${formatLeaveToast(game)}\n\n${formatLeavePrivateMessage(game)}`,
    });
  } catch (error) {
    const messages = {
      NO_ACTIVE_GAME: "Нет активной игры.",
      NOT_REGISTERED: "Ты не был записан.",
    };
    await notifyUserError(ctx, messages[error.message] ?? "Не удалось отменить запись.");
  }
});

bot.command("players", async (ctx) => {
  if (!requireGroup(ctx)) return;

  const game = getActiveGame(getChatId(ctx));
  if (!game) {
    const drawn = getLatestDrawnGame(getChatId(ctx));
    if (drawn) {
      await ctx.reply(formatDrawResults(drawn));
      return;
    }
    await ctx.reply("Нет активной игры.");
    return;
  }

  await ctx.reply(formatRegistrationMessage(game));
});

bot.command("results", async (ctx) => {
  if (!requireGroup(ctx)) return;

  const game = getLatestDrawnGame(getChatId(ctx));
  if (!game) {
    const active = getActiveGame(getChatId(ctx));
    if (active) {
      await ctx.reply(
        `Жеребьёвка ещё не проведена.\n\n${formatRegistrationMessage(active)}`
      );
      return;
    }
    await ctx.reply("Составов пока нет.");
    return;
  }

  await ctx.reply(formatDrawResults(game));
});

bot.command("draw", async (ctx) => {
  const chatId = await resolveAdminChatId(ctx);
  if (!chatId) return;

  const game = getActiveGame(chatId);
  if (!game) {
    await ctx.reply("Нет активной игры для жеребьёвки.");
    return;
  }

  if (game.players.length === 0) {
    await ctx.reply("Никто не записался — жеребьёвка невозможна.");
    return;
  }

  await drawAndNotify(bot, game.id);
  await ctx.reply(
    isPrivateChat(ctx)
      ? "Жеребьёвка проведена и опубликована в группе."
      : "Жеребьёвка проведена."
  );
});

bot.command("add", async (ctx) => {
  const chatId = await resolveAdminChatId(ctx);
  if (!chatId) return;

  const namesText = parseCommandArgs(ctx.message.text, "add");
  if (!namesText) {
    await ctx.reply(
      [
        "Добавить игроков вручную (без Telegram):",
        "/add Иван",
        "/add Иван Петров",
        "/add Иван, Петя, Саша",
      ].join("\n")
    );
    return;
  }

  try {
    const { game, added } = addManualPlayers(chatId, [namesText]);
    const label = added.length === 1 ? "Добавлен" : "Добавлены";

    await ctx.reply(
      `${label}: ${added.join(", ")}\n\n${formatRegistrationMessage(game)}`
    );
  } catch (error) {
    if (error.message === "NO_ACTIVE_GAME") {
      await ctx.reply("Нет активной игры. Сначала /newgame");
      return;
    }
    if (error.message === "REGISTRATION_CLOSED") {
      await ctx.reply("Запись закрыта — скоро будет жеребьёвка.");
      return;
    }
    if (error.message === "GAME_FULL") {
      await ctx.reply("Все места заняты.");
      return;
    }
    if (error.message.startsWith("DUPLICATE:")) {
      const name = error.message.slice("DUPLICATE:".length);
      await ctx.reply(`Игрок «${name}» уже в списке.`);
      return;
    }
    throw error;
  }
});

bot.command("remove", async (ctx) => {
  const chatId = await resolveAdminChatId(ctx);
  if (!chatId) return;

  const name = parseCommandArgs(ctx.message.text, "remove");
  if (!name) {
    await ctx.reply("Формат: /remove Иван Петров");
    return;
  }

  try {
    const { game, removed } = removeManualPlayer(chatId, name);
    await ctx.reply(
      `Удалён: ${removed.firstName}\n\n${formatRegistrationMessage(game)}`
    );
  } catch (error) {
    const messages = {
      NO_ACTIVE_GAME: "Нет активной игры.",
      REGISTRATION_CLOSED: "Запись закрыта.",
      NOT_FOUND: "Игрок не найден среди добавленных вручную.",
    };
    await ctx.reply(messages[error.message] ?? "Не удалось удалить игрока.");
  }
});

bot.command("cancel", async (ctx) => {
  const chatId = await resolveAdminChatId(ctx);
  if (!chatId) return;

  try {
    cancelGame(chatId);
    await ctx.reply(
      isPrivateChat(ctx)
        ? "Текущая игра отменена в группе."
        : "Текущая игра отменена."
    );
  } catch (error) {
    if (error.message === "NO_ACTIVE_GAME") {
      await ctx.reply("Нет активной игры.");
      return;
    }
    throw error;
  }
});

bot.action("join", async (ctx) => {
  if (!requireGroup(ctx)) return;

  try {
    const { game, already } = joinGame(getChatId(ctx), ctx.from);

    await notifyUserOnly(ctx, {
      privateText: formatJoinPrivateMessage(game, ctx.from.first_name, already),
      toastText: formatJoinToast(game, already),
      alertText: `${formatJoinToast(game, already)}\n\n${formatJoinPrivateMessage(game, ctx.from.first_name, already)}`,
    });
  } catch (error) {
    const messages = {
      NO_ACTIVE_GAME: "Нет открытой игры.",
      REGISTRATION_CLOSED: "Запись закрыта.",
      GAME_FULL: "Все места заняты.",
    };
    await notifyUserError(ctx, messages[error.message] ?? "Не удалось записаться.");
  }
});

bot.action("players", async (ctx) => {
  const game = getActiveGame(getChatId(ctx));
  if (!game) {
    await ctx.answerCbQuery("Нет активной игры");
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(formatRegistrationMessage(game));
});

bot.on("my_chat_member", (ctx) => {
  const { new_chat_member, chat } = ctx.update.my_chat_member;
  if (chat.type === "private") return;

  if (["member", "administrator"].includes(new_chat_member.status)) {
    registerGroupChat(chat.id);
  }
});

bot.catch((error, ctx) => {
  console.error(`Bot error for ${ctx.updateType}:`, error);
});

startScheduler(bot);

bot.launch({
  allowedUpdates: ["message", "callback_query", "my_chat_member"],
}).then(async () => {
  const me = await bot.telegram.getMe();
  botUsername = me.username;
  console.log(`Bot started as @${botUsername}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

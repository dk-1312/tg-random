import { Markup } from "telegraf";
import { isAdmin } from "./config.js";
import { getTargetGroupChatId } from "./groupAccess.js";
import { formatNewGameMessage } from "./messages.js";

export function parseCommandArgs(text, command) {
  return text.replace(new RegExp(`^\\/${command}(@\\w+)?\\s*`), "").trim();
}

export async function resolveAdminChatId(ctx) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply("Команда доступна только администратору.");
    return null;
  }

  const chatId = getTargetGroupChatId(ctx);
  if (!chatId) {
    await ctx.reply(
      [
        "Не могу определить группу для этой команды.",
        "Укажи GROUP_CHAT_IDS в .env (ID вашей группы).",
      ].join("\n")
    );
    return null;
  }

  return chatId;
}

export function isPrivateChat(ctx) {
  return ctx.chat?.type === "private";
}

export async function publishGameToGroup(bot, chatId, game) {
  await bot.telegram.sendMessage(
    chatId,
    formatNewGameMessage(game),
    Markup.inlineKeyboard([
      Markup.button.callback("Записаться", "join"),
      Markup.button.callback("Список игроков", "players"),
    ])
  );
}

export async function replyAdmin(ctx, text) {
  await ctx.reply(text);
}

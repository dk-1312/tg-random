import { getDb, withDb } from "./db.js";
import { config, isAdmin } from "./config.js";

const MEMBER_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export function registerGroupChat(chatId) {
  withDb((db) => {
    if (!db.groups) db.groups = [];
    if (!db.groups.includes(chatId)) {
      db.groups.push(chatId);
    }
  });
}

export function getAllowedChatIds() {
  const db = getDb();
  const fromDb = db.groups ?? [];
  const fromGames = db.games.map((game) => game.chatId);
  return [...new Set([...config.groupChatIds, ...fromDb, ...fromGames])];
}

export async function isMemberOfAllowedGroup(telegram, userId) {
  const chatIds = getAllowedChatIds();
  if (!chatIds.length) return false;

  for (const chatId of chatIds) {
    try {
      const member = await telegram.getChatMember(chatId, userId);
      if (MEMBER_STATUSES.has(member.status)) {
        return true;
      }
    } catch {
      // бот не в чате или пользователь не найден
    }
  }

  return false;
}

export async function canAccessPrivateChat(ctx) {
  if (!ctx.from) return false;
  if (isAdmin(ctx.from.id)) return true;
  return isMemberOfAllowedGroup(ctx.telegram, ctx.from.id);
}

export function getTargetGroupChatId(ctx) {
  if (ctx.chat?.type !== "private") {
    return ctx.chat.id;
  }

  if (config.groupChatIds.length === 1) {
    return config.groupChatIds[0];
  }

  const allowed = getAllowedChatIds();
  if (allowed.length === 1) {
    return allowed[0];
  }

  if (config.groupChatIds.length > 0) {
    return config.groupChatIds[0];
  }

  if (allowed.length > 0) {
    return allowed[0];
  }

  return null;
}

export function privateAccessDeniedMessage(botUsername) {
  const usernameHint = botUsername
    ? `Найди бота по username: @${botUsername}`
    : "Найди бота по username в группе";

  const inviteHint = config.groupInviteLink
    ? `\n\nСсылка на группу: ${config.groupInviteLink}`
    : "";

  return [
    "Личные сообщения доступны только участникам группы.",
    usernameHint,
    inviteHint,
  ]
    .filter(Boolean)
    .join("\n");
}

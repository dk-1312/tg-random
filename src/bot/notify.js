import {
  formatDateTime,
  formatPlayer,
  getGameSummary,
} from "./gameService.js";

function registrationList(game) {
  const { registered, capacity } = getGameSummary(game);
  const list = registered.length
    ? registered.map((p, i) => `${i + 1}. ${formatPlayer(p)}`).join("\n")
    : "Пока никого";

  return [
    `Запись на «${game.title}»`,
    `Игра: ${formatDateTime(game.gameAt)}`,
    `Жеребьёвка: ${formatDateTime(game.drawAt)}`,
    `Записано: ${registered.length} / ${capacity}`,
    "",
    list,
  ].join("\n");
}

export function formatJoinToast(game, already) {
  const { registered, capacity } = getGameSummary(game);
  const status = `${registered.length} / ${capacity}`;
  return already ? `Ты уже записан (${status})` : `Записан! ${status}`;
}

export function formatLeaveToast(game) {
  const { registered, capacity } = getGameSummary(game);
  return `Запись отменена. ${registered.length} / ${capacity}`;
}

export function formatJoinPrivateMessage(game, firstName, already) {
  const prefix = already
    ? `Ты уже записан на «${game.title}».`
    : `${firstName}, ты записан на «${game.title}»!`;

  return `${prefix}\n\n${registrationList(game)}`;
}

export function formatLeavePrivateMessage(game) {
  return `Запись отменена.\n\n${registrationList(game)}`;
}

export const startRequiredHint =
  "Напиши боту /start в личке, чтобы получать подтверждения без сообщений в чат.";

export async function notifyUserOnly(ctx, { privateText, toastText, alertText }) {
  const userId = ctx.from.id;
  let sentPrivate = false;

  try {
    await ctx.telegram.sendMessage(userId, privateText);
    sentPrivate = true;
  } catch {
    sentPrivate = false;
  }

  if (ctx.callbackQuery) {
    const popup = sentPrivate ? toastText : (alertText ?? `${toastText}\n\n${startRequiredHint}`);
    await ctx.answerCbQuery(popup, { show_alert: !sentPrivate });
    return;
  }

  if (sentPrivate) return;

  await ctx.reply(startRequiredHint);
}

export async function notifyUserError(ctx, message) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(message, { show_alert: true });
    return;
  }

  try {
    await ctx.telegram.sendMessage(ctx.from.id, message);
  } catch {
    await ctx.reply(message);
  }
}

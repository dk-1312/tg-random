import cron from "node-cron";
import {
  getGamesReadyForDraw,
  runDraw,
} from "./gameService.js";
import {
  formatDrawResults,
  formatPersonalTeamMessage,
} from "./messages.js";

async function publishDraw(bot, game) {
  const drawnGame = runDraw(game.id);
  const text = formatDrawResults(drawnGame);

  await bot.telegram.sendMessage(drawnGame.chatId, text);

  for (const player of drawnGame.players) {
    if (player.manual || !player.tgUserId) continue;

    try {
      await bot.telegram.sendMessage(
        player.tgUserId,
        formatPersonalTeamMessage(drawnGame, player)
      );
    } catch {
      // пользователь мог не начать диалог с ботом
    }
  }
}

export function startScheduler(bot) {
  cron.schedule("* * * * *", async () => {
    const games = getGamesReadyForDraw();

    for (const game of games) {
      try {
        await publishDraw(bot, game);
      } catch (error) {
        console.error(`Draw failed for game ${game.id}:`, error);
      }
    }
  });

  console.log("Scheduler started (every minute)");
}

export async function drawAndNotify(bot, gameId) {
  const game = runDraw(gameId);
  const text = formatDrawResults(game);

  await bot.telegram.sendMessage(game.chatId, text);

  for (const player of game.players) {
    if (player.manual || !player.tgUserId) continue;

    try {
      await bot.telegram.sendMessage(
        player.tgUserId,
        formatPersonalTeamMessage(game, player)
      );
    } catch {
      // ignore
    }
  }

  return game;
}

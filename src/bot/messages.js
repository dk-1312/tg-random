import {
  formatDateTime,
  formatPlayer,
  getGameSummary,
} from "./gameService.js";

function listPlayers(players, emptyText) {
  if (!players.length) return emptyText;
  return players.map((p, i) => `${i + 1}. ${formatPlayer(p)}`).join("\n");
}

export function helpText() {
  return [
    "Бот для записи на футбол и жеребьёвки команд.",
    "",
    "Команды:",
    "/newgame 19:00 — создать игру (в группе или в личке админу)",
    "/newgame 22.06 19:00 — создать игру на дату",
    "/join — записаться (ответ только тебе, только в группе)",
    "/leave — отменить запись (ответ только тебе, только в группе)",
    "/players — список записавшихся (в группе)",
    "/results — составы после жеребьёвки (в группе)",
    "/draw — провести жеребьёвку сейчас (админ, группа или личка)",
    "/add — добавить игрока вручную (админ, группа или личка)",
    "/remove — удалить вручную добавленного игрока (админ, группа или личка)",
    "/cancel — отменить текущую игру (админ, группа или личка)",
    "",
    "Личные сообщения — только для участников группы.",
    "Перед записью напиши боту /start в личке — так подтверждения не будут появляться в чате.",
  ].join("\n");
}

export function formatNewGameMessage(game) {
  return [
    `Игра создана: ${game.title}`,
    `Начало: ${formatDateTime(game.gameAt)}`,
    `Жеребьёвка: ${formatDateTime(game.drawAt)}`,
    `Команды: ${game.teamAName} vs ${game.teamBName}`,
    `Мест: ${game.teamSize * 2} (${game.teamSize} на команду)`,
    "",
    "Записывайтесь командой /join",
  ].join("\n");
}

export function formatRegistrationMessage(game) {
  const { registered, capacity } = getGameSummary(game);

  return [
    `Запись на «${game.title}»`,
    `Игра: ${formatDateTime(game.gameAt)}`,
    `Жеребьёвка: ${formatDateTime(game.drawAt)}`,
    `Записано: ${registered.length} / ${capacity}`,
    "",
    listPlayers(registered, "Пока никого"),
  ].join("\n");
}

export function formatDrawResults(game) {
  const { teamA, teamB, reserve } = getGameSummary(game);

  const lines = [
    `Составы для «${game.title}»`,
    `Игра: ${formatDateTime(game.gameAt)}`,
    "",
    `${game.teamAName} (${teamA.length}):`,
    listPlayers(teamA, "—"),
    "",
    `${game.teamBName} (${teamB.length}):`,
    listPlayers(teamB, "—"),
  ];

  if (reserve.length) {
    lines.push("", `Запас (${reserve.length}):`, listPlayers(reserve, "—"));
  }

  return lines.join("\n");
}

export function formatPersonalTeamMessage(game, player) {
  if (!player.team) {
    return `Ты в запасе на игру «${game.title}».`;
  }

  const teamName = player.team === "A" ? game.teamAName : game.teamBName;
  return `Ты в команде ${teamName} на игру «${game.title}».`;
}

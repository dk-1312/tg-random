import { DateTime } from "luxon";
import { config } from "./config.js";
import { getDb, withDb } from "./db.js";
import { registerGroupChat } from "./groupAccess.js";

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function playerName(player) {
  if (player.firstName) return player.firstName;
  if (player.username) return player.username;
  if (player.tgUserId) return `id${player.tgUserId}`;
  return "Игрок";
}

export function normalizePlayerName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function assertRegistrationOpen(game) {
  const drawAt = DateTime.fromISO(game.drawAt);
  if (DateTime.now() >= drawAt) {
    throw new Error("REGISTRATION_CLOSED");
  }
}

function findDuplicatePlayer(game, normalizedName) {
  return game.players.find((player) => {
    if (player.manual) {
      return player.manualKey === normalizedName;
    }
    return normalizePlayerName(player.firstName || "") === normalizedName;
  });
}

export function parseGameDateTime(input) {
  const tz = config.timezone;
  const trimmed = input.trim();

  let dt;
  const withDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s+(\d{1,2}):(\d{2})$/);
  if (withDate) {
    const [, day, month, yearRaw, hour, minute] = withDate;
    const year = yearRaw ? Number(yearRaw) : DateTime.now().setZone(tz).year;
    dt = DateTime.fromObject(
      {
        year,
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: 0,
      },
      { zone: tz }
    );
  } else {
    const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeOnly) return null;

    const [, hour, minute] = timeOnly;
    const now = DateTime.now().setZone(tz);
    dt = now.set({
      hour: Number(hour),
      minute: Number(minute),
      second: 0,
      millisecond: 0,
    });

    if (dt <= now) {
      dt = dt.plus({ days: 1 });
    }
  }

  if (!dt.isValid) return null;
  return dt;
}

export function getActiveGame(chatId) {
  const db = getDb();
  return (
    db.games.find(
      (game) => game.chatId === chatId && game.status === "registration"
    ) ?? null
  );
}

export function getGameById(gameId) {
  const db = getDb();
  return db.games.find((game) => game.id === gameId) ?? null;
}

export function createGame({
  chatId,
  title,
  teamAName,
  teamBName,
  teamSize,
  gameAtIso,
}) {
  return withDb((db) => {
    const existing = db.games.find(
      (game) => game.chatId === chatId && game.status === "registration"
    );
    if (existing) {
      throw new Error("ACTIVE_GAME_EXISTS");
    }

    const gameAt = DateTime.fromISO(gameAtIso, { zone: config.timezone });
    const drawAt = gameAt.minus({ minutes: config.drawMinutesBefore });

    const game = {
      id: db.nextGameId++,
      chatId,
      title,
      teamAName,
      teamBName,
      teamSize,
      gameAt: gameAt.toISO(),
      drawAt: drawAt.toISO(),
      status: "registration",
      players: [],
      createdAt: DateTime.now().toISO(),
    };

    db.games.push(game);
    registerGroupChat(chatId);
    return game;
  });
}

export function cancelGame(chatId) {
  return withDb((db) => {
    const game = db.games.find(
      (item) => item.chatId === chatId && item.status === "registration"
    );
    if (!game) throw new Error("NO_ACTIVE_GAME");
    game.status = "cancelled";
    return game;
  });
}

export function joinGame(chatId, user) {
  return withDb((db) => {
    const game = db.games.find(
      (item) => item.chatId === chatId && item.status === "registration"
    );
    if (!game) throw new Error("NO_ACTIVE_GAME");

    assertRegistrationOpen(game);

    const capacity = game.teamSize * 2;
    const existing = game.players.find((p) => p.tgUserId === user.id);
    if (existing) {
      return { game, player: existing, already: true };
    }

    if (game.players.length >= capacity) {
      throw new Error("GAME_FULL");
    }

    const player = {
      manual: false,
      tgUserId: user.id,
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      team: null,
      joinedAt: DateTime.now().toISO(),
    };

    game.players.push(player);
    return { game, player, already: false };
  });
}

export function addManualPlayers(chatId, rawNames) {
  return withDb((db) => {
    const game = db.games.find(
      (item) => item.chatId === chatId && item.status === "registration"
    );
    if (!game) throw new Error("NO_ACTIVE_GAME");

    assertRegistrationOpen(game);

    const names = rawNames
      .flatMap((part) => part.split(","))
      .map((name) => name.trim())
      .filter(Boolean);

    if (!names.length) throw new Error("EMPTY_NAME");

    const capacity = game.teamSize * 2;
    const added = [];

    for (const name of names) {
      const manualKey = normalizePlayerName(name);
      if (findDuplicatePlayer(game, manualKey)) {
        throw new Error(`DUPLICATE:${name}`);
      }

      if (game.players.length >= capacity) {
        throw new Error("GAME_FULL");
      }

      game.players.push({
        manual: true,
        manualKey,
        tgUserId: null,
        username: null,
        firstName: name,
        team: null,
        joinedAt: DateTime.now().toISO(),
      });
      added.push(name);
    }

    return { game, added };
  });
}

export function removeManualPlayer(chatId, name) {
  return withDb((db) => {
    const game = db.games.find(
      (item) => item.chatId === chatId && item.status === "registration"
    );
    if (!game) throw new Error("NO_ACTIVE_GAME");

    assertRegistrationOpen(game);

    const manualKey = normalizePlayerName(name);
    const index = game.players.findIndex(
      (player) => player.manual && player.manualKey === manualKey
    );

    if (index === -1) throw new Error("NOT_FOUND");

    const [removed] = game.players.splice(index, 1);
    return { game, removed };
  });
}

export function leaveGame(chatId, userId) {
  return withDb((db) => {
    const game = db.games.find(
      (item) => item.chatId === chatId && item.status === "registration"
    );
    if (!game) throw new Error("NO_ACTIVE_GAME");

    const index = game.players.findIndex((p) => p.tgUserId === userId);
    if (index === -1) throw new Error("NOT_REGISTERED");

    game.players.splice(index, 1);
    return game;
  });
}

export function runDraw(gameId) {
  return withDb((db) => {
    const game = db.games.find((item) => item.id === gameId);
    if (!game) throw new Error("GAME_NOT_FOUND");
    if (game.status === "drawn") return game;
    if (game.status !== "registration") throw new Error("GAME_NOT_OPEN");

    const shuffled = shuffle(game.players);
    const teamA = [];
    const teamB = [];
    const reserve = [];

    for (const player of shuffled) {
      if (teamA.length >= game.teamSize && teamB.length >= game.teamSize) {
        player.team = null;
        reserve.push(player);
        continue;
      }

      if (teamA.length >= game.teamSize) {
        player.team = "B";
        teamB.push(player);
        continue;
      }

      if (teamB.length >= game.teamSize) {
        player.team = "A";
        teamA.push(player);
        continue;
      }

      const countA = teamA.length;
      const countB = teamB.length;
      const assigned = countA + countB;
      const toTeamA =
        assigned === 0 ? Math.random() < 0.5 : Math.random() < countB / assigned;

      if (toTeamA) {
        player.team = "A";
        teamA.push(player);
      } else {
        player.team = "B";
        teamB.push(player);
      }
    }

    game.status = "drawn";
    game.drawnAt = DateTime.now().toISO();
    game.reserve = reserve.map((p) => p.manualKey ?? p.tgUserId);
    return game;
  });
}

export function getGamesReadyForDraw() {
  const db = getDb();
  const now = DateTime.now();

  return db.games.filter((game) => {
    if (game.status !== "registration") return false;
    const drawAt = DateTime.fromISO(game.drawAt);
    return drawAt <= now;
  });
}

export function getLatestDrawnGame(chatId) {
  const db = getDb();
  const games = db.games
    .filter((game) => game.chatId === chatId && game.status === "drawn")
    .sort((a, b) => new Date(b.drawnAt) - new Date(a.drawnAt));
  return games[0] ?? null;
}

export function formatDateTime(iso) {
  return DateTime.fromISO(iso)
    .setZone(config.timezone)
    .toFormat("dd.MM.yyyy HH:mm");
}

export function formatPlayer(player) {
  return playerName(player);
}

export function getGameSummary(game) {
  const teamA = game.players.filter((p) => p.team === "A");
  const teamB = game.players.filter((p) => p.team === "B");
  const reserve = game.players.filter(
    (p) => !p.team && game.status === "drawn"
  );
  const registered = game.players.filter((p) => !p.team && game.status !== "drawn");

  return {
    teamA,
    teamB,
    reserve,
    registered,
    capacity: game.teamSize * 2,
  };
}

export { playerName };

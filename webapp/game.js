const STORAGE_KEY = "tg-random-game";

export function loadGame() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveGame(game) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(game));
}

export function createGame({ title, teamAName, teamBName, teamSize }) {
  const game = {
    title,
    teamAName,
    teamBName,
    teamSize,
    players: [],
  };
  saveGame(game);
  return game;
}

export function resetGame() {
  sessionStorage.removeItem(STORAGE_KEY);
}

function countTeam(players, team) {
  return players.filter((p) => p.team === team).length;
}

function pickBalancedTeam(countA, countB, freeA, freeB) {
  if (freeA <= 0) return "B";
  if (freeB <= 0) return "A";

  const assigned = countA + countB;
  if (assigned === 0) {
    return Math.random() < 0.5 ? "A" : "B";
  }

  // Чем больше игроков в команде, тем ниже шанс попасть в неё снова
  const probA = countB / assigned;
  return Math.random() < probA ? "A" : "B";
}

export function spin(game, player) {
  const existing = game.players.find((p) => p.id === player.id);
  if (existing?.team) {
    return {
      team: existing.team === "A" ? game.teamAName : game.teamBName,
      teamCode: existing.team,
      already: true,
      game,
    };
  }

  const countA = countTeam(game.players, "A");
  const countB = countTeam(game.players, "B");
  const freeA = game.teamSize - countA;
  const freeB = game.teamSize - countB;

  if (freeA <= 0 && freeB <= 0) {
    throw new Error("TEAMS_FULL");
  }

  let team = pickBalancedTeam(countA, countB, freeA, freeB);

  if (existing) {
    existing.team = team;
  } else {
    game.players.push({ ...player, team });
  }

  saveGame(game);

  return {
    team: team === "A" ? game.teamAName : game.teamBName,
    teamCode: team,
    already: false,
    game,
  };
}

export function getResults(game) {
  return {
    teamA: game.players.filter((p) => p.team === "A"),
    teamB: game.players.filter((p) => p.team === "B"),
    waiting: game.players.filter((p) => !p.team),
    total: game.players.length,
    capacity: game.teamSize * 2,
  };
}

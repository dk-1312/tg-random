import {
  loadGame,
  createGame,
  resetGame,
  spin,
  getResults,
} from "./game.js";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const setupView = document.getElementById("setupView");
const gameView = document.getElementById("gameView");

const titleInput = document.getElementById("titleInput");
const teamAInput = document.getElementById("teamAInput");
const teamBInput = document.getElementById("teamBInput");
const teamSizeInput = document.getElementById("teamSizeInput");
const createBtn = document.getElementById("createBtn");

const gameTitle = document.getElementById("gameTitle");
const gameMeta = document.getElementById("gameMeta");
const nameInput = document.getElementById("nameInput");
const spinBtn = document.getElementById("spinBtn");
const wheel = document.getElementById("wheel");
const statusEl = document.getElementById("status");
const teamALabel = document.getElementById("teamALabel");
const teamBLabel = document.getElementById("teamBLabel");
const teamAList = document.getElementById("teamAList");
const teamBList = document.getElementById("teamBList");
const resetBtn = document.getElementById("resetBtn");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function showView(view) {
  setupView.classList.toggle("hidden", view !== "setup");
  gameView.classList.toggle("hidden", view !== "game");
}

function playerId(name) {
  return `name:${name.trim().toLowerCase()}`;
}

function getCurrentPlayer() {
  const name = nameInput.value.trim();
  if (!name) return null;

  return {
    id: playerId(name),
    name,
  };
}

function findPlayerByName(game, name) {
  return game.players.find((p) => p.id === playerId(name));
}

function renderResults(game) {
  const results = getResults(game);

  teamALabel.textContent = `${game.teamAName} (${results.teamA.length}/${game.teamSize})`;
  teamBLabel.textContent = `${game.teamBName} (${results.teamB.length}/${game.teamSize})`;

  teamAList.innerHTML = results.teamA.length
    ? results.teamA.map((p) => `<li>${p.name}</li>`).join("")
    : "<li class='empty'>Пока никого</li>";

  teamBList.innerHTML = results.teamB.length
    ? results.teamB.map((p) => `<li>${p.name}</li>`).join("")
    : "<li class='empty'>Пока никого</li>";

  gameMeta.textContent = `${results.total} / ${results.capacity} игроков`;
}

function updateSpinState(game, statusMessage = "") {
  const results = getResults(game);
  const isFull = results.teamA.length + results.teamB.length >= results.capacity;
  const name = nameInput.value.trim();

  if (isFull) {
    spinBtn.disabled = true;
    statusEl.textContent = statusMessage || "Все места заняты";
    return;
  }

  if (!name) {
    spinBtn.disabled = true;
    statusEl.textContent = statusMessage;
    return;
  }

  const existing = findPlayerByName(game, name);
  if (existing?.team) {
    const teamName = existing.team === "A" ? game.teamAName : game.teamBName;
    spinBtn.disabled = true;
    statusEl.textContent = statusMessage || `${name} уже в команде: ${teamName}`;
    return;
  }

  spinBtn.disabled = false;
  statusEl.textContent = statusMessage;
}

function renderGame(game, statusMessage = "") {
  gameTitle.textContent = game.title;
  renderResults(game);
  updateSpinState(game, statusMessage);
}

function prepareNextPlayer() {
  nameInput.value = "";
  nameInput.focus();
}

function init() {
  const game = loadGame();
  if (game) {
    showView("game");
    renderGame(game);
    nameInput.focus();
  } else {
    showView("setup");
  }
}

createBtn.addEventListener("click", () => {
  const teamSize = Number(teamSizeInput.value);
  if (!titleInput.value.trim() || !teamAInput.value.trim() || !teamBInput.value.trim()) {
    alert("Заполни все поля");
    return;
  }
  if (!teamSize || teamSize < 1) {
    alert("Укажи количество игроков в команде");
    return;
  }

  const game = createGame({
    title: titleInput.value.trim(),
    teamAName: teamAInput.value.trim(),
    teamBName: teamBInput.value.trim(),
    teamSize,
  });

  showView("game");
  prepareNextPlayer();
  renderGame(game);
});

spinBtn.addEventListener("click", async () => {
  const game = loadGame();
  if (!game) return;

  const player = getCurrentPlayer();
  if (!player) {
    statusEl.textContent = "Введи имя";
    return;
  }

  spinBtn.disabled = true;
  statusEl.textContent = "Крутим...";
  wheel.classList.add("spin");

  try {
    await wait(1800);

    const result = spin(game, player);
    const message = result.already
      ? `${player.name} уже в команде: ${result.team}`
      : `${player.name} → ${result.team}`;

    prepareNextPlayer();
    renderGame(result.game, message);
  } catch (e) {
    statusEl.textContent =
      e.message === "TEAMS_FULL" ? "Все места заняты" : "Что-то пошло не так";
    updateSpinState(game);
  } finally {
    wheel.classList.remove("spin");
  }
});

nameInput.addEventListener("input", () => {
  const game = loadGame();
  if (!game) return;
  renderGame(game);
});

resetBtn.addEventListener("click", () => {
  if (!confirm("Начать новую игру? Текущие составы будут сброшены.")) return;
  resetGame();
  showView("setup");
  statusEl.textContent = "";
  spinBtn.disabled = false;
  nameInput.value = "";
});

init();

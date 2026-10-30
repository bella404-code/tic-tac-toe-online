
const { createClient } = supabase;

// Add your Supabase project details here.
const SUPABASE_URL = "https://gvdygzxacwnkbdevwvag.supabase.co";
const SUPABASE_KEY = "sb_publishable_3iNmav8LRR9FMfW3WhqVzQ_S1Cyta3o";

const cells = [...document.querySelectorAll(".cell")];
const status = document.getElementById("status");
const onlineStatus = document.getElementById("onlineStatus");
const createButton = document.getElementById("createGame");
const copyButton = document.getElementById("copyLink");
const nameX = document.getElementById("nameX");
const nameO = document.getElementById("nameO");
const scoreX = document.getElementById("scoreX");
const scoreO = document.getElementById("scoreO");
const draws = document.getElementById("draws");
const scoreNameX = document.getElementById("scoreNameX");
const scoreNameO = document.getElementById("scoreNameO");
const winLine = document.getElementById("winLine");
const winningStroke = document.getElementById("winningStroke");

const wins = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

let client = null;
let roomId = null;
let playerToken = null;
let myMark = null;
let inviteLink = "";
let online = false;
let gameState = null;
let pollTimer = null;
let busy = false;
let nameTimer = null;

let board = Array(9).fill("");
let turn = "X";
let finished = false;
let scores = { X: 0, O: 0, draws: 0 };

function playerName(mark) {
  const input = mark === "X" ? nameX : nameO;
  return input.value.trim().slice(0, 16) ||
    (mark === "X" ? "Player 1" : "Player 2");
}

function setupClient() {
  if (
    SUPABASE_URL.startsWith("PASTE_") ||
    SUPABASE_KEY.startsWith("PASTE_")
  ) {
    onlineStatus.textContent =
      "Add your Supabase URL and publishable key in script.js.";
    return false;
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  return true;
}

function showError(action, error) {
  console.error(`${action}:`, error);
  onlineStatus.textContent =
    `${action}: ${error?.message || "Unknown error"}`;
}

function updateScores() {
  scoreX.textContent = scores.X;
  scoreO.textContent = scores.O;
  draws.textContent = scores.draws;
  scoreNameX.textContent = playerName("X");
  scoreNameO.textContent = playerName("O");
}

function clearWinningLine() {
  winLine.classList.remove("show");
  cells.forEach(cell => cell.classList.remove("winner"));
}

function showWinningLine(nextBoard, winner) {
  clearWinningLine();

  if (!winner || winner === "draw") return;

  const combo = wins.find(([a, b, c]) =>
    nextBoard[a] === winner &&
    nextBoard[b] === winner &&
    nextBoard[c] === winner
  );

  if (!combo) return;

  combo.forEach(index => cells[index].classList.add("winner"));

  const center = index => ({
    x: (index % 3) * 100 + 50,
    y: Math.floor(index / 3) * 100 + 50
  });

  const start = center(combo[0]);
  const end = center(combo[2]);

  winningStroke.setAttribute("x1", start.x);
  winningStroke.setAttribute("y1", start.y);
  winningStroke.setAttribute("x2", end.x);
  winningStroke.setAttribute("y2", end.y);

  winLine.classList.add("show");
}

function renderBoard(nextBoard, winner = null) {
  cells.forEach((cell, index) => {
    cell.textContent = nextBoard[index] || "";
    cell.classList.toggle("o", nextBoard[index] === "O");

    const canPlayOnline =
      online &&
      gameState &&
      gameState.status === "playing" &&
      gameState.current_turn === myMark &&
      !busy &&
      !nextBoard[index];

    cell.disabled = online
      ? !canPlayOnline
      : Boolean(nextBoard[index] || finished);
  });

  showWinningLine(nextBoard, winner);
}

function renderOnlineState(state) {
  gameState = state;

  if (document.activeElement !== nameX) {
    nameX.value = state.player_x_name || "Player 1";
  }

  if (document.activeElement !== nameO) {
    nameO.value = state.player_o_name || "Player 2";
  }

  nameX.readOnly = myMark !== "X";
  nameO.readOnly = myMark !== "O";

  scoreNameX.textContent = state.player_x_name || "Player 1";
  scoreNameO.textContent = state.player_o_name || "Player 2";

  scores = {
    X: state.score_x ?? 0,
    O: state.score_o ?? 0,
    draws: state.draws ?? 0
  };

  scoreX.textContent = scores.X;
  scoreO.textContent = scores.O;
  draws.textContent = scores.draws;

  renderBoard(state.board, state.winner);

  if (state.status === "waiting") {
    status.textContent = "Waiting for a friend to join...";
  } else if (state.status === "finished") {
    status.textContent = state.winner === "draw"
      ? "It's a draw!"
      : `${state.winner === "X"
          ? state.player_x_name
          : state.player_o_name} wins!`;
  } else {
    status.textContent = state.current_turn === myMark
      ? `Your turn (${myMark})`
      : `${state.current_turn === "X"
          ? state.player_x_name
          : state.player_o_name}'s turn`;
  }

  copyButton.disabled = !inviteLink;
  createButton.disabled = false;
  createButton.textContent = "Create another game";
}

async function fetchState() {
  if (!client || !roomId || !playerToken || busy) return;

  const { data, error } = await client.rpc("get_game", {
    p_room_id: roomId,
    p_token: playerToken
  });

  if (error) {
    showError("Could not load game", error);
    return;
  }

  if (!data) return;

  myMark = data.your_mark;
  renderOnlineState(data);
}

async function setPlayerName() {
  if (!online || !client || !roomId || !playerToken || busy) return;
  if (myMark !== "X" && myMark !== "O") return;

  const { error } = await client.rpc("set_player_name", {
    p_room_id: roomId,
    p_token: playerToken,
    p_name: playerName(myMark)
  });

  if (error) {
    showError("Could not save name", error);
    return;
  }

  await fetchState();
}

function scheduleNameSave() {
  updateScores();

  if (!online) {
    if (!finished) {
      status.textContent = `${playerName(turn)}'s turn`;
    }
    return;
  }

  clearTimeout(nameTimer);
  nameTimer = setTimeout(setPlayerName, 500);
}

async function createOnlineGame() {
  if (!setupClient()) return;

  createButton.disabled = true;
  onlineStatus.textContent = "Creating your game...";

  const { data, error } = await client.rpc("create_game");

  createButton.disabled = false;

  if (error) {
    showError("Could not create game", error);
    return;
  }

  if (!data?.room_id || !data?.player_token) {
    console.error("Unexpected create_game response:", data);
    onlineStatus.textContent =
      "Unexpected response from create_game. Check the SQL setup.";
    return;
  }

  roomId = data.room_id;
  playerToken = data.player_token;
  myMark = "X";
  online = true;

  inviteLink =
    `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;

  localStorage.setItem("ttt-token-" + roomId, playerToken);

  history.replaceState(
    null,
    "",
    "?room=" + encodeURIComponent(roomId)
  );

  const { error: nameError } = await client.rpc("set_player_name", {
    p_room_id: roomId,
    p_token: playerToken,
    p_name: playerName("X")
  });

  if (nameError) {
    showError("Game created, but name could not be saved", nameError);
  } else {
    onlineStatus.textContent =
      "Game created! Copy the invite link for your friend.";
  }

  await fetchState();
  startPolling();
}

async function joinOnlineGame(id) {
  if (!setupClient()) return;

  roomId = id;

  inviteLink =
    `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;

  playerToken = localStorage.getItem("ttt-token-" + roomId);

  if (playerToken) {
    const { data, error } = await client.rpc("get_game", {
      p_room_id: roomId,
      p_token: playerToken
    });

    if (!error && data) {
      myMark = data.your_mark;
      online = true;
      renderOnlineState(data);
      startPolling();
      onlineStatus.textContent = "Welcome back to your game.";
      return;
    }

    console.warn("Saved session could not be restored:", error);
    localStorage.removeItem("ttt-token-" + roomId);
    playerToken = null;
  }

  onlineStatus.textContent = "Joining game...";

  const { data, error } = await client.rpc("join_game", {
    p_room_id: roomId
  });

  if (error) {
    showError("Could not join game", error);
    return;
  }

  if (typeof data !== "string" || !data) {
    console.error("Unexpected join_game response:", data);
    onlineStatus.textContent =
      "Unexpected response from join_game. Check the SQL setup.";
    return;
  }

  playerToken = data;
  myMark = "O";
  online = true;

  localStorage.setItem("ttt-token-" + roomId, playerToken);

  const { error: nameError } = await client.rpc("set_player_name", {
    p_room_id: roomId,
    p_token: playerToken,
    p_name: playerName("O")
  });

  if (nameError) {
    showError("Joined, but name could not be saved", nameError);
  } else {
    onlineStatus.textContent = "You're in! You're playing as O.";
  }

  await fetchState();
  startPolling();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(fetchState, 1200);
}

async function makeOnlineMove(index) {
  if (
    !online ||
    !gameState ||
    busy ||
    gameState.status !== "playing" ||
    gameState.current_turn !== myMark ||
    gameState.board[index]
  ) {
    return;
  }

  busy = true;
  renderBoard(gameState.board, gameState.winner);

  const { error } = await client.rpc("make_move", {
    p_room_id: roomId,
    p_token: playerToken,
    p_cell: index
  });

  busy = false;

  if (error) {
    showError("Move could not be saved", error);
  }

  await fetchState();
}

function playLocal(index) {
  if (board[index] || finished) return;

  board[index] = turn;

  const combo = wins.find(([a, b, c]) =>
    board[a] &&
    board[a] === board[b] &&
    board[a] === board[c]
  );

  if (combo) {
    scores[turn]++;
    finished = true;
    renderBoard(board, turn);
    status.textContent = `${playerName(turn)} wins!`;
    updateScores();
    return;
  }

  if (board.every(cell => cell !== "")) {
    scores.draws++;
    finished = true;
    renderBoard(board);
    status.textContent = "It's a draw!";
    updateScores();
    return;
  }

  renderBoard(board);
  turn = turn === "X" ? "O" : "X";
  status.textContent = `${playerName(turn)}'s turn`;
  updateScores();
}

function newLocalRound(reset = false) {
  board = Array(9).fill("");
  turn = "X";
  finished = false;

  if (reset) {
    scores = { X: 0, O: 0, draws: 0 };
  }

  renderBoard(board);
  status.textContent = `${playerName("X")}'s turn`;
  updateScores();
}

async function resetOnline(resetScores = false) {
  if (!online) {
    newLocalRound(resetScores);
    return;
  }

  if (!client || !roomId || !playerToken || busy) return;

  busy = true;

  const { error } = await client.rpc("reset_game", {
    p_room_id: roomId,
    p_token: playerToken,
    p_reset_scores: resetScores
  });

  busy = false;

  if (error) {
    showError("Could not reset game", error);
    return;
  }

  await fetchState();
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    if (online) {
      makeOnlineMove(index);
    } else {
      playLocal(index);
    }
  });
});

createButton.addEventListener("click", createOnlineGame);

copyButton.addEventListener("click", async () => {
  if (!inviteLink) return;

  try {
    await navigator.clipboard.writeText(inviteLink);
    onlineStatus.textContent =
      "Invite link copied! Send it to your friend.";
  } catch {
    onlineStatus.textContent = "Copy this invite link: " + inviteLink;
  }
});

document.getElementById("newGame").addEventListener("click", () => {
  resetOnline(false);
});

document.getElementById("reset").addEventListener("click", () => {
  resetOnline(true);
});

nameX.addEventListener("input", scheduleNameSave);
nameO.addEventListener("input", scheduleNameSave);
nameX.addEventListener("change", setPlayerName);
nameO.addEventListener("change", setPlayerName);

const roomFromLink = new URLSearchParams(location.search).get("room");

if (roomFromLink) {
  joinOnlineGame(roomFromLink);
} else {
  nameX.readOnly = false;
  nameO.readOnly = false;
  updateScores();
  newLocalRound();
}

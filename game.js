const firebaseConfig = {
  // TODO: wklej tutaj konfigurację z konsoli Firebase (apiKey, authDomain, itp.)
  apiKey: "AIzaSyCwHukHazOawRd7Mfn2FHWlnAt6MS8Gkd4",
  authDomain: "cotton-timber.firebaseapp.com",
  projectId: "cotton-timber",
  storageBucket: "cotton-timber.firebasestorage.app",
  messagingSenderId: "84248720059",
  appId: "1:84248720059:web:2d797220a4f5f423ca6f9e",
  measurementId: "G-G2WBE5HZ8W"
};

if (firebaseConfig.apiKey === "REPLACE_ME") {
  console.warn("[CottonTimber] Wstaw własny firebaseConfig w game.js");
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

const SKINS = [
  { id: "sky", label: "Błękitny zbieracz", color: "#2563eb" },
  { id: "sunset", label: "Zachód słońca", color: "#f97316" },
  { id: "forest", label: "Leśny farmer", color: "#16a34a" },
  { id: "berry", label: "Jagodowa brygada", color: "#a855f7" }
];

const ENDLESS_STORAGE_KEY = "cotton_endless_scores";
const MAX_ENDLESS_RESULTS = 20;
const INITIAL_STACK_SIZE = 12;
const MAX_CONSECUTIVE_FULL = 7;
const HIT_ANIMATION_MS = 180;
const COTTON_FULL_SRC = "bawelna-full.png";
const COTTON_EMPTY_SRC = "pusty.png";
const PLAYER_IDLE_SRC = "postac1.png";
const PLAYER_SWING_SRC = "postac1-uderzenie.png";

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[CottonTimber] localStorage set failed for ${key}`, error);
    spawnPopup("Przeglądarka zablokowała zapisywanie postępu.", "rgba(248,113,113,0.92)");
    return false;
  }
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`[CottonTimber] localStorage get failed for ${key}`, error);
    return null;
  }
}

function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== "string") return `rgba(37,99,235,${alpha})`;
  let normalized = hex.trim().replace("#", "");
  if (![3, 6].includes(normalized.length)) return `rgba(37,99,235,${alpha})`;
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return `rgba(37,99,235,${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function preloadAssets() {
  [COTTON_FULL_SRC, COTTON_EMPTY_SRC, PLAYER_IDLE_SRC, PLAYER_SWING_SRC].forEach((src) => {
    const img = new Image();
    img.src = src;
  });
  setPlayerColor();
}

const state = {
  user: null,
  nick: "",
  skin: SKINS[0].id,
  skinColor: SKINS[0].color,
  lobbyId: null,
  lobbyRef: null,
  lobbyData: null,
  lobbyUnsub: null,
  playersUnsub: null,
  lobbiesUnsub: null,
  latestPlayers: [],
  isOwner: false,
  countdownTimer: null,
  ownerFinishTimeout: null,
  ownerStartTimeout: null,
  pendingStartTimeout: null,
  swingTimeout: null,
  hitTimeout: null,
  game: {
    mode: "multiplayer",
    active: false,
    score: 0,
    stack: [],
    side: "left",
    died: false,
    submitted: false,
    endsAt: null,
    timerInterval: null,
    gauge: 0,
    gaugeMax: 0,
    gaugeMin: 600,
    gaugeDecay: 8,
    moves: 0,
    elapsed: 0,
    lastTick: null,
    lastFullSide: null,
    fullRun: 0,
  }
};

const elements = {
  views: Array.from(document.querySelectorAll(".view")),
  authForm: document.getElementById("authForm"),
  nickname: document.getElementById("nickname"),
  skinOptions: document.getElementById("skinOptions"),
  createLobbyBtn: document.getElementById("createLobbyBtn"),
  startEndlessBtn: document.getElementById("startEndlessBtn"),
  refreshLobbiesBtn: document.getElementById("refreshLobbiesBtn"),
  lobbyList: document.getElementById("lobbyList"),
  leaderboardList: document.getElementById("leaderboardList"),
  playerNick: document.getElementById("playerNick"),
  playerSkin: document.getElementById("playerSkin"),
  lobbyIdLabel: document.getElementById("lobbyIdLabel"),
  lobbyStatusLabel: document.getElementById("lobbyStatusLabel"),
  lobbyMaxSlots: document.getElementById("lobbyMaxSlots"),
  leaveLobbyBtn: document.getElementById("leaveLobbyBtn"),
  startLobbyBtn: document.getElementById("startLobbyBtn"),
  playerList: document.getElementById("playerList"),
  countdownContainer: document.getElementById("countdownContainer"),
  countdownValue: document.getElementById("countdownValue"),
  timeLabel: document.getElementById("timeLabel"),
  timeBlock: document.getElementById("timeBlock"),
  gameTime: document.getElementById("gameTime"),
  gameScore: document.getElementById("gameScore"),
  opponentScores: document.getElementById("opponentScores"),
  opponentBlock: document.getElementById("opponentBlock"),
  gameCanvasWrapper: document.getElementById("gameCanvasWrapper"),
  cottonStack: document.getElementById("cottonStack"),
  timberPlayer: document.getElementById("timberPlayer"),
  gaugeBar: document.getElementById("gaugeBar"),
  gaugeFill: document.getElementById("gaugeFill"),
  gaugeLabel: document.getElementById("gaugeLabel"),
  resultHeadline: document.getElementById("resultHeadline"),
  resultScoresTitle: document.getElementById("resultScoresTitle"),
  resultLeaderboardTitle: document.getElementById("resultLeaderboardTitle"),
  resultPlayerList: document.getElementById("resultPlayerList"),
  resultLeaderboard: document.getElementById("resultLeaderboard"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  backToMenuBtn: document.getElementById("backToMenuBtn"),
  cashOutBtn: document.getElementById("cashOutButton")
};

function setActiveView(id) {
  elements.views.forEach((view) => {
    if (view.id === id) {
      view.classList.remove("hidden");
      view.classList.add("view--active");
    } else {
      view.classList.add("hidden");
      view.classList.remove("view--active");
    }
  });
}

function initSkinOptions() {
  elements.skinOptions.innerHTML = "";
  SKINS.forEach((skin, index) => {
    const label = document.createElement("label");
    label.className = "skin-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "skin";
    input.value = skin.id;
    if (index === 0) input.checked = true;
    const preview = document.createElement("div");
    preview.className = "skin-option__preview";
    preview.style.background = skin.color;
    const title = document.createElement("span");
    title.textContent = skin.label;
    label.append(input, preview, title);
    input.addEventListener("change", () => {
      state.skin = skin.id;
      state.skinColor = skin.color;
      document.querySelectorAll(".skin-option").forEach((node) => node.classList.remove("is-selected"));
      label.classList.add("is-selected");
      setPlayerColor();
    });
    if (index === 0) label.classList.add("is-selected");
    elements.skinOptions.appendChild(label);
  });
}

function getSkinById(id) {
  return SKINS.find((skin) => skin.id === id) || SKINS[0];
}

async function cancelExistingLobbies(ownerId) {
  const waiting = await db
    .collection("lobbies")
    .where("ownerId", "==", ownerId)
    .where("status", "in", ["waiting", "countdown"])
    .get();
  const batch = db.batch();
  waiting.forEach((doc) => {
    batch.update(doc.ref, { status: "cancelled" });
  });
  if (!waiting.empty) {
    await batch.commit();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const nick = elements.nickname.value.trim();
  if (nick.length < 2) {
    alert("Nick musi mieć przynajmniej 2 znaki.");
    return;
  }
  state.nick = nick;
  const skinMeta = getSkinById(state.skin);
  state.skinColor = skinMeta.color;
  elements.playerNick.textContent = nick;
  elements.playerSkin.textContent = skinMeta.label;
  try {
    if (!auth.currentUser) {
      await auth.signInAnonymously();
    }
    safeStorageSet("cotton_nick", nick);
    safeStorageSet("cotton_skin", state.skin);
    subscribeToLobbies();
    fetchLeaderboard();
    setPlayerColor();
    setActiveView("view-lobbies");
  } catch (error) {
    console.error(error);
    alert("Nie udało się zalogować anonimowo. Odśwież stronę i spróbuj ponownie.");
  }
}

function setPlayerColor() {
  if (!elements.timberPlayer) return;
  const accent = state.skinColor || "#2563eb";
  const shadow = hexToRgba(accent, 0.38);
  elements.timberPlayer.style.setProperty("--player-accent", accent);
  elements.timberPlayer.style.setProperty("--player-shadow", shadow);
}

function subscribeToLobbies() {
  if (state.lobbiesUnsub) state.lobbiesUnsub();
  const query = db
    .collection("lobbies")
    .where("status", "==", "waiting")
    .orderBy("createdAt", "desc")
    .limit(10);
  state.lobbiesUnsub = query.onSnapshot((snap) => {
    if (snap.empty) {
      elements.lobbyList.innerHTML = '<li class="placeholder">Brak otwartych gier. Stwórz własne lobby!</li>';
      return;
    }
    const fragment = document.createDocumentFragment();
    snap.forEach((doc) => {
      const lobby = doc.data();
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${lobby.ownerNick}</strong>
          <div class="player-badge">${doc.id.slice(0, 6)}</div>
          <div class="muted">Graczy: ${lobby.playerCount || 1}/${lobby.maxPlayers || 4}</div>
        </div>
        <button class="primary" data-lobby="${doc.id}">Dołącz</button>
      `;
      const button = li.querySelector("button");
      button.addEventListener("click", () => joinLobby(doc.id));
      fragment.appendChild(li);
    });
    elements.lobbyList.innerHTML = "";
    elements.lobbyList.appendChild(fragment);
  });
}

function fetchLeaderboard(target = elements.leaderboardList) {
  db.collection("profiles")
    .orderBy("wins", "desc")
    .limit(10)
    .get()
    .then((snap) => {
      if (snap.empty) {
        target.innerHTML = '<li class="placeholder">Brak wpisów w tabeli zwycięstw.</li>';
        return;
      }
      const fragment = document.createDocumentFragment();
      snap.forEach((doc) => {
        const data = doc.data();
        const li = document.createElement("li");
        li.innerHTML = `<span>${data.nick || "Anonim"}</span><div><strong>${data.wins || 0}</strong> wygranych</div>`;
        fragment.appendChild(li);
      });
      target.innerHTML = "";
      target.appendChild(fragment);
    })
    .catch((error) => console.error("Leaderboard error", error));
}

async function createLobby() {
  if (!state.nick) return;
  elements.createLobbyBtn.disabled = true;
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("not-auth");
    await cancelExistingLobbies(user.uid);
    const lobbyRef = await db.collection("lobbies").add({
      ownerId: user.uid,
      ownerNick: state.nick,
      status: "waiting",
      maxPlayers: 4,
      playerCount: 1,
      createdAt: FieldValue.serverTimestamp(),
    });
    await lobbyRef.collection("players").doc(user.uid).set({
      nick: state.nick,
      skin: state.skin,
      score: 0,
      state: "idle",
      joinedAt: FieldValue.serverTimestamp(),
    });
    enterLobby(lobbyRef.id);
  } catch (error) {
    console.error(error);
    alert(mapFirestoreError(error) || "Nie udało się stworzyć lobby.");
  } finally {
    elements.createLobbyBtn.disabled = false;
  }
}

async function joinLobby(lobbyId) {
  if (!lobbyId) return;
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("not-auth");
    await db.runTransaction(async (tx) => {
      const lobbyRef = db.collection("lobbies").doc(lobbyId);
      const lobbySnap = await tx.get(lobbyRef);
      if (!lobbySnap.exists) throw new Error("not-found");
      const lobby = lobbySnap.data();
      if (lobby.status !== "waiting") throw new Error("already-started");
      const maxPlayers = lobby.maxPlayers || 4;
      const currentPlayers = lobby.playerCount || 0;
      if (currentPlayers >= maxPlayers) throw new Error("full");
      tx.set(lobbyRef.collection("players").doc(user.uid), {
        nick: state.nick,
        skin: state.skin,
        score: 0,
        state: "idle",
        joinedAt: FieldValue.serverTimestamp(),
      });
      tx.update(lobbyRef, { playerCount: currentPlayers + 1 });
    });
    enterLobby(lobbyId);
  } catch (error) {
    console.error(error);
    alert(mapFirestoreError(error) || "Nie udało się dołączyć.");
  }
}

function enterLobby(lobbyId) {
  cleanupLobbySubscriptions();
  state.lobbyId = lobbyId;
  state.lobbyRef = db.collection("lobbies").doc(lobbyId);
  state.lobbyUnsub = state.lobbyRef.onSnapshot(handleLobbySnapshot);
  state.playersUnsub = state.lobbyRef
    .collection("players")
    .orderBy("joinedAt", "asc")
    .onSnapshot(handlePlayersSnapshot);
  setActiveView("view-lobby");
  elements.lobbyIdLabel.textContent = lobbyId.slice(0, 6);
  elements.countdownContainer.classList.add("hidden");
  setCountdown(null);
}

function cleanupLobbySubscriptions() {
  if (state.lobbyUnsub) state.lobbyUnsub();
  if (state.playersUnsub) state.playersUnsub();
  state.lobbyUnsub = null;
  state.playersUnsub = null;
  state.lobbyId = null;
  state.lobbyRef = null;
  state.lobbyData = null;
  state.isOwner = false;
  state.latestPlayers = [];
  clearCountdown();
  if (state.ownerStartTimeout) clearTimeout(state.ownerStartTimeout);
  state.ownerStartTimeout = null;
  clearPendingStart();
  clearOwnerFinishTimer();
  stopGame();
  resetCottonHit();
  state.game.mode = "multiplayer";
  setTimeLabel("Pozostały czas");
  elements.opponentBlock?.classList.remove("hidden-block");
  showGauge(false);
}

function handleLobbySnapshot(doc) {
  if (!doc.exists) {
    alert("To lobby zostało zamknięte.");
    leaveLobby();
    return;
  }
  const lobby = doc.data();
  state.lobbyData = lobby;
  const ownerId = lobby.ownerId;
  state.isOwner = ownerId === state.user?.uid;
  elements.startLobbyBtn.disabled = !(state.isOwner && lobby.status === "waiting" && state.latestPlayers.length >= 2);
  elements.lobbyMaxSlots.textContent = lobby.maxPlayers || 4;

  switch (lobby.status) {
    case "waiting":
      elements.lobbyStatusLabel.textContent = "Oczekujemy na graczy...";
      clearCountdown();
      clearPendingStart();
      setTimeLabel("Pozostały czas");
      elements.opponentBlock?.classList.remove("hidden-block");
      showGauge(false);
      stopGame();
      break;
    case "countdown":
    case "in_progress": {
      elements.lobbyStatusLabel.textContent = "Trwa przygotowanie do rundy";
      scheduleGameStart(lobby);
      break;
    }
    case "finished":
      elements.lobbyStatusLabel.textContent = "Runda zakończona";
      showResults(lobby);
      break;
    case "cancelled":
      elements.lobbyStatusLabel.textContent = "Lobby zamknięte";
      spawnPopup("Lobby zostało zamknięte", "rgba(248,113,113,0.9)");
      cleanupLobbySubscriptions();
      setActiveView("view-lobbies");
      break;
    default:
      elements.lobbyStatusLabel.textContent = lobby.status;
  }
}

function scheduleGameStart(lobby) {
  const startsAt = lobby.startsAt?.toDate() || new Date(Date.now() + 5000);
  const now = Date.now();
  const diffMs = Math.max(0, startsAt.getTime() - now);
  setPlayerState("ready");
  elements.lobbyStatusLabel.textContent = "Odliczanie do startu";
  startCountdown(startsAt);
  if (diffMs <= 120) {
    clearPendingStart();
    handleGameStart(lobby);
  } else {
    clearPendingStart();
    state.pendingStartTimeout = setTimeout(() => {
      clearCountdown();
      handleGameStart(state.lobbyData || lobby);
    }, diffMs);
  }
}

function handlePlayersSnapshot(snap) {
  const fragment = document.createDocumentFragment();
  const players = [];
  snap.forEach((doc) => {
    const data = doc.data();
    players.push({ id: doc.id, ...data });
    const li = document.createElement("li");
    const skinMeta = getSkinById(data.skin);
    li.innerHTML = `
      <div class="player-badge" style="background:${skinMeta.color}26;color:${skinMeta.color}">${data.nick}</div>
      <div class="muted">Stan: ${translateState(data.state)}</div>
      <div class="muted">Wynik: ${data.score || 0}</div>
    `;
    fragment.appendChild(li);
  });
  state.latestPlayers = players;
  if (players.length) {
    elements.playerList.innerHTML = "";
    elements.playerList.appendChild(fragment);
  } else {
    elements.playerList.innerHTML = '<li class="placeholder">Nikt jeszcze nie dołączył.</li>';
  }
  elements.startLobbyBtn.disabled = !(state.isOwner && state.lobbyData?.status === "waiting" && players.length >= 2);
  updateOpponentScores();
  if (state.isOwner && state.lobbyData?.status === "in_progress") {
    const someonePlaying = players.some((player) => ["playing", "moving", "ready"].includes(player.state));
    if (!someonePlaying) {
      finishGame();
    }
  }
}

function translateState(stateValue) {
  switch (stateValue) {
    case "idle":
      return "W lobby";
    case "ready":
      return "Gotowy";
    case "playing":
      return "W grze";
    case "moving":
      return "W ruchu";
    case "dead":
      return "Odpada";
    case "finished":
      return "Ukończył";
    default:
      return stateValue || "?";
  }
}

function setPlayerState(newState) {
  if (!state.lobbyRef || !state.user) return;
  state.lobbyRef
    .collection("players")
    .doc(state.user.uid)
    .set({ state: newState }, { merge: true })
    .catch((error) => console.error("Set state error", error));
}

function startCountdown(targetDate) {
  const target = targetDate instanceof Date ? targetDate : new Date(Date.now() + 5000);
  elements.countdownContainer.classList.remove("hidden");
  clearCountdown();
  state.countdownTimer = setInterval(() => {
    const diff = Math.max(0, (target.getTime() - Date.now()) / 1000);
    elements.countdownValue.textContent = Math.ceil(diff);
    if (diff <= 0.1) {
      clearCountdown();
      elements.countdownContainer.classList.add("hidden");
    }
  }, 100);
}

function clearCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = null;
}

function clearPendingStart() {
  if (state.pendingStartTimeout) clearTimeout(state.pendingStartTimeout);
  state.pendingStartTimeout = null;
}

function clearOwnerFinishTimer() {
  if (state.ownerFinishTimeout) clearTimeout(state.ownerFinishTimeout);
  state.ownerFinishTimeout = null;
}

function handleGameStart(lobbyData) {
  state.game.mode = "multiplayer";
  const startsAt = lobbyData.startsAt?.toDate();
  if (startsAt && Date.now() < startsAt.getTime() - 80) {
    scheduleGameStart(lobbyData);
    return;
  }
  clearCountdown();
  clearPendingStart();
  if (state.game.active) return;
  elements.lobbyStatusLabel.textContent = "Trwa runda!";
  setTimeLabel("Pozostały czas");
  elements.opponentBlock?.classList.remove("hidden-block");
  showGauge(false);
  state.game.active = true;
  state.game.died = false;
  state.game.submitted = false;
  state.game.score = 0;
  state.game.stack = createInitialStack();
  state.game.side = "left";
  state.game.moves = 0;
  state.game.elapsed = 0;
  state.game.endsAt = lobbyData.endsAt?.toDate() || new Date((startsAt ? startsAt.getTime() : Date.now()) + 60000);
  state.game.submitted = false;
  resetCottonHit();
  renderStack();
  updateScoreDisplays();
  setPlayerColor();
  setActiveView("view-game");
  setPlayerState("playing");
  attachInputListeners();
  clearSwing();
  setPlayerSide("left");
  startGameTimer();
  updateOpponentScores();
  if (state.isOwner) {
    clearOwnerFinishTimer();
    const ms = state.game.endsAt.getTime() - Date.now() + 2000;
    state.ownerFinishTimeout = setTimeout(() => finishGame(), Math.max(ms, 2000));
  }
}

function resetCottonPattern() {
  state.game.lastFullSide = null;
  state.game.fullRun = 0;
}

function chooseFullSide() {
  const lastSide = state.game.lastFullSide;
  const run = state.game.fullRun || 0;
  if (!lastSide) {
    const initialSide = Math.random() < 0.5 ? "left" : "right";
    state.game.lastFullSide = initialSide;
    state.game.fullRun = 1;
    return initialSide;
  }
  if (run >= MAX_CONSECUTIVE_FULL) {
    const enforcedSide = lastSide === "left" ? "right" : "left";
    state.game.lastFullSide = enforcedSide;
    state.game.fullRun = 1;
    return enforcedSide;
  }
  const rolledSide = Math.random() < 0.5 ? "left" : "right";
  if (rolledSide === lastSide) {
    state.game.fullRun = run + 1;
    return rolledSide;
  }
  state.game.lastFullSide = rolledSide;
  state.game.fullRun = 1;
  return rolledSide;
}

function generateRow() {
  const side = chooseFullSide();
  return {
    left: side === "left" ? "full" : "empty",
    right: side === "right" ? "full" : "empty",
  };
}

function createInitialStack() {
  resetCottonPattern();
  const stack = [];
  for (let i = 0; i < INITIAL_STACK_SIZE; i += 1) {
    stack.push(generateRow());
  }
  return stack;
}

function renderStack() {
  if (!elements.cottonStack) return;
  elements.cottonStack.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.game.stack.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "cotton-row";
    if (index === 0) {
      rowEl.classList.add("cotton-row--active");
    }
    const depthOpacity = Math.max(0.35, 1 - index * 0.05);
    rowEl.style.setProperty("--row-opacity", depthOpacity.toFixed(2));
    rowEl.appendChild(createCottonCell(row.left, "left"));
    rowEl.appendChild(createCottonCell(row.right, "right"));
    fragment.appendChild(rowEl);
  });
  elements.cottonStack.appendChild(fragment);
  updatePlayerPosition();
  if (state.game.mode === "endless") {
    updateGaugeVisual();
  }
}

function createCottonCell(type, side) {
  const cell = document.createElement("div");
  cell.className = `cotton-cell cotton-cell--${type} cotton-cell--${side}`;
  const img = document.createElement("img");
  img.src = type === "full" ? COTTON_FULL_SRC : COTTON_EMPTY_SRC;
  img.alt = type === "full" ? "Krzak bawełny" : "Pusty krzak";
  cell.appendChild(img);
  return cell;
}

function attachInputListeners() {
  window.addEventListener("keydown", handleKeyDown);
  elements.gameCanvasWrapper?.addEventListener("pointerdown", handlePointerDown);
}

function detachInputListeners() {
  window.removeEventListener("keydown", handleKeyDown);
  elements.gameCanvasWrapper?.removeEventListener("pointerdown", handlePointerDown);
}

function handleKeyDown(event) {
  if (!state.game.active || state.game.died) return;
  if (["ArrowLeft", "KeyA"].includes(event.code)) {
    event.preventDefault();
    performMove("left");
  }
  if (["ArrowRight", "KeyD"].includes(event.code)) {
    event.preventDefault();
    performMove("right");
  }
}

function handlePointerDown(event) {
  if (!state.game.active || state.game.died) return;
  const bounds = elements.gameCanvasWrapper.getBoundingClientRect();
  const side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
  performMove(side);
}

function performMove(side) {
  if (!state.game.active || state.game.died) return;
  setPlayerSide(side);
  const row = state.game.stack[0];
  if (!row) return;
  if (row[side] !== "full") {
    triggerDeath("empty");
    return;
  }
  triggerSwing();
  state.game.score += 1;
  state.game.stack.shift();
  state.game.stack.push(generateRow());
  if (state.game.mode === "endless") {
    state.game.moves += 1;
    state.game.gaugeMax = Math.max(state.game.gaugeMin, state.game.gaugeMax - state.game.gaugeDecay);
    state.game.gauge = state.game.gaugeMax;
  }
  renderStack();
  flashCottonHit(side);
  updateScoreDisplays();
  if (state.game.mode === "endless") {
    updateGaugeVisual();
  }
}

function setPlayerSide(side) {
  state.game.side = side;
  if (side === "right") {
    elements.timberPlayer.classList.add("player--right");
  } else {
    elements.timberPlayer.classList.remove("player--right");
  }
}

function triggerSwing() {
  if (!elements.timberPlayer) return;
  elements.timberPlayer.classList.add("player--swing");
  if (state.swingTimeout) clearTimeout(state.swingTimeout);
  state.swingTimeout = setTimeout(() => {
    elements.timberPlayer.classList.remove("player--swing");
    state.swingTimeout = null;
  }, HIT_ANIMATION_MS);
}

function clearSwing() {
  if (state.swingTimeout) {
    clearTimeout(state.swingTimeout);
    state.swingTimeout = null;
  }
  elements.timberPlayer?.classList.remove("player--swing");
}

function flashCottonHit(side) {
  if (!elements.cottonStack) return;
  const className = side === "right" ? "cotton--hit-right" : "cotton--hit-left";
  elements.cottonStack.classList.remove("cotton--hit-left", "cotton--hit-right");
  if (state.hitTimeout) {
    clearTimeout(state.hitTimeout);
    state.hitTimeout = null;
  }
  elements.cottonStack.classList.add(className);
  state.hitTimeout = setTimeout(() => {
    elements.cottonStack?.classList.remove(className);
    state.hitTimeout = null;
  }, HIT_ANIMATION_MS + 80);
}

function resetCottonHit() {
  if (state.hitTimeout) {
    clearTimeout(state.hitTimeout);
    state.hitTimeout = null;
  }
  elements.cottonStack?.classList.remove("cotton--hit-left", "cotton--hit-right");
}

function triggerDeath(reason = "empty") {
  if (state.game.died) return;
  state.game.died = true;
  state.game.active = false;
  detachInputListeners();
  clearInterval(state.game.timerInterval);
  state.game.timerInterval = null;
  clearSwing();
  resetCottonHit();
  if (state.game.mode === "endless") {
    showGauge(false);
    showEndlessResult(reason);
    return;
  }
  if (reason === "empty") {
    spawnPopup("Trafiłeś w pusty krzak", "rgba(248,113,113,0.9)");
  }
  elements.gameTime.textContent = "X";
  setPlayerState("dead");
  submitScore(true);
}

function updateScoreDisplays() {
  elements.gameScore.textContent = state.game.score;
  if (state.game.mode === "multiplayer") {
    updateOpponentScores();
  } else {
    elements.opponentBlock?.classList.add("hidden-block");
    elements.opponentScores.textContent = "-";
  }
}

function updateOpponentScores() {
  if (!state.latestPlayers.length) {
    elements.opponentScores.textContent = "-";
    return;
  }
  elements.opponentBlock?.classList.remove("hidden-block");
  const scoreboard = state.latestPlayers
    .filter((player) => player.id !== state.user?.uid)
    .map((player) => `${player.nick}: ${player.score || 0}`)
    .join(", ");
  elements.opponentScores.textContent = scoreboard || "-";
}

function startGameTimer() {
  clearInterval(state.game.timerInterval);
  state.game.timerInterval = setInterval(() => {
    if (!state.game.endsAt) return;
    const remaining = Math.max(0, Math.ceil((state.game.endsAt.getTime() - Date.now()) / 1000));
    elements.gameTime.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.game.timerInterval);
      if (!state.game.submitted) {
        submitScore(false);
      }
      state.game.active = false;
      detachInputListeners();
    }
  }, 200);
}

function startEndlessTimer() {
  if (state.game.timerInterval) clearInterval(state.game.timerInterval);
  state.game.lastTick = performance.now();
  state.game.timerInterval = setInterval(() => {
    if (state.game.mode !== "endless" || !state.game.active) return;
    const now = performance.now();
    const dt = now - (state.game.lastTick || now);
    state.game.lastTick = now;
    state.game.elapsed += dt;
    state.game.gauge -= dt;
    elements.gameTime.textContent = formatElapsed(state.game.elapsed);
    updateGaugeVisual();
    if (state.game.gauge <= 0) {
      clearInterval(state.game.timerInterval);
      triggerDeath("gauge");
    }
  }, 80);
}

function stopGame() {
  if (!state.game.active && !state.game.died) {
    clearSwing();
    resetCottonHit();
    return;
  }
  state.game.active = false;
  detachInputListeners();
  clearInterval(state.game.timerInterval);
  state.game.timerInterval = null;
  clearSwing();
  resetCottonHit();
  if (state.game.mode === "endless") {
    showGauge(false);
  }
}

async function submitScore(died) {
  if (state.game.mode !== "multiplayer") return;
  if (state.game.submitted || !state.lobbyId) return;
  state.game.submitted = true;
  try {
    if (!state.user) throw new Error("not-auth");
    await state.lobbyRef
      .collection("players")
      .doc(state.user.uid)
      .set(
        {
          score: state.game.score,
          state: died ? "dead" : "finished",
          submittedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    console.error("submitScore", error);
  }
}

async function startLobby() {
  if (!state.isOwner || !state.lobbyId) return;
  try {
    elements.startLobbyBtn.disabled = true;
    if (!state.lobbyRef) throw new Error("no-lobby");
    const startsAtMs = Date.now() + 5000;
    const endsAtMs = startsAtMs + 60000;
    const startsAt = firebase.firestore.Timestamp.fromMillis(startsAtMs);
    const endsAt = firebase.firestore.Timestamp.fromMillis(endsAtMs);
    await state.lobbyRef.update({
      status: "countdown",
      countdownStartedAt: FieldValue.serverTimestamp(),
      startsAt,
      endsAt,
    });
    if (state.ownerStartTimeout) clearTimeout(state.ownerStartTimeout);
    state.ownerStartTimeout = setTimeout(async () => {
      try {
        await state.lobbyRef.update({
          status: "in_progress",
          startedAt: FieldValue.serverTimestamp(),
          endsAt,
        });
      } catch (err) {
        console.warn("ownerStartTimeout", err);
      }
    }, Math.max(0, startsAtMs - Date.now()));
  } catch (error) {
    console.error(error);
    alert(mapFirestoreError(error) || "Nie udało się wystartować gry.");
  }
}

function startEndlessMode() {
  if (state.game.mode === "endless" && state.game.active) return;
  if (elements.startEndlessBtn) {
    elements.startEndlessBtn.disabled = true;
    setTimeout(() => {
      elements.startEndlessBtn.disabled = false;
    }, 600);
  }
  cleanupLobbySubscriptions();
  state.game.mode = "endless";
  state.game.active = false;
  state.game.died = false;
  state.game.submitted = false;
  state.game.score = 0;
  state.game.stack = createInitialStack();
  state.game.side = "left";
  state.game.moves = 0;
  state.game.elapsed = 0;
  state.game.gaugeMax = 2200;
  state.game.gauge = state.game.gaugeMax;
  state.game.gaugeMin = 650;
  state.game.gaugeDecay = 18;
  state.game.lastTick = performance.now();
  state.game.endsAt = null;
  state.game.timerInterval = null;
  setTimeLabel("Czas gry");
  elements.gameTime.textContent = "0.0";
  elements.opponentScores.textContent = "-";
  elements.opponentBlock?.classList.add("hidden-block");
  showGauge(true);
  updateGaugeVisual();
  resetCottonHit();
  renderStack();
  updateScoreDisplays();
  setPlayerColor();
  setActiveView("view-game");
  attachInputListeners();
  state.game.active = true;
  clearSwing();
  setPlayerSide("left");
  startEndlessTimer();
  spawnPopup("Start trybu nieskończonego", "rgba(37,99,235,0.85)");
}

async function finishGame() {
  if (!state.isOwner || !state.lobbyId) return;
  try {
    const lobbyRef = state.lobbyRef;
    if (!lobbyRef) return;
    const playersSnap = await lobbyRef.collection("players").get();
    const players = playersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    players.sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = players[0] || null;

    await lobbyRef.update({
      status: "finished",
      finishedAt: FieldValue.serverTimestamp(),
      winnerId: winner?.id || null,
      winnerNick: winner?.nick || null,
    });

    if (winner) {
      const profileRef = db.collection("profiles").doc(winner.id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(profileRef);
        const current = snap.data() || {};
        const wins = (current.wins || 0) + 1;
        const bestScore = Math.max(current.bestScore || 0, winner.score || 0);
        tx.set(
          profileRef,
          {
            nick: winner.nick,
            wins,
            bestScore,
            lastSeen: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    }

    await db.collection("matches").add({
      ownerId: state.user?.uid || null,
      lobbyId: state.lobbyId,
      winnerId: winner?.id || null,
      winnerNick: winner?.nick || null,
      createdAt: FieldValue.serverTimestamp(),
      players: players.map((player) => ({
        id: player.id,
        nick: player.nick,
        score: player.score || 0,
        state: player.state || "unknown",
      })),
    });
  } catch (error) {
    console.error("finishGame", error);
  }
}

function showResults(lobby) {
  if (state.game.mode === "endless") {
    showEndlessResult("finished");
    return;
  }
  stopGame();
  detachInputListeners();
  setActiveView("view-result");
  elements.resultScoresTitle.textContent = "Wyniki rundy";
  elements.resultLeaderboardTitle.textContent = "Najwięcej zwycięstw";
  const winnerNick = lobby.winnerNick || "Brak zwycięzcy";
  elements.resultHeadline.textContent = `Wygrywa ${winnerNick}!`;
  const players = [...state.latestPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
  const fragment = document.createDocumentFragment();
  players.forEach((player) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${player.nick}</span><div><strong>${player.score || 0}</strong> pkt · ${translateState(player.state)}</div>`;
    fragment.appendChild(li);
  });
  elements.resultPlayerList.innerHTML = "";
  elements.resultPlayerList.appendChild(fragment);
  fetchLeaderboard(elements.resultLeaderboard);
}

async function leaveLobby() {
  if (state.lobbyRef && state.user) {
    try {
      await state.lobbyRef.collection("players").doc(state.user.uid).delete();
      await state.lobbyRef.update({
        playerCount: FieldValue.increment(-1),
      });
    } catch (error) {
      console.warn("leaveLobby", error);
    }
  }
  cleanupLobbySubscriptions();
  setActiveView("view-lobbies");
  spawnPopup("Opuszczono lobby", "rgba(37,99,235,0.85)");
}

function mapFirestoreError(error) {
  const code = error?.code || error?.message || error?.toString?.() || "";
  if (code.includes("permission-denied")) return "Brak uprawnień.";
  if (code.includes("not-found")) return "Lobby już nie istnieje.";
  if (code.includes("already-started")) return "Lobby jest już w trakcie gry.";
  if (code.includes("resource-exhausted") || code.includes("full")) return "Lobby jest pełne.";
  if (code.includes("failed-precondition")) return "Nie można wykonać tej operacji w tym stanie lobby.";
  if (code.includes("not-auth")) return "Brak autoryzacji. Odśwież stronę.";
  return error?.message || error?.code || "Wystąpił nieznany błąd.";
}

function spawnPopup(a, b, c, d) {
  if (typeof a !== "string") return; // animacje w grze wyłączone
  const text = a;
  const color = typeof b === "string" ? b : "rgba(37, 99, 235, 0.9)";
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  toast.style.background = color;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--show"));
  setTimeout(() => toast.classList.remove("toast--show"), 1500);
  setTimeout(() => toast.remove(), 1800);
}

function drawPopups() {}

function setTimeLabel(text) {
  if (elements.timeLabel) {
    elements.timeLabel.textContent = text;
  }
}

function showGauge(show) {
  if (!elements.gaugeBar || !elements.gaugeLabel) return;
  elements.gaugeBar.classList.toggle("hidden", !show);
  elements.gaugeLabel.classList.toggle("hidden", !show);
}

function updateGaugeVisual() {
  if (!elements.gaugeFill) return;
  if (state.game.mode !== "endless") {
    elements.gaugeFill.style.width = "100%";
    return;
  }
  const pct = state.game.gaugeMax > 0 ? Math.max(0, Math.min(1, state.game.gauge / state.game.gaugeMax)) : 0;
  elements.gaugeFill.style.width = `${(pct * 100).toFixed(1)}%`;
}

function formatElapsed(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toFixed(1)}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function normalizeEndlessEntry(raw) {
  if (!raw) return null;
  const score = Number(raw.score);
  const time = Number(raw.time);
  const recordedAt = Number(raw.recordedAt);
  const nick = typeof raw.nick === "string" ? raw.nick.trim() : "";
  return {
    nick: nick || "Gracz",
    score: Number.isFinite(score) && score >= 0 ? score : 0,
    time: Number.isFinite(time) && time >= 0 ? time : 0,
    recordedAt: Number.isFinite(recordedAt) && recordedAt > 0 ? recordedAt : Date.now(),
  };
}

function normalizeEndlessEntries(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => normalizeEndlessEntry(item))
    .filter(Boolean);
}

function loadEndlessScores() {
  try {
    const raw = safeStorageGet(ENDLESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeEndlessEntries(parsed);
  } catch (error) {
    console.warn("loadEndlessScores", error);
    return [];
  }
}

function saveEndlessScore(entry) {
  const normalizedEntry = normalizeEndlessEntry(entry);
  if (!normalizedEntry) return loadEndlessScores();
  try {
    const current = loadEndlessScores();
    const updated = [...current, normalizedEntry];
    updated.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.time !== b.time) return a.time - b.time;
      return a.recordedAt - b.recordedAt;
    });
    const trimmed = updated.slice(0, MAX_ENDLESS_RESULTS);
    safeStorageSet(ENDLESS_STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (error) {
    console.warn("saveEndlessScore", error);
    return [normalizedEntry];
  }
}

function showEndlessResult(reason) {
  stopGame();
  detachInputListeners();
  setActiveView("view-result");
  state.game.mode = "endless";
  const reasonText =
    reason === "gauge"
      ? "Tempo spadło! Nie utrzymałeś rytmu."
      : "Trafiłeś w pusty krzak!";
  const timeText = formatElapsed(state.game.elapsed);
  const entry = {
    nick: state.nick || "Ty",
    score: state.game.score,
    time: state.game.elapsed,
    recordedAt: Date.now(),
  };
  const scores = saveEndlessScore(entry);

  elements.resultHeadline.textContent = reasonText;
  elements.resultScoresTitle.textContent = "Twój wynik";
  elements.resultLeaderboardTitle.textContent = "Rekordy nieskończone";

  elements.resultPlayerList.innerHTML = "";
  const li = document.createElement("li");
  li.innerHTML = `<span>${entry.nick}</span><div><strong>${entry.score}</strong> pkt · ${timeText}</div>`;
  elements.resultPlayerList.appendChild(li);

  const fragment = document.createDocumentFragment();
  scores.slice(0, 5).forEach((score, index) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${index + 1}. ${score.nick}</span><div><strong>${score.score}</strong> pkt · ${formatElapsed(score.time)}</div>`;
    fragment.appendChild(item);
  });
  elements.resultLeaderboard.innerHTML = "";
  if (fragment.childNodes.length) {
    elements.resultLeaderboard.appendChild(fragment);
  } else {
    const placeholder = document.createElement("li");
    placeholder.className = "placeholder";
    placeholder.textContent = "Brak rekordów";
    elements.resultLeaderboard.appendChild(placeholder);
  }

  fetchLeaderboard();
}

function handleExistingCredentials() {
  const savedNick = safeStorageGet("cotton_nick");
  const savedSkin = safeStorageGet("cotton_skin");
  if (savedNick) {
    elements.nickname.value = savedNick;
    state.nick = savedNick;
  }
  if (savedSkin && SKINS.some((skin) => skin.id === savedSkin)) {
    state.skin = savedSkin;
    const meta = getSkinById(savedSkin);
    state.skinColor = meta.color;
    Array.from(elements.skinOptions.querySelectorAll("input[name='skin']")).forEach((input) => {
      input.checked = input.value === savedSkin;
      input.parentElement.classList.toggle("is-selected", input.checked);
    });
  }
  setPlayerColor();
}

function attachEventListeners() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.createLobbyBtn.addEventListener("click", createLobby);
  elements.startEndlessBtn.addEventListener("click", startEndlessMode);
  elements.refreshLobbiesBtn.addEventListener("click", () => fetchLeaderboard());
  elements.leaveLobbyBtn.addEventListener("click", leaveLobby);
  elements.startLobbyBtn.addEventListener("click", startLobby);
  const goBackToLobbies = () => {
    cleanupLobbySubscriptions();
    setActiveView("view-lobbies");
    fetchLeaderboard();
  };
  elements.playAgainBtn.addEventListener("click", goBackToLobbies);
  elements.backToMenuBtn.addEventListener("click", goBackToLobbies);
  if (elements.cashOutBtn) {
    elements.cashOutBtn.addEventListener("click", () => finishGame());
  }
}

function updatePlayerPosition() {
  setPlayerSide(state.game.side);
}

function bootstrap() {
  preloadAssets();
  initSkinOptions();
  handleExistingCredentials();
  attachEventListeners();
  auth.onAuthStateChanged((user) => {
    state.user = user;
  });
  setActiveView("view-auth");
}

bootstrap();

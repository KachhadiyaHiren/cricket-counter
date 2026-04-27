/**
 * CRICSCORE – Frontend Logic (Static Version)
 * Handles all game logic locally using localStorage.
 */

// ── Constants ──────────────────────────────────────────────────────
const STORAGE_KEY = "cricscore_match_state";
const ADMIN_KEY = "cricscore_is_admin";

// ── State Management ───────────────────────────────────────────────
let state = {
  innings: 1,
  max_overs: 6,
  first_innings_score: null,
  first_innings_balls: null,
  current: {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false,
  },
  is_admin: false
};

let currentState = null; // Used for change detection in updateUI

/** Load state from localStorage. */
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };
  }
  state.is_admin = localStorage.getItem(ADMIN_KEY) === "true";
  return state;
}

/** Save state to localStorage. */
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(ADMIN_KEY, state.is_admin.toString());
}

// ── Game Logic ─────────────────────────────────────────────────────

function computeOvers(balls) {
  const overs = Math.floor(balls / 6);
  const remainder = balls % 6;
  return `${overs}.${remainder}`;
}

function computeRunRate(score, balls) {
  if (balls === 0) return 0.0;
  const overs = balls / 6;
  return score / overs;
}

function checkMatchOver() {
  const current = state.current;
  const max_balls = state.max_overs * 6;

  if (current.wickets >= 10) return true;
  if (current.balls >= max_balls) return true;

  if (state.innings === 2 && state.first_innings_score !== null) {
    if (current.score > state.first_innings_score) return true;
  }

  return false;
}

function getFullState() {
  const current = state.current;
  const first_score = state.first_innings_score;
  const max_balls = state.max_overs * 6;
  
  let rrr = null;
  if (state.innings === 2 && first_score !== null) {
    const balls_remaining = max_balls - current.balls;
    if (balls_remaining > 0) {
      const overs_remaining = balls_remaining / 6;
      const runs_needed = (first_score + 1) - current.score;
      rrr = runs_needed > 0 ? runs_needed / overs_remaining : 0.0;
    } else {
      rrr = 0.0;
    }
  }

  return {
    ...current,
    innings: state.innings,
    max_overs: state.max_overs,
    target: (first_score !== null) ? first_score + 1 : null,
    first_innings_score: first_score,
    required_run_rate: rrr,
    overs: computeOvers(current.balls),
    run_rate: computeRunRate(current.score, current.balls),
    match_over: checkMatchOver(),
    is_admin: state.is_admin,
    history: current.history.slice(-10)
  };
}

// ── Actions ────────────────────────────────────────────────────────

function toggleAdmin() {
  if (state.is_admin) {
    if (confirm("Exit Admin mode?")) {
      state.is_admin = false;
      saveState();
      refreshUI();
    }
  } else {
    const password = prompt("Enter Admin Password (default: admin):");
    if (password === "admin") {
      state.is_admin = true;
      saveState();
      refreshUI();
    } else if (password !== null) {
      alert("Incorrect password.");
    }
  }
}

function sendBall(type) {
  if (checkMatchOver() || state.current.nb_pending) return;

  const current = state.current;
  const snapshot = {
    score: current.score,
    wickets: current.wickets,
    balls: current.balls,
    extras: current.extras,
    ball_type: type
  };

  if (type === "NB") {
    current.score += 1;
    current.extras += 1;
    current.nb_pending = true;
  } else if (type === "WD") {
    current.score += 1;
    current.extras += 1;
  } else if (type === "W") {
    current.wickets += 1;
    current.balls += 1;
  } else {
    current.score += parseInt(type);
    current.balls += 1;
  }

  current.history.push(snapshot);
  saveState();
  updateUI(getFullState(), type);
}

function sendNBRuns(runs) {
  const current = state.current;
  current.history.push({
    score: current.score,
    wickets: current.wickets,
    balls: current.balls,
    extras: current.extras,
    ball_type: `NB+${runs}`
  });
  current.score += parseInt(runs);
  current.nb_pending = false;
  saveState();
  updateUI(getFullState(), runs.toString());
}

function sendNBWicket() {
  const current = state.current;
  current.history.push({
    score: current.score,
    wickets: current.wickets,
    balls: current.balls,
    extras: current.extras,
    ball_type: "NB+W"
  });
  current.wickets += 1;
  current.balls += 1;
  current.nb_pending = false;
  saveState();
  updateUI(getFullState(), "W");
}

function changeOvers(delta) {
  if (state.innings !== 1) return;
  state.max_overs = Math.max(1, Math.min(50, state.max_overs + delta));
  saveState();
  refreshUI();
}

function undoBall() {
  const history = state.current.history;
  if (history.length === 0) return;

  const last = history.pop();
  state.current.score = last.score;
  state.current.wickets = last.wickets;
  state.current.balls = last.balls;
  state.current.extras = last.extras;
  state.current.nb_pending = false;

  saveState();
  refreshUI();
}

function startSecondInnings() {
  if (state.innings >= 2) return;
  if (!confirm("End 1st innings and start 2nd innings?")) return;

  state.first_innings_score = state.current.score;
  state.first_innings_balls = state.current.balls;
  state.innings = 2;
  state.current = {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false,
  };

  saveState();
  document.getElementById("matchOverOverlay").classList.add("hidden");
  refreshUI();
}

function resetMatch() {
  if (!confirm("Reset entire match? All data will be lost.")) return;
  state = {
    innings: 1,
    max_overs: 6,
    first_innings_score: null,
    first_innings_balls: null,
    current: {
      score: 0,
      wickets: 0,
      balls: 0,
      extras: 0,
      history: [],
      nb_pending: false,
    },
    is_admin: state.is_admin
  };
  saveState();
  document.getElementById("matchOverOverlay").classList.add("hidden");
  refreshUI();
}

function refreshScore() {
  // In static mode, refresh just re-syncs from localStorage and triggers animation
  const btn = document.querySelector(".score-refresh-btn");
  if (btn) {
    btn.classList.add("spinning");
    setTimeout(() => btn.classList.remove("spinning"), 600);
  }
  loadState();
  refreshUI();
}

// ── UI Logic ───────────────────────────────────────────────────────

function refreshUI() {
  updateUI(getFullState(), null);
}

function updateUI(state, ballType) {
  const hasChanged = currentState && (
    currentState.score !== state.score ||
    currentState.wickets !== state.wickets ||
    currentState.balls !== state.balls ||
    currentState.innings !== state.innings
  );

  currentState = JSON.parse(JSON.stringify(state)); // Deep copy for comparison

  // ── Score ──
  const runsEl = document.getElementById("scoreRuns");
  const wicketsEl = document.getElementById("scoreWickets");

  runsEl.textContent = state.score;
  wicketsEl.textContent = state.wickets;

  // Bump animation on score display
  if (ballType || hasChanged) {
    const scoreDisplay = runsEl.closest(".score-display");
    if (scoreDisplay) {
      scoreDisplay.classList.remove("bump");
      void scoreDisplay.offsetWidth; // reflow
      scoreDisplay.classList.add("bump");
    }
  }

  // Flash run colour on ball
  if (ballType) {
    runsEl.classList.remove("flash-4", "flash-6", "flash-W");
    if (ballType === "4") {
      runsEl.classList.add("flash-4");
      setTimeout(() => runsEl.classList.remove("flash-4"), 700);
    } else if (ballType === "6") {
      runsEl.classList.add("flash-6");
      setTimeout(() => runsEl.classList.remove("flash-6"), 800);
    } else if (ballType === "W") {
      runsEl.classList.add("flash-W");
      setTimeout(() => runsEl.classList.remove("flash-W"), 650);
    }
  }

  // ── Overs / Run Rate / Extras ──
  document.getElementById("metaOvers").textContent   = state.overs;
  document.getElementById("metaRunRate").textContent = state.run_rate.toFixed(2);
  document.getElementById("metaExtras").textContent  = state.extras;
  document.getElementById("metaMaxOvers").textContent = state.max_overs;

  // Progress bar
  const pct = state.max_overs > 0
    ? Math.min(100, (state.balls / (state.max_overs * 6)) * 100)
    : 0;
  document.getElementById("oversProgressBar").style.width = pct + "%";

  // ── Admin Controls visibility ──
  const inputSection = document.getElementById("inputSection");
  const controlsSection = document.getElementById("controlsSection");
  const loginBtn = document.getElementById("loginBtn");

  if (state.is_admin) {
    inputSection.classList.remove("hidden");
    controlsSection.classList.remove("hidden");
    loginBtn.textContent = "Exit Admin";
    loginBtn.style.background = "rgba(248,81,73,0.1)";
    loginBtn.style.color = "var(--accent-red)";
  } else {
    inputSection.classList.add("hidden");
    controlsSection.classList.add("hidden");
    loginBtn.textContent = "Admin Login";
    loginBtn.style.background = "rgba(0,0,0,0.05)";
    loginBtn.style.color = "var(--text-secondary)";
  }

  // ── Overs selector ──
  const oversSelector = document.getElementById("oversSelector");
  const oversValueEl  = document.getElementById("oversValue");
  if (state.is_admin && state.innings === 1 && !state.match_over) {
    oversSelector.classList.remove("hidden");
    oversValueEl.textContent = state.max_overs;
  } else {
    oversSelector.classList.add("hidden");
  }

  // ── Innings badge ──
  const badge = document.getElementById("inningsBadge");
  if (state.innings === 2) {
    badge.textContent = "2nd Innings";
    badge.classList.add("second");
  } else {
    badge.textContent = "1st Innings";
    badge.classList.remove("second");
  }

  // ── Target bar ──
  const targetBar = document.getElementById("targetBar");
  if (state.innings === 2 && state.target !== null) {
    targetBar.classList.remove("hidden");
    document.getElementById("targetValue").textContent = state.target;
    const need = state.target - state.score;
    document.getElementById("targetNeed").textContent =
      need > 0 ? `${need} runs` : "—";
    document.getElementById("targetRrr").textContent =
      state.required_run_rate !== null ? state.required_run_rate.toFixed(2) : "—";
  } else {
    targetBar.classList.add("hidden");
  }

  // ── No Ball pending panel ──
  const nbPanel   = document.getElementById("nbPanel");
  const ballGrid  = document.querySelector(".ball-grid");
  if (state.nb_pending) {
    nbPanel.classList.remove("hidden");
    ballGrid.style.opacity        = "0.35";
    ballGrid.style.pointerEvents  = "none";
  } else {
    nbPanel.classList.add("hidden");
    ballGrid.style.opacity        = "";
    ballGrid.style.pointerEvents  = "";
  }

  // ── Second innings button ──
  const siBtn = document.getElementById("secondInningsBtn");
  if (state.innings >= 2) {
    siBtn.classList.add("disabled");
  } else {
    siBtn.classList.remove("disabled");
  }

  // ── Disable ball buttons on wickets ──
  const allBallBtns = document.querySelectorAll(".ball-btn");
  if (state.wickets >= 10 || state.match_over) {
    allBallBtns.forEach(btn => btn.classList.add("disabled"));
  } else {
    allBallBtns.forEach(btn => btn.classList.remove("disabled"));
  }

  updateOverDots(state);
  updateHistory(state);
  if (state.match_over) showMatchOver(state);
}

function updateOverDots(state) {
  const container = document.getElementById("thisOverDots");
  container.innerHTML = "";
  const legalTypes = ["0","1","2","3","4","6","W"];
  const legalBalls = (state.history || []).filter(b => legalTypes.includes(b.ball_type));
  const ballsInOver = state.balls % 6;
  const overStart   = legalBalls.length - ballsInOver;
  const thisOver    = legalBalls.slice(Math.max(0, overStart));

  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("div");
    dot.className = "dot-ball";
    if (i < thisOver.length) {
      const t = thisOver[i].ball_type;
      const dotLabels = { "0":"·","1":"1","2":"2","3":"3","4":"4","6":"6","W":"W","WD":"Wd","NB":"Nb" };
      dot.textContent = dotLabels[t] || t;
      dot.classList.add(`is-${t}`);
    } else {
      dot.textContent = "";
      dot.style.opacity = "0.25";
    }
    container.appendChild(dot);
  }
}

function updateHistory(state) {
  const list = document.getElementById("historyList");
  const history = state.history || [];
  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No balls bowled yet</div>';
    return;
  }
  const shown = [...history].reverse().slice(0, 10);
  const typeLabel = {
    "0":"Dot ball","1":"1 Run","2":"2 Runs","3":"3 Runs",
    "4":"FOUR","6":"SIX","W":"WICKET","WD":"Wide","NB":"No Ball",
    "NB+0":"NB + 0","NB+1":"NB + 1","NB+2":"NB + 2",
    "NB+3":"NB + 3","NB+4":"NB + FOUR","NB+6":"NB + SIX",
    "NB+W":"NB Run Out",
  };
  list.innerHTML = shown.map((b, idx) => {
    const cls = `h-type-${b.ball_type}`;
    const label = typeLabel[b.ball_type] || b.ball_type;
    const scoreAfter = `${b.score}/${b.wickets}`;
    return `
      <div class="history-item" style="animation-delay:${idx * 0.04}s">
        <span class="h-ball-type ${cls}">${label}</span>
        <span class="h-score">${scoreAfter}</span>
      </div>
    `;
  }).join("");
}

function showMatchOver(state) {
  const overlay = document.getElementById("matchOverOverlay");
  const title   = document.getElementById("matchOverTitle");
  const sub     = document.getElementById("matchOverSub");
  overlay.classList.remove("hidden");
  if (state.innings === 1) {
    title.textContent = "Innings Over!";
    sub.textContent   = `Final Score: ${state.score}/${state.wickets} (${state.overs} ov)`;
  } else if (state.innings === 2) {
    if (state.score > (state.first_innings_score || 0)) {
      title.textContent = "Target Chased! 🎉";
      sub.textContent   = `Won by ${10 - state.wickets} wickets`;
    } else if (state.wickets >= 10 || state.balls >= (state.max_overs * 6)) {
      const diff = (state.first_innings_score || 0) - state.score;
      title.textContent = "Match Over!";
      sub.textContent   = diff > 0 ? `Lost by ${diff} runs` : "Match Tied!";
    }
  }
}

// ── Init ───────────────────────────────────────────────────────────
(() => {
  loadState();
  refreshUI();
})();

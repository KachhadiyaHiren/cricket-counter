/**
   ==========================================================================
   CRICSCORE – Frontend Logic
   Handles Team Balancing, 3D Toss, and Live Scorecard with full undo-redo
   ==========================================================================
*/

// ── CONSTANTS & STATE KEYS ──
const STORAGE_KEY = "cricscore_extended_state_clean_v10";

// ── DEFAULT 20 PLAYERS POOL ──
const DEFAULT_PLAYERS = [
  { id: "p1",  name: "Ambar",          role: "All-rounder", available: true },
  { id: "p2",  name: "Hardik",         role: "All-rounder", available: true },
  { id: "p3",  name: "Umesh",          role: "All-rounder", available: true },
  { id: "p4",  name: "Mehul",          role: "All-rounder", available: true },
  { id: "p5",  name: "krish",          role: "All-rounder", available: true },
  { id: "p6",  name: "j acharya",      role: "All-rounder", available: true },
  { id: "p7",  name: "Hiren",          role: "Bowler",      available: true },
  { id: "p8",  name: "Dhruvil",        role: "Batter",      available: true },
  { id: "p9",  name: "Naresh Chanchad",role: "All-rounder", available: true },
  { id: "p10", name: "Tarun",          role: "Bowler",      available: true },
  { id: "p11", name: "Prerak",         role: "Batter",      available: true },
  { id: "p12", name: "Shyam",          role: "All-rounder", available: true },
  { id: "p13", name: "Umesh K",        role: "All-rounder", available: true },
  { id: "p14", name: "Hiren K(OG)",    role: "Bowler",      available: true },
  { id: "p15", name: "Shailesh",       role: "Bowler",      available: true },
  { id: "p16", name: "Shankar",        role: "Batter",      available: true },
  { id: "p17", name: "Siddhesh",       role: "All-rounder", available: true },
  { id: "p18", name: "Vimal",          role: "Batter",      available: true },
  { id: "p19", name: "Niraj",          role: "Bowler",      available: true },
  { id: "p20", name: "Chintan",        role: "All-rounder", available: true }
];

// ── INITIAL APP STATE ──
let state = {
  phase: 'setup', // 'setup' | 'toss' | 'innings1' | 'innings2' | 'completed'
  players: [],
  team1: [],
  team2: [],
  toss: {
    caller: 'team1',
    choice: 'Heads',
    winner: null, // 'team1' | 'team2'
    decision: null // 'Batting' | 'Bowling'
  },
  maxOvers: 6,
  innings: 1,
  
  // Scoring parameters
  battingTeam: null, // 'team1' or 'team2'
  bowlingTeam: null, // 'team1' or 'team2'
  
  strikerId: null,
  nonStrikerId: null,
  bowlerId: null,
  lastBowlerId: null,
  
  innings1Score: null,
  innings1Wickets: null,
  innings1Balls: null,
  
  current: {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [], // For time travel undo support
    nb_pending: false
  },
  
  // Player statistics map
  playerStats: {}, // { playerId: { runs, balls, fours, sixes, out, outDesc, bowledBalls, maidens, concededRuns, wickets, currentOverRuns } }
  
  // Storage for completed Innings 1 scorecard details
  innings1Stats: null
};

// ── STATE SAVE/LOAD ──
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = JSON.parse(saved);
      if (!state.players || state.players.length === 0) {
        state.players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
      }
    } catch(e) {
      console.error("Error loading state", e);
      resetToDefaultState();
    }
  } else {
    resetToDefaultState();
  }
}

function resetToDefaultState() {
  state = {
    phase: 'setup',
    players: JSON.parse(JSON.stringify(DEFAULT_PLAYERS)),
    team1: [],
    team2: [],
    toss: { caller: 'team1', choice: 'Heads', winner: null, decision: null },
    maxOvers: 6,
    innings: 1,
    battingTeam: null,
    bowlingTeam: null,
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    lastBowlerId: null,
    innings1Score: null,
    innings1Wickets: null,
    innings1Balls: null,
    current: { score: 0, wickets: 0, balls: 0, extras: 0, history: [], nb_pending: false },
    playerStats: {},
    innings1Stats: null,
    completedMatches: [],
    nextMatchBattingWinner: null
  };
  saveState();
}

// ── INITIALIZATION ──
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupEventListeners();
  renderAll();
});

// Setup DOM event listeners
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Player Form Submission
  const form = document.getElementById("playerForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addPlayerFromForm();
    });
  }
}

// ── TABS NAVIGATION ──
function switchTab(tabId) {
  // If moving away from current tabs check phase restrictions
  if (tabId === "toss-tab" && state.team1.length === 0) {
    alert("Please generate balanced teams in the Squads tab first!");
    return;
  }
  if (tabId === "scoring-tab" && state.phase === "setup") {
    alert("Please generate teams and complete the Toss first!");
    return;
  }
  if (tabId === "scoring-tab" && state.phase === "toss") {
    alert("Please complete the Toss phase first!");
    return;
  }

  // Deactivate all nav tabs and panels
  document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));

  // Activate target
  const targetTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (targetTab) targetTab.classList.add("active");
  const targetPanel = document.getElementById(tabId);
  if (targetPanel) targetPanel.classList.add("active");

  renderAll();
}

// ── SQUAD MANAGEMENT (TAB 1) ──
function renderPlayerPool() {
  const tbody = document.getElementById("poolTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.players.forEach(p => {
    const tr = document.createElement("tr");
    
    // Checkbox Play/Available Cell
    const tdCheck = document.createElement("td");
    tdCheck.style.textAlign = "center";
    const label = document.createElement("label");
    label.className = "checkbox-container";
    label.style.paddingLeft = "0";
    label.style.margin = "0 auto";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = p.available;
    input.addEventListener("change", () => {
      p.available = input.checked;
      saveState();
      updatePoolSummaryText();
    });
    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";
    checkmark.style.position = "relative";
    checkmark.style.top = "0";
    checkmark.style.transform = "none";
    checkmark.style.display = "block";
    label.appendChild(input);
    label.appendChild(checkmark);
    tdCheck.appendChild(label);
    tr.appendChild(tdCheck);

    // Player Name Cell
    const tdName = document.createElement("td");
    const capTag = p.isCaptain ? ' <span class="pool-tag pool-tag-cap">(c)</span>' : '';
    const comTag = p.isCommon ? ' <span class="pool-tag pool-tag-com">(cp)</span>' : '';
    tdName.innerHTML = `${p.name}${capTag}${comTag}`;
    tr.appendChild(tdName);

    // Role Cell
    const tdRole = document.createElement("td");
    tdRole.style.textAlign = "center";
    tdRole.innerHTML = `<span style="font-size:1.1rem; display:block; text-align:center;" title="${p.role}">${roleIcon(p.role)}</span>`;
    tr.appendChild(tdRole);

    // Actions Cell
    const tdActions = document.createElement("td");
    tdActions.className = "actions-cell";

    // Edit button
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn-icon";
    btnEdit.textContent = "Edit";
    btnEdit.title = "Edit Player";
    btnEdit.addEventListener("click", () => editPlayerPrompt(p.id));

    // Delete button
    const btnDel = document.createElement("button");
    btnDel.className = "btn-icon delete";
    btnDel.textContent = "Del";
    btnDel.title = "Delete Player";
    btnDel.addEventListener("click", () => deletePlayer(p.id));

    tdActions.appendChild(btnEdit);
    tdActions.appendChild(btnDel);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  updatePoolSummaryText();
}

function updatePoolSummaryText() {
  const summary = document.getElementById("poolSummary");
  if (!summary) return;
  const total = state.players.length;
  const available = state.players.filter(p => p.available).length;
  summary.textContent = `${total} players registered (${available} available for match)`;
}

function addPlayerFromForm() {
  const nameInput = document.getElementById("playerName");
  const roleInput = document.getElementById("playerRole");

  const name = nameInput.value.trim();
  if (!name) return;

  const newPlayer = {
    id: "p_" + Date.now(),
    name: name,
    role: roleInput.value,
    isCaptain: false,
    isCommon: false,
    available: true
  };

  state.players.push(newPlayer);
  saveState();

  // Reset Form
  nameInput.value = "";

  renderPlayerPool();
}

function editPlayerPrompt(id) {
  const p = state.players.find(x => x.id === id);
  if (!p) return;

  const newName = prompt("Edit Player Name:", p.name);
  if (newName === null) return;
  const trimmedName = newName.trim();
  if (trimmedName) p.name = trimmedName;

  const roleOpts = ["Batter", "Bowler", "All-rounder"];
  const newRole = prompt(`Edit Role (${roleOpts.join("/")}):`, p.role);
  if (newRole && roleOpts.includes(newRole)) p.role = newRole;

  saveState();
  renderPlayerPool();
}

function deletePlayer(id) {
  if (!confirm("Are you sure you want to delete this player?")) return;
  state.players = state.players.filter(p => p.id !== id);
  saveState();
  renderPlayerPool();
}

function resetToDefaultPool() {
  if (!confirm("Reset player pool to the default 20 players?")) return;
  state.players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
  saveState();
  renderPlayerPool();
}

function clearPlayerPool() {
  if (!confirm("Clear the entire player pool?")) return;
  state.players = [];
  saveState();
  renderPlayerPool();
}

function toggleSelectAllPlayers(val) {
  state.players.forEach(p => p.available = val);
  saveState();
  renderPlayerPool();
}

// ── TEAM BALANCER ALGORITHM ──
function generateBalancedTeams(isShuffle = false) {
  state.nextMatchBattingWinner = null;
  const available = state.players.filter(p => p.available && !p.isCommon);
  if (available.length < 2) {
    alert("Please select at least 2 available normal players to form teams!");
    return;
  }

  // Algorithm search variables
  let bestSplit = null;
  let minScore = Infinity;
  
  const captains = available.filter(p => p.isCaptain);
  const nonCaptains = available.filter(p => !p.isCaptain);

  // Perform 1500 random shuffles to find the split with minimum penalty score
  const simulations = 1500;
  for (let i = 0; i < simulations; i++) {
    // Shuffle elements randomly
    let tempCaptains = [...captains].sort(() => Math.random() - 0.5);
    let tempNonCaptains = [...nonCaptains].sort(() => Math.random() - 0.5);

    let t1 = [];
    let t2 = [];

    // Alternately deal captains to separate teams
    tempCaptains.forEach((c, idx) => {
      if (idx % 2 === 0) t1.push(c);
      else t2.push(c);
    });

    // Alternately deal non-captains
    tempNonCaptains.forEach(p => {
      if (t1.length < t2.length) {
        t1.push(p);
      } else {
        t2.push(p);
      }
    });

    // Evaluate how balanced the teams are
    const score = evaluateTeamSplit(t1, t2);
    if (score < minScore) {
      minScore = score;
      bestSplit = { team1: t1, team2: t2 };
    }
  }

  if (bestSplit) {
    state.team1 = bestSplit.team1;
    state.team2 = bestSplit.team2;
    saveState();
    renderGeneratedTeams();
  }
}

function evaluateTeamSplit(t1, t2) {
  let penalty = 0;

  // Rule 1: size mismatch is heavily penalized (must be equal or +/- 1)
  penalty += Math.abs(t1.length - t2.length) * 2000;

  // Rule 2: Captain distribution (prefer exactly 1 captain on each team if there are 2)
  const cap1 = t1.filter(p => p.isCaptain).length;
  const cap2 = t2.filter(p => p.isCaptain).length;
  penalty += Math.abs(cap1 - cap2) * 500;

  // Rule 3: Role counts balance (balanced number of batters/bowlers/all-rounders)
  const roles = ["Batter", "Bowler", "All-rounder"];
  roles.forEach(role => {
    const count1 = t1.filter(p => p.role === role).length;
    const count2 = t2.filter(p => p.role === role).length;
    penalty += Math.abs(count1 - count2) * 100;
  });

  return penalty;
}

function renderGeneratedTeams() {
  const container = document.getElementById("generatedTeamsContainer");
  const proceed = document.getElementById("proceedSection");
  const shuffleBtn = document.getElementById("btnShuffleTeams");
  const unassignedWrapper = document.getElementById("unassignedPlayersWrapper");
  const unassignedList = document.getElementById("unassignedPlayerList");
  
  const available = state.players.filter(p => p.available);
  if (!container || available.length === 0) {
    if (container) container.classList.add("hidden");
    if (proceed) proceed.classList.add("hidden");
    if (shuffleBtn) shuffleBtn.classList.add("hidden");
    if (unassignedWrapper) unassignedWrapper.classList.add("hidden");
    return;
  }

  // Always show unassigned block and teams block when we have available players
  container.classList.remove("hidden");
  proceed.classList.remove("hidden");
  
  if (state.nextMatchBattingWinner) {
    proceed.innerHTML = `<button class="btn btn-primary btn-lg btn-block btn-glow" onclick="startNextMatchSeries()">
                          Start Next Match (Winner Bats) 🚀
                         </button>`;
  } else {
    proceed.innerHTML = `<button class="btn btn-primary btn-lg btn-block" onclick="proceedToToss()">
                          Proceed to Coin Toss 🪙 👉
                         </button>`;
  }
  const hasTeams = state.team1.length > 0 || state.team2.length > 0;
  if (shuffleBtn) {
    if (hasTeams) shuffleBtn.classList.remove("hidden");
    else shuffleBtn.classList.add("hidden");
  }
  
  const clearBtn = document.getElementById("btnClearTeams");
  if (clearBtn) {
    if (hasTeams) clearBtn.classList.remove("hidden");
    else clearBtn.classList.add("hidden");
  }

  // Filter unassigned available players
  const assignedIds = new Set([...state.team1.map(x => x.id), ...state.team2.map(x => x.id)]);
  const unassigned = available.filter(p => !p.isCommon && !assignedIds.has(p.id));

  // Render unassigned available players list
  if (unassigned.length > 0) {
    unassignedWrapper.classList.remove("hidden");
    unassignedList.innerHTML = unassigned.map(p => `
      <div class="unassigned-row">
        <span class="unassigned-name">${p.name} <span class="unassigned-role" style="font-size: 0.95rem; margin-left: 0.25rem;" title="${p.role}">${roleIcon(p.role)}</span></span>
        <div class="unassigned-actions">
          <button class="ua-btn ua-t1" onclick="addPlayerToTeam('${p.id}', 1)">T1</button>
          <button class="ua-btn ua-t2" onclick="addPlayerToTeam('${p.id}', 2)">T2</button>
          <button class="ua-btn ua-com" onclick="makePlayerCommon('${p.id}')">Common</button>
        </div>
      </div>
    `).join("");
  } else {
    unassignedWrapper.classList.add("hidden");
  }

  // Render Common Players neutral list
  const commonPlayers = available.filter(p => p.isCommon);
  const commonList = document.getElementById("commonPlayersList");
  const commonCard = document.getElementById("commonPlayersCard");
  if (commonList && commonCard) {
    if (commonPlayers.length > 0) {
      commonCard.style.display = "block";
      commonList.innerHTML = commonPlayers.map(p => `
        <div class="team-player-item" style="padding: 0.4rem 0.75rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25); display: flex; align-items: center; gap: 0.25rem;">
          <button class="btn-icon delete" onclick="unmakePlayerCommon('${p.id}')" style="margin-right: 0.25rem;" title="Remove Common">✕</button>
          <strong>🤝 ${p.name}</strong> <span style="font-size:0.85rem; margin-left: 0.25rem;" title="${p.role}">${roleIcon(p.role)}</span>
        </div>
      `).join("");
    } else {
      commonCard.style.display = "none";
      commonList.innerHTML = "";
    }
  }

  const getStatsText = (team) => {
    const batters = team.filter(x => x.role === "Batter").length;
    const bowlers = team.filter(x => x.role === "Bowler").length;
    const allRounders = team.filter(x => x.role === "All-rounder").length;
    return `Bat: ${batters} | Bowl: ${bowlers} | AR: ${allRounders}`;
  };

  // Render Team A
  document.getElementById("teamAStats").textContent = `${state.team1.length} Players`;
  document.getElementById("teamAMeta").textContent = getStatsText(state.team1);
  const listA = document.getElementById("teamAPlayerList");
  if (state.team1.length === 0) {
    listA.innerHTML = `<li class="tpi-empty">No players assigned</li>`;
  } else {
       listA.innerHTML = state.team1.map(p => `
      <li class="team-player-item">
        <span class="tpi-name">${p.name}${p.isCaptain ? ' <span class="tpi-cap">(c)</span>' : ''}</span>
        <span class="tpi-role" title="${p.role}">${roleIcon(p.role)}</span>
        <div class="tpi-actions">
          <button class="tpi-btn tpi-cap-btn${p.isCaptain ? ' active' : ''}" onclick="togglePlayerCaptain('${p.id}', 1)">${p.isCaptain ? 'Cap' : 'Cap?'}</button>
          <button class="tpi-btn tpi-switch" onclick="movePlayerToTeam('${p.id}', 2)">T2</button>
          <button class="tpi-btn tpi-del" onclick="removePlayerFromTeam('${p.id}')">✕</button>
        </div>
      </li>
    `).join("");
  }

  // Render Team B
  document.getElementById("teamBStats").textContent = `${state.team2.length} Players`;
  document.getElementById("teamBMeta").textContent = getStatsText(state.team2);
  const listB = document.getElementById("teamBPlayerList");
  if (state.team2.length === 0) {
    listB.innerHTML = `<li class="tpi-empty">No players assigned</li>`;
  } else {
     listB.innerHTML = state.team2.map(p => `
      <li class="team-player-item">
        <span class="tpi-name">${p.name}${p.isCaptain ? ' <span class="tpi-cap">(c)</span>' : ''}</span>
        <span class="tpi-role" title="${p.role}">${roleIcon(p.role)}</span>
        <div class="tpi-actions">
          <button class="tpi-btn tpi-cap-btn${p.isCaptain ? ' active' : ''}" onclick="togglePlayerCaptain('${p.id}', 2)">${p.isCaptain ? 'Cap' : 'Cap?'}</button>
          <button class="tpi-btn tpi-switch" onclick="movePlayerToTeam('${p.id}', 1)">T1</button>
          <button class="tpi-btn tpi-del" onclick="removePlayerFromTeam('${p.id}')">✕</button>
        </div>
      </li>
    `).join("");
  }
}

function roleIcon(role) {
  if (role === 'Batter') return '🏏';
  if (role === 'Bowler') return '🥎';
  return '⚡'; // All-rounder
}

function togglePlayerCaptain(playerId, teamNum) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  if (p.isCaptain) {
    // Already captain — un-captain them
    p.isCaptain = false;
  } else {
    // Remove captain from anyone else in the same team first
    const team = teamNum === 1 ? state.team1 : state.team2;
    team.forEach(tp => {
      const tp_player = state.players.find(x => x.id === tp.id);
      if (tp_player) tp_player.isCaptain = false;
    });
    p.isCaptain = true;
  }

  saveState();
  renderAll();
}

function makePlayerCommon(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  state.team1 = state.team1.filter(x => x.id !== playerId);
  state.team2 = state.team2.filter(x => x.id !== playerId);

  p.isCommon = true;
  p.isCaptain = false;

  saveState();
  renderAll();
}

function unmakePlayerCommon(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  p.isCommon = false;

  saveState();
  renderAll();
}

function addPlayerToTeam(playerId, teamNum) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;

  state.team1 = state.team1.filter(x => x.id !== playerId);
  state.team2 = state.team2.filter(x => x.id !== playerId);

  if (teamNum === 1) state.team1.push(p);
  else state.team2.push(p);

  saveState();
  renderAll();
}

function removePlayerFromTeam(playerId) {
  state.team1 = state.team1.filter(x => x.id !== playerId);
  state.team2 = state.team2.filter(x => x.id !== playerId);
  saveState();
  renderAll();
}

function movePlayerToTeam(playerId, targetTeamNum) {
  addPlayerToTeam(playerId, targetTeamNum);
}

function clearGeneratedTeams() {
  if (!confirm("Are you sure you want to clear the teams? This moves all players back to the unassigned list.")) return;
  state.nextMatchBattingWinner = null;
  state.team1 = [];
  state.team2 = [];
  saveState();
  renderAll();
}

function resetEntireApp() {
  if (!confirm("Are you sure you want to completely reset the application? This will restore the default player pool, clear all match history, and return to the Setup phase.")) return;
  resetToDefaultState();
  location.reload(); // Refresh the page to reload a completely fresh state
}

function proceedToToss() {
  if (state.team1.length === 0 || state.team2.length === 0) {
    alert("Please assign at least 1 player to both Team 1 and Team 2!");
    return;
  }
  state.phase = 'toss';
  saveState();
  switchTab("toss-tab");
}


// ── TOSS MECHANISM (TAB 2) ──
function renderTossTab() {
  const tossCaller = document.getElementById("tossCaller");
  if (!tossCaller) return;

  const cap1 = state.team1.find(p => p.isCaptain) || state.team1[0];
  const cap2 = state.team2.find(p => p.isCaptain) || state.team2[0];
  
  tossCaller.innerHTML = `
    <option value="team1">${cap1 ? cap1.name : 'Team 1'} (Team 1)</option>
    <option value="team2">${cap2 ? cap2.name : 'Team 2'} (Team 2)</option>
  `;

  const resultCard = document.getElementById("tossResultCard");
  const finalizedCard = document.getElementById("tossFinalizedCard");

  if (state.toss.winner === null) {
    resultCard.classList.add("hidden");
    finalizedCard.classList.add("hidden");
    document.getElementById("btnFlipCoin").disabled = false;
  } else {
    document.getElementById("btnFlipCoin").disabled = true;
    if (state.toss.decision === null) {
      resultCard.classList.remove("hidden");
      finalizedCard.classList.add("hidden");
      displayTossWinnerMessage();
    } else {
      resultCard.classList.add("hidden");
      finalizedCard.classList.remove("hidden");
      displayTossFinalizedMessage();
    }
  }
}

function flipCoin() {
  const coin = document.getElementById("tossCoin");
  const btn = document.getElementById("btnFlipCoin");
  
  if (!coin || !btn) return;
  btn.disabled = true;
  
  coin.classList.remove("spin-h", "spin-t");
  void coin.offsetWidth; 
  
  const randArray = new Uint32Array(1);
  window.crypto.getRandomValues(randArray);
  const isHeads = randArray[0] % 2 === 0;
  const finalResult = isHeads ? "Heads" : "Tails";
  
  const animClass = isHeads ? "spin-h" : "spin-t";
  coin.classList.add(animClass);
  
  setTimeout(() => {
    const callerTeam = document.getElementById("tossCaller").value;
    const choice = document.querySelector('input[name="tossChoice"]:checked').value;
    
    let winner = null;
    if (choice === finalResult) {
      winner = callerTeam; 
    } else {
      winner = callerTeam === "team1" ? "team2" : "team1"; 
    }
    
    state.toss.winner = winner;
    saveState();
    
    const resultCard = document.getElementById("tossResultCard");
    resultCard.classList.remove("hidden");
    
    document.getElementById("tossResultTitle").textContent = `${finalResult.toUpperCase()}!`;
    displayTossWinnerMessage();
  }, 2000);
}

function displayTossWinnerMessage() {
  const winnerName = state.toss.winner === "team1" ? "Team 1" : "Team 2";
  const captain = state.toss.winner === "team1" 
    ? (state.team1.find(p => p.isCaptain) || state.team1[0])
    : (state.team2.find(p => p.isCaptain) || state.team2[0]);
  
  const capName = captain ? captain.name : winnerName;
  document.getElementById("tossResultMessage").textContent = `🎉 ${capName} (${winnerName}) won the toss!`;
}

function setTossDecision(decision) {
  state.toss.decision = decision; 
  
  const winner = state.toss.winner; 
  const other = winner === "team1" ? "team2" : "team1";
  
  if (decision === "Batting") {
    state.battingTeam = winner;
    state.bowlingTeam = other;
  } else {
    state.battingTeam = other;
    state.bowlingTeam = winner;
  }
  
  saveState();
  
  document.getElementById("tossResultCard").classList.add("hidden");
  document.getElementById("tossFinalizedCard").classList.remove("hidden");
  displayTossFinalizedMessage();
}

function displayTossFinalizedMessage() {
  const winnerName = state.toss.winner === "team1" ? "Team 1" : "Team 2";
  const dec = state.toss.decision === "Batting" ? "Bat first" : "Bowl first";
  document.getElementById("finalTossText").textContent = `📢 ${winnerName} won the toss and elected to ${dec}`;
  document.getElementById("matchOversDisplay").textContent = state.maxOvers;
}

function changeOversInput(delta) {
  state.maxOvers = Math.max(1, Math.min(50, state.maxOvers + delta));
  saveState();
  document.getElementById("matchOversDisplay").textContent = state.maxOvers;
}

// ── INITIALIZING THE LIVE MATCH SCORECARD ──
function startMatchScorecard() {
  state.phase = 'innings1';
  state.innings = 1;
  state.playerStats = {};
  
  const initializeStats = (player) => {
    state.playerStats[player.id] = {
      name: player.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      outDesc: "not out",
      bowledBalls: 0,
      maidens: 0,
      concededRuns: 0,
      wickets: 0,
      currentOverRuns: 0 
    };
  };
  
  state.team1.forEach(initializeStats);
  state.team2.forEach(initializeStats);
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  commonPlayers.forEach(initializeStats);
  
  state.current = {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false
  };
  
  state.strikerId = null;
  state.nonStrikerId = null;
  state.bowlerId = null;
  state.lastBowlerId = null;
  
  saveState();
  switchTab("scoring-tab");
  showOpenersDialog();
}

// Openers selection dialog
function showOpenersDialog() {
  const backdrop = document.getElementById("openersModal");
  if (!backdrop) return;

  const batTeam = state.battingTeam === "team1" ? state.team1 : state.team2;
  const bowlTeam = state.bowlingTeam === "team1" ? state.team1 : state.team2;
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  
  const totalBatTeam = [...batTeam, ...commonPlayers];
  const totalBowlTeam = [...bowlTeam, ...commonPlayers];
  
  const strikerSel = document.getElementById("openerStriker");
  const nonStrikerSel = document.getElementById("openerNonStriker");

  const optionsHtml = totalBatTeam.map(p => `<option value="${p.id}">${p.name} (${p.role})</option>`).join("");
  strikerSel.innerHTML = optionsHtml;
  nonStrikerSel.innerHTML = optionsHtml;
  
  if (totalBatTeam.length > 1) {
    nonStrikerSel.selectedIndex = 1;
  }

  const bowlerSel = document.getElementById("newBowlerSelect");
  bowlerSel.innerHTML = totalBowlTeam.map(p => `<option value="${p.id}">${p.name} (${p.role})</option>`).join("");

  backdrop.classList.remove("hidden");
}

function submitOpeningBatsmen() {
  const strikerId = document.getElementById("openerStriker").value;
  const nonStrikerId = document.getElementById("openerNonStriker").value;

  if (strikerId === nonStrikerId) {
    alert("Please select different players for Striker and Non-Striker!");
    return;
  }

  state.strikerId = strikerId;
  state.nonStrikerId = nonStrikerId;
  
  document.getElementById("openersModal").classList.add("hidden");
  
  const bowlerModal = document.getElementById("bowlerModal");
  bowlerModal.classList.remove("hidden");
  
  saveState();
  renderAll();
}

function submitBowlerChange() {
  const newBowlerId = document.getElementById("newBowlerSelect").value;
  state.bowlerId = newBowlerId;
  
  if (state.playerStats[newBowlerId]) {
    state.playerStats[newBowlerId].currentOverRuns = 0;
  }

  document.getElementById("bowlerModal").classList.add("hidden");
  saveState();
  renderAll();
}


// ── CORE SCORE RECORDING LOGIC ──
function recordBall(type) {
  if (state.phase !== 'innings1' && state.phase !== 'innings2') return;
  if (state.current.nb_pending) return;
  
  if (!state.strikerId || !state.nonStrikerId || !state.bowlerId) {
    alert("Make sure both batsmen and a bowler are selected before scoring!");
    return;
  }

  const cur = state.current;
  
  const snapshot = {
    score: cur.score,
    wickets: cur.wickets,
    balls: cur.balls,
    extras: cur.extras,
    nb_pending: cur.nb_pending,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.bowlerId,
    lastBowlerId: state.lastBowlerId,
    playerStats: JSON.parse(JSON.stringify(state.playerStats)),
    ball_type: type
  };
  
  if (type === "NB") {
    cur.score += 1;
    cur.extras += 1;
    cur.nb_pending = true;
    
    state.playerStats[state.bowlerId].concededRuns += 1;
    state.playerStats[state.bowlerId].currentOverRuns += 1;
  } 
  else if (type === "WD") {
    cur.score += 1;
    cur.extras += 1;
    
    state.playerStats[state.bowlerId].concededRuns += 1;
    state.playerStats[state.bowlerId].currentOverRuns += 1;
  } 
  else if (type === "W") {
    cur.wickets += 1;
    cur.balls += 1;
    
    state.playerStats[state.bowlerId].bowledBalls += 1;
    state.playerStats[state.strikerId].balls += 1;
    
    cur.history.push(snapshot);
    saveState();
    
    showWicketDismissalDialog(state.strikerId);
    return;
  } 
  else {
    const run = parseInt(type);
    cur.score += run;
    cur.balls += 1;
    
    state.playerStats[state.strikerId].runs += run;
    state.playerStats[state.strikerId].balls += 1;
    if (run === 4) state.playerStats[state.strikerId].fours += 1;
    if (run === 6) state.playerStats[state.strikerId].sixes += 1;
    
    state.playerStats[state.bowlerId].bowledBalls += 1;
    state.playerStats[state.bowlerId].concededRuns += run;
    state.playerStats[state.bowlerId].currentOverRuns += run;
    
    if (run === 1 || run === 3) {
      swapStrike();
    }
  }

  cur.history.push(snapshot);
  saveState();
  
  animateScoreBump("liveRuns");
  checkMatchProgress();
}

function animateScoreBump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("bump-runs");
  void el.offsetWidth;
  el.classList.add("bump-runs");
}

function animateWicketsBump() {
  const el = document.getElementById("liveWickets");
  if (!el) return;
  el.classList.remove("bump-wickets");
  void el.offsetWidth;
  el.classList.add("bump-wickets");
}

function recordNbResult(runs) {
  const cur = state.current;
  
  const snapshot = {
    score: cur.score,
    wickets: cur.wickets,
    balls: cur.balls,
    extras: cur.extras,
    nb_pending: cur.nb_pending,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.bowlerId,
    lastBowlerId: state.lastBowlerId,
    playerStats: JSON.parse(JSON.stringify(state.playerStats)),
    ball_type: `NB+${runs}`
  };
  
  cur.score += runs;
  state.playerStats[state.strikerId].runs += runs;
  state.playerStats[state.strikerId].balls += 1;
  if (runs === 4) state.playerStats[state.strikerId].fours += 1;
  if (runs === 6) state.playerStats[state.strikerId].sixes += 1;
  
  state.playerStats[state.bowlerId].concededRuns += runs;
  state.playerStats[state.bowlerId].currentOverRuns += runs;
  
  cur.nb_pending = false;
  
  if (runs === 1 || runs === 3) {
    swapStrike();
  }
  
  cur.history.push(snapshot);
  saveState();
  
  animateScoreBump("liveRuns");
  checkMatchProgress();
}

function recordNbWicket() {
  const cur = state.current;
  
  const snapshot = {
    score: cur.score,
    wickets: cur.wickets,
    balls: cur.balls,
    extras: cur.extras,
    nb_pending: cur.nb_pending,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.bowlerId,
    lastBowlerId: state.lastBowlerId,
    playerStats: JSON.parse(JSON.stringify(state.playerStats)),
    ball_type: "NB+W"
  };
  
  cur.wickets += 1;
  state.playerStats[state.strikerId].balls += 1;
  cur.nb_pending = false;
  
  cur.history.push(snapshot);
  saveState();
  
  showWicketDismissalDialog(state.strikerId, true);
}

// ── WICKET DISMISSAL DIALOG (MODAL FLOW) ──
function showWicketDismissalDialog(outPlayerId, isRunOutOnNb = false) {
  const backdrop = document.getElementById("wicketModal");
  const modalDesc = document.getElementById("wicketModalDesc");
  const selectNew = document.getElementById("newBatsmanSelect");
  const dismissalSelect = document.getElementById("dismissalType");
  
  if (!backdrop || !selectNew) return;

  const playerOut = state.playerStats[outPlayerId];
  modalDesc.textContent = `${playerOut ? playerOut.name : 'Batsman'} is out. Select dismissal mode and next batsman.`;

  if (isRunOutOnNb) {
    dismissalSelect.value = "Run Out";
    dismissalSelect.disabled = true;
  } else {
    dismissalSelect.value = "Bowled";
    dismissalSelect.disabled = false;
  }

  const batTeam = state.battingTeam === "team1" ? state.team1 : state.team2;
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  const totalBatTeam = [...batTeam, ...commonPlayers];
  
  const yetToBat = totalBatTeam.filter(p => {
    const stats = state.playerStats[p.id];
    return p.id !== state.strikerId && p.id !== state.nonStrikerId && (!stats || !stats.out);
  });

  if (yetToBat.length === 0) {
    selectNew.innerHTML = `<option value="none">— No batsmen left (All Out) —</option>`;
  } else {
    selectNew.innerHTML = yetToBat.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  backdrop.setAttribute("data-out-player-id", outPlayerId);
  backdrop.classList.remove("hidden");
  animateWicketsBump();
}

function submitWicketDismissal() {
  const backdrop = document.getElementById("wicketModal");
  const outPlayerId = backdrop.getAttribute("data-out-player-id");
  const nextPlayerId = document.getElementById("newBatsmanSelect").value;
  const dismissal = document.getElementById("dismissalType").value;

  if (!outPlayerId) return;

  if (state.playerStats[outPlayerId]) {
    state.playerStats[outPlayerId].out = true;
    state.playerStats[outPlayerId].outDesc = dismissal;
  }

  if (["Bowled", "Caught", "LBW", "Stumped"].includes(dismissal)) {
    if (state.playerStats[state.bowlerId]) {
      state.playerStats[state.bowlerId].wickets += 1;
    }
  }

  if (nextPlayerId === "none" || !nextPlayerId) {
    state.strikerId = null;
  } else {
    if (state.strikerId === outPlayerId) {
      state.strikerId = nextPlayerId;
    } else {
      state.nonStrikerId = nextPlayerId;
    }
  }

  backdrop.classList.add("hidden");
  saveState();
  
  checkMatchProgress();
}


// ── TIME TRAVEL UNDO SYSTEM ──
function undoLastBall() {
  const history = state.current.history;
  if (history.length === 0) return;

  const prev = history.pop();
  
  state.current.score = prev.score;
  state.current.wickets = prev.wickets;
  state.current.balls = prev.balls;
  state.current.extras = prev.extras;
  state.current.nb_pending = prev.nb_pending;
  
  state.strikerId = prev.strikerId;
  state.nonStrikerId = prev.nonStrikerId;
  state.bowlerId = prev.bowlerId;
  state.lastBowlerId = prev.lastBowlerId;
  
  state.playerStats = prev.playerStats;

  saveState();
  renderAll();
  
  document.getElementById("wicketModal").classList.add("hidden");
  document.getElementById("bowlerModal").classList.add("hidden");
}

function swapStrike() {
  const temp = state.strikerId;
  state.strikerId = state.nonStrikerId;
  state.nonStrikerId = temp;
}

function swapStrikeManual() {
  swapStrike();
  saveState();
  renderAll();
}


// ── MATCH PROGRESS STATE CHECK ──
function checkMatchProgress() {
  const cur = state.current;
  const maxBalls = state.maxOvers * 6;
  const batTeam = state.battingTeam === "team1" ? state.team1 : state.team2;
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  const totalBatTeam = [...batTeam, ...commonPlayers];
  
  let inningsFinished = false;
  let reason = "";

  const maxPossibleWickets = totalBatTeam.length - 1;
  if (cur.wickets >= Math.min(10, maxPossibleWickets)) {
    inningsFinished = true;
    reason = "All Out!";
  }
  else if (cur.balls >= maxBalls) {
    inningsFinished = true;
    reason = "Overs Completed.";
  }
  else if (state.innings === 2 && state.innings1Score !== null && cur.score > state.innings1Score) {
    inningsFinished = true;
    reason = "Target Chased!";
  }

  if (inningsFinished) {
    if (state.innings === 1) {
      state.innings1Score = cur.score;
      state.innings1Wickets = cur.wickets;
      state.innings1Balls = cur.balls;
      state.innings1Stats = JSON.parse(JSON.stringify(state.playerStats));
      
      saveState();
      showInningsOverOverlay(false, reason);
    } else {
      state.phase = 'completed';
      saveState();
      showInningsOverOverlay(true, reason);
    }
  } 
  else {
    const isOverEnd = cur.balls > 0 && cur.balls % 6 === 0 && cur.history.length > 0;
    const lastBallSnapshot = cur.history[cur.history.length - 1];
    
    const legalTypes = ["0", "1", "2", "3", "4", "6", "W"];
    const wasLegal = lastBallSnapshot && legalTypes.includes(lastBallSnapshot.ball_type);
    const ballsCountChanged = lastBallSnapshot && (cur.balls !== lastBallSnapshot.balls);

    if (isOverEnd && wasLegal && ballsCountChanged) {
      if (state.playerStats[state.bowlerId]) {
        const stats = state.playerStats[state.bowlerId];
        if (stats.currentOverRuns === 0) {
          stats.maidens += 1;
        }
      }
      
      state.lastBowlerId = state.bowlerId;
      state.bowlerId = null; 
      
      swapStrike();
      saveState();
      showBowlerSelectorDialog();
    }
  }

  renderAll();
}

function showBowlerSelectorDialog() {
  const bowlTeam = state.bowlingTeam === "team1" ? state.team1 : state.team2;
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  const totalBowlTeam = [...bowlTeam, ...commonPlayers];
  const selectNew = document.getElementById("newBowlerSelect");
  
  if (!selectNew) return;

  const availableBowlers = totalBowlTeam.filter(p => p.id !== state.lastBowlerId);
  
  if (availableBowlers.length === 0) {
    selectNew.innerHTML = totalBowlTeam.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  } else {
    selectNew.innerHTML = availableBowlers.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  document.getElementById("bowlerModal").classList.remove("hidden");
}

function showInningsOverOverlay(isMatchComplete, reason) {
  const modal = document.getElementById("inningsOverModal");
  const title = document.getElementById("inningsOverTitle");
  const desc = document.getElementById("inningsOverDesc");
  const emoji = document.getElementById("inningsOverEmoji");
  const btnNext = document.getElementById("btnTransitionInnings");
  const btnRestart = document.getElementById("btnRestartFromOverlay");

  if (!modal) return;

  if (!isMatchComplete) {
    emoji.textContent = "🏏";
    title.textContent = `1st Innings Over! (${reason})`;
    
    const teamName = state.battingTeam === "team1" ? "Team 1" : "Team 2";
    const overText = computeOvers(state.current.balls);
    desc.textContent = `${teamName} finished with ${state.current.score}/${state.current.wickets} in ${overText} overs. 
                        Target for 2nd innings: ${state.current.score + 1} runs.`;
    
    btnNext.classList.remove("hidden");
    btnRestart.classList.add("hidden");
    const btnNextMatch = document.getElementById("btnNextMatch");
    if (btnNextMatch) btnNextMatch.classList.add("hidden");
  } else {
    emoji.textContent = "🏆";
    title.textContent = `Match Finished!`;
    
    const score1 = state.innings1Score;
    const score2 = state.current.score;
    const team1Name = state.battingTeam === "team1" ? "Team 2" : "Team 1"; 
    const team2Name = state.battingTeam === "team1" ? "Team 1" : "Team 2"; 
    
    let winnerMsg = "";
    if (score2 > score1) {
      const batTeam = state.battingTeam === "team1" ? state.team1 : state.team2;
      const commonPlayers = state.players.filter(p => p.isCommon && p.available);
      const batTeamSize = batTeam.length + commonPlayers.length;
      const wicketsLeft = batTeamSize - 1 - state.current.wickets;
      winnerMsg = `${team2Name} won by ${wicketsLeft} wickets! 🎉`;
    } else if (score1 > score2) {
      const margin = score1 - score2;
      winnerMsg = `${team1Name} won by ${margin} runs! 🏏`;
    } else {
      winnerMsg = "It's a TIE match! 🤝";
    }

    desc.innerHTML = `<strong>${winnerMsg}</strong><br><br>
                      ${team1Name}: ${score1}/${state.innings1Wickets}<br>
                      ${team2Name}: ${score2}/${state.current.wickets}`;

    btnNext.classList.add("hidden");
    btnRestart.classList.remove("hidden");
    const btnNextMatch = document.getElementById("btnNextMatch");
    if (btnNextMatch) btnNextMatch.classList.remove("hidden");
  }

  modal.classList.remove("hidden");
}

function transitionToSecondInnings() {
  document.getElementById("inningsOverModal").classList.add("hidden");
  
  state.phase = 'innings2';
  state.innings = 2;
  
  const prevBat = state.battingTeam;
  state.battingTeam = state.bowlingTeam;
  state.bowlingTeam = prevBat;
  
  state.current = {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false
  };
  
  state.strikerId = null;
  state.nonStrikerId = null;
  state.bowlerId = null;
  state.lastBowlerId = null;
  
  saveState();
  showOpenersDialog();
}

function resetMatchData() {
  if (!confirm("Are you sure you want to reset the match? All scorecard history will be deleted.")) return;
  
  document.getElementById("inningsOverModal").classList.add("hidden");
  
  resetToDefaultState();
  switchTab("squads-tab");
}

function playNextMatchSeries() {
  if (!confirm("Play next match? The winner of this match will bat first, keeping the same teams. You can edit the teams before starting!")) return;

  const score1 = state.innings1Score || 0;
  const score2 = state.current.score || 0;
  const teamBattedSecond = state.battingTeam; // 'team1' or 'team2'
  const teamBattedFirst = state.battingTeam === "team1" ? "team2" : "team1";

  let matchWinner = null;
  if (score2 > score1) {
    matchWinner = teamBattedSecond;
  } else if (score1 > score2) {
    matchWinner = teamBattedFirst;
  } else {
    matchWinner = teamBattedFirst; // default
  }

  // Record completed match history
  if (!state.completedMatches) state.completedMatches = [];
  const matchNum = state.completedMatches.length + 1;
  const completedMatch = {
    matchId: matchNum,
    matchName: `Match ${matchNum}`,
    innings1Score: state.innings1Score,
    innings1Wickets: state.innings1Wickets,
    innings1Balls: state.innings1Balls,
    innings2Score: state.current.score,
    innings2Wickets: state.current.wickets,
    innings2Balls: state.current.balls,
    playerStats: JSON.parse(JSON.stringify(state.playerStats))
  };
  state.completedMatches.push(completedMatch);

  // Preserve teams, set the next batting winner, change phase to setup to edit squads
  state.nextMatchBattingWinner = matchWinner;
  state.phase = 'setup';

  document.getElementById("inningsOverModal").classList.add("hidden");
  saveState();
  switchTab("squads-tab");
  renderAll();
}

function startNextMatchSeries() {
  if (state.team1.length === 0 || state.team2.length === 0) {
    alert("Please assign at least 1 player to both Team 1 and Team 2!");
    return;
  }
  
  const winner = state.nextMatchBattingWinner || "team1";
  state.battingTeam = winner;
  state.bowlingTeam = winner === "team1" ? "team2" : "team1";
  state.phase = 'innings1';
  state.innings = 1;

  state.innings1Score = null;
  state.innings1Wickets = null;
  state.innings1Balls = null;
  state.innings1Stats = null;
  
  state.strikerId = null;
  state.nonStrikerId = null;
  state.bowlerId = null;
  state.lastBowlerId = null;

  state.current = {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false
  };

  // Reset player stats for the new match
  state.playerStats = {};
  const initializeStats = (player) => {
    state.playerStats[player.id] = {
      name: player.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      outDesc: "not out",
      bowledBalls: 0,
      maidens: 0,
      concededRuns: 0,
      wickets: 0,
      currentOverRuns: 0
    };
  };
  state.team1.forEach(initializeStats);
  state.team2.forEach(initializeStats);
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  commonPlayers.forEach(initializeStats);

  state.nextMatchBattingWinner = null; // Clear the series pending winner state
  saveState();
  switchTab("scoring-tab");
  showOpenersDialog();
}

function restartCurrentMatch() {
  if (!confirm("Are you sure you want to restart this match? All scores and stats for the current match will be cleared, but your teams and toss choice will be kept.")) return;

  const winner = state.toss.winner; // 'team1' or 'team2'
  const decision = state.toss.decision; // 'Batting' or 'Bowling'
  if (decision === 'Batting') {
    state.battingTeam = winner;
    state.bowlingTeam = winner === 'team1' ? 'team2' : 'team1';
  } else {
    state.bowlingTeam = winner;
    state.battingTeam = winner === 'team1' ? 'team2' : 'team1';
  }

  state.phase = 'innings1';
  state.innings = 1;

  state.innings1Score = null;
  state.innings1Wickets = null;
  state.innings1Balls = null;
  state.innings1Stats = null;
  
  state.strikerId = null;
  state.nonStrikerId = null;
  state.bowlerId = null;
  state.lastBowlerId = null;

  state.current = {
    score: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    history: [],
    nb_pending: false
  };

  // Reset player stats for the new match
  state.playerStats = {};
  const initializeStats = (player) => {
    state.playerStats[player.id] = {
      name: player.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      outDesc: "not out",
      bowledBalls: 0,
      maidens: 0,
      concededRuns: 0,
      wickets: 0,
      currentOverRuns: 0
    };
  };
  state.team1.forEach(initializeStats);
  state.team2.forEach(initializeStats);
  const commonPlayers = state.players.filter(p => p.isCommon && p.available);
  commonPlayers.forEach(initializeStats);

  document.getElementById("inningsOverModal").classList.add("hidden");
  saveState();
  switchTab("scoring-tab");
  showOpenersDialog();
}


// ── VIEW UPDATING / RENDERING SYSTEMS ──
function renderAll() {
  const phaseText = {
    'setup': 'Setup Phase 👥',
    'toss': 'Toss Phase 🪙',
    'innings1': 'Innings 1 🏏',
    'innings2': 'Innings 2 🥎',
    'completed': 'Match Complete 🏆'
  };
  document.getElementById("globalMatchPhase").textContent = phaseText[state.phase] || state.phase;

  const navToss = document.getElementById("navTossTab");
  const navScore = document.getElementById("navScoringTab");
  const navStats = document.getElementById("navStatsTab");
  
  if (state.team1.length > 0) navToss.removeAttribute("disabled");
  else navToss.setAttribute("disabled", "true");
  
  if (state.phase !== 'setup' && state.phase !== 'toss') {
    navScore.removeAttribute("disabled");
    navStats.removeAttribute("disabled");
  } else {
    navScore.setAttribute("disabled", "true");
    navStats.setAttribute("disabled", "true");
  }

  renderPlayerPool();
  renderGeneratedTeams();
  renderTossTab();
  renderScorecard();
  renderStatsTab();
}

function renderScorecard() {
  if (state.phase === 'setup' || state.phase === 'toss') return;

  const cur = state.current;

  const team1Name = state.battingTeam === "team1" ? "Team 1" : "Team 2";
  document.getElementById("liveBattingTeam").textContent = team1Name;
  document.getElementById("liveInningsBadge").textContent = state.innings === 1 ? "1st Innings" : "2nd Innings";
  if (state.innings === 2) {
    document.getElementById("liveInningsBadge").classList.add("second");
  } else {
    document.getElementById("liveInningsBadge").classList.remove("second");
  }

  document.getElementById("liveRuns").textContent = cur.score;
  document.getElementById("liveWickets").textContent = cur.wickets;
  
  const oversStr = computeOvers(cur.balls);
  document.getElementById("liveOvers").textContent = oversStr;
  document.getElementById("liveMaxOvers").textContent = state.maxOvers;

  const runRate = computeRunRate(cur.score, cur.balls);
  document.getElementById("liveRunRate").textContent = runRate.toFixed(2);
  document.getElementById("liveExtras").textContent = cur.extras;

  const targetCard = document.getElementById("targetCardWrapper");
  if (state.innings === 2 && state.innings1Score !== null) {
    targetCard.classList.remove("hidden");
    const target = state.innings1Score + 1;
    document.getElementById("liveTarget").textContent = target;
    
    const runsNeeded = target - cur.score;
    document.getElementById("liveTargetNeed").textContent = runsNeeded > 0 ? `${runsNeeded} runs` : "0 runs";
    
    const ballsRemaining = (state.maxOvers * 6) - cur.balls;
    if (ballsRemaining > 0 && runsNeeded > 0) {
      const rrr = (runsNeeded / (ballsRemaining / 6));
      document.getElementById("liveRrr").textContent = rrr.toFixed(2);
    } else {
      document.getElementById("liveRrr").textContent = runsNeeded > 0 ? "∞" : "0.00";
    }
  } else {
    targetCard.classList.add("hidden");
  }

  const maxBalls = state.maxOvers * 6;
  const progressPct = maxBalls > 0 ? Math.min(100, (cur.balls / maxBalls) * 100) : 0;
  document.getElementById("liveOversProgressBar").style.width = `${progressPct}%`;

  renderOverDotsList();
  renderActiveBatsmenSection();
  renderActiveBowlerSection();

  const nbPanel = document.getElementById("scoringNbPanel");
  const controlsGrid = document.getElementById("ballInputControls");
  if (cur.nb_pending) {
    nbPanel.classList.remove("hidden");
    if (controlsGrid) controlsGrid.style.opacity = "0.3";
  } else {
    nbPanel.classList.add("hidden");
    if (controlsGrid) controlsGrid.style.opacity = "1.0";
  }

  renderRecentLogsList();
}

function renderOverDotsList() {
  const container = document.getElementById("liveOverDots");
  if (!container) return;
  container.innerHTML = "";

  const cur = state.current;
  const legalTypes = ["0", "1", "2", "3", "4", "6", "W"];
  
  const totalLegalBalls = cur.history.filter(b => legalTypes.includes(b.ball_type));
  const ballsInCurrentOver = cur.balls % 6;
  
  const startIdx = totalLegalBalls.length - ballsInCurrentOver;
  const currentOverBalls = totalLegalBalls.slice(Math.max(0, startIdx));

  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    
    if (i < currentOverBalls.length) {
      const b = currentOverBalls[i];
      const type = b.ball_type;
      
      dot.textContent = type === "0" ? "•" : type;
      
      if (type === "4") dot.classList.add("score-4");
      else if (type === "6") dot.classList.add("score-6");
      else if (type === "W") dot.classList.add("score-w");
      else dot.classList.add("score-runs");
    } else {
      dot.classList.add("dot-empty");
    }
    
    container.appendChild(dot);
  }
}

function renderActiveBatsmenSection() {
  const s1 = state.playerStats[state.strikerId];
  const s2 = state.playerStats[state.nonStrikerId];

  if (s1) {
    document.getElementById("batsman1Name").textContent = s1.name;
    document.getElementById("batsman1Runs").textContent = s1.runs;
    document.getElementById("batsman1Balls").textContent = `(${s1.balls})`;
    document.getElementById("batsman1Fours").textContent = s1.fours;
    document.getElementById("batsman1Sixes").textContent = s1.sixes;
    
    const sr = s1.balls > 0 ? (s1.runs / s1.balls) * 100 : 0.0;
    document.getElementById("batsman1SR").textContent = sr.toFixed(1);
    document.getElementById("strike1").textContent = "🏏";
    document.getElementById("batsman1Row").classList.add("highlight");
  } else {
    document.getElementById("batsman1Name").textContent = "— Select Batter —";
    document.getElementById("batsman1Runs").textContent = "0";
    document.getElementById("batsman1Balls").textContent = "(0)";
    document.getElementById("strike1").textContent = "";
  }

  if (s2) {
    document.getElementById("batsman2Name").textContent = s2.name;
    document.getElementById("batsman2Runs").textContent = s2.runs;
    document.getElementById("batsman2Balls").textContent = `(${s2.balls})`;
    document.getElementById("batsman2Fours").textContent = s2.fours;
    document.getElementById("batsman2Sixes").textContent = s2.sixes;
    
    const sr = s2.balls > 0 ? (s2.runs / s2.balls) * 100 : 0.0;
    document.getElementById("batsman2SR").textContent = sr.toFixed(1);
    document.getElementById("strike2").textContent = "";
    document.getElementById("batsman2Row").classList.remove("highlight");
  } else {
    document.getElementById("batsman2Name").textContent = "— Select Batter —";
    document.getElementById("batsman2Runs").textContent = "0";
    document.getElementById("batsman2Balls").textContent = "(0)";
    document.getElementById("strike2").textContent = "";
  }
}

function setStrike(batsmanNum) {
  if (batsmanNum === 2 && state.nonStrikerId) {
    swapStrikeManual();
  }
}

function renderActiveBowlerSection() {
  const b = state.playerStats[state.bowlerId];
  
  if (b) {
    document.getElementById("activeBowlerName").textContent = b.name;
    
    const overs = computeOvers(b.bowledBalls);
    document.getElementById("activeBowlerFigures").textContent = `${b.wickets} - ${b.concededRuns} (${overs})`;
    
    document.getElementById("activeBowlerOvers").textContent = overs;
    document.getElementById("activeBowlerMaidens").textContent = b.maidens;
    document.getElementById("activeBowlerRuns").textContent = b.concededRuns;
    document.getElementById("activeBowlerWickets").textContent = b.wickets;
    
    const econ = b.bowledBalls > 0 ? (b.concededRuns / (b.bowledBalls / 6)) : 0.0;
    document.getElementById("activeBowlerEcon").textContent = econ.toFixed(2);
  } else {
    document.getElementById("activeBowlerName").textContent = "— Choose Bowler —";
    document.getElementById("activeBowlerFigures").textContent = "0 - 0 (0.0)";
    
    document.getElementById("activeBowlerOvers").textContent = "0.0";
    document.getElementById("activeBowlerMaidens").textContent = "0";
    document.getElementById("activeBowlerRuns").textContent = "0";
    document.getElementById("activeBowlerWickets").textContent = "0";
    document.getElementById("activeBowlerEcon").textContent = "0.00";
    
    if (state.phase !== 'completed' && (state.phase === 'innings1' || state.phase === 'innings2') && state.strikerId) {
      showBowlerSelectorDialog();
    }
  }
}

function renderRecentLogsList() {
  const container = document.getElementById("scoringHistoryList");
  if (!container) return;

  const history = state.current.history || [];
  if (history.length === 0) {
    container.innerHTML = `<p class="text-muted text-center" style="padding: 1rem;">No balls recorded yet.</p>`;
    return;
  }

  const logs = [...history].reverse().slice(0, 8);
  
  const labelMap = {
    "0": "Dot ball", "1": "1 Run", "2": "2 Runs", "3": "3 Runs",
    "4": "FOUR! 🏏", "6": "SIX! 🚀", "WD": "Wide extra", "NB": "No Ball extra",
    "W": "WICKET 🔴", "NB+0": "NB + 0 Runs", "NB+1": "NB + 1 Run", 
    "NB+2": "NB + 2 Runs", "NB+3": "NB + 3 Runs", "NB+4": "NB + FOUR 🏏", 
    "NB+6": "NB + SIX 🚀", "NB+W": "NB + Run Out Wicket"
  };

  container.innerHTML = logs.map(b => {
    const ballNumText = computeOvers(b.balls);
    const label = labelMap[b.ball_type] || b.ball_type;
    const scoreAfter = `${b.score}/${b.wickets}`;
    
    let spanClass = "hist-runs";
    if (b.ball_type === "4") spanClass = "hist-4";
    else if (b.ball_type === "6") spanClass = "hist-6";
    else if (b.ball_type === "W" || b.ball_type === "NB+W") spanClass = "hist-w";
    else if (b.ball_type === "WD") spanClass = "hist-wd";
    else if (b.ball_type === "NB" || b.ball_type.startsWith("NB+")) spanClass = "hist-nb";
    
    return `
      <div class="history-item">
        <div>
          <span class="history-ball-label">[${ballNumText}]</span>
          <span class="${spanClass}" style="margin-left: 0.5rem; font-weight: bold;">${label}</span>
        </div>
        <span class="history-score-after">${scoreAfter}</span>
      </div>
    `;
  }).join("");
}

// ── COMPREHENSIVE MATCH STATS RENDERING (TAB 4) ──
function renderStatsTab() {
  const statusText = document.getElementById("statsMatchStatusText");
  const tablesContainer = document.getElementById("statsScorecardTables");

  if (!statusText || !tablesContainer) return;

  // Populate series cumulative leaderboard
  renderCumulativeLeaderboard();

  if (state.phase === 'setup' || state.phase === 'toss') {
    statusText.textContent = "Match scorecard has not started yet. Complete setup and toss.";
    tablesContainer.classList.add("hidden");
    return;
  }

  statusText.textContent = `Match Phase: ${state.phase.toUpperCase()}.`;
  tablesContainer.classList.remove("hidden");

  const t1Name = state.innings === 1 
    ? (state.battingTeam === "team1" ? "Team 1" : "Team 2")
    : (state.battingTeam === "team1" ? "Team 2" : "Team 1"); 
    
  const t2Name = state.innings === 1
    ? (state.battingTeam === "team1" ? "Team 2" : "Team 1")
    : (state.battingTeam === "team1" ? "Team 1" : "Team 2"); 

  document.getElementById("statsInnings1Header").textContent = `1st Innings: ${t1Name}`;
  const inn1Stats = state.innings1Stats || state.playerStats;
  const batTeam1 = state.innings === 1 
    ? (state.battingTeam === "team1" ? state.team1 : state.team2)
    : (state.bowlingTeam === "team1" ? state.team1 : state.team2);
    
  const bowlTeam1 = state.innings === 1
    ? (state.bowlingTeam === "team1" ? state.team1 : state.team2)
    : (state.battingTeam === "team1" ? state.team1 : state.team2);

  populateBattingTable("statsInnings1BattingBody", batTeam1, inn1Stats);
  
  const score1 = state.innings1Score !== null ? state.innings1Score : state.current.score;
  const wickets1 = state.innings1Wickets !== null ? state.innings1Wickets : state.current.wickets;
  const balls1 = state.innings1Balls !== null ? state.innings1Balls : state.current.balls;
  document.getElementById("statsInnings1BattingTotal").textContent = `Total: ${score1}/${wickets1} (${computeOvers(balls1)} Overs)`;

  populateBowlingTable("statsInnings1BowlingBody", bowlTeam1, inn1Stats);

  const statsInnings2Wrapper = document.getElementById("statsInnings2Wrapper");
  if (state.innings === 2 || state.phase === 'completed') {
    statsInnings2Wrapper.classList.remove("hidden");
    document.getElementById("statsInnings2Header").textContent = `2nd Innings: ${t2Name}`;
    
    const batTeam2 = state.battingTeam === "team1" ? state.team1 : state.team2;
    const bowlTeam2 = state.bowlingTeam === "team1" ? state.team1 : state.team2;
    
    populateBattingTable("statsInnings2BattingBody", batTeam2, state.playerStats);
    document.getElementById("statsInnings2BattingTotal").textContent = `Total: ${state.current.score}/${state.current.wickets} (${computeOvers(state.current.balls)} Overs)`;
    populateBowlingTable("statsInnings2BowlingBody", bowlTeam2, state.playerStats);
  } else {
    statsInnings2Wrapper.classList.add("hidden");
  }
}

function populateBattingTable(elementId, squad, statsMap) {
  const tbody = document.getElementById(elementId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const sortedSquad = [...squad].sort((x, y) => {
    const sX = statsMap[x.id] || { balls: 0, out: false };
    const sY = statsMap[y.id] || { balls: 0, out: false };
    
    const didBatX = sX.balls > 0 || sX.out;
    const didBatY = sY.balls > 0 || sY.out;
    if (didBatX && !didBatY) return -1;
    if (!didBatX && didBatY) return 1;
    return 0;
  });

  sortedSquad.forEach(p => {
    const s = statsMap[p.id];
    if (!s) return;
    
    const tr = document.createElement("tr");
    
    let statusText = "yet to bat";
    if (s.out) statusText = `out (${s.outDesc})`;
    else if (p.id === state.strikerId || p.id === state.nonStrikerId) {
      if (state.phase !== 'completed' && state.innings === (elementId.includes("Innings1") ? 1 : 2)) {
        statusText = "batting*";
      }
    } else if (s.balls > 0) {
      statusText = "not out";
    }

    const sr = s.balls > 0 ? (s.runs / s.balls) * 100 : 0.0;

    const isCurrentInnings = state.phase !== 'completed' && state.innings === (elementId.includes("Innings1") ? 1 : 2);
    const isActiveBatsman = isCurrentInnings && (p.id === state.strikerId || p.id === state.nonStrikerId);
    if (isActiveBatsman) {
      tr.style.background = "rgba(16, 185, 129, 0.12)";
    }

    tr.innerHTML = `
      <td>
        <strong>${p.name}</strong> 
        ${p.isCaptain ? '<span style="font-size:0.7rem;font-weight:700;color:var(--accent-yellow);">(c)</span>' : ''} 
        <span style="font-size:0.8rem; margin-left:0.25rem;" title="${p.role}">${roleIcon(p.role)}</span>
      </td>
      <td class="text-muted" style="font-size:0.75rem;">${statusText}</td>
      <td class="text-right">${s.runs}</td>
      <td class="text-right">${s.balls}</td>
      <td class="text-right">${s.fours}</td>
      <td class="text-right">${s.sixes}</td>
      <td class="text-right text-muted">${sr.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateBowlingTable(elementId, squad, statsMap) {
  const tbody = document.getElementById(elementId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const bowlers = squad.filter(p => {
    const s = statsMap[p.id];
    return s && s.bowledBalls > 0;
  });

  if (bowlers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding:1rem;">No bowlers have bowled yet.</td></tr>`;
    return;
  }

  bowlers.forEach(p => {
    const s = statsMap[p.id];
    const tr = document.createElement("tr");

    const econ = s.bowledBalls > 0 ? (s.concededRuns / (s.bowledBalls / 6)) : 0.0;
    const overs = computeOvers(s.bowledBalls);

    const isCurrentInnings = state.phase !== 'completed' && state.innings === (elementId.includes("Innings1") ? 1 : 2);
    const isActiveBowler = isCurrentInnings && p.id === state.bowlerId;
    if (isActiveBowler) {
      tr.style.background = "rgba(59, 130, 246, 0.12)";
    }

    tr.innerHTML = `
      <td>
        <strong>${p.name}</strong> 
        <span style="font-size:0.8rem; margin-left:0.25rem;" title="${p.role}">${roleIcon(p.role)}</span>
      </td>
      <td class="text-right">${overs}</td>
      <td class="text-right">${s.maidens}</td>
      <td class="text-right">${s.concededRuns}</td>
      <td class="text-right text-success">${s.wickets}</td>
      <td class="text-right text-muted">${econ.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── EXPORT STATE UTILITY ──
function exportStateToJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `cricscore_match_export_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// ── MATHEMATICAL HELPERS ──
function computeOvers(balls) {
  const overs = Math.floor(balls / 6);
  const remainder = balls % 6;
  return `${overs}.${remainder}`;
}

function computeRunRate(score, balls) {
  if (balls === 0) return 0.0;
  return score / (balls / 6);
}

// ── CUMULATIVE SERIES LEADERBOARD IMPLEMENTATION ──
function getPlayerCumulativeStats(playerId) {
  const player = state.players.find(x => x.id === playerId);
  if (!player) return null;

  const cumulative = {
    name: player.name,
    role: player.role,
    isCaptain: player.isCaptain,
    matches: [],
    totals: {
      batRuns: 0,
      batBalls: 0,
      batFours: 0,
      batSixes: 0,
      batOuts: 0,
      bowlBalls: 0,
      bowlRuns: 0,
      bowlWickets: 0,
      bowlMaidens: 0
    }
  };

  const completed = state.completedMatches || [];
  completed.forEach(m => {
    const stats = m.playerStats ? m.playerStats[playerId] : null;
    if (stats) {
      const hasBatted = stats.balls > 0 || stats.out;
      const hasBowled = stats.bowledBalls > 0;
      
      if (hasBatted || hasBowled) {
        cumulative.matches.push({
          matchName: m.matchName,
          batting: hasBatted ? {
            runs: stats.runs,
            balls: stats.balls,
            fours: stats.fours,
            sixes: stats.sixes,
            out: stats.out,
            outDesc: stats.outDesc
          } : null,
          bowling: hasBowled ? {
            overs: computeOvers(stats.bowledBalls),
            runs: stats.concededRuns,
            wickets: stats.wickets,
            bowledBalls: stats.bowledBalls,
            maidens: stats.maidens,
            econ: stats.bowledBalls > 0 ? (stats.concededRuns / (stats.bowledBalls / 6)) : 0.0
          } : null
        });

        if (hasBatted) {
          cumulative.totals.batRuns += stats.runs;
          cumulative.totals.batBalls += stats.balls;
          cumulative.totals.batFours += stats.fours;
          cumulative.totals.batSixes += stats.sixes;
          if (stats.out) cumulative.totals.batOuts += 1;
        }
        if (hasBowled) {
          cumulative.totals.bowlBalls += stats.bowledBalls;
          cumulative.totals.bowlRuns += stats.concededRuns;
          cumulative.totals.bowlWickets += stats.wickets;
          cumulative.totals.bowlMaidens += stats.maidens;
        }
      }
    }
  });

  if (state.phase !== 'setup' && state.phase !== 'toss' && state.playerStats && state.playerStats[playerId]) {
    const stats = state.playerStats[playerId];
    const hasBatted = stats.balls > 0 || stats.out;
    const hasBowled = stats.bowledBalls > 0;

    if (hasBatted || hasBowled) {
      cumulative.matches.push({
        matchName: "Active Match",
        batting: hasBatted ? {
          runs: stats.runs,
          balls: stats.balls,
          fours: stats.fours,
          sixes: stats.sixes,
          out: stats.out,
          outDesc: stats.outDesc
        } : null,
        bowling: hasBowled ? {
          overs: computeOvers(stats.bowledBalls),
          runs: stats.concededRuns,
          wickets: stats.wickets,
          bowledBalls: stats.bowledBalls,
          maidens: stats.maidens,
          econ: stats.bowledBalls > 0 ? (stats.concededRuns / (stats.bowledBalls / 6)) : 0.0
        } : null
      });

      if (hasBatted) {
        cumulative.totals.batRuns += stats.runs;
        cumulative.totals.batBalls += stats.balls;
        cumulative.totals.batFours += stats.fours;
        cumulative.totals.batSixes += stats.sixes;
        if (stats.out) cumulative.totals.batOuts += 1;
      }
      if (hasBowled) {
        cumulative.totals.bowlBalls += stats.bowledBalls;
        cumulative.totals.bowlRuns += stats.concededRuns;
        cumulative.totals.bowlWickets += stats.wickets;
        cumulative.totals.bowlMaidens += stats.maidens;
      }
    }
  }

  return cumulative;
}

function renderCumulativeLeaderboard() {
  const battingBody = document.getElementById("statsCumulativeBattingBody");
  const bowlingBody = document.getElementById("statsCumulativeBowlingBody");
  const wrapper = document.getElementById("statsCumulativeWrapper");
  
  if (!battingBody || !bowlingBody || !wrapper) return;

  const hasHistory = state.completedMatches && state.completedMatches.length > 0;
  const hasActive = state.phase !== 'setup' && state.phase !== 'toss';
  
  if (!hasHistory && !hasActive) {
    wrapper.classList.add("hidden");
    return;
  }
  
  wrapper.classList.remove("hidden");

  const playerStatsList = state.players.map(p => getPlayerCumulativeStats(p.id)).filter(x => x !== null);

  // 1. Batting
  const batters = playerStatsList.filter(x => x.totals.batBalls > 0 || x.totals.batOuts > 0);
  batters.sort((x, y) => {
    if (y.totals.batRuns !== x.totals.batRuns) {
      return y.totals.batRuns - x.totals.batRuns;
    }
    return x.totals.batBalls - y.totals.batBalls;
  });

  if (batters.length === 0) {
    battingBody.innerHTML = `<tr><td colspan="8" class="text-muted text-center" style="padding:1rem;">No batting stats recorded yet.</td></tr>`;
  } else {
    battingBody.innerHTML = batters.map(p => {
      const t = p.totals;
      const sr = t.batBalls > 0 ? (t.batRuns / t.batBalls) * 100 : 0.0;
      
      const breakdownHtml = p.matches.map(m => {
        if (!m.batting) return "";
        let status = m.batting.out ? `out (${m.batting.outDesc})` : "not out";
        const matchSr = m.batting.balls > 0 ? (m.batting.runs / m.batting.balls) * 100 : 0.0;
        return `
          <div style="display:flex; justify-content:space-between; padding:0.35rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.03); font-size:0.8rem; color:var(--text-secondary);">
            <span><strong>${m.matchName}</strong>: <span style="font-size:0.75rem; color:var(--text-muted);">${status}</span></span>
            <span>Runs: <strong>${m.batting.runs}</strong> (${m.batting.balls}b) | 4s: ${m.batting.fours} | 6s: ${m.batting.sixes} | SR: ${matchSr.toFixed(1)}</span>
          </div>
        `;
      }).filter(x => x !== "").join("");

      const collapseId = `bat-collapse-${p.name.replace(/\s+/g, '-')}`;

      return `
        <tr class="expandable-row" onclick="toggleRowCollapse('${collapseId}', this)" style="cursor:pointer;">
          <td class="text-center text-muted collapse-arrow" style="font-size:0.75rem; color:var(--accent-blue);">▶</td>
          <td><strong>${p.name}</strong> ${p.isCaptain ? '<span style="font-size:0.7rem;font-weight:700;color:var(--accent-yellow);">(c)</span>' : ''} <span style="font-size:0.8rem; margin-left:0.25rem;" title="${p.role}">${roleIcon(p.role)}</span></td>
          <td class="text-right" style="font-weight:bold; color:var(--accent-green);">${t.batRuns}</td>
          <td class="text-right">${t.batBalls}</td>
          <td class="text-right">${t.batFours}</td>
          <td class="text-right">${t.batSixes}</td>
          <td class="text-right" style="color:var(--accent-red);">${t.batOuts}</td>
          <td class="text-right text-muted">${sr.toFixed(1)}</td>
        </tr>
        <tr id="${collapseId}" class="hidden" style="background: rgba(15, 23, 42, 0.02);">
          <td colspan="8" style="padding: 0.5rem 0;">
            <div style="padding: 0 0.5rem;">
              <h4 style="margin: 0.25rem 1.25rem 0.5rem; font-size: 0.75rem; color:var(--accent-blue); text-transform: uppercase; letter-spacing: 1px;">Match-by-Match Breakdown</h4>
              ${breakdownHtml || '<p class="text-muted" style="margin:0 1.25rem; font-size:0.8rem;">No match breakdown available</p>'}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // 2. Bowling
  const bowlers = playerStatsList.filter(x => x.totals.bowlBalls > 0);
  bowlers.sort((x, y) => {
    if (y.totals.bowlWickets !== x.totals.bowlWickets) {
      return y.totals.bowlWickets - x.totals.bowlWickets;
    }
    const econX = x.totals.bowlBalls > 0 ? (x.totals.bowlRuns / (x.totals.bowlBalls / 6)) : 999;
    const econY = y.totals.bowlRuns > 0 ? (y.totals.bowlRuns / (y.totals.bowlBalls / 6)) : 999;
    return econX - econY;
  });

  if (bowlers.length === 0) {
    bowlingBody.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="padding:1rem;">No bowling stats recorded yet.</td></tr>`;
  } else {
    bowlingBody.innerHTML = bowlers.map(p => {
      const t = p.totals;
      const overs = computeOvers(t.bowlBalls);
      const econ = t.bowlBalls > 0 ? (t.bowlRuns / (t.bowlBalls / 6)) : 0.0;

      const breakdownHtml = p.matches.map(m => {
        if (!m.bowling) return "";
        return `
          <div style="display:flex; justify-content:space-between; padding:0.35rem 1.25rem; border-bottom:1px solid rgba(255,255,255,0.03); font-size:0.8rem; color:var(--text-secondary);">
            <span><strong>${m.matchName}</strong></span>
            <span>Wickets: <strong>${m.bowling.wickets}</strong> | Runs: ${m.bowling.runs} | Overs: ${m.bowling.overs} | Maidens: ${m.bowling.maidens} | Econ: ${m.bowling.econ.toFixed(2)}</span>
          </div>
        `;
      }).filter(x => x !== "").join("");

      const collapseId = `bowl-collapse-${p.name.replace(/\s+/g, '-')}`;

      return `
        <tr class="expandable-row" onclick="toggleRowCollapse('${collapseId}', this)" style="cursor:pointer;">
          <td class="text-center text-muted collapse-arrow" style="font-size:0.75rem; color:var(--accent-blue);">▶</td>
          <td><strong>${p.name}</strong> ${p.isCaptain ? '<span style="font-size:0.7rem;font-weight:700;color:var(--accent-yellow);">(c)</span>' : ''} <span style="font-size:0.8rem; margin-left:0.25rem;" title="${p.role}">${roleIcon(p.role)}</span></td>
          <td class="text-right" style="color:var(--accent-blue);">${overs}</td>
          <td class="text-right">${t.bowlMaidens}</td>
          <td class="text-right">${t.bowlRuns}</td>
          <td class="text-right" style="font-weight:bold; color:var(--accent-green);">${t.bowlWickets}</td>
          <td class="text-right text-muted">${econ.toFixed(2)}</td>
        </tr>
        <tr id="${collapseId}" class="hidden" style="background: rgba(15, 23, 42, 0.02);">
          <td colspan="7" style="padding: 0.5rem 0;">
            <div style="padding: 0 0.5rem;">
              <h4 style="margin: 0.25rem 1.25rem 0.5rem; font-size: 0.75rem; color:var(--accent-orange); text-transform: uppercase; letter-spacing: 1px;">Match-by-Match Breakdown</h4>
              ${breakdownHtml || '<p class="text-muted" style="margin:0 1.25rem; font-size:0.8rem;">No match breakdown available</p>'}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }
}

function toggleRowCollapse(rowId, triggerRowEl) {
  const targetRow = document.getElementById(rowId);
  if (!targetRow) return;
  const isHidden = targetRow.classList.contains("hidden");
  
  if (isHidden) {
    targetRow.classList.remove("hidden");
    triggerRowEl.querySelector(".collapse-arrow").textContent = "▼";
  } else {
    targetRow.classList.add("hidden");
    triggerRowEl.querySelector(".collapse-arrow").textContent = "▶";
  }
}

const STORAGE = {
  team: "vgc-notes-team",
  teams: "vgc-notes-teams",
  activeTeamId: "vgc-notes-active-team-id",
  battles: "vgc-notes-battles",
};

const archetypes = [
  "IDK",
  "Balance",
  "Offense",
  "Trick Room",
  "Tailwind",
  "Weather",
  "Setup",
];

const POKEMON_NAMES = window.POKEMON_NAMES ?? [];

const BATTLE_SNAPSHOT_PLACEHOLDER = `Plan:
Target:
Key moment:`;

const ICON_VERSIONS = {
  teams: "2",
};

const state = {
  teams: loadTeams(),
  activeTeamId: "",
  battles: readJson(STORAGE.battles, []),
  view: "dashboard",
  step: 1,
  parsedTeam: [],
  draft: null,
  teamImportOpen: false,
  archiveDetailId: "",
  dashboardRange: "global",
  dashboardTeamFilter: "active",
  dashboardResultFilter: "all",
  replayImport: null,
  replayImportChoice: "",
};

state.activeTeamId = readJson(STORAGE.activeTeamId, "") || state.teams[0]?.id || "";
if (state.activeTeamId) writeJson(STORAGE.activeTeamId, state.activeTeamId);

const screen = document.querySelector("#screen");
const actionBar = document.querySelector("#actionBar");
const mainNav = document.querySelector("#mainNav");
const stepKicker = document.querySelector("#stepKicker");
const stepTitle = document.querySelector("#stepTitle");
const stepDots = document.querySelector(".step-dots");
let performanceChartInstance = null;
let performanceChartResizeObserver = null;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadTeams() {
  const savedTeams = readJson(STORAGE.teams, []);
  if (savedTeams.length) return savedTeams;

  const legacyTeam = readJson(STORAGE.team, []);
  if (legacyTeam.length !== 6) return [];

  const team = {
    id: createId(),
    name: teamLabel(legacyTeam),
    names: legacyTeam,
    createdAt: new Date().toISOString(),
  };
  writeJson(STORAGE.teams, [team]);
  writeJson(STORAGE.activeTeamId, team.id);
  return [team];
}

function createDraft() {
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    archetypes: [],
    result: "",
    opponentTeam: Array(6).fill(""),
    opponentLead: [],
    opponentLeadConfirmed: false,
    used: [],
    note: "",
    turns: [],
    editingTurnNumber: null,
    turnDraft: emptyTurnDraft(),
    errorTurn: "",
    takeaway: "",
  };
}

function emptyTurnDraft() {
  return {
    note: "",
    myEntries: [],
    myEntriesConfirmed: false,
    opponentEntries: [],
    opponentEntriesConfirmed: false,
    mySwitches: [],
    opponentSwitches: [],
    mySwitchPairs: [],
    opponentSwitchPairs: [],
    myKos: [],
    opponentKos: [],
    eventMode: "",
    mySwitchOut: "",
    mySwitchIn: "",
    opponentSwitchOut: "",
    opponentSwitchIn: "",
  };
}

function setPage(view) {
  state.view = view;
  state.archiveDetailId = "";
  if (!["battle", "archive"].includes(view)) {
    state.replayImport = null;
    state.replayImportChoice = "";
  }
  actionBar.className = "action-bar";
  window.scrollTo({ top: 0, left: 0 });

  if (view === "battle") {
    if (!activeTeam()) {
      state.view = "teams";
      state.teamImportOpen = true;
    } else {
      state.step = 1;
      if (!state.draft) state.draft = createDraft();
    }
  }

  if (view === "teams") {
    state.teamImportOpen = state.teams.length === 0;
  }

  render();
}

function setStep(step) {
  if (!activeTeam()) {
    setPage("teams");
    return;
  }

  state.view = "battle";
  state.step = step;

  if (state.step === 1 && !state.draft) {
    state.draft = createDraft();
  }

  if (state.step === 3 && state.draft && !state.draft.errorTurn) {
    state.draft.errorTurn = String(state.draft.turns[0]?.number ?? 1);
  }

  render();
}

function render(options = {}) {
  const preserveScroll = options.preserveScroll ?? false;
  const scrollY = preserveScroll ? window.scrollY : null;
  teardownPerformanceChart();
  screen.innerHTML = "";
  actionBar.innerHTML = "";
  actionBar.className = "action-bar";
  mainNav.innerHTML = "";

  renderTopbar();
  renderMainNav();

  if (state.view === "dashboard") renderDashboard();
  if (state.view === "battle" && state.step === 1) renderBattleSetup();
  if (state.view === "battle" && state.step === 2) renderBattleTurns();
  if (state.view === "battle" && state.step === 3) renderReview();
  if (state.view === "teams") renderTeams();
  if (state.view === "archive") renderArchive();
  if (state.view === "settings") renderSettings();

  if (scrollY !== null) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0 }));
  }
}

function teardownPerformanceChart() {
  performanceChartResizeObserver?.disconnect();
  performanceChartResizeObserver = null;
  performanceChartInstance?.dispose();
  performanceChartInstance = null;
}

function renderTopbar() {
  const pageTitles = {
    dashboard: "Dashboard",
    teams: "Teams",
    archive: "Archive",
    settings: "Settings",
  };

  const back = getBackConfig();
  const titleWrap = stepTitle.parentElement?.parentElement;
  const titleRow = titleWrap?.querySelector(".title-row");
  titleRow?.querySelector(".top-back")?.remove();
  document.querySelector(".top-action")?.remove();
  if (back && titleRow) {
    const button = el("button", "top-back", "←");
    button.type = "button";
    button.title = back.label;
    button.setAttribute("aria-label", back.label);
    button.addEventListener("click", back.action);
    titleRow.prepend(button);
  }

  if (state.view === "battle") {
    stepKicker.textContent = "";
    stepKicker.hidden = true;
    const stepTitles = {
      1: "New battle",
      2: "Turns",
      3: "Review",
    };
    stepTitle.textContent = stepTitles[state.step] ?? "Battle";
    stepDots.hidden = false;
    document.querySelectorAll(".dot").forEach((dot, index) => {
      dot.hidden = index > 2;
      dot.classList.toggle("is-active", index === state.step - 1);
    });
    return;
  }

  let title = pageTitles[state.view];
  if (state.view === "teams" && state.teamImportOpen) title = "Add team";
  if (state.view === "archive" && state.archiveDetailId) title = "Battle log";
  stepKicker.textContent = "";
  stepKicker.hidden = true;
  stepTitle.textContent = title;
  stepDots.hidden = true;
}

function getBackConfig() {
  if (state.view === "archive" && state.archiveDetailId) {
    return {
      label: "Back to Archive",
      action: () => {
        state.archiveDetailId = "";
        render();
      },
    };
  }

  if (state.view === "teams" && state.teamImportOpen && state.teams.length) {
    return {
      label: "Back to Teams",
      action: () => {
        state.teamImportOpen = false;
        render();
      },
    };
  }

  if (state.view === "battle" && state.step === 2) {
    return {
      label: "Back to Setup",
      action: () => setStep(1),
    };
  }

  if (state.view === "battle" && state.step === 3) {
    return {
      label: "Back to Turns",
      action: () => setStep(2),
    };
  }

  return null;
}

function renderMainNav() {
  [
    ["dashboard", "Home"],
    ["battle", "Battle"],
    ["archive", "Archive"],
    ["teams", "Teams"],
    ["settings", "Settings"],
  ].forEach(([view, label]) => {
    const button = el("button", "nav-button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.classList.add("is-icon");
    button.append(navIconAsset(view, label), srOnly(label));
    button.classList.toggle("is-active", state.view === view);
    button.addEventListener("click", () => setPage(view));
    mainNav.append(button);
  });
}

function navIconAsset(view, label) {
  const img = el("img", "nav-icon");
  const version = ICON_VERSIONS[view] ? `?v=${ICON_VERSIONS[view]}` : "";
  img.src = `icons/${view}.svg${version}`;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.draggable = false;
  img.decoding = "async";
  img.loading = "eager";
  img.dataset.icon = label;
  return img;
}

function srOnly(text) {
  return el("span", "sr-only", text);
}

function renderImport() {
  const currentNames = Array.from({ length: 6 }, (_, index) => state.parsedTeam[index] ?? "");

  const field = el("div", "field");
  const label = el("label", "", "Pokepaste");
  label.htmlFor = "pasteInput";
  const textarea = el("textarea");
  textarea.id = "pasteInput";
  textarea.placeholder = "Paste team here";
  textarea.autocapitalize = "off";
  const parseButton = el("button", "primary", "Parse");
  parseButton.type = "button";
  parseButton.addEventListener("click", () => {
    const parsed = parseTeam(textarea.value);
    state.parsedTeam = Array.from({ length: 6 }, (_, index) => parsed[index] ?? "");
    textarea.value = "";
    render();
  });
  field.append(label, textarea, parseButton);

  const namesGroup = el("div", "group");
  namesGroup.append(el("div", "group-title", "Team"));

  const datalistId = "teamPokemonSuggestions";
  ensureDatalist(datalistId, POKEMON_NAMES);

  const grid = el("div", "opponent-grid");
  currentNames.forEach((name, index) => {
    const input = el("input", "mini-input opponent-input");
    input.value = name;
    enableNativeSuggest(input, datalistId, () => POKEMON_NAMES);
    input.addEventListener("input", () => {
      currentNames[index] = input.value.slice(0, 40);
      state.parsedTeam = [...currentNames];
      saveButton.disabled = !isImportedTeamReady(currentNames);
    });
    input.addEventListener("blur", () => {
      currentNames[index] = input.value.trim();
      state.parsedTeam = [...currentNames];
      input.value = currentNames[index];
      saveButton.disabled = !isImportedTeamReady(currentNames);
    });
    grid.append(input);
  });
  namesGroup.append(grid);

  const saveButton = el("button", "primary", "Save team");
  saveButton.type = "button";
  saveButton.disabled = !isImportedTeamReady(currentNames);
  saveButton.addEventListener("click", () => {
    saveImportedTeam();
    state.teamImportOpen = false;
    state.parsedTeam = [];
    setPage("teams");
  });

  screen.append(field, namesGroup);
  actionBar.append(saveButton);
}

function saveImportedTeam() {
  const names = state.parsedTeam.slice(0, 6).map((name) => name.trim()).filter(Boolean);
  const team = {
    id: createId(),
    name: teamLabel(names),
    names,
    createdAt: new Date().toISOString(),
  };
  state.teams.unshift(team);
  if (!state.activeTeamId || !state.teams.some((saved) => saved.id === state.activeTeamId)) {
    state.activeTeamId = team.id;
  }
  writeJson(STORAGE.teams, state.teams);
  writeJson(STORAGE.activeTeamId, state.activeTeamId);
  writeJson(STORAGE.team, activeTeamNames());
}

function isImportedTeamReady(names) {
  return names.filter((name) => name.trim()).length === 6;
}

function renderImportNames(list) {
  list.innerHTML = "";

  if (!state.parsedTeam.length) {
    list.append(el("li", "empty", "Imported names appear here."));
    return;
  }

  state.parsedTeam.slice(0, 6).forEach((name) => {
    const row = el("li", "name-row");
    row.append(el("span", "", name));
    list.append(row);
  });
}

function renderBattleSetup() {
  const draft = state.draft;
  ensureDraftShape(draft);
  const team = activeTeamNames();
  const hasFullOpponentTeam = opponentTeamReady(draft);
  const teamsCompare = renderBattleTeamsCompare(draft, team);

  const noteField = el("div", "field");
  const noteLabel = el("label", "section-label", "Game Plan");
  noteLabel.htmlFor = "battleNote";
  const note = el("textarea", "snapshot-note");
  note.id = "battleNote";
  note.rows = 4;
  note.value = draft.note;
  note.addEventListener("input", () => {
    draft.note = note.value;
    note.value = draft.note;
  });
  noteField.append(noteLabel, note);

  const startButton = el("button", "primary", "Start battle");
  startButton.type = "button";
  startButton.disabled = draft.used.length !== 4 || !hasFullOpponentTeam;
  startButton.addEventListener("click", () => setStep(2));

  [teamsCompare, noteField].filter(Boolean).forEach((node) => screen.append(node));
  actionBar.append(startButton);
}

function renderBattleTeamsCompare(draft, team) {
  const wrap = el("div", "picks-compare-grid");

  const myCard = el("div", "dash-block picks-compare-card");
  myCard.append(el("div", "dash-label", "My Team"));
  const myList = el("div", "picks-compare-list is-interactive");
  team.forEach((name) => {
    const pick = el("button", "team-pick picks-compare-pick", name);
    const pickIndex = draft.used.indexOf(name);
    pick.type = "button";
    pick.textContent = "";
    pick.classList.toggle("is-selected", pickIndex !== -1);
    pick.classList.toggle("is-lead", pickIndex === 0 || pickIndex === 1);
    pick.classList.toggle("is-back", pickIndex === 2 || pickIndex === 3);
    pick.append(el("span", "pick-name", name));
    if (pickIndex !== -1) pick.append(el("span", "pick-number", String(pickIndex + 1)));
    pick.addEventListener("click", () => {
      if (draft.used.includes(name)) {
        draft.used = draft.used.filter((item) => item !== name);
      } else if (draft.used.length < 4) {
        draft.used.push(name);
      }
      render();
    });
    myList.append(pick);
  });
  myCard.append(myList);

  const opponentCard = renderOpponentTeam(draft);

  wrap.append(myCard, opponentCard);
  return wrap;
}

function renderBattleTurns() {
  const draft = state.draft;
  ensureDraftShape(draft);
  const hasFullOpponentTeam = opponentTeamReady(draft);
  const needsOpponentLeadConfirmation = draft.turns.length === 0 && !draft.opponentLeadConfirmed;
  const opponentNames = filledOpponentTeam(draft);
  if (needsOpponentLeadConfirmation) {
    const leadCard = el("div", "turn-compose-card");
    leadCard.append(
      el("div", "group-title", "Turn 1 lead"),
      el("p", "helper-text", "Pick their two leads, then confirm before you start logging turn 1.")
    );
    const leadChips = el("div", "team-grid lead-pick-grid");
    opponentNames.forEach((name) => {
      const chip = el("button", "team-pick picks-compare-pick", "");
      chip.type = "button";
      chip.classList.toggle("is-selected", draft.opponentLead.includes(name));
      chip.classList.toggle("is-lead", draft.opponentLead.includes(name));
      chip.append(el("span", "pick-name", name));
      chip.addEventListener("click", () => {
        draft.opponentLead = toggleLimited(draft.opponentLead, name, 2);
        draft.opponentLeadConfirmed = false;
        render({ preserveScroll: true });
      });
      leadChips.append(chip);
    });
    const confirmLead = el("button", "primary", "Confirm lead");
    confirmLead.type = "button";
    confirmLead.disabled = !hasFullOpponentTeam || draft.opponentLead.length !== 2;
    confirmLead.addEventListener("click", () => {
      if (draft.opponentLead.length !== 2) return;
      draft.opponentLeadConfirmed = true;
      render({ preserveScroll: true });
    });
    leadCard.append(leadChips, confirmLead);
    screen.append(leadCard);
    return;
  }

  const turnEntryStatus = getTurnEntryStatus(draft, battleTeamNames(draft));
  const editingTurn = draft.turns.find((turn) => turn.number === draft.editingTurnNumber);
  const nextTurnState = getNextTurnState(draft, battleTeamNames(draft));
  const canComposeNextTurn = Boolean(editingTurn) || !nextTurnState.battleOver;
  const controls = el("div", "turn-controls");
  if (canComposeNextTurn) {
    const composeCard = el("div", "turn-compose-card");
    const composeTitle = el("div", "group-title", editingTurn ? `Turn ${editingTurn.number}` : `Turn ${draft.turns.length + 1}`);
    const saveTurn = el(
      "button",
      editingTurn ? "secondary save-turn-button" : "icon-button save-turn-button",
      editingTurn ? "Save turn" : "End turn"
    );
    saveTurn.type = "button";
    saveTurn.disabled = editingTurn
      ? turnEntryStatus.mustResolveEntries || !hasFullOpponentTeam
      : draft.used.length !== 4 || !hasFullOpponentTeam || turnEntryStatus.mustResolveEntries;
    const turnNoteField = el("div", "turn-note-field");
    const turnLabel = el("label", "", "Notes");
    turnLabel.htmlFor = "battleTurnNote";
    const turnInput = el("textarea", "turn-note-input");
    turnInput.id = "battleTurnNote";
    turnInput.rows = 1;
    turnInput.value = draft.turnDraft.note;
    turnInput.addEventListener("input", () => {
      draft.turnDraft.note = turnInput.value;
    });
    turnNoteField.append(turnLabel, turnInput);
    const switchControls = renderSwitchControls(draft, battleTeamNames(draft));
    saveTurn.addEventListener("click", () => {
      const text = draft.turnDraft.note.trim();
      if (editingTurn) {
        editingTurn.note = text;
        editingTurn.noteSource = editingTurn.noteSource ?? "manual";
        editingTurn.myEntries = [...draft.turnDraft.myEntries];
        editingTurn.opponentEntries = [...draft.turnDraft.opponentEntries];
        editingTurn.mySwitches = [...draft.turnDraft.mySwitches];
        editingTurn.opponentSwitches = [...draft.turnDraft.opponentSwitches];
        editingTurn.mySwitchPairs = [...draft.turnDraft.mySwitchPairs];
        editingTurn.opponentSwitchPairs = [...draft.turnDraft.opponentSwitchPairs];
        editingTurn.myKos = [...draft.turnDraft.myKos];
        editingTurn.opponentKos = [...draft.turnDraft.opponentKos];
        draft.editingTurnNumber = null;
        draft.turnDraft = emptyTurnDraft();
      } else {
        draft.turns.push({
          number: draft.turns.length + 1,
          note: text,
          noteSource: "manual",
          feedback: "",
          myEntries: [...draft.turnDraft.myEntries],
          opponentEntries: [...draft.turnDraft.opponentEntries],
          mySwitches: [...draft.turnDraft.mySwitches],
          opponentSwitches: [...draft.turnDraft.opponentSwitches],
          mySwitchPairs: [...draft.turnDraft.mySwitchPairs],
          opponentSwitchPairs: [...draft.turnDraft.opponentSwitchPairs],
          myKos: [...draft.turnDraft.myKos],
          opponentKos: [...draft.turnDraft.opponentKos],
        });
        draft.turnDraft = emptyTurnDraft();
      }
      render({ preserveScroll: true });
    });
    composeCard.append(composeTitle, turnNoteField, switchControls, saveTurn);
    controls.append(composeCard);
  }
  const turnList = el("ul", "turn-list");
  draft.turns.slice(-4).forEach((turn) => {
    const row = renderBattleTurnRow(draft, turn);
    const actions = el("div", "turn-actions");
    const edit = el("button", "tiny-button", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => {
      draft.editingTurnNumber = turn.number;
      draft.turnDraft = {
        note: turn.note ?? "",
        noteSource: turn.noteSource ?? inferTurnNoteSource(turn),
        myEntries: [...(turn.myEntries ?? [])],
        myEntriesConfirmed: Boolean((turn.myEntries ?? []).length),
        opponentEntries: [...(turn.opponentEntries ?? [])],
        opponentEntriesConfirmed: Boolean((turn.opponentEntries ?? []).length),
        mySwitches: [...(turn.mySwitches ?? [])],
        opponentSwitches: [...(turn.opponentSwitches ?? [])],
        mySwitchPairs: [...(turn.mySwitchPairs ?? [])],
        opponentSwitchPairs: [...(turn.opponentSwitchPairs ?? [])],
        myKos: [...(turn.myKos ?? [])],
        opponentKos: [...(turn.opponentKos ?? [])],
        eventMode: "",
        mySwitchOut: "",
        mySwitchIn: "",
        opponentSwitchOut: "",
        opponentSwitchIn: "",
      };
      render({ preserveScroll: true });
    });
    actions.append(edit);

    if (turn.number === draft.turns.at(-1)?.number) {
      const remove = el("button", "tiny-button", "Delete");
      remove.type = "button";
      remove.addEventListener("click", () => {
        draft.turns.pop();
        draft.editingTurnNumber = null;
        draft.turnDraft = emptyTurnDraft();
        render({ preserveScroll: true });
      });
      actions.append(remove);
    }

    row.append(actions);

    turnList.append(row);
  });

  const reviewButton = el("button", "primary", "Save and review");
  reviewButton.type = "button";
  reviewButton.disabled = draft.used.length !== 4 || !hasFullOpponentTeam || draft.turns.length === 0;
  reviewButton.addEventListener("click", () => setStep(3));

  screen.append(controls, turnList);
  actionBar.append(reviewButton);
}

function replayChoiceButton(replayImport, sideKey) {
  const side = replayImport.sides[sideKey];
  const option = el("button", "archive-card replay-choice");
  option.type = "button";
  option.classList.toggle("is-selected", state.replayImportChoice === sideKey);
  const header = el("div", "archive-card-header");
  header.append(
    el("strong", "", side.playerName || sideKey),
    el("span", "result-chip", sideKey)
  );
  option.append(header, renderReplayChoiceTeam(side.team));
  option.addEventListener("click", () => {
    state.replayImportChoice = state.replayImportChoice === sideKey ? "" : sideKey;
    render();
  });
  return option;
}

function renderReplayChoiceTeam(names) {
  const list = el("div", "picks-compare-list");
  (names ?? []).filter(Boolean).forEach((name) => {
    list.append(el("span", "roster-chip picks-compare-chip", name));
  });
  return list;
}

function replayCancelButton() {
  const cancel = el("button", "result-chip replay-cancel-chip", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    state.replayImport = null;
    state.replayImportChoice = "";
    render();
  });
  return cancel;
}

function ensureDraftShape(draft) {
  draft.opponentTeam ??= Array(6).fill("");
  while (draft.opponentTeam.length < 6) draft.opponentTeam.push("");
  draft.opponentLead ??= [];
  draft.opponentLeadConfirmed ??= false;
  draft.turnDraft ??= emptyTurnDraft();
  draft.turnDraft.note ??= "";
  draft.turnDraft.myEntries ??= [];
  draft.turnDraft.myEntriesConfirmed ??= false;
  draft.turnDraft.opponentEntries ??= [];
  draft.turnDraft.opponentEntriesConfirmed ??= false;
  draft.turnDraft.mySwitches ??= [];
  draft.turnDraft.opponentSwitches ??= [];
  draft.turnDraft.mySwitchPairs ??= [];
  draft.turnDraft.opponentSwitchPairs ??= [];
  draft.turnDraft.myKos ??= [];
  draft.turnDraft.opponentKos ??= [];
  draft.turnDraft.eventMode ??= "";
  draft.turnDraft.mySwitchOut ??= "";
  draft.turnDraft.mySwitchIn ??= "";
  draft.turnDraft.opponentSwitchOut ??= "";
  draft.turnDraft.opponentSwitchIn ??= "";
  draft.turns.forEach((turn) => {
    turn.feedback ??= "";
    turn.noteSource ??= inferTurnNoteSource(turn);
    turn.myEntries ??= [];
    turn.opponentEntries ??= [];
    turn.mySwitches ??= [];
    turn.opponentSwitches ??= [];
    turn.mySwitchPairs ??= [];
    turn.opponentSwitchPairs ??= [];
    turn.myKos ??= [];
    turn.opponentKos ??= [];
  });
  const opponentNames = filledOpponentTeam(draft);
  const myBattleTeam = battleTeamNames(draft);
  const board = boardBeforeTurn(draft, draft.editingTurnNumber ?? draft.turns.length + 1);
  const myEntryChoices = mergeChoices(
    draft.turnDraft.myEntries,
    replacementChoices(myBattleTeam, board.myActive, board.myFainted, draft.turnDraft.myEntries)
  );
  const opponentEntryChoices = mergeChoices(
    draft.turnDraft.opponentEntries,
    replacementChoices(opponentNames, board.opponentActive, board.opponentFainted, draft.turnDraft.opponentEntries)
  );
  draft.opponentLead = draft.opponentLead.filter((name) => opponentNames.includes(name));
  if (draft.opponentLead.length !== 2) draft.opponentLeadConfirmed = false;
  draft.turnDraft.myEntries = draft.turnDraft.myEntries.filter((name) => myEntryChoices.includes(name));
  draft.turnDraft.opponentEntries = draft.turnDraft.opponentEntries.filter((name) => opponentEntryChoices.includes(name));
  draft.turnDraft.mySwitches = draft.turnDraft.mySwitches.filter((name) => myBattleTeam.includes(name));
  draft.turnDraft.opponentSwitches = draft.turnDraft.opponentSwitches.filter((name) => opponentNames.includes(name));
  const boardAfterSwitches = previewBoard(board, draft.turnDraft, { includeKos: false });
  draft.turnDraft.myKos = draft.turnDraft.myKos.filter((name) => boardAfterSwitches.myActive.includes(name));
  draft.turnDraft.opponentKos = draft.turnDraft.opponentKos.filter((name) => boardAfterSwitches.opponentActive.includes(name));
  draft.turnDraft.mySwitchPairs = draft.turnDraft.mySwitchPairs.filter((pair) =>
    board.myActive.includes(pair.out) &&
    myBattleTeam.includes(pair.in) &&
    !board.myActive.includes(pair.in) &&
    !board.myFainted.includes(pair.in)
  );
  draft.turnDraft.opponentSwitchPairs = draft.turnDraft.opponentSwitchPairs.filter((pair) =>
    board.opponentActive.includes(pair.out) &&
    opponentNames.includes(pair.in) &&
    !board.opponentActive.includes(pair.in) &&
    !board.opponentFainted.includes(pair.in)
  );
  draft.turnDraft.mySwitches = draft.turnDraft.mySwitchPairs.map((pair) => pair.in);
  draft.turnDraft.opponentSwitches = draft.turnDraft.opponentSwitchPairs.map((pair) => pair.in);
}

function renderOpponentTeam(draft) {
  const card = el("div", "dash-block picks-compare-card");
  card.append(el("div", "dash-label", "Opponent Team"));

  const datalistId = "pokemonSuggestions";
  ensureDatalist(datalistId, pokemonSuggestions(draft));

  const grid = el("div", "picks-compare-list picks-compare-input-list");
  draft.opponentTeam.slice(0, 6).forEach((name, index) => {
    const input = el("input", "mini-input opponent-input picks-compare-input");
    input.value = name;
    enableNativeSuggest(input, datalistId, () => pokemonSuggestions(draft));
    input.addEventListener("input", () => {
      draft.opponentTeam[index] = input.value.slice(0, 32);
      draft.opponentLead = draft.opponentLead.filter((lead) => filledOpponentTeam(draft).includes(lead));
      draft.opponentLeadConfirmed = false;
    });
    input.addEventListener("blur", () => {
      draft.opponentTeam[index] = input.value.trim();
      input.value = draft.opponentTeam[index];
      draft.opponentLead = draft.opponentLead.filter((lead) => filledOpponentTeam(draft).includes(lead));
      draft.opponentLeadConfirmed = false;
      render();
    });
    grid.append(input);
  });
  card.append(grid);

  return card;
}

function ensureDatalist(id, names) {
  let datalist = document.getElementById(id);
  if (!datalist) {
    datalist = el("datalist");
    datalist.id = id;
    datalist.hidden = true;
    document.body.append(datalist);
  }
  datalist.innerHTML = "";
  names.forEach((name) => {
    const option = el("option");
    option.value = name;
    datalist.append(option);
  });
  return datalist;
}

function renderSwitchControls(draft, team) {
  const wrap = el("div", "switch-controls");
  const turnNumber = draft.editingTurnNumber ?? draft.turns.length + 1;
  const baseBoard = boardBeforeTurn(draft, turnNumber);
  let entryStatus = getTurnEntryStatus(draft, team, baseBoard);
  let {
    myMissing,
    opponentMissing,
    myRequiredEntries,
    opponentRequiredEntries,
    myEntryChoices,
    opponentEntryChoices,
    needsMyEntry,
    needsOpponentEntry,
    mustResolveEntries,
  } = entryStatus;

  let preselectedSingleEntry = false;
  if (myRequiredEntries === 1 && myEntryChoices.length === 1 && draft.turnDraft.myEntries.length === 0) {
    draft.turnDraft.myEntries = [myEntryChoices[0]];
    draft.turnDraft.myEntriesConfirmed = false;
    preselectedSingleEntry = true;
  }
  if (opponentRequiredEntries === 1 && opponentEntryChoices.length === 1 && draft.turnDraft.opponentEntries.length === 0) {
    draft.turnDraft.opponentEntries = [opponentEntryChoices[0]];
    draft.turnDraft.opponentEntriesConfirmed = false;
    preselectedSingleEntry = true;
  }
  if (preselectedSingleEntry) {
    entryStatus = getTurnEntryStatus(draft, team, baseBoard);
    ({
      myMissing,
      opponentMissing,
      myRequiredEntries,
      opponentRequiredEntries,
      myEntryChoices,
      opponentEntryChoices,
      needsMyEntry,
      needsOpponentEntry,
      mustResolveEntries,
    } = entryStatus);
  }

  const confirmedTurnDraft = withConfirmedEntriesOnly(draft.turnDraft);

  const boardAfterEntries = previewBoard(baseBoard, confirmedTurnDraft, {
    includeSwitches: false,
    includeKos: false,
  });
  const boardAfterSwitches = previewBoard(baseBoard, confirmedTurnDraft, { includeKos: false });
  const boardNow = previewBoard(baseBoard, confirmedTurnDraft);
  wrap.append(boardPanel("Active", boardNow.myActive, boardNow.opponentActive));

  if (mustResolveEntries) {
    const entryPanel = el("div", "event-panel is-required");
    entryPanel.append(el("div", "event-panel-title", "Entries after KO"));
    if (needsMyEntry) {
      entryPanel.append(
        switchGroup(
          "Who comes in for me?",
          myEntryChoices,
          draft.turnDraft.myEntries,
          (next) => {
            draft.turnDraft.myEntries = limitSelection(next, myRequiredEntries);
          draft.turnDraft.myEntriesConfirmed = false;
            render({ preserveScroll: true });
          },
          "No available Pokemon on my side",
          myRequiredEntries,
          "in",
          "my"
        )
      );
      const confirmMine = el("button", "secondary add-switch-button", "Confirm entry");
      confirmMine.type = "button";
      confirmMine.disabled =
        draft.turnDraft.myEntries.length < myRequiredEntries &&
        !(myRequiredEntries === 1 && myEntryChoices.length === 1);
      confirmMine.addEventListener("click", () => {
        if (!draft.turnDraft.myEntries.length && myRequiredEntries === 1 && myEntryChoices.length === 1) {
          draft.turnDraft.myEntries = [myEntryChoices[0]];
        }
        if (draft.turnDraft.myEntries.length < myRequiredEntries) return;
        draft.turnDraft.myEntriesConfirmed = true;
        render({ preserveScroll: true });
      });
      entryPanel.append(confirmMine);
    }
    if (needsOpponentEntry) {
      entryPanel.append(
        switchGroup(
          "Who comes in for them?",
          opponentEntryChoices,
          draft.turnDraft.opponentEntries,
          (next) => {
            draft.turnDraft.opponentEntries = limitSelection(next, opponentRequiredEntries);
          draft.turnDraft.opponentEntriesConfirmed = false;
            render({ preserveScroll: true });
          },
          "No available Pokemon on their side",
          opponentRequiredEntries,
          "in",
          "opponent"
        )
      );
      const confirmTheirs = el("button", "secondary add-switch-button", "Confirm entry");
      confirmTheirs.type = "button";
      confirmTheirs.disabled =
        draft.turnDraft.opponentEntries.length < opponentRequiredEntries &&
        !(opponentRequiredEntries === 1 && opponentEntryChoices.length === 1);
      confirmTheirs.addEventListener("click", () => {
        if (!draft.turnDraft.opponentEntries.length && opponentRequiredEntries === 1 && opponentEntryChoices.length === 1) {
          draft.turnDraft.opponentEntries = [opponentEntryChoices[0]];
        }
        if (draft.turnDraft.opponentEntries.length < opponentRequiredEntries) return;
        draft.turnDraft.opponentEntriesConfirmed = true;
        render({ preserveScroll: true });
      });
      entryPanel.append(confirmTheirs);
    }
    wrap.append(entryPanel);
  }

  const eventBar = el("div", "event-bar");
  [
    ["my-switch", "My switch"],
    ["opp-switch", "Opponent switch"],
    ["ko", "KO"],
  ].forEach(([mode, label]) => {
    const button = el("button", `event-button ${mode}`, label);
    button.type = "button";
    button.disabled = mustResolveEntries;
    button.classList.toggle("is-selected", draft.turnDraft.eventMode === mode);
    button.addEventListener("click", () => {
      draft.turnDraft.eventMode = draft.turnDraft.eventMode === mode ? "" : mode;
      render({ preserveScroll: true });
    });
    eventBar.append(button);
  });
  wrap.append(eventBar);

  if (draft.turnDraft.eventMode === "my-switch") {
    wrap.append(
      switchPairPanel(
        "Who do you switch?",
        availableSwitchOuts(boardAfterEntries.myActive, draft.turnDraft.mySwitchPairs),
        switchBenchOptions(team, boardAfterEntries.myActive, draft.turnDraft.mySwitchPairs, baseBoard.myFainted),
        draft.turnDraft,
        "my"
      )
    );
  }
  if (draft.turnDraft.eventMode === "opp-switch") {
    wrap.append(
      switchPairPanel(
        "Who do they switch?",
        availableSwitchOuts(boardAfterEntries.opponentActive, draft.turnDraft.opponentSwitchPairs),
        switchBenchOptions(
          filledOpponentTeam(draft),
          boardAfterEntries.opponentActive,
          draft.turnDraft.opponentSwitchPairs,
          baseBoard.opponentFainted
        ),
        draft.turnDraft,
        "opponent"
      )
    );
  }
  if (draft.turnDraft.eventMode === "ko") {
    const koPanel = el("div", "event-panel");
    koPanel.append(el("div", "event-panel-title", "KO"));
    koPanel.append(
      switchGroup("My active", boardAfterSwitches.myActive, draft.turnDraft.myKos, (next) => {
        draft.turnDraft.myKos = next;
        render({ preserveScroll: true });
      }, "No options right now", 2, "ko", "my"),
      switchGroup("Opponent active", boardAfterSwitches.opponentActive, draft.turnDraft.opponentKos, (next) => {
        draft.turnDraft.opponentKos = next;
        render({ preserveScroll: true });
      }, "No options right now", 2, "ko", "opponent")
    );
    wrap.append(koPanel);
  }

  return wrap;
}

function switchPairPanel(title, active, bench, turnDraft, side) {
  const panel = el("div", "event-panel");
  const outKey = side === "my" ? "mySwitchOut" : "opponentSwitchOut";
  const inKey = side === "my" ? "mySwitchIn" : "opponentSwitchIn";
  const pairsKey = side === "my" ? "mySwitchPairs" : "opponentSwitchPairs";
  const insKey = side === "my" ? "mySwitches" : "opponentSwitches";
  const tone = side === "my" ? "my" : "opponent";
  const maxPairs = side === "opponent" ? 2 : 2;
  const hasRemainingPairSlots = turnDraft[pairsKey].length < maxPairs;
  const canOfferSwitch = hasRemainingPairSlots && active.length > 0;

  if (!hasRemainingPairSlots) {
    turnDraft[outKey] = "";
    turnDraft[inKey] = "";
  }

  panel.append(el("div", "event-panel-title", title));
  if (canOfferSwitch) {
    panel.append(
      switchGroup("Out", active, turnDraft[outKey] ? [turnDraft[outKey]] : [], (next) => {
        turnDraft[outKey] = next.at(-1) ?? "";
        if (turnDraft[outKey] === "" || turnDraft[outKey] === turnDraft[inKey]) {
          turnDraft[inKey] = "";
        }
        render({ preserveScroll: true });
      }, "No options right now", 1, "out", tone)
    );
  } else {
    panel.append(el("div", "mini-empty", "No options right now"));
  }

  if (hasRemainingPairSlots && bench.length) {
    panel.append(
      switchGroup("In", bench, turnDraft[inKey] ? [turnDraft[inKey]] : [], (next) => {
        turnDraft[inKey] = next.at(-1) ?? "";
        render({ preserveScroll: true });
      }, "No options right now", 1, "in", tone)
    );

    if (turnDraft[outKey] && turnDraft[inKey]) {
      const addPair = el("button", "secondary add-switch-button", "Add switch");
      addPair.type = "button";
      addPair.addEventListener("click", () => {
        if (!turnDraft[outKey] || !turnDraft[inKey]) return;
        turnDraft[pairsKey] = upsertSwitchPair(turnDraft[pairsKey], { out: turnDraft[outKey], in: turnDraft[inKey] });
        turnDraft[insKey] = turnDraft[pairsKey].map((pair) => pair.in);
        turnDraft[outKey] = "";
        turnDraft[inKey] = "";
        render({ preserveScroll: true });
      });
      panel.append(addPair);
    }
  } else {
    turnDraft[inKey] = "";
  }

  if (turnDraft[pairsKey].length) {
    const pairs = el("div", "switch-pairs");
    turnDraft[pairsKey].forEach((pair) => {
      const item = el("div", "switch-pair");
      const chips = el("div", "switch-pair-chips");
      chips.append(
        previewEventChip(pair.out, "out"),
        previewEventChip(pair.in, "in")
      );
      const remove = el("button", "switch-pair-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove switch");
      remove.append(turnActionIcon("trash"));
      remove.addEventListener("click", () => {
        turnDraft[pairsKey] = turnDraft[pairsKey].filter((saved) => saved.out !== pair.out);
        turnDraft[insKey] = turnDraft[pairsKey].map((saved) => saved.in);
        render({ preserveScroll: true });
      });
      item.append(chips, remove);
      pairs.append(item);
    });
    panel.append(pairs);
  }

  return panel;
}

function upsertSwitchPair(pairs, nextPair) {
  return [...pairs.filter((pair) => pair.out !== nextPair.out), nextPair].slice(0, 2);
}

function withConfirmedEntriesOnly(turnDraft) {
  return {
    ...turnDraft,
    myEntries: turnDraft.myEntriesConfirmed ? [...(turnDraft.myEntries ?? [])] : [],
    opponentEntries: turnDraft.opponentEntriesConfirmed ? [...(turnDraft.opponentEntries ?? [])] : [],
  };
}

function switchGroup(label, names, selected, onChange, emptyText = "No options right now", maxSelected = 2, iconKind = "", tone = "") {
  const group = el("div", "mini-chip-group");
  group.append(el("div", "event-subtitle", label));
  if (!names.length) {
    group.append(el("div", "mini-empty", emptyText));
    return group;
  }

  const chips = el("div", "chip-grid compact-chips");
  names.forEach((name) => {
    const chip = el("button", `chip switch-chip${tone ? ` is-${tone}` : ""}`);
    chip.type = "button";
    chip.classList.toggle("is-selected", selected.includes(name));
    chip.append(switchChipContent(name, iconKind));
    chip.addEventListener("click", () => onChange(toggleSelection(selected, name, maxSelected)));
    chips.append(chip);
  });
  group.append(chips);
  return group;
}

function switchChipContent(name, iconKind) {
  const wrap = el("span", "switch-chip-content");
  if (iconKind) {
    wrap.append(turnActionIcon(iconKind));
  }
  wrap.append(el("span", "switch-chip-name", name));
  return wrap;
}

function turnActionIcon(kind) {
  const common = {
    class: `turn-action-icon is-${kind}`,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };

  if (kind === "in") {
    return svgEl("svg", common, [
      svgEl("path", { d: "m10 17 5-5-5-5" }),
      svgEl("path", { d: "M15 12H3" }),
      svgEl("path", { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }),
    ]);
  }

  if (kind === "out") {
    return svgEl("svg", common, [
      svgEl("path", { d: "m16 17 5-5-5-5" }),
      svgEl("path", { d: "M21 12H9" }),
      svgEl("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
    ]);
  }

  if (kind === "ko") {
    return svgEl("svg", common, [
      svgEl("path", { d: "m12.5 17-.5-1-.5 1h1z" }),
      svgEl("path", { d: "M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" }),
      svgEl("circle", { cx: "15", cy: "12", r: "1" }),
      svgEl("circle", { cx: "9", cy: "12", r: "1" }),
    ]);
  }

  if (kind === "trash") {
    return svgEl("svg", common, [
      svgEl("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }),
      svgEl("path", { d: "M3 6h18" }),
      svgEl("path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
    ]);
  }

  return svgEl("svg", common);
}

function boardPanel(label, myActive, opponentActive) {
  const panel = el("div", "board-panel");
  panel.append(
    el("div", "mini-label", label),
    boardSide("Me", myActive),
    boardSide("Opp", opponentActive)
  );
  return panel;
}

function boardSide(label, names) {
  const row = el("div", "board-side");
  row.append(el("span", "", label));
  const chips = el("div", "board-chips");
  (names.length ? names : ["?"]).forEach((name) => chips.append(el("b", "", name)));
  row.append(chips);
  return row;
}

function switchOptions(names, active, selected, fainted = []) {
  return names.filter((name) => (!active.includes(name) || selected.includes(name)) && !fainted.includes(name));
}

function battleTeamNames(draft) {
  return draft.used?.length ? draft.used : activeTeamNames();
}

function getTurnEntryStatus(draft, myTeam, baseBoard = null) {
  const board = baseBoard ?? boardBeforeTurn(draft, draft.editingTurnNumber ?? draft.turns.length + 1);
  const myMissing = board.myFainted.length ? Math.max(0, 2 - board.myActive.length) : 0;
  const opponentMissing = board.opponentFainted.length ? Math.max(0, 2 - board.opponentActive.length) : 0;
  const myEntryChoices = replacementChoices(myTeam, board.myActive, board.myFainted, draft.turnDraft.myEntries);
  const opponentEntryChoices = replacementChoices(
    filledOpponentTeam(draft),
    board.opponentActive,
    board.opponentFainted,
    draft.turnDraft.opponentEntries
  );
  const myRequiredEntries = Math.min(myMissing, myEntryChoices.length);
  const opponentRequiredEntries = Math.min(opponentMissing, opponentEntryChoices.length);
  const needsMyEntry =
    myRequiredEntries > 0 &&
    (draft.turnDraft.myEntries.length < myRequiredEntries || !draft.turnDraft.myEntriesConfirmed);
  const needsOpponentEntry =
    opponentRequiredEntries > 0 &&
    (draft.turnDraft.opponentEntries.length < opponentRequiredEntries || !draft.turnDraft.opponentEntriesConfirmed);
  return {
    myMissing,
    opponentMissing,
    myRequiredEntries,
    opponentRequiredEntries,
    myEntryChoices,
    opponentEntryChoices,
    needsMyEntry,
    needsOpponentEntry,
    mustResolveEntries: needsMyEntry || needsOpponentEntry,
  };
}

function getNextTurnState(draft, myTeam) {
  const board = boardBeforeTurn(draft, draft.editingTurnNumber ?? draft.turns.length + 1);
  const myEntryChoices = replacementChoices(myTeam, board.myActive, board.myFainted, draft.turnDraft.myEntries);
  const opponentEntryChoices = replacementChoices(
    filledOpponentTeam(draft),
    board.opponentActive,
    board.opponentFainted,
    draft.turnDraft.opponentEntries
  );
  const myOutOfPokemon = board.myActive.length === 0 && myEntryChoices.length === 0;
  const opponentOutOfPokemon = board.opponentActive.length === 0 && opponentEntryChoices.length === 0;
  return {
    battleOver: myOutOfPokemon || opponentOutOfPokemon,
    myOutOfPokemon,
    opponentOutOfPokemon,
  };
}

function inferredBattleResult(draft) {
  if (!draft.turns?.length) return "";
  const finalBoard = boardBeforeTurn(draft, draft.turns.length + 1);
  if (finalBoard.myActive.length === 0 && finalBoard.opponentActive.length > 0) return "Loss";
  if (finalBoard.opponentActive.length === 0 && finalBoard.myActive.length > 0) return "Win";
  return "";
}

function replacementChoices(names, active, fainted = [], selected = []) {
  return names.filter((name) => !active.includes(name) && !fainted.includes(name));
}

function mergeChoices(available, selected) {
  return [...new Set([...(available ?? []), ...(selected ?? [])])];
}

function limitSelection(items, max) {
  return (items ?? []).slice(0, max);
}

function availableSwitchOuts(active, pairs = []) {
  const reserved = new Set((pairs ?? []).map((pair) => pair.out).filter(Boolean));
  return active.filter((name) => !reserved.has(name));
}

function switchBenchOptions(names, active, pairs = [], fainted = []) {
  const reserved = new Set(
    (pairs ?? [])
      .flatMap((pair) => [pair.out, pair.in])
      .filter(Boolean)
  );
  return names.filter((name) => !active.includes(name) && !reserved.has(name) && !fainted.includes(name));
}

function boardBeforeTurn(battle, turnNumber) {
  const myInitial = battle.used?.slice(0, 2) ?? [];
  const opponentInitial = battle.opponentLead?.slice(0, 2) ?? [];
  const board = {
    myActive: [...myInitial],
    opponentActive: [...opponentInitial],
    myKnown: battle.used ?? [],
    opponentKnown: (battle.opponentTeam ?? []).filter(Boolean),
    myFainted: [],
    opponentFainted: [],
  };

  (battle.turns ?? [])
    .filter((turn) => turn.number < turnNumber)
    .forEach((turn) => applyTurnToBoard(board, turn));

  return board;
}

function cloneBoard(board) {
  return {
    myActive: [...(board.myActive ?? [])],
    opponentActive: [...(board.opponentActive ?? [])],
    myKnown: [...(board.myKnown ?? [])],
    opponentKnown: [...(board.opponentKnown ?? [])],
    myFainted: [...(board.myFainted ?? [])],
    opponentFainted: [...(board.opponentFainted ?? [])],
  };
}

function previewBoard(baseBoard, turn, options = {}) {
  const next = cloneBoard(baseBoard);
  const includeEntries = options.includeEntries ?? true;
  const includeSwitches = options.includeSwitches ?? true;
  const includeKos = options.includeKos ?? true;
  applyTurnToBoard(next, {
    myEntries: includeEntries ? turn.myEntries ?? [] : [],
    opponentEntries: includeEntries ? turn.opponentEntries ?? [] : [],
    mySwitches: turn.mySwitches ?? [],
    opponentSwitches: turn.opponentSwitches ?? [],
    mySwitchPairs: turn.mySwitchPairs ?? [],
    opponentSwitchPairs: turn.opponentSwitchPairs ?? [],
    myKos: includeKos ? turn.myKos ?? [] : [],
    opponentKos: includeKos ? turn.opponentKos ?? [] : [],
  }, {
    includeSwitches,
  });
  return next;
}

function applyTurnToBoard(board, turn, options = {}) {
  const includeSwitches = options.includeSwitches ?? true;
  board.myActive = applyEntries(board.myActive, turn.myEntries ?? []);
  board.opponentActive = applyEntries(board.opponentActive, turn.opponentEntries ?? []);
  if (includeSwitches) {
    board.myActive = applySwitchEvents(board.myActive, turn.mySwitchPairs ?? [], turn.mySwitches ?? []);
    board.opponentActive = applySwitchEvents(board.opponentActive, turn.opponentSwitchPairs ?? [], turn.opponentSwitches ?? []);
  }
  board.myActive = board.myActive.filter((name) => !(turn.myKos ?? []).includes(name));
  board.opponentActive = board.opponentActive.filter((name) => !(turn.opponentKos ?? []).includes(name));
  board.myFainted = [...new Set([...board.myFainted, ...(turn.myKos ?? [])])];
  board.opponentFainted = [...new Set([...board.opponentFainted, ...(turn.opponentKos ?? [])])];
}

function applyEntries(active, entries) {
  const next = [...active];
  (entries ?? []).forEach((name) => {
    if (!name || next.includes(name)) return;
    if (next.length < 2) next.push(name);
  });
  return next.slice(0, 2);
}

function applySwitchEvents(active, switchPairs, switchIns) {
  let next = [...active];
  if (switchPairs.length) {
    switchPairs.forEach((pair) => {
      if (!pair.out || !pair.in) return;
      next = next.map((name) => (name === pair.out ? pair.in : name));
      if (!next.includes(pair.in)) next.push(pair.in);
    });
    return next.slice(0, 2);
  }

  return applySwitchIns(next, switchIns);
}

function applySwitchIns(active, switchIns) {
  const next = [...active];
  switchIns.forEach((name) => {
    if (!name || next.includes(name)) return;
    if (next.length >= 2) next.shift();
    next.push(name);
  });
  return next;
}

function filledOpponentTeam(draft) {
  return draft.opponentTeam.map((name) => name.trim()).filter(Boolean);
}

function opponentTeamReady(draft) {
  return filledOpponentTeam(draft).length === 6;
}

function pokemonSuggestions(draft) {
  return [...new Set([...POKEMON_NAMES, ...activeTeamNames(), ...filledOpponentTeam(draft)])].sort();
}

function enableNativeSuggest(input, listId, getNames) {
  input.autocomplete = "off";
  input.spellcheck = false;
  input.removeAttribute("list");
  input.addEventListener("input", () => {
    const value = input.value.trim().toLowerCase();
    const hasMatch =
      value.length >= 3 &&
      getNames().some((name) => name.toLowerCase().includes(value));
    if (!hasMatch) {
      input.removeAttribute("list");
      return;
    }
    input.setAttribute("list", listId);
    if (typeof input.showPicker !== "function") return;
    try {
      input.showPicker();
    } catch {}
  });
}

function toggleLimited(items, value, max) {
  if (items.includes(value)) return items.filter((item) => item !== value);
  if (items.length >= max) return items;
  return [...items, value];
}

function toggleSelection(items, value, max) {
  if (items.includes(value)) return items.filter((item) => item !== value);
  if (max === 1) return [value];
  if (items.length >= max) return items;
  return [...items, value];
}

function turnSummary(turn) {
  const parts = [];
  if (turn.note) parts.push(turn.note);
  return turnSummaryDetails(turn, parts);
}

function turnSummaryDetails(turn, parts = []) {
  if (turn.myEntries?.length) parts.push(`My in: ${turn.myEntries.join(" / ")}`);
  if (turn.opponentEntries?.length) parts.push(`Opponent in: ${turn.opponentEntries.join(" / ")}`);
  const mySwitchText = switchText(turn.mySwitchPairs, turn.mySwitches);
  const opponentSwitchText = switchText(turn.opponentSwitchPairs, turn.opponentSwitches);
  if (mySwitchText) parts.push(`My switch: ${mySwitchText}`);
  if (opponentSwitchText) parts.push(`Opponent switch: ${opponentSwitchText}`);
  if (turn.myKos?.length) parts.push(`My KO: ${turn.myKos.join(" / ")}`);
  if (turn.opponentKos?.length) parts.push(`Opponent KO: ${turn.opponentKos.join(" / ")}`);
  return parts.join(" | ") || "No note";
}

function renderBattleTurnRow(battle, turn) {
  const row = el("li", "turn-preview-card");
  const header = el("div", "turn-preview-header");
  header.append(el("strong", "", `Turn ${turn.number}`));
  row.append(header);

  appendTurnPreviewLines(row, battle, turn);
  return row;
}

function appendTurnPreviewLines(container, battle, turn) {
  const board = boardBeforeTurn(battle, turn.number);
  const boardStart = previewBoard(board, turn, { includeSwitches: false, includeKos: false });
  const boardAfter = previewBoard(board, turn);
  container.append(previewBoardLine("Start turn", boardStart));
  appendPreviewEventLines(container, turn);
  container.append(previewBoardLine("End turn", boardAfter));
  if (turn.note) {
    container.append(previewNoteLine(turn.note, turn.noteSource ?? inferTurnNoteSource(turn)));
  }
}

function previewBoardLine(label, board) {
  const line = el("div", "turn-preview-line turn-preview-board");
  line.append(el("strong", "turn-preview-board-label", label));

  const flow = el("div", "turn-preview-board-flow");
  const mySide = el("div", "turn-preview-board-side is-my");
  (board.myActive.length ? board.myActive : []).forEach((name) => {
    mySide.append(el("span", "roster-chip board-roster-chip is-lead-outline", name));
  });

  const opponentSide = el("div", "turn-preview-board-side is-opp");
  (board.opponentActive.length ? board.opponentActive : []).forEach((name) => {
    opponentSide.append(el("span", "roster-chip board-roster-chip is-lead", name));
  });

  if (board.myActive.length) flow.append(mySide);
  if (board.myActive.length && board.opponentActive.length) {
    flow.append(el("span", "turn-preview-board-vs", "VS"));
  }
  if (board.opponentActive.length) flow.append(opponentSide);
  line.append(flow);
  return line;
}

function previewNoteLine(text, source = "manual") {
  const line = el("div", "turn-preview-line turn-preview-note is-muted");
  const copy = el("div", "turn-preview-note-copy");
  copy.append(
    el("span", "turn-preview-note-label", source === "showdown" ? "Showdown log" : "Notes"),
    el("span", "turn-preview-note-text", text)
  );
  line.append(copy);
  return line;
}

function inferTurnNoteSource(turn) {
  return turn?.noteSource ?? (String(turn?.note ?? "").includes("\n") ? "showdown" : "manual");
}

function appendPreviewEventLines(container, turn) {
  previewEventItems(turn).forEach((event) => container.append(previewEventLine(event)));
}

function previewEventItems(turn) {
  const items = [];
  if (turn.myEntries?.length) items.push({ kind: "in", label: "My in", names: turn.myEntries });
  if (turn.opponentEntries?.length) items.push({ kind: "in", label: "Opponent in", names: turn.opponentEntries });
  (turn.mySwitchPairs ?? []).forEach((pair) => items.push({ kind: "switch", label: "My switch", out: pair.out, in: pair.in }));
  (turn.opponentSwitchPairs ?? []).forEach((pair) => items.push({ kind: "switch", label: "Opponent switch", out: pair.out, in: pair.in }));
  const myLooseSwitches = previewLooseSwitches(turn.mySwitchPairs, turn.mySwitches);
  if (myLooseSwitches.length) items.push({ kind: "in", label: "My switch", names: myLooseSwitches });
  const oppLooseSwitches = previewLooseSwitches(turn.opponentSwitchPairs, turn.opponentSwitches);
  if (oppLooseSwitches.length) items.push({ kind: "in", label: "Opponent switch", names: oppLooseSwitches });
  if (turn.myKos?.length) items.push({ kind: "ko", label: "My KO", names: turn.myKos });
  if (turn.opponentKos?.length) items.push({ kind: "ko", label: "Opponent KO", names: turn.opponentKos });
  return items;
}

function previewLooseSwitches(pairs = [], switches = []) {
  const usedIncoming = new Set((pairs ?? []).filter((pair) => pair?.in).map((pair) => pair.in));
  return (switches ?? []).filter((name) => name && !usedIncoming.has(name));
}

function previewEventLine(event) {
  const lineClass = event.kind === "switch" ? "turn-preview-line turn-preview-event is-muted is-switch" : "turn-preview-line turn-preview-event is-muted";
  const line = el("div", lineClass);
  line.append(el("span", "turn-preview-board-label turn-preview-event-section-label", event.label));
  if (event.kind === "switch") {
    const flow = el("span", "turn-preview-switch-flow");
    flow.append(
      previewEventChip(event.out || "?", "out"),
      previewEventChip(event.in || "?", "in")
    );
    line.append(flow);
    return line;
  }

  line.append(previewEventNames(event.kind, event.names ?? []));
  return line;
}

function previewEventNames(kind, names) {
  const wrap = el("span", "turn-preview-event-names");
  names.forEach((name) => {
    wrap.append(previewEventChip(name, kind));
  });
  return wrap;
}

function previewEventChip(name, kind) {
  const tone = kind === "ko" ? " is-ko-event" : "";
  const chip = el("span", `roster-chip board-roster-chip turn-event-chip${tone}`, "");
  chip.append(turnActionIcon(kind), el("span", "turn-event-chip-name", name));
  return chip;
}

function battleBoardLine(board) {
  const mySide = board.myActive.length ? board.myActive.join(" + ") : "?";
  const opponentSide = board.opponentActive.length ? board.opponentActive.join(" + ") : "?";
  return `${mySide} vs ${opponentSide}`;
}

function turnEventGroups(turn) {
  return [
    { label: "My entry", names: turn.myEntries ?? [] },
    { label: "Opponent entry", names: turn.opponentEntries ?? [] },
    { label: "My switch", names: switchLabels(turn.mySwitchPairs, turn.mySwitches) },
    { label: "Opponent switch", names: switchLabels(turn.opponentSwitchPairs, turn.opponentSwitches) },
    { label: "My KO", names: turn.myKos ?? [], tone: "ko" },
    { label: "Opponent KO", names: turn.opponentKos ?? [], tone: "ko" },
  ];
}

function switchText(pairs = [], switches = []) {
  const labels = switchLabels(pairs, switches);
  return labels.join(" / ");
}

function switchLabels(pairs = [], switches = []) {
  const pairLabels = pairs
    .filter((pair) => pair?.out && pair?.in)
    .map((pair) => `${pair.out} -> ${pair.in}`);
  const usedIncoming = new Set(
    pairs.filter((pair) => pair?.in).map((pair) => pair.in)
  );
  const orphanLabels = (switches ?? [])
    .filter((name) => name && !usedIncoming.has(name));
  return [...pairLabels, ...orphanLabels];
}

function renderReview() {
  const draft = state.draft;
  ensureDraftShape(draft);
  if (!["Win", "Loss"].includes(draft.result)) {
    const autoResult = inferredBattleResult(draft);
    if (autoResult) draft.result = autoResult;
  }

  const resultGroup = el("div", "group");
  resultGroup.append(el("div", "group-title", "Result"));
  const resultRow = el("div", "toggle-row");
  ["Win", "Loss"].forEach((result) => {
    const button = el("button", "toggle", result);
    button.type = "button";
    button.classList.toggle("is-selected", draft.result === result);
    button.addEventListener("click", () => {
      draft.result = result;
      render();
    });
    resultRow.append(button);
  });
  resultGroup.append(resultRow);

  const turnGroup = el("div", "group");
  turnGroup.append(el("div", "group-title", "Key Turn"));
  const turnGrid = el("div", "review-turn-list");
  const turns = draft.turns;
  turns.forEach((turn) => {
    const card = el("div", "review-turn-card");
    const header = el("div", "archive-turn-header");
    const pick = el(
      "button",
      draft.errorTurn === String(turn.number) ? "result-chip is-key key-turn-button" : "tiny-button key-turn-button",
      draft.errorTurn === String(turn.number) ? "Key turn" : "Set key turn"
    );
    pick.type = "button";
    pick.addEventListener("click", () => {
      draft.errorTurn = draft.errorTurn === String(turn.number) ? "" : String(turn.number);
      render();
    });
    header.append(el("strong", "", `Turn ${turn.number}`), pick);

    const feedbackField = el("div", "field compact-field turn-feedback-field");
    const feedbackLabel = el("label", "turn-preview-board-label plain-field-label", "Feedback");
    feedbackLabel.htmlFor = `turnFeedback${turn.number}`;
    const feedback = el("input", "mini-input");
    feedback.id = `turnFeedback${turn.number}`;
    feedback.value = turn.feedback ?? "";
    feedback.placeholder = "What I would change / what I learned";
    feedback.addEventListener("input", () => {
      turn.feedback = feedback.value;
      feedback.value = turn.feedback;
    });
    feedbackField.append(feedbackLabel, feedback);

    card.append(header);
    appendTurnPreviewLines(card, draft, turn);
    card.append(feedbackField);
    turnGrid.append(card);
  });
  turnGroup.append(turnGrid);

  const takeawayField = el("div", "field");
  const takeawayLabel = el("label", "", "Takeaways");
  takeawayLabel.htmlFor = "takeaway";
  const takeaway = el("textarea", "takeaway-note");
  takeaway.id = "takeaway";
  takeaway.rows = 3;
  takeaway.value = draft.takeaway ?? "";
  takeaway.placeholder = "One thing I’m taking away from this battle";
  takeaway.addEventListener("input", () => {
    draft.takeaway = takeaway.value;
    takeaway.value = draft.takeaway;
  });
  takeawayField.append(takeawayLabel, takeaway);

  const saveButton = el("button", "primary", "Save");
  saveButton.type = "button";
  saveButton.disabled = !["Win", "Loss"].includes(draft.result) || !opponentTeamReady(draft);
  saveButton.addEventListener("click", () => {
    if (!["Win", "Loss"].includes(draft.result) || !opponentTeamReady(draft)) return;
    const team = activeTeam();
    const { editingTurnNumber, turnDraft, ...savedDraft } = draft;
    state.battles.unshift({
      ...savedDraft,
      teamId: team?.id ?? "",
      teamName: team?.name ?? "",
      teamNames: team?.names ?? activeTeamNames(),
      lead: draft.used.slice(0, 2),
      back: draft.used.slice(2, 4),
      savedAt: new Date().toISOString(),
    });
    writeJson(STORAGE.battles, state.battles);
    state.draft = null;
    setPage("dashboard");
  });

  screen.append(resultGroup, turnGroup, takeawayField);
  actionBar.append(saveButton);
}

function renderDashboard() {
  const filtered = getDashboardBattles();
  const performance = getDashboardPerformance(filtered);
  const kpis = getDashboardKpis(filtered);

  const performanceBlock = el("div", `dash-block dashboard-hero trend-${performance.trend}`);
  const heroHead = el("div", "dashboard-hero-head");
  heroHead.append(
    el("strong", "dashboard-card-title", "Performance"),
    el("div", `trend-pill is-${performance.trend}`, performance.trendLabel)
  );

  const rangeRow = el("div", "segment-row dashboard-range-row");
  [
    ["day", "Day"],
    ["week", "Week"],
    ["month", "Month"],
    ["global", "All time"],
  ].forEach(([value, label]) => {
    const button = el("button", "segment-button", label);
    button.type = "button";
    button.classList.toggle("is-selected", state.dashboardRange === value);
    button.addEventListener("click", () => {
      state.dashboardRange = value;
      render();
    });
    rangeRow.append(button);
  });

  const heroPrimary = el("div", "dashboard-hero-primary");
  const heroRate = el("div", "dashboard-hero-rate");
  heroRate.append(
    el("strong", "", `${performance.current}%`),
    el("span", "", performance.rateCaption)
  );
  const heroContext = el("div", "dashboard-hero-context");
  heroContext.append(
    el("div", "dashboard-context-line", performance.deltaLabel),
    el("div", "dashboard-context-line is-muted", performance.matchesLabel)
  );
  heroPrimary.append(heroRate, heroContext);

  const heroStats = el("div", "dashboard-mini-grid");
  heroStats.append(
    dashboardMiniStat("Latest window", `${performance.current}%`, performance.recentCount ? `${performance.recentCount} decided matches` : "No matches yet"),
    dashboardMiniStat("Previous window", performance.previousCount ? `${performance.previous}%` : "—", performance.previousCount ? `${performance.previousCount} decided matches` : "No earlier window"),
    dashboardMiniStat("Record", `${kpis.wins}-${kpis.losses}`, rangeLabel())
  );

  performanceBlock.append(
    heroHead,
    rangeRow,
    heroPrimary,
    performanceChart(performance.series, performance.trend),
    heroStats
  );

  screen.append(performanceBlock);
}

function renderTeams() {
  if (state.teamImportOpen || !state.teams.length) {
    renderImport();
    return;
  }

  const active = activeTeam();
  const activeBlock = el("div", "dash-block");
  activeBlock.append(el("div", "dash-label", "Active Team"), teamNames(active.names));

  const addTeamButton = el("button", "primary", "Add team");
  addTeamButton.type = "button";
  addTeamButton.addEventListener("click", () => {
    state.parsedTeam = [];
    state.teamImportOpen = true;
    render();
  });

  const savedGroup = el("div", "group");
  savedGroup.append(el("div", "group-title", "Saved Teams"));
  const list = el("div", "team-list");
  state.teams.forEach((team) => {
    const row = el("div", "team-card");
    row.classList.toggle("is-active", team.id === state.activeTeamId);

    const body = el("div", "team-card-main");
    const header = el("div", "team-card-header");
    const title = el("input", "team-card-title");
    title.type = "text";
    title.value = team.name ?? "";
    title.placeholder = "Team name";
    title.addEventListener("input", () => {
      team.name = title.value.slice(0, 60);
    });
    title.addEventListener("blur", () => {
      team.name = title.value.trim();
      title.value = team.name;
      writeJson(STORAGE.teams, state.teams);
      render();
    });
    const statusWrap = el("div", "team-card-status");
    header.append(title, statusWrap);

    const roster = teamNames(team.names);
    roster.classList.add("team-card-roster-slots");
    body.append(header, roster);

    if (team.id === state.activeTeamId) {
      const activeTag = el("button", "result-chip is-key key-turn-button team-status-button", "Active");
      activeTag.type = "button";
      activeTag.disabled = true;
      statusWrap.append(activeTag);
    } else {
      const setActive = el("button", "tiny-button key-turn-button team-status-button", "Set active");
      setActive.type = "button";
      setActive.addEventListener("click", () => activateTeam(team.id));
      statusWrap.append(setActive);
    }

    const remove = el("button", "tiny-button is-danger team-delete-button", "Delete");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!confirm("Delete this team? This cannot be undone.")) return;
      deleteTeam(team.id);
    });
    body.append(remove);

    row.append(body);
    list.append(row);
  });
  savedGroup.append(list);

  screen.append(activeBlock, addTeamButton, savedGroup);
}

function activateTeam(teamId) {
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return;
  state.activeTeamId = team.id;
  writeJson(STORAGE.activeTeamId, state.activeTeamId);
  writeJson(STORAGE.team, team.names);
  render();
}

function renderArchive() {
  if (state.archiveDetailId) {
    renderArchiveDetail();
    return;
  }

  screen.append(renderArchiveImportGroup());

  if (!state.battles.length) {
    screen.append(el("div", "empty", "No saved games yet."));
    return;
  }

  const list = el("div", "archive-list");
  state.battles.forEach((battle, index) => {
    const card = el("button", "archive-card");
    card.type = "button";
    const header = el("div", "archive-card-header");
    header.append(
      el("strong", "", formatDate(battle.savedAt ?? battle.createdAt)),
      resultChip(battle.result)
    );
    const compare = archivePicksCompareRow(battle, true);
    card.append(header);
    if (compare) card.append(compare);
    if (battle.note) {
      const preview = el("div", "archive-card-preview");
      preview.append(previewLabeledText("Game Plan", battle.note));
      if (battle.takeaway) {
        preview.append(previewLabeledText("Takeaways", battle.takeaway, true));
      }
      card.append(preview);
    } else if (battle.takeaway) {
      const preview = el("div", "archive-card-preview");
      preview.append(previewLabeledText("Takeaways", battle.takeaway, true));
      card.append(preview);
    }
    card.addEventListener("click", () => {
      state.archiveDetailId = String(index);
      render();
    });
    list.append(card);
  });
  screen.append(list);
}

function renderArchiveImportGroup() {
  const group = el("div", "settings-grid archive-import-grid");

  const replayInput = el("input", "file-input");
  replayInput.type = "file";
  replayInput.accept = "text/html,.html";
  replayInput.addEventListener("change", () => {
    const file = replayInput.files?.[0];
    if (file) handleBattleReplayFile(file);
    replayInput.value = "";
  });

  const markdownInput = el("input", "file-input");
  markdownInput.type = "file";
  markdownInput.accept = "text/markdown,.md,text/plain";
  markdownInput.addEventListener("change", () => {
    const file = markdownInput.files?.[0];
    if (file) handleBattleMarkdownFile(file);
    markdownInput.value = "";
  });

  if (!state.replayImport) {
    const replayButton = el("button", "secondary import-button", "Import Showdown Replay");
    replayButton.type = "button";
    replayButton.addEventListener("click", () => replayInput.click());

    const markdownButton = el("button", "secondary import-button", "Import from markdown");
    markdownButton.type = "button";
    markdownButton.addEventListener("click", () => markdownInput.click());

    group.append(replayButton, markdownButton, replayInput, markdownInput);
    return group;
  }

  group.append(replayInput, markdownInput);
  const prompt = el("div", "group replay-import-prompt");
  const promptHeader = el("div", "archive-card-header");
  promptHeader.append(
    el("div", "turn-preview-board-label", "Which side are you?"),
    replayCancelButton()
  );
  const options = el("div", "replay-choice-list");
  ["p1", "p2"].forEach((side) => options.append(replayChoiceButton(state.replayImport, side)));
  const confirm = el("button", "primary", "Confirm side");
  confirm.type = "button";
  confirm.disabled = !state.replayImportChoice;
  confirm.addEventListener("click", () => {
    if (!state.replayImportChoice) return;
    finalizeReplayImport(state.replayImportChoice);
  });
  prompt.append(promptHeader, options, confirm);
  group.append(prompt);
  return group;
}

function renderArchiveDetail() {
  const battle = state.battles[Number(state.archiveDetailId)];
  if (!battle) {
    state.archiveDetailId = "";
    renderArchive();
    return;
  }

  const summary = el("div", "dash-block");
  const summaryHeader = el("div", "archive-card-header");
  summaryHeader.append(
    el("strong", "", formatDate(battle.savedAt ?? battle.createdAt)),
    resultChip(battle.result)
  );
  summary.append(summaryHeader);

  const opponent = rosterBlock("Opponent Picks", [
    { label: "Team", names: (battle.opponentTeam ?? []).filter(Boolean) },
    { label: "Lead", names: battle.opponentLead ?? [], tone: "lead" },
    { label: "Back", names: observedOpponentBack(battle), tone: "back" },
  ]);

  const team = rosterBlock("My Picks", [
    { label: "Lead", names: battle.lead ?? battle.used.slice(0, 2), tone: "lead-outline" },
    { label: "Back", names: battle.back ?? battle.used.slice(2, 4), tone: "back-outline" },
  ]);
  const picksCompare = archivePicksCompareRow(battle);
  const teamPreview = el("div", "group");
  teamPreview.append(el("div", "group-title", "Team Preview"));
  if (picksCompare ?? team ?? opponent) {
    teamPreview.append(picksCompare ?? team ?? opponent);
  }

  const gamePlan = el("div", "group");
  gamePlan.append(el("div", "group-title", "Game Plan"));

  const turns = el("div", "group");
  turns.append(el("div", "group-title", "Turns"));
  const turnList = el("div", "archive-turns");
  if (battle.turns?.length) {
    battle.turns.forEach((turn) => {
      const card = el("div", "archive-turn-card");
      const header = el("div", "archive-turn-header");
      const keyTurnButton = el(
        "button",
        battle.errorTurn === String(turn.number) ? "result-chip is-key key-turn-button" : "tiny-button key-turn-button",
        battle.errorTurn === String(turn.number) ? "Key turn" : "Set key turn"
      );
      keyTurnButton.type = "button";
      keyTurnButton.addEventListener("click", () => {
        battle.errorTurn = battle.errorTurn === String(turn.number) ? "" : String(turn.number);
        writeJson(STORAGE.battles, state.battles);
        render();
      });
      header.append(
        el("strong", "archive-turn-title", `Turn ${turn.number}`),
        keyTurnButton
      );
      card.append(header);
      appendTurnPreviewLines(card, battle, turn);

      const feedbackField = el("div", "field compact-field turn-feedback-field");
      const feedbackLabel = el("label", "turn-preview-board-label plain-field-label", "Feedback");
      feedbackLabel.htmlFor = `archiveTurnFeedback${turn.number}`;
      const feedback = el("textarea", "archive-feedback-input auto-grow-textarea");
      feedback.id = `archiveTurnFeedback${turn.number}`;
      feedback.rows = 2;
      feedback.value = turn.feedback ?? "";
      autoResizeTextarea(feedback);
      feedback.addEventListener("input", () => {
        turn.feedback = feedback.value;
        feedback.value = turn.feedback;
        autoResizeTextarea(feedback);
        writeJson(STORAGE.battles, state.battles);
      });
      feedbackField.append(feedbackLabel, feedback);
      card.append(feedbackField);
      turnList.append(card);
    });
  } else {
    turnList.append(el("div", "empty", "No turn notes."));
  }
  turns.append(turnList);

  const snapshotField = el("div", "field compact-field");
  const snapshot = el("textarea", "takeaway-note archive-takeaway-note");
  snapshot.id = "archiveBattleSnapshot";
  snapshot.rows = 4;
  snapshot.value = battle.note ?? "";
  autoResizeTextarea(snapshot);
  snapshot.addEventListener("input", () => {
    battle.note = snapshot.value;
    snapshot.value = battle.note;
    autoResizeTextarea(snapshot);
    writeJson(STORAGE.battles, state.battles);
  });
  snapshotField.append(snapshot);
  gamePlan.append(snapshotField);

  const takeaways = el("div", "group");
  takeaways.append(el("div", "group-title", "Takeaways"));
  const takeawayField = el("div", "field compact-field");
  const takeaway = el("textarea", "takeaway-note archive-takeaway-note");
  takeaway.id = "archiveTakeaway";
  takeaway.rows = 3;
  takeaway.value = battle.takeaway ?? battle.finalRule ?? battle.betterLine ?? "";
  autoResizeTextarea(takeaway);
  takeaway.addEventListener("input", () => {
    battle.takeaway = takeaway.value;
    takeaway.value = battle.takeaway;
    autoResizeTextarea(takeaway);
    writeJson(STORAGE.battles, state.battles);
  });
  takeawayField.append(takeaway);
  takeaways.append(takeawayField);

  const exportBattleButton = el("button", "secondary export-button", "Export battle");
  exportBattleButton.type = "button";
  exportBattleButton.addEventListener("click", () => {
    const stamp = dateStamp(battle.savedAt ?? battle.createdAt);
    download(
      `battle-log-${stamp}.md`,
      battleToMarkdown(battle),
      "text/markdown;charset=utf-8"
    );
  });

  const deleteBattleButton = el("button", "danger-button", "Delete");
  deleteBattleButton.type = "button";
  deleteBattleButton.addEventListener("click", () => {
    if (!confirm("Delete this battle? This cannot be undone.")) return;
    deleteBattle(Number(state.archiveDetailId));
  });

  const battleActions = el("div", "archive-detail-actions");
  battleActions.append(deleteBattleButton, exportBattleButton);

  [summary, teamPreview, gamePlan, turns, takeaways, battleActions].filter(Boolean).forEach((node) => screen.append(node));
}

function archivePicksCompareRow(battle, compact = false) {
  const myNames = (battle.teamNames ?? []).filter(Boolean);
  const opponentNames = (battle.opponentTeam ?? []).filter(Boolean);
  if (!myNames.length && !opponentNames.length) return null;

  const row = el("div", `picks-compare-grid${compact ? " is-compact" : ""}`);
  const myLead = new Set(battle.lead ?? battle.used.slice(0, 2));
  const myBack = new Set(battle.back ?? battle.used.slice(2, 4));
  const opponentLead = new Set(battle.opponentLead ?? []);
  const opponentBack = new Set(observedOpponentBack(battle));

  row.append(
    picksCompareCard("My Team", myNames, (name) => {
      if (myLead.has(name)) return "lead-outline";
      if (myBack.has(name)) return "back-outline";
      return "";
    }, compact),
    picksCompareCard("Opponent Team", opponentNames, (name) => {
      if (opponentLead.has(name)) return "lead";
      if (opponentBack.has(name)) return "back";
      return "";
    }, compact)
  );

  return row;
}

function picksCompareCard(title, names, toneForName, compact = false) {
  const card = el("div", `dash-block picks-compare-card${compact ? " is-compact" : ""}`);
  card.append(el("div", "dash-label", title));
  const list = el("div", `picks-compare-list${compact ? " is-compact" : ""}`);
  names.forEach((name) => {
    const tone = toneForName(name);
    list.append(el("span", `roster-chip picks-compare-chip ${compact ? "is-compact " : ""}${tone ? `is-${tone}` : ""}`.trim(), name));
  });
  card.append(list);
  return card;
}

function rosterBlock(title, groups, framed = true) {
  const visibleGroups = groups
    .map((group) => ({ ...group, names: (group.names ?? []).filter(Boolean) }))
    .filter((group) => group.names.length);
  if (!visibleGroups.length) return null;

  const block = el("div", framed ? "dash-block roster-block" : "roster-block");
  block.append(el("div", "dash-label", title));
  visibleGroups.forEach((group) => {
    const section = el("div", "roster-section");
    section.append(el("div", "mini-label", group.label));
    const chips = el("div", "roster-chips");
    group.names.forEach((name) => {
      const chip = el("span", `roster-chip ${group.tone ? `is-${group.tone}` : ""}`, name);
      chips.append(chip);
    });
    section.append(chips);
    block.append(section);
  });
  return block;
}

function compactRosterRow(label, names, toneForName) {
  const row = el("div", "archive-card-roster");
  row.append(el("div", "archive-card-label", label));
  const chips = el("div", "archive-card-chips");
  names.forEach((name) => {
    const tone = toneForName(name);
    chips.append(el("span", `roster-chip archive-card-chip ${tone ? `is-${tone}` : ""}`, name));
  });
  row.append(chips);
  return row;
}

function resultChip(result) {
  const tone = result === "Win" ? "is-win" : result === "Loss" ? "is-loss" : "";
  return el("span", `result-chip ${tone}`.trim(), result || "Pending");
}

function previewLabeledText(label, text, muted = false) {
  const block = el("div", `turn-preview-line turn-preview-note${muted ? " is-muted" : ""}`);
  const copy = el("div", "turn-preview-note-copy");
  copy.append(
    el("span", "turn-preview-note-label", label),
    el("span", "turn-preview-note-text", text)
  );
  block.append(copy);
  return block;
}

function observedOpponentBack(battle) {
  const lead = new Set(battle.opponentLead ?? []);
  const seenBack = new Set();
  (battle.turns ?? []).forEach((turn) => {
    (turn.opponentEntries ?? []).forEach((name) => {
      if (name && !lead.has(name)) seenBack.add(name);
    });
    (turn.opponentSwitchPairs ?? []).forEach((pair) => {
      if (pair?.in && !lead.has(pair.in)) seenBack.add(pair.in);
    });
    (turn.opponentSwitches ?? []).forEach((name) => {
      if (name && !lead.has(name)) seenBack.add(name);
    });
  });
  return [...seenBack];
}

function renderSettings() {
  const backup = el("div", "dash-block");
  backup.append(
    el("div", "dash-label", "Backup"),
    el("p", "dash-text", "Export or import your full app data backup.")
  );

  const exportAll = el("button", "secondary export-button", "Export backup");
  exportAll.type = "button";
  exportAll.addEventListener("click", () => {
    download("vgc-notes-backup.json", JSON.stringify(createBackup(), null, 2), "application/json;charset=utf-8");
  });

  const importInput = el("input", "file-input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) importBackupFile(file);
    importInput.value = "";
  });

  const importAll = el("button", "secondary import-button", "Import backup");
  importAll.type = "button";
  importAll.addEventListener("click", () => importInput.click());

  const actions = el("div", "settings-grid settings-actions-row");
  actions.append(exportAll, importAll, importInput);

  const danger = el("div", "dash-block danger-block");
  danger.append(el("div", "dash-label", "Danger"), el("p", "dash-text", "Delete all teams and battles from this browser."));
  const deleteAll = el("button", "danger-button", "Delete all data");
  deleteAll.type = "button";
  deleteAll.addEventListener("click", () => {
    if (!confirm("Delete all VGC notes from this browser? This cannot be undone.")) return;
    clearAllData();
  });
  danger.append(deleteAll);

  screen.append(backup, actions, danger);
}

function activeTeam() {
  return state.teams.find((team) => team.id === state.activeTeamId) ?? state.teams[0] ?? null;
}

function activeTeamNames() {
  return activeTeam()?.names ?? [];
}

function savedTeamById(teamId) {
  return state.teams.find((team) => team.id === teamId) ?? null;
}

function battleFullTeamNames(battle) {
  if (battle?.teamNames?.length) return battle.teamNames.filter(Boolean);
  const savedTeam = battle?.teamId ? savedTeamById(battle.teamId) : null;
  if (savedTeam?.names?.length) return savedTeam.names.filter(Boolean);
  return [...new Set([...(battle?.used ?? []), ...(battle?.lead ?? []), ...(battle?.back ?? [])])].filter(Boolean);
}

function teamNames(names) {
  const list = el("div", "team-name-list");
  names.forEach((name) => list.append(el("span", "", name)));
  return list;
}

function teamLabel(names) {
  return `${names[0]} / ${names[1]}`;
}

function deleteTeam(teamId) {
  state.teams = state.teams.filter((team) => team.id !== teamId);
  if (state.activeTeamId === teamId) {
    state.activeTeamId = state.teams[0]?.id ?? "";
  }
  writeJson(STORAGE.teams, state.teams);
  writeJson(STORAGE.activeTeamId, state.activeTeamId);
  writeJson(STORAGE.team, activeTeamNames());
  render();
}

function deleteBattle(index) {
  if (index < 0 || index >= state.battles.length) return;
  state.battles.splice(index, 1);
  writeJson(STORAGE.battles, state.battles);
  state.archiveDetailId = "";
  render();
}

function formatDate(value) {
  if (!value) return "Saved";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function parseTeam(text) {
  const skips = [
    /^ability:/i,
    /^level:/i,
    /^tera type:/i,
    /^evs:/i,
    /^ivs:/i,
    /^shiny:/i,
    /^happiness:/i,
    /^gigantamax:/i,
    /^- /,
    / nature$/i,
  ];

  const names = [];

  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (names.length >= 6 || skips.some((pattern) => pattern.test(line)) || line.includes(":")) {
        return;
      }

      const beforeItem = line.split("@")[0].trim();
      let name = beforeItem;
      const species = beforeItem.match(/\(([^)]+)\)/);
      if (species && !["M", "F"].includes(species[1])) {
        name = species[1];
      }
      name = name.replace(/\s+\((M|F)\)$/i, "").trim();

      if (name && !names.includes(name)) {
        names.push(name);
      }
    });

  return names;
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 64)}px`;
}

function getRollingPerformance() {
  const decided = state.battles.filter((battle) => ["Win", "Loss"].includes(battle.result));
  const recent = decided.slice(0, 10);
  const previous = decided.slice(10, 20);
  const current = getRate(recent);
  const prior = getRate(previous);
  const diff = current - prior;
  const hasComparison = previous.length > 0;
  const trend = !hasComparison || Math.abs(diff) < 5 ? "stable" : diff > 0 ? "improving" : "declining";
  const arrows = { improving: "^ improving", stable: "-> stable", declining: "v declining" };

  return {
    current,
    previous: prior,
    trend,
    arrow: arrows[trend],
  };
}

function getDashboardBattles() {
  return state.battles.filter((battle) => {
    const savedAt = battle.savedAt ?? battle.createdAt;
    if (!matchesDashboardRange(savedAt)) return false;
    return true;
  });
}

function matchesDashboardRange(value) {
  if (state.dashboardRange === "global") return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (state.dashboardRange === "day") {
    return date >= start;
  }
  if (state.dashboardRange === "week") {
    start.setDate(start.getDate() - 6);
    return date >= start;
  }
  if (state.dashboardRange === "month") {
    start.setDate(start.getDate() - 29);
    return date >= start;
  }
  return true;
}

function getDashboardPerformance(filteredBattles) {
  const decided = filteredBattles.filter((battle) => ["Win", "Loss"].includes(battle.result));
  const recent = decided.slice(0, 10);
  const previous = decided.slice(10, 20);
  const current = getRate(recent);
  const prior = getRate(previous);
  const diff = current - prior;
  const hasComparison = previous.length > 0;
  const trend = !hasComparison || Math.abs(diff) < 5 ? "stable" : diff > 0 ? "improving" : "declining";
  const trendLabel = { improving: "Improving", stable: "Stable", declining: "Declining" }[trend];
  const rateCaption = recent.length ? `Win rate in the latest window` : `No decided matches yet`;
  const deltaLabel = !hasComparison
    ? "No earlier comparison window yet."
    : `Compared with the previous ${previous.length}: ${prior}% (${diff > 0 ? "+" : ""}${diff})`;

  return {
    current,
    previous: prior,
    trend,
    trendLabel,
    rateCaption,
    deltaLabel,
    series: getDashboardSeries(decided),
    recentCount: recent.length,
    previousCount: previous.length,
    matchesLabel: decided.length ? `${decided.length} decided matches in ${rangeLabel().toLowerCase()}` : `No decided matches in ${rangeLabel().toLowerCase()}`,
  };
}

function getDashboardSeries(battles) {
  const matches = battles
    .slice(0, 20)
    .reverse()
    .map((battle) => (battle.result === "Win" ? 1 : 0));

  return matches.map((_, index) => {
    const window = matches.slice(Math.max(0, index - 9), index + 1);
    const wins = window.reduce((sum, result) => sum + result, 0);
    return Math.round((wins / window.length) * 100);
  });
}

function getDashboardKpis(filteredBattles) {
  const decided = filteredBattles.filter((battle) => ["Win", "Loss"].includes(battle.result));
  const wins = decided.filter((battle) => battle.result === "Win").length;
  const losses = decided.filter((battle) => battle.result === "Loss").length;
  const reviewed = filteredBattles.filter(hasReviewData);
  const avgTurns = filteredBattles.length
    ? (filteredBattles.reduce((sum, battle) => sum + (battle.turns?.length ?? 0), 0) / filteredBattles.length).toFixed(1)
    : "0.0";

  return {
    matches: filteredBattles.length,
    matchesSub: rangeLabel(),
    winRate: getRate(decided),
    wins,
    losses,
    reviewRate: filteredBattles.length ? Math.round((reviewed.length / filteredBattles.length) * 100) : 0,
    reviewSub: reviewed.length ? `${reviewed.length} with takeaway/feedback` : "No review notes",
    avgTurns,
    avgTurnsSub: filteredBattles.length ? "turn notes per battle" : "No battles",
    topArchetype: topArchetype(filteredBattles),
    topLead: topLeadPair(filteredBattles),
  };
}

function hasReviewData(battle) {
  return Boolean(
    battle.takeaway ||
    battle.errorTurn ||
    (battle.turns ?? []).some((turn) => turn.feedback)
  );
}

function topArchetype(battles) {
  const tags = battles
    .flatMap((battle) => battle.archetypes ?? [])
    .filter(Boolean);
  if (!tags.length) return "No opponent tags yet";
  return mostFrequent(tags);
}

function topLeadPair(battles) {
  const pairs = battles
    .map((battle) => (battle.lead ?? battle.used?.slice(0, 2) ?? []).filter(Boolean))
    .filter((lead) => lead.length === 2)
    .map((lead) => lead.join(" / "));
  if (!pairs.length) return "No lead data yet";
  return mostFrequent(pairs);
}

function rangeLabel() {
  const labels = {
    day: "Today",
    week: "Last 7 days",
    month: "Last 30 days",
    global: "All time",
  };
  return labels[state.dashboardRange];
}

function getRate(battles) {
  if (!battles.length) return 0;
  const wins = battles.filter((battle) => battle.result === "Win").length;
  return Math.round((wins / battles.length) * 100);
}

function winLossSubline(wins, losses) {
  const row = el("div", "kpi-sub kpi-sub-stats");
  if (!wins && !losses) {
    row.textContent = "No result yet";
    return row;
  }

  row.append(
    el("span", "kpi-sub-stat is-win", `W: ${wins}`),
    el("span", "kpi-sub-divider", "/"),
    el("span", "kpi-sub-stat is-loss", `L: ${losses}`)
  );
  return row;
}

function getPerformanceSeries() {
  const matches = state.battles
    .filter((battle) => ["Win", "Loss"].includes(battle.result))
    .slice(0, 20)
    .reverse()
    .map((battle) => (battle.result === "Win" ? 1 : 0));

  return matches.map((_, index) => {
    const window = matches.slice(Math.max(0, index - 9), index + 1);
    const wins = window.reduce((sum, result) => sum + result, 0);
    return Math.round((wins / window.length) * 100);
  });
}

function performanceChart(series, trend = "stable") {
  const wrap = el("div", "chart-wrap");
  if (!series.length) {
    wrap.append(el("div", "chart-empty", "Play matches to draw trend."));
    return wrap;
  }
  if (!window.echarts) {
    wrap.append(el("div", "chart-empty", "Chart library not available."));
    return wrap;
  }
  const chart = el("div", "echart-canvas");
  wrap.append(chart);
  requestAnimationFrame(() => initPerformanceChart(chart, series, trend));
  return wrap;
}

function initPerformanceChart(node, series, trend = "stable") {
  if (!node.isConnected || !window.echarts) return;
  const lineColor = trend === "declining" ? "#ff756f" : trend === "stable" ? "#9fb2c8" : "#5ee0c2";
  const areaTop = trend === "declining" ? "rgba(255,117,111,0.24)" : trend === "stable" ? "rgba(159,178,200,0.22)" : "rgba(94,224,194,0.28)";
  const areaBottom = trend === "declining" ? "rgba(255,117,111,0.04)" : trend === "stable" ? "rgba(159,178,200,0.03)" : "rgba(94,224,194,0.03)";
  const chart = window.echarts.init(node, null, { renderer: "svg" });
  performanceChartInstance = chart;
  chart.setOption({
    animation: false,
    grid: { left: 10, right: 10, top: 12, bottom: 8, containLabel: false },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#10141a",
      borderColor: "#29313b",
      padding: [10, 12],
      textStyle: { color: "#f4f6f8", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700 },
      formatter(params) {
        const point = Array.isArray(params) ? params[0] : params;
        return `Match ${point.dataIndex + 1}<br/>Win rate: ${point.value}%`;
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: series.map((_, index) => index + 1),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: {
        lineStyle: {
          color: "rgba(143, 155, 170, 0.16)",
          width: 1,
        },
      },
    },
    series: [
      {
        type: "line",
        data: series,
        smooth: 0.38,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { color: lineColor, width: 4, cap: "round", join: "round" },
        itemStyle: { color: "#080a0d", borderColor: lineColor, borderWidth: 2 },
        emphasis: { scale: false },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: areaTop },
            { offset: 1, color: areaBottom },
          ]),
        },
      },
    ],
  });

  if (typeof ResizeObserver === "function") {
    performanceChartResizeObserver = new ResizeObserver(() => chart.resize());
    performanceChartResizeObserver.observe(node);
  }
}

function dashboardMiniStat(label, value, note) {
  const card = el("div", "dashboard-mini-card");
  card.append(
    el("div", "dashboard-mini-label", label),
    el("div", "dashboard-mini-value", value),
    el("div", "dashboard-mini-note", note)
  );
  return card;
}

function getMostCommonMistake() {
  const recent = state.battles.slice(0, 10);
  if (!recent.length) return "No reviews yet.";

  const rules = recent.map((battle) => battle.finalRule).filter(Boolean);
  if (rules.length) return mistakeFromRule(mostFrequent(rules));

  const betterLines = recent.map((battle) => battle.betterLine).filter(Boolean);
  if (betterLines.length) return `Missed line: ${sentenceCase(mostFrequent(betterLines))}`;

  return "No clear mistake yet.";
}

function getActiveRule() {
  const rules = state.battles.map((battle) => battle.finalRule).filter(Boolean);
  if (!rules.length) return "Save one review to set a rule.";
  return rules[0];
}

function mostFrequent(items) {
  const counts = new Map();
  items.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function mistakeFromRule(rule) {
  const match = rule.match(/^if\s+(.+?),?\s+then\s+(.+)$/i);
  if (!match) return sentenceCase(rule);
  return sentenceCase(`Trouble when ${match[1]}`);
}

function sentenceCase(text) {
  const clean = text.trim();
  if (!clean) return "";
  return clean.charAt(0) + clean.slice(1);
}

function createBackup() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      teams: state.teams,
      activeTeamId: state.activeTeamId,
      battles: state.battles,
    },
  };
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const backup = JSON.parse(String(reader.result));
      const data = backup.data ?? backup;
      if (!Array.isArray(data.teams) || !Array.isArray(data.battles)) {
        throw new Error("Invalid backup");
      }

      state.teams = data.teams;
      state.battles = data.battles;
      state.activeTeamId = data.activeTeamId || data.teams[0]?.id || "";
      state.draft = null;
      state.parsedTeam = [];
      state.teamImportOpen = false;
      state.archiveDetailId = "";

      writeJson(STORAGE.teams, state.teams);
      writeJson(STORAGE.battles, state.battles);
      writeJson(STORAGE.activeTeamId, state.activeTeamId);
      writeJson(STORAGE.team, activeTeamNames());
      setPage("dashboard");
    } catch {
      alert("Invalid backup.");
    }
  });
  reader.readAsText(file);
}

function handleBattleReplayFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state.replayImport = parseShowdownReplayHtml(String(reader.result));
      state.replayImportChoice = "";
      render();
    } catch {
      alert("Invalid replay HTML.");
    }
  });
  reader.readAsText(file);
}

function finalizeReplayImport(mySide) {
  if (!state.replayImport) return;
  const battle = buildBattleFromReplay(state.replayImport, mySide);
  state.battles.unshift(battle);
  writeJson(STORAGE.battles, state.battles);
  state.replayImport = null;
  state.replayImportChoice = "";
  state.archiveDetailId = "0";
  state.view = "archive";
  render();
}

function handleBattleMarkdownFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const battle = parseBattleMarkdown(String(reader.result));
      state.battles.unshift(battle);
      writeJson(STORAGE.battles, state.battles);
      state.archiveDetailId = "0";
      state.view = "archive";
      render();
    } catch {
      alert("Invalid battle markdown.");
    }
  });
  reader.readAsText(file);
}

function clearAllData() {
  Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
  state.teams = [];
  state.activeTeamId = "";
  state.battles = [];
  state.draft = null;
  state.parsedTeam = [];
  state.teamImportOpen = false;
  state.archiveDetailId = "";
  setPage("dashboard");
}

function parseShowdownReplayHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const log = doc.querySelector("script.battle-log-data");
  if (!log?.textContent) throw new Error("Missing replay log");
  return parseShowdownReplayLog(log.textContent);
}

function parseShowdownReplayLog(rawLog) {
  const sides = {
    p1: { playerName: "", team: [], used: [], lead: [], active: { a: "", b: "" }, pendingEntries: [] },
    p2: { playerName: "", team: [], used: [], lead: [], active: { a: "", b: "" }, pendingEntries: [] },
  };
  const turns = [];
  let currentTurn = null;
  let currentTurnNumber = 0;
  let pendingTurnNotes = [];
  let firstTimestamp = "";
  let winner = "";
  let forfeitedPlayer = "";

  rawLog.replace(/\r/g, "").split("\n").forEach((line) => {
    if (!line || line === "|") return;
    const parts = line.split("|");
    const kind = parts[1];
    if (!kind) return;

    if (kind === "t:" && !firstTimestamp && parts[2]) {
      firstTimestamp = timestampToIso(parts[2]);
      return;
    }

    if (kind === "player") {
      const side = parts[2];
      if (sides[side] && parts[3]?.trim()) sides[side].playerName = parts[3].trim();
      return;
    }

    if (kind === "poke") {
      const side = parts[2];
      const name = speciesFromDetails(parts[3] ?? "");
      if (sides[side] && name) sides[side].team.push(name);
      return;
    }

    if (kind === "switch") {
      applyReplaySwitch(sides, currentTurn, currentTurnNumber, parts[2] ?? "", parts[3] ?? "");
      appendReplayTurnNote(parts, sides, currentTurn, pendingTurnNotes, currentTurnNumber);
      return;
    }

    if (kind === "turn") {
      currentTurnNumber = Number(parts[2] ?? 0);
      currentTurn = {
        number: currentTurnNumber,
        note: "",
        noteLines: pendingTurnNotes,
        feedback: "",
        p1Entries: consumePendingEntries(sides.p1),
        p2Entries: consumePendingEntries(sides.p2),
        p1SwitchPairs: [],
        p2SwitchPairs: [],
        p1Kos: [],
        p2Kos: [],
      };
      pendingTurnNotes = [];
      turns.push(currentTurn);
      return;
    }

    if (kind === "faint") {
      applyReplayFaint(sides, currentTurn, parts[2] ?? "");
      appendReplayTurnNote(parts, sides, currentTurn, pendingTurnNotes, currentTurnNumber);
      return;
    }

    if (kind === "upkeep") {
      finalizeReplayTurnNote(currentTurn);
      currentTurn = null;
      return;
    }

    if (kind === "win") {
      winner = parts[2] ?? "";
      return;
    }

    if (kind === "-message") {
      const text = parts[2] ?? "";
      const match = text.match(/^(.+?) forfeited\./);
      if (match) forfeitedPlayer = match[1];
    }

    appendReplayTurnNote(parts, sides, currentTurn, pendingTurnNotes, currentTurnNumber);
  });

  finalizeReplayTurnNote(currentTurn);

  return {
    sides,
    turns,
    winner,
    forfeitedPlayer,
    savedAt: firstTimestamp || new Date().toISOString(),
  };
}

function buildBattleFromReplay(replayData, mySide) {
  const opponentSide = mySide === "p1" ? "p2" : "p1";
  const myTeam = replayData.sides[mySide].team;
  const matchedTeam = matchSavedTeam(myTeam);

  return {
    id: createId(),
    createdAt: replayData.savedAt,
    savedAt: replayData.savedAt,
    archetypes: [],
    result: resolveReplayResult(replayData.winner, replayData.forfeitedPlayer, replayData.sides, mySide),
    opponentTeam: replayData.sides[opponentSide].team,
    opponentLead: replayData.sides[opponentSide].lead,
    used: replayData.sides[mySide].used,
    note: "",
    turns: replayData.turns.map((turn) => ({
      number: turn.number,
      note: turn.note ?? "",
      noteSource: "showdown",
      feedback: "",
      myEntries: turn[`${mySide}Entries`] ?? [],
      opponentEntries: turn[`${opponentSide}Entries`] ?? [],
      mySwitches: (turn[`${mySide}SwitchPairs`] ?? []).map((pair) => pair.in),
      opponentSwitches: (turn[`${opponentSide}SwitchPairs`] ?? []).map((pair) => pair.in),
      mySwitchPairs: turn[`${mySide}SwitchPairs`] ?? [],
      opponentSwitchPairs: turn[`${opponentSide}SwitchPairs`] ?? [],
      myKos: turn[`${mySide}Kos`] ?? [],
      opponentKos: turn[`${opponentSide}Kos`] ?? [],
    })),
    errorTurn: "",
    takeaway: "",
    teamId: matchedTeam?.id ?? "",
    teamName: matchedTeam?.name ?? (myTeam.length >= 2 ? teamLabel(myTeam) : ""),
    teamNames: matchedTeam?.names ?? myTeam,
    lead: replayData.sides[mySide].lead,
    back: replayData.sides[mySide].used.slice(2, 4),
  };
}

function appendReplayTurnNote(parts, sides, currentTurn, pendingTurnNotes, currentTurnNumber) {
  if (!currentTurn && currentTurnNumber <= 0) return;
  const line = replayLineToNote(parts, sides);
  if (!line) return;
  if (currentTurn) {
    currentTurn.noteLines ??= [];
    currentTurn.noteLines.push(line);
    return;
  }
  pendingTurnNotes.push(line);
}

function finalizeReplayTurnNote(turn) {
  if (!turn) return;
  turn.note = (turn.noteLines ?? []).join("\n").trim();
  delete turn.noteLines;
}

function replayLineToNote(parts, sides) {
  const kind = parts[1];
  if (!kind) return "";

  if (kind === "switch") {
    const actor = parseReplaySlot(parts[2] ?? "");
    const side = actor ? sides[actor.side] : null;
    const name = side ? replayNameForSide(side, parts[3] ?? "") : speciesFromDetails(parts[3] ?? "");
    if (!name) return "";
    return `${slotLabel(parts[2] ?? "")}: ${name} entered`;
  }

  if (kind === "move") {
    const user = replayActorName(parts[2] ?? "", sides);
    const move = parts[3] ?? "";
    const target = replayActorName(parts[4] ?? "", sides);
    if (!user || !move) return "";
    return target ? `${user} used ${move} into ${target}` : `${user} used ${move}`;
  }

  if (kind === "faint") {
    const target = replayActorName(parts[2] ?? "", sides);
    return target ? `${target} fainted` : "";
  }

  if (kind === "-damage") {
    const target = replayActorName(parts[2] ?? "", sides);
    const hp = replayHpText(parts[3] ?? "");
    return target ? `${target} took damage${hp ? ` (${hp})` : ""}` : "";
  }

  if (kind === "-heal") {
    const target = replayActorName(parts[2] ?? "", sides);
    const hp = replayHpText(parts[3] ?? "");
    return target ? `${target} healed${hp ? ` (${hp})` : ""}` : "";
  }

  if (kind === "-status") {
    const target = replayActorName(parts[2] ?? "", sides);
    const status = statusLabel(parts[3] ?? "");
    return target && status ? `${target} was ${status}` : "";
  }

  if (kind === "-miss") {
    const user = replayActorName(parts[2] ?? "", sides);
    const target = replayActorName(parts[3] ?? "", sides);
    return user ? `${user} missed${target ? ` into ${target}` : ""}` : "";
  }

  if (kind === "-supereffective") {
    const target = replayActorName(parts[2] ?? "", sides);
    return target ? `It was super effective on ${target}` : "";
  }

  if (kind === "-resisted") {
    const target = replayActorName(parts[2] ?? "", sides);
    return target ? `${target} resisted the hit` : "";
  }

  if (kind === "-immune") {
    const target = replayActorName(parts[2] ?? "", sides);
    return target ? `${target} was immune` : "";
  }

  if (kind === "-singleturn") {
    const target = replayActorName(parts[2] ?? "", sides);
    const effect = parts[3] ?? "";
    if (!target || !effect) return "";
    return `${target}: ${effect.replace(/^move:\s*/i, "")}`;
  }

  if (kind === "-weather") {
    const weather = weatherLabel(parts[2] ?? "");
    return weather ? `Weather: ${weather}` : "";
  }

  if (kind === "-mega") {
    const target = replayActorName(parts[2] ?? "", sides);
    return target ? `${target} Mega Evolved` : "";
  }

  if (kind === "-activate") {
    const target = replayActorName(parts[2] ?? "", sides);
    const effect = parts[3] ?? "";
    if (!target || !effect) return "";
    return `${target}: ${effect.replace(/^move:\s*/i, "")}`;
  }

  if (kind === "-enditem") {
    const target = replayActorName(parts[2] ?? "", sides);
    const item = parts[3] ?? "";
    return target && item ? `${target} used ${item}` : "";
  }

  return "";
}

function replayActorName(token, sides) {
  const actor = parseReplaySlot(token);
  if (actor && sides[actor.side]) {
    return sides[actor.side].active[actor.slot] || token.split(":").slice(1).join(":").trim();
  }
  return token.split(":").slice(1).join(":").trim() || token.trim();
}

function replayHpText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.includes("fnt")) return "KO";
  return text.split(" ").slice(0, 1)[0];
}

function statusLabel(code) {
  const labels = {
    brn: "burned",
    par: "paralyzed",
    slp: "put to sleep",
    frz: "frozen",
    psn: "poisoned",
    tox: "badly poisoned",
  };
  return labels[String(code ?? "").trim()] ?? String(code ?? "").trim();
}

function weatherLabel(code) {
  const labels = {
    Sandstorm: "Sandstorm",
    SunnyDay: "Sun",
    RainDance: "Rain",
    Snow: "Snow",
    Hail: "Hail",
  };
  return labels[String(code ?? "").trim()] ?? String(code ?? "").trim();
}

function slotLabel(token) {
  const actor = parseReplaySlot(token);
  if (!actor) return "Field";
  return actor.slot === "a" ? `${actor.side} left` : `${actor.side} right`;
}

function applyReplaySwitch(sides, currentTurn, currentTurnNumber, slotToken, details) {
  const actor = parseReplaySlot(slotToken);
  if (!actor || !sides[actor.side]) return;

  const side = sides[actor.side];
  const incoming = replayNameForSide(side, details);
  if (!incoming) return;

  const currentActive = side.active[actor.slot];
  markReplayUsed(side, incoming);

  if (currentTurnNumber === 0 && !currentTurn) {
    side.active[actor.slot] = incoming;
    pushUnique(side.lead, incoming);
    return;
  }

  if (!currentTurn) {
    side.active[actor.slot] = incoming;
    pushUnique(side.pendingEntries, incoming);
    return;
  }

  if (!currentActive || currentActive === incoming) {
    pushUnique(currentTurn[`${actor.side}Entries`], incoming);
    side.active[actor.slot] = incoming;
    return;
  }

  currentTurn[`${actor.side}SwitchPairs`] = upsertSwitchPair(currentTurn[`${actor.side}SwitchPairs`], {
    out: currentActive,
    in: incoming,
  });
  side.active[actor.slot] = incoming;
}

function applyReplayFaint(sides, currentTurn, slotToken) {
  const actor = parseReplaySlot(slotToken);
  if (!actor || !currentTurn || !sides[actor.side]) return;
  const side = sides[actor.side];
  const fainted = side.active[actor.slot];
  if (!fainted) return;
  pushUnique(currentTurn[`${actor.side}Kos`], fainted);
  side.active[actor.slot] = "";
}

function matchSavedTeam(team) {
  const ranked = state.teams
    .map((saved) => ({ saved, score: replayTeamMatchScore(team, saved.names) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].saved : null;
}

function replayTeamMatchScore(left, right) {
  const rightSet = new Set((right ?? []).map(normalizeReplayName));
  return (left ?? []).reduce((score, name) => score + (rightSet.has(normalizeReplayName(name)) ? 1 : 0), 0);
}

function resolveReplayResult(winner, forfeitedPlayer, sides, mySide) {
  const myName = sides[mySide].playerName;
  if (winner) return winner === myName ? "Win" : "Loss";
  if (forfeitedPlayer) return forfeitedPlayer === myName ? "Loss" : "Win";
  return "";
}

function timestampToIso(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Date(numeric * 1000).toISOString();
}

function consumePendingEntries(side) {
  const entries = [...side.pendingEntries];
  side.pendingEntries = [];
  return entries;
}

function parseReplaySlot(token) {
  const match = token.match(/^(p[12])([ab]):/);
  if (!match) return null;
  return { side: match[1], slot: match[2] };
}

function replayNameForSide(side, details) {
  const species = speciesFromDetails(details);
  if (!species) return "";
  const normalized = normalizeReplayName(species);
  return side.team.find((name) => normalizeReplayName(name) === normalized) ?? species;
}

function speciesFromDetails(details) {
  const raw = String(details ?? "").split(",")[0].trim();
  if (!raw) return "";
  return baseReplaySpecies(raw);
}

function baseReplaySpecies(name) {
  return String(name ?? "")
    .replace(/-Mega(?:-[XY])?$/i, "")
    .replace(/-Primal$/i, "")
    .trim();
}

function normalizeReplayName(name) {
  return baseReplaySpecies(name).toLowerCase();
}

function markReplayUsed(side, name) {
  if (!name || side.used.includes(name)) return;
  side.used.push(name);
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function toCoachCsv() {
  const headers = [
    "match_number_newest_first",
    "saved_at",
    "result",
    "team_name",
    "my_team",
    "my_lead",
    "my_back",
    "opponent_team",
    "opponent_lead",
    "opponent_back_seen",
    "battle_snapshot",
    "takeaway",
    "turn_number",
    "is_key_turn",
    "start_board",
    "turn_note",
    "my_entries",
    "opponent_entries",
    "my_switches",
    "opponent_switches",
    "my_kos",
    "opponent_kos",
    "end_board",
    "turn_feedback",
  ];

  const rows = state.battles.flatMap((battle, index) => {
    const team = battleFullTeamNames(battle);
    const base = [
      index + 1,
      battle.savedAt ?? battle.createdAt ?? "",
      battle.result ?? "",
      battle.teamName || (team.length >= 2 ? teamLabel(team) : ""),
      team.join(" / "),
      (battle.lead ?? battle.used?.slice(0, 2) ?? []).join(" / "),
      (battle.back ?? battle.used?.slice(2, 4) ?? []).join(" / "),
      (battle.opponentTeam ?? []).filter(Boolean).join(" / "),
      (battle.opponentLead ?? []).join(" / "),
      observedOpponentBack(battle).join(" / "),
      battle.note ?? "",
      battle.takeaway ?? battle.finalRule ?? battle.betterLine ?? "",
    ];

    if (!battle.turns?.length) {
      return [[
        ...base,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]];
    }

    return battle.turns.map((turn) => {
      const boardStart = previewBoard(boardBeforeTurn(battle, turn.number), turn, {
        includeSwitches: false,
        includeKos: false,
      });
      const boardEnd = previewBoard(boardBeforeTurn(battle, turn.number), turn);

      return [
        ...base,
        turn.number,
        battle.errorTurn === String(turn.number) ? "YES" : "",
        battleBoardLine(boardStart),
        turn.note ?? "",
        (turn.myEntries ?? []).join(" / "),
        (turn.opponentEntries ?? []).join(" / "),
        switchText(turn.mySwitchPairs, turn.mySwitches),
        switchText(turn.opponentSwitchPairs, turn.opponentSwitches),
        (turn.myKos ?? []).join(" / "),
        (turn.opponentKos ?? []).join(" / "),
        battleBoardLine(boardEnd),
        turn.feedback ?? "",
      ];
    });
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function battleToMarkdown(battle) {
  const lines = [];
  const savedDate = formatDate(battle.savedAt ?? battle.createdAt);
  const result = battle.result || "Pending";
  const myLead = battle.lead ?? battle.used.slice(0, 2);
  const myBack = battle.back ?? battle.used.slice(2, 4);
  const myTeam = battleFullTeamNames(battle);
  const oppBack = observedOpponentBack(battle);

  lines.push(`# Battle log`);
  lines.push("");
  lines.push(`- Date: ${savedDate}`);
  lines.push(`- Result: ${result}`);
  if (battle.errorTurn) lines.push(`- Key turn: Turn ${battle.errorTurn}`);
  lines.push("");

  lines.push(`## Team preview`);
  lines.push("");
  lines.push(`### My team`);
  lines.push(...markdownRosterSection("Team", myTeam));
  lines.push(...markdownRosterSection("Lead", myLead));
  lines.push(...markdownRosterSection("Back", myBack));
  lines.push("");
  lines.push(`### Opponent team`);
  lines.push(...markdownRosterSection("Team", (battle.opponentTeam ?? []).filter(Boolean)));
  lines.push(...markdownRosterSection("Lead", battle.opponentLead ?? []));
  if (oppBack.length) lines.push(...markdownRosterSection("Back", oppBack));
  lines.push("");

  if (String(battle.note ?? "").trim()) {
    lines.push(`## Game Plan`);
    lines.push("");
    lines.push(String(battle.note).trim());
    lines.push("");
  }

  lines.push(`## Turns`);
  lines.push("");
  if (battle.turns?.length) {
    battle.turns.forEach((turn) => {
      const board = boardBeforeTurn(battle, turn.number);
      const boardStart = previewBoard(board, turn, { includeSwitches: false, includeKos: false });
      const boardEnd = previewBoard(board, turn);
      lines.push(`### Turn ${turn.number}`);
      lines.push("");
      if (battle.errorTurn === String(turn.number)) lines.push(`- Key turn`);
      lines.push(`- Start turn: ${battleBoardLine(boardStart)}`);
      markdownEventLines(turn).forEach((item) => lines.push(`- ${item}`));
      lines.push(`- End turn: ${battleBoardLine(boardEnd)}`);
      if (String(turn.note ?? "").trim()) {
        lines.push(`- ${turn.noteSource === "showdown" ? "Showdown log" : "Notes"}:`);
        lines.push(...indentMultiline(turn.note));
      }
      if (String(turn.feedback ?? "").trim()) {
        lines.push(`- Feedback:`);
        lines.push(...indentMultiline(turn.feedback));
      }
      lines.push("");
    });
  } else {
    lines.push(`No turn notes.`);
    lines.push("");
  }

  if (String(battle.takeaway ?? battle.finalRule ?? battle.betterLine ?? "").trim()) {
    lines.push(`## Takeaways`);
    lines.push("");
    lines.push(String(battle.takeaway ?? battle.finalRule ?? battle.betterLine ?? "").trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function markdownRosterSection(label, names) {
  const filled = (names ?? []).filter(Boolean);
  if (!filled.length) return [];
  return [`- ${label}: ${filled.join(", ")}`];
}

function markdownEventLines(turn) {
  return previewEventItems(turn).map((event) => {
    if (event.kind === "switch") {
      return `${event.label}: ${event.out || "?"} -> ${event.in || "?"}`;
    }
    return `${event.label}: ${(event.names ?? []).join(", ")}`;
  });
}

function indentMultiline(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => `  ${line}`);
}

function dateStamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "battle";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBattleMarkdown(markdown) {
  const text = String(markdown ?? "").replace(/\r/g, "").trim();
  if (!text.includes("# Battle log")) throw new Error("Invalid markdown");

  const sections = splitMarkdownSections(text);
  const meta = parseMarkdownMeta(text);
  const teamPreview = sections["Team preview"] ?? "";
  const myTeamSection = sectionBody(teamPreview, "My team");
  const opponentTeamSection = sectionBody(teamPreview, "Opponent team");
  const turnsSection = sections["Turns"] ?? "";
  const takeaways = (sections["Takeaways"] ?? "").trim();
  const gamePlan = (sections["Game Plan"] ?? "").trim();

  const parsedMyTeamNames = parseMarkdownListLine(myTeamSection, "Team");
  const myLead = parseMarkdownListLine(myTeamSection, "Lead");
  const myBack = parseMarkdownListLine(myTeamSection, "Back");
  const myTeamNames = parsedMyTeamNames.length ? parsedMyTeamNames : [...new Set([...myLead, ...myBack])];
  const opponentTeam = parseMarkdownListLine(opponentTeamSection, "Team");
  const opponentLead = parseMarkdownListLine(opponentTeamSection, "Lead");

  const parsedTurns = parseMarkdownTurns(turnsSection);
  const matchedTeam = matchSavedTeam(myTeamNames);

  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    archetypes: [],
    result: meta.result,
    opponentTeam,
    opponentLead,
    used: [...myLead, ...myBack].filter(Boolean),
    note: gamePlan,
    turns: parsedTurns,
    errorTurn: meta.keyTurn,
    takeaway: takeaways,
    teamId: matchedTeam?.id ?? "",
    teamName: matchedTeam?.name ?? (myTeamNames.length >= 2 ? teamLabel(myTeamNames) : ""),
    teamNames: matchedTeam?.names ?? myTeamNames,
    lead: myLead,
    back: myBack,
  };
}

function splitMarkdownSections(text) {
  const sections = {};
  const matches = [...text.matchAll(/^## (.+)$/gm)];
  matches.forEach((match, index) => {
    const title = match[1].trim();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    sections[title] = text.slice(start, end).trim();
  });
  return sections;
}

function parseMarkdownMeta(text) {
  return {
    result: markdownMetaValue(text, "Result") || "",
    keyTurn: (markdownMetaValue(text, "Key turn").match(/Turn\s+(\d+)/i)?.[1] ?? ""),
  };
}

function markdownMetaValue(text, label) {
  const match = text.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function sectionBody(sectionText, heading) {
  const match = sectionText.match(new RegExp(`### ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n### |$)`));
  return match?.[1]?.trim() ?? "";
}

function parseMarkdownListLine(sectionText, label) {
  const match = sectionText.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMarkdownTurns(sectionText) {
  const matches = [...sectionText.matchAll(/^### Turn (\d+)$/gm)];
  return matches.map((match, index) => {
    const number = Number(match[1]);
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : sectionText.length;
    const body = sectionText.slice(start, end).trim();
    return parseMarkdownTurn(number, body);
  });
}

function parseMarkdownTurn(number, body) {
  const noteBlock = markdownIndentedBlock(body, "Notes") || markdownIndentedBlock(body, "Showdown log");
  const noteSource = markdownIndentedBlock(body, "Showdown log") ? "showdown" : "manual";
  const feedbackBlock = markdownIndentedBlock(body, "Feedback");
  return {
    number,
    note: noteBlock,
    noteSource,
    feedback: feedbackBlock,
    myEntries: markdownCommaLine(body, "My in"),
    opponentEntries: markdownCommaLine(body, "Opponent in"),
    mySwitches: markdownSwitchPairs(body, "My switch").map((pair) => pair.in),
    opponentSwitches: markdownSwitchPairs(body, "Opponent switch").map((pair) => pair.in),
    mySwitchPairs: markdownSwitchPairs(body, "My switch"),
    opponentSwitchPairs: markdownSwitchPairs(body, "Opponent switch"),
    myKos: markdownCommaLine(body, "My KO"),
    opponentKos: markdownCommaLine(body, "Opponent KO"),
  };
}

function markdownCommaLine(body, label) {
  const match = body.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  if (!match?.[1]) return [];
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

function markdownSwitchPairs(body, label) {
  const match = body.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m"));
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [out, incoming] = item.split("->").map((part) => part.trim());
      return out && incoming ? { out, in: incoming } : null;
    })
    .filter(Boolean);
}

function markdownIndentedBlock(body, label) {
  const match = body.match(new RegExp(`^- ${escapeRegExp(label)}:\\n((?:  .*\\n?)*)`, "m"));
  return match?.[1]
    ? match[1].replace(/^  /gm, "").trim()
    : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  children.forEach((child) => node.append(child));
  return node;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

render();

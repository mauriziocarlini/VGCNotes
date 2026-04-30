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
};

state.activeTeamId = readJson(STORAGE.activeTeamId, "") || state.teams[0]?.id || "";
if (state.activeTeamId) writeJson(STORAGE.activeTeamId, state.activeTeamId);

const screen = document.querySelector("#screen");
const actionBar = document.querySelector("#actionBar");
const mainNav = document.querySelector("#mainNav");
const stepKicker = document.querySelector("#stepKicker");
const stepTitle = document.querySelector("#stepTitle");
const stepDots = document.querySelector(".step-dots");

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
    opponentEntries: [],
    nextMyEntries: [],
    nextOpponentEntries: [],
    mySwitches: [],
    opponentSwitches: [],
    mySwitchPairs: [],
    opponentSwitchPairs: [],
    myKos: [],
    opponentKos: [],
    eventMode: "",
    mySwitchOut: "",
    opponentSwitchOut: "",
  };
}

function setPage(view) {
  state.view = view;
  state.archiveDetailId = "";
  if (view !== "battle") state.replayImport = null;
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

  if (state.step === 2 && state.draft && !state.draft.errorTurn) {
    state.draft.errorTurn = String(state.draft.turns[0]?.number ?? 1);
  }

  render();
}

function render() {
  screen.innerHTML = "";
  actionBar.innerHTML = "";
  actionBar.className = "action-bar";
  mainNav.innerHTML = "";

  renderTopbar();
  renderMainNav();

  if (state.view === "dashboard") renderDashboard();
  if (state.view === "battle" && state.step === 1) renderBattle();
  if (state.view === "battle" && state.step === 2) renderReview();
  if (state.view === "teams") renderTeams();
  if (state.view === "archive") renderArchive();
  if (state.view === "settings") renderSettings();
}

function renderTopbar() {
  const pageTitles = {
    dashboard: "Dashboard",
    teams: "Teams",
    archive: "Archive",
    settings: "Settings",
  };

  const back = getBackConfig();
  const titleWrap = stepTitle.parentElement;
  titleWrap.querySelector(".top-back")?.remove();
  document.querySelector(".top-action")?.remove();
  if (back) {
    const button = el("button", "top-back", back.label);
    button.type = "button";
    button.addEventListener("click", back.action);
    titleWrap.prepend(button);
  }

  if (state.view === "battle") {
    stepKicker.textContent = "";
    stepKicker.hidden = true;
    stepTitle.textContent = state.step === 1 ? "New battle" : "Review";
    stepDots.hidden = false;
    document.querySelectorAll(".dot").forEach((dot, index) => {
      dot.hidden = index > 1;
      dot.classList.toggle("is-active", index === state.step - 1);
    });
    return;
  }

  const title = pageTitles[state.view];
  stepKicker.textContent = "";
  stepKicker.hidden = true;
  stepTitle.textContent = title;
  stepDots.hidden = true;

  if (state.view === "teams" && !state.teamImportOpen && state.teams.length) {
    const add = el("button", "top-action", "+");
    add.type = "button";
    add.ariaLabel = "Add team";
    add.addEventListener("click", () => {
      state.parsedTeam = [];
      state.teamImportOpen = true;
      render();
    });
    document.querySelector(".topbar").append(add);
  }
}

function getBackConfig() {
  if (state.view === "archive" && state.archiveDetailId) {
    return {
      label: "Back to archive",
      action: () => {
        state.archiveDetailId = "";
        render();
      },
    };
  }

  if (state.view === "teams" && state.teamImportOpen && state.teams.length) {
    return {
      label: "Back to teams",
      action: () => {
        state.teamImportOpen = false;
        render();
      },
    };
  }

  if (state.view === "battle" && state.step === 2) {
    return {
      label: "Back to battle",
      action: () => setStep(1),
    };
  }

  return null;
}

function renderMainNav() {
  [
    ["dashboard", "Home"],
    ["battle", "Battle"],
    ["teams", "Teams"],
    ["archive", "Archive"],
    ["settings", "Settings"],
  ].forEach(([view, label]) => {
    const button = el("button", "nav-button", label);
    button.type = "button";
    button.classList.toggle("is-active", state.view === view);
    button.addEventListener("click", () => setPage(view));
    mainNav.append(button);
  });
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
  const datalist = el("datalist");
  datalist.id = datalistId;
  POKEMON_NAMES.forEach((name) => {
    const option = el("option");
    option.value = name;
    datalist.append(option);
  });

  const grid = el("div", "opponent-grid");
  currentNames.forEach((name, index) => {
    const input = el("input", "mini-input opponent-input");
    input.setAttribute("list", datalistId);
    input.value = name;
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
  namesGroup.append(datalist, grid);

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

function renderBattle() {
  const draft = state.draft;
  ensureDraftShape(draft);
  const team = activeTeamNames();
  const turnEntryStatus = getTurnEntryStatus(draft, battleTeamNames(draft));
  const nextTurnEntryStatus = getNextTurnEntryStatus(draft, battleTeamNames(draft));
  const replayImportGroup = renderBattleReplayImport();

  const opponentGroup = renderOpponentTeam(draft);

  const usedGroup = el("div", "group");
  const usedHeader = el("div", "group-header");
  usedHeader.append(el("div", "group-title", `Lead / back ${draft.used.length}/4`));
  const clearUsed = el("button", "tiny-button", "Clear");
  clearUsed.type = "button";
  clearUsed.disabled = draft.used.length === 0;
  clearUsed.addEventListener("click", () => {
    draft.used = [];
    render();
  });
  usedHeader.append(clearUsed);
  const teamGrid = el("div", "team-grid");
  team.forEach((name) => {
    const pick = el("button", "team-pick", name);
    const pickIndex = draft.used.indexOf(name);
    pick.type = "button";
    pick.textContent = "";
    pick.classList.toggle("is-selected", pickIndex !== -1);
    pick.classList.toggle("is-lead", pickIndex === 0 || pickIndex === 1);
    pick.classList.toggle("is-back", pickIndex === 2 || pickIndex === 3);
    pick.append(el("span", "pick-name", name));
    if (pickIndex !== -1) {
      pick.append(el("span", "pick-number", String(pickIndex + 1)));
    }
    pick.addEventListener("click", () => {
      if (draft.used.includes(name)) {
        draft.used = draft.used.filter((item) => item !== name);
      } else if (draft.used.length < 4) {
        draft.used.push(name);
      }
      render();
    });
    teamGrid.append(pick);
  });
  usedGroup.append(usedHeader, teamGrid);

  const noteField = el("div", "field");
  const noteLabel = el("label", "", "Battle snapshot");
  noteLabel.htmlFor = "battleNote";
  const noteHelp = el("p", "helper-text", "Scrivi solo piano, target e momento chiave.");
  const note = el("textarea", "snapshot-note");
  note.id = "battleNote";
  note.rows = 4;
  note.value = draft.note;
  note.addEventListener("input", () => {
    draft.note = note.value;
    note.value = draft.note;
  });
  noteField.append(noteLabel, noteHelp, note);

  const turnGroup = el("div", "group");
  turnGroup.append(
    el("div", "group-title", "Key turns"),
    el("p", "helper-text", "Non segnare tutto. Solo i turni che vuoi capire meglio dopo.")
  );
  const editingTurn = draft.turns.find((turn) => turn.number === draft.editingTurnNumber);
  const controls = el("div", "turn-controls");
  const addTurn = el("button", "icon-button", `Add turn (${draft.turns.length + 1})`);
  addTurn.type = "button";
  addTurn.ariaLabel = `Add turn ${draft.turns.length + 1}`;
  addTurn.disabled = Boolean(editingTurn) || turnEntryStatus.mustResolveEntries || nextTurnEntryStatus.mustResolveEntries;
  const saveTurn = el("button", "secondary save-turn-button", "Save turn");
  saveTurn.type = "button";
  saveTurn.disabled = !editingTurn || turnEntryStatus.mustResolveEntries;
  const turnInput = el("textarea", "turn-note-input");
  turnInput.rows = 1;
  turnInput.value = draft.turnDraft.note;
  turnInput.addEventListener("input", () => {
    draft.turnDraft.note = turnInput.value;
  });
  const switchControls = renderSwitchControls(draft, battleTeamNames(draft));
  addTurn.addEventListener("click", () => {
    const text = draft.turnDraft.note.trim();
    draft.turns.push({
      number: draft.turns.length + 1,
      note: text,
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
    const nextDraft = emptyTurnDraft();
    nextDraft.myEntries = [...draft.turnDraft.nextMyEntries];
    nextDraft.opponentEntries = [...draft.turnDraft.nextOpponentEntries];
    draft.turnDraft = nextDraft;
    render();
  });
  saveTurn.addEventListener("click", () => {
    if (!editingTurn) return;
    editingTurn.note = draft.turnDraft.note.trim();
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
    render();
  });
  const turnEntryRow = el("div", "turn-entry-row");
  const turnEntryActions = el("div", "turn-entry-actions");
  turnEntryActions.append(addTurn);
  if (editingTurn) {
    turnEntryActions.append(saveTurn);
  }
  turnEntryRow.append(turnEntryActions, turnInput);
  controls.append(turnEntryRow, switchControls);
  const turnList = el("ul", "turn-list");
  draft.turns.slice(-4).forEach((turn) => {
    const row = el("li", "turn-row");
    const turnText = el("span", "", turnSummary(turn));
    row.append(el("strong", "", `Turn ${turn.number}`), turnText);

    if (turn.number === draft.turns.at(-1)?.number) {
      row.classList.add("has-actions");
      const actions = el("div", "turn-actions");
      const edit = el("button", "tiny-button", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => {
        draft.editingTurnNumber = turn.number;
        draft.turnDraft = {
          note: turn.note ?? "",
          myEntries: [...(turn.myEntries ?? [])],
          opponentEntries: [...(turn.opponentEntries ?? [])],
          nextMyEntries: [],
          nextOpponentEntries: [],
          mySwitches: [...(turn.mySwitches ?? [])],
          opponentSwitches: [...(turn.opponentSwitches ?? [])],
          mySwitchPairs: [...(turn.mySwitchPairs ?? [])],
          opponentSwitchPairs: [...(turn.opponentSwitchPairs ?? [])],
          myKos: [...(turn.myKos ?? [])],
          opponentKos: [...(turn.opponentKos ?? [])],
          eventMode: "",
          mySwitchOut: "",
          opponentSwitchOut: "",
        };
        render();
      });

      const remove = el("button", "tiny-button", "Delete");
      remove.type = "button";
      remove.addEventListener("click", () => {
        draft.turns.pop();
        draft.editingTurnNumber = null;
        draft.turnDraft = emptyTurnDraft();
        render();
      });

      actions.append(edit, remove);
      row.append(actions);
    }

    turnList.append(row);
  });
  if (!draft.turns.length) {
    turnList.append(el("li", "empty", "Segna solo i turni importanti, strani o decisivi."));
  }
  turnGroup.append(controls, turnList);

  const reviewButton = el("button", "primary", "Save and review");
  reviewButton.type = "button";
  reviewButton.disabled = draft.used.length !== 4 || draft.turns.length === 0;
  reviewButton.addEventListener("click", () => setStep(2));

  screen.append(replayImportGroup, opponentGroup, usedGroup, noteField, turnGroup);
  actionBar.append(reviewButton);
}

function renderBattleReplayImport() {
  const group = el("div", "group battle-import-group");
  group.append(el("div", "group-title", "Import replay"));

  const replayInput = el("input", "file-input");
  replayInput.type = "file";
  replayInput.accept = "text/html,.html";
  replayInput.addEventListener("change", () => {
    const file = replayInput.files?.[0];
    if (file) handleBattleReplayFile(file);
    replayInput.value = "";
  });

  const importButton = el("button", "secondary", "Import replay HTML");
  importButton.type = "button";
  importButton.addEventListener("click", () => replayInput.click());

  group.append(importButton, replayInput);

  if (state.replayImport) {
    const prompt = el("div", "dash-block");
    prompt.append(el("div", "dash-label", "Chi sei tu?"));
    const options = el("div", "replay-choice-list");
    ["p1", "p2"].forEach((side) => options.append(replayChoiceButton(state.replayImport, side)));
    const cancel = el("button", "tiny-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      state.replayImport = null;
      render();
    });
    prompt.append(options, cancel);
    group.append(prompt);
  }

  group.append(el("div", "or-divider", "or"));
  return group;
}

function replayChoiceButton(replayImport, sideKey) {
  const side = replayImport.sides[sideKey];
  const option = el("button", "replay-choice");
  option.type = "button";
  option.append(
    el("strong", "", side.playerName || sideKey.toUpperCase()),
    teamNames(side.team)
  );
  option.addEventListener("click", () => finalizeReplayImport(sideKey));
  return option;
}

function ensureDraftShape(draft) {
  draft.opponentTeam ??= Array(6).fill("");
  while (draft.opponentTeam.length < 6) draft.opponentTeam.push("");
  draft.opponentLead ??= [];
  draft.turnDraft ??= emptyTurnDraft();
  draft.turnDraft.note ??= "";
  draft.turnDraft.myEntries ??= [];
  draft.turnDraft.opponentEntries ??= [];
  draft.turnDraft.nextMyEntries ??= [];
  draft.turnDraft.nextOpponentEntries ??= [];
  draft.turnDraft.mySwitches ??= [];
  draft.turnDraft.opponentSwitches ??= [];
  draft.turnDraft.mySwitchPairs ??= [];
  draft.turnDraft.opponentSwitchPairs ??= [];
  draft.turnDraft.myKos ??= [];
  draft.turnDraft.opponentKos ??= [];
  draft.turnDraft.eventMode ??= "";
  draft.turnDraft.mySwitchOut ??= "";
  draft.turnDraft.opponentSwitchOut ??= "";
  draft.turns.forEach((turn) => {
    turn.feedback ??= "";
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

  const nextEntryStatus = getNextTurnEntryStatus(draft, myBattleTeam, board);
  const nextMyEntryChoices = mergeChoices(
    draft.turnDraft.nextMyEntries,
    nextEntryStatus.myEntryChoices
  );
  const nextOpponentEntryChoices = mergeChoices(
    draft.turnDraft.nextOpponentEntries,
    nextEntryStatus.opponentEntryChoices
  );
  if (nextEntryStatus.myMissing === 0) {
    draft.turnDraft.nextMyEntries = [];
  } else {
    draft.turnDraft.nextMyEntries = draft.turnDraft.nextMyEntries.filter((name) => nextMyEntryChoices.includes(name));
  }
  if (nextEntryStatus.opponentMissing === 0) {
    draft.turnDraft.nextOpponentEntries = [];
  } else {
    draft.turnDraft.nextOpponentEntries = draft.turnDraft.nextOpponentEntries.filter((name) => nextOpponentEntryChoices.includes(name));
  }
}

function renderOpponentTeam(draft) {
  const group = el("div", "group");
  group.append(el("div", "group-title", "Opponent team"));

  const datalistId = "pokemonSuggestions";
  const datalist = el("datalist");
  datalist.id = datalistId;
  pokemonSuggestions(draft).forEach((name) => {
    const option = el("option");
    option.value = name;
    datalist.append(option);
  });

  const grid = el("div", "opponent-grid");
  draft.opponentTeam.slice(0, 6).forEach((name, index) => {
    const input = el("input", "mini-input opponent-input");
    input.setAttribute("list", datalistId);
    input.value = name;
    input.addEventListener("input", () => {
      draft.opponentTeam[index] = input.value.slice(0, 32);
      draft.opponentLead = draft.opponentLead.filter((lead) => filledOpponentTeam(draft).includes(lead));
    });
    input.addEventListener("blur", () => {
      draft.opponentTeam[index] = input.value.trim();
      render();
    });
    grid.append(input);
  });
  group.append(datalist, grid);

  const opponentNames = filledOpponentTeam(draft);
  if (opponentNames.length) {
    const leadGroup = el("div", "mini-chip-group");
    leadGroup.append(el("div", "mini-label", "T1 lead"));
    const leadChips = el("div", "chip-grid compact-chips");
    opponentNames.forEach((name) => {
      const chip = el("button", "chip", name);
      chip.type = "button";
      chip.classList.toggle("is-selected", draft.opponentLead.includes(name));
      chip.addEventListener("click", () => {
        draft.opponentLead = toggleLimited(draft.opponentLead, name, 2);
        render();
      });
      leadChips.append(chip);
    });
    leadGroup.append(leadChips);
    group.append(leadGroup);
  }

  return group;
}

function renderSwitchControls(draft, team) {
  const wrap = el("div", "switch-controls");
  const turnNumber = draft.editingTurnNumber ?? draft.turns.length + 1;
  const baseBoard = boardBeforeTurn(draft, turnNumber);
  const entryStatus = getTurnEntryStatus(draft, team, baseBoard);
  const { myMissing, opponentMissing, myEntryChoices, opponentEntryChoices, needsMyEntry, needsOpponentEntry, mustResolveEntries } = entryStatus;
  const nextEntryStatus = getNextTurnEntryStatus(draft, team, baseBoard);
  const boardAfterEntries = previewBoard(baseBoard, draft.turnDraft, {
    includeSwitches: false,
    includeKos: false,
  });
  const boardAfterSwitches = previewBoard(baseBoard, draft.turnDraft, { includeKos: false });
  const boardNow = previewBoard(baseBoard, draft.turnDraft);
  wrap.append(boardPanel("Active", boardNow.myActive, boardNow.opponentActive));

  if (mustResolveEntries) {
    const entryPanel = el("div", "event-panel");
    entryPanel.append(el("div", "mini-label", "Ingressi dopo KO"));
    if (needsMyEntry) {
      entryPanel.append(
        switchGroup(
          "Chi entra per me?",
          mergeChoices(draft.turnDraft.myEntries, myEntryChoices),
          draft.turnDraft.myEntries,
          (next) => {
            draft.turnDraft.myEntries = limitSelection(next, myMissing);
            render();
          },
          "Nessun mio Pokemon disponibile",
          myMissing
        )
      );
    }
    if (needsOpponentEntry) {
      entryPanel.append(
        switchGroup(
          "Chi entra per lui?",
          mergeChoices(draft.turnDraft.opponentEntries, opponentEntryChoices),
          draft.turnDraft.opponentEntries,
          (next) => {
            draft.turnDraft.opponentEntries = limitSelection(next, opponentMissing);
            render();
          },
          "Nessun suo Pokemon disponibile",
          opponentMissing
        )
      );
    }
    wrap.append(entryPanel);
  }

  const eventBar = el("div", "event-bar");
  [
    ["my-switch", "Mio switch"],
    ["opp-switch", "Suo switch"],
    ["ko", "KO"],
  ].forEach(([mode, label]) => {
    const button = el("button", "event-button", label);
    button.type = "button";
    button.disabled = mustResolveEntries;
    button.classList.toggle("is-selected", draft.turnDraft.eventMode === mode);
    button.addEventListener("click", () => {
      draft.turnDraft.eventMode = draft.turnDraft.eventMode === mode ? "" : mode;
      render();
    });
    eventBar.append(button);
  });
  wrap.append(eventBar);

  if (draft.turnDraft.eventMode === "my-switch") {
    wrap.append(
      switchPairPanel(
        "Chi switchi?",
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
        "Chi switcha lui?",
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
    koPanel.append(
      switchGroup("Miei attivi", boardAfterSwitches.myActive, draft.turnDraft.myKos, (next) => {
        draft.turnDraft.myKos = next;
        render();
      }),
      switchGroup("Suoi attivi", boardAfterSwitches.opponentActive, draft.turnDraft.opponentKos, (next) => {
        draft.turnDraft.opponentKos = next;
        render();
      })
    );
    wrap.append(koPanel);
  }

  if (nextEntryStatus.showPrompt) {
    const nextEntryPanel = el("div", "event-panel");
    nextEntryPanel.append(el("div", "mini-label", "Chi entra dopo i KO?"));
    if (nextEntryStatus.needsMyEntry || draft.turnDraft.nextMyEntries.length) {
      nextEntryPanel.append(
        switchGroup(
          "Chi entra per me?",
          mergeChoices(draft.turnDraft.nextMyEntries, nextEntryStatus.myEntryChoices),
          draft.turnDraft.nextMyEntries,
          (next) => {
            draft.turnDraft.nextMyEntries = limitSelection(next, nextEntryStatus.myMissing);
            render();
          },
          "Nessun mio Pokemon disponibile",
          nextEntryStatus.myMissing
        )
      );
    }
    if (nextEntryStatus.needsOpponentEntry || draft.turnDraft.nextOpponentEntries.length) {
      nextEntryPanel.append(
        switchGroup(
          "Chi entra per lui?",
          mergeChoices(draft.turnDraft.nextOpponentEntries, nextEntryStatus.opponentEntryChoices),
          draft.turnDraft.nextOpponentEntries,
          (next) => {
            draft.turnDraft.nextOpponentEntries = limitSelection(next, nextEntryStatus.opponentMissing);
            render();
          },
          "Nessun suo Pokemon disponibile",
          nextEntryStatus.opponentMissing
        )
      );
    }
    wrap.append(nextEntryPanel);
  }

  const summary = turnSummary({ ...draft.turnDraft, number: turnNumber });
  if (summary !== "No note") wrap.append(el("div", "event-summary", summary));
  return wrap;
}

function switchPairPanel(title, active, bench, turnDraft, side) {
  const panel = el("div", "event-panel");
  const outKey = side === "my" ? "mySwitchOut" : "opponentSwitchOut";
  const pairsKey = side === "my" ? "mySwitchPairs" : "opponentSwitchPairs";
  const insKey = side === "my" ? "mySwitches" : "opponentSwitches";

  panel.append(el("div", "mini-label", title));
  panel.append(
    switchGroup("Fuori", active, turnDraft[outKey] ? [turnDraft[outKey]] : [], (next) => {
      turnDraft[outKey] = next.at(-1) ?? "";
      render();
    })
  );

  if (turnDraft[outKey]) {
    panel.append(
      switchGroup("Dentro", bench, [], (next) => {
        const incoming = next.at(-1);
        if (!incoming) return;
        turnDraft[pairsKey] = upsertSwitchPair(turnDraft[pairsKey], { out: turnDraft[outKey], in: incoming });
        turnDraft[insKey] = turnDraft[pairsKey].map((pair) => pair.in);
        turnDraft[outKey] = "";
        render();
      })
    );
  }

  if (turnDraft[pairsKey].length) {
    const pairs = el("div", "switch-pairs");
    turnDraft[pairsKey].forEach((pair) => {
      const item = el("button", "switch-pair", `${pair.out} -> ${pair.in}`);
      item.type = "button";
      item.addEventListener("click", () => {
        turnDraft[pairsKey] = turnDraft[pairsKey].filter((saved) => saved.out !== pair.out);
        turnDraft[insKey] = turnDraft[pairsKey].map((saved) => saved.in);
        render();
      });
      pairs.append(item);
    });
    panel.append(pairs);
  }

  return panel;
}

function upsertSwitchPair(pairs, nextPair) {
  return [...pairs.filter((pair) => pair.out !== nextPair.out), nextPair].slice(0, 2);
}

function switchGroup(label, names, selected, onChange, emptyText = "No options right now", maxSelected = 2) {
  const group = el("div", "mini-chip-group");
  group.append(el("div", "mini-label", label));
  if (!names.length) {
    group.append(el("div", "mini-empty", emptyText));
    return group;
  }

  const chips = el("div", "chip-grid compact-chips");
  names.forEach((name) => {
    const chip = el("button", "chip switch-chip", name);
    chip.type = "button";
    chip.classList.toggle("is-selected", selected.includes(name));
    chip.addEventListener("click", () => onChange(toggleLimited(selected, name, maxSelected)));
    chips.append(chip);
  });
  group.append(chips);
  return group;
}

function boardPanel(label, myActive, opponentActive) {
  const panel = el("div", "board-panel");
  panel.append(
    el("div", "mini-label", label),
    boardSide("Io", myActive),
    boardSide("Lui", opponentActive)
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
  const needsMyEntry = myMissing > draft.turnDraft.myEntries.length && myEntryChoices.length > 0;
  const needsOpponentEntry = opponentMissing > draft.turnDraft.opponentEntries.length && opponentEntryChoices.length > 0;
  return {
    myMissing,
    opponentMissing,
    myEntryChoices,
    opponentEntryChoices,
    needsMyEntry,
    needsOpponentEntry,
    mustResolveEntries: needsMyEntry || needsOpponentEntry,
  };
}

function getNextTurnEntryStatus(draft, myTeam, baseBoard = null) {
  const board = baseBoard ?? boardBeforeTurn(draft, draft.editingTurnNumber ?? draft.turns.length + 1);
  const afterTurn = previewBoard(board, draft.turnDraft);
  const myMissing = Math.max(0, 2 - afterTurn.myActive.length);
  const opponentMissing = Math.max(0, 2 - afterTurn.opponentActive.length);
  const myEntryChoices = replacementChoices(
    myTeam,
    afterTurn.myActive,
    afterTurn.myFainted,
    draft.turnDraft.nextMyEntries
  );
  const opponentEntryChoices = replacementChoices(
    filledOpponentTeam(draft),
    afterTurn.opponentActive,
    afterTurn.opponentFainted,
    draft.turnDraft.nextOpponentEntries
  );
  const needsMyEntry = myMissing > draft.turnDraft.nextMyEntries.length && myEntryChoices.length > 0;
  const needsOpponentEntry = opponentMissing > draft.turnDraft.nextOpponentEntries.length && opponentEntryChoices.length > 0;
  const showPrompt =
    draft.turnDraft.myKos.length > 0 ||
    draft.turnDraft.opponentKos.length > 0 ||
    draft.turnDraft.nextMyEntries.length > 0 ||
    draft.turnDraft.nextOpponentEntries.length > 0;
  return {
    myMissing,
    opponentMissing,
    myEntryChoices,
    opponentEntryChoices,
    needsMyEntry,
    needsOpponentEntry,
    mustResolveEntries: needsMyEntry || needsOpponentEntry,
    showPrompt,
  };
}

function replacementChoices(names, active, fainted = [], selected = []) {
  const selectedSet = new Set(selected);
  return names.filter((name) => !active.includes(name) && !fainted.includes(name) && !selectedSet.has(name));
}

function mergeChoices(selected, available) {
  return [...new Set([...(selected ?? []), ...(available ?? [])])];
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

function pokemonSuggestions(draft) {
  return [...new Set([...POKEMON_NAMES, ...activeTeamNames(), ...filledOpponentTeam(draft)])].sort();
}

function toggleLimited(items, value, max) {
  if (items.includes(value)) return items.filter((item) => item !== value);
  if (items.length >= max) return items;
  return [...items, value];
}

function turnSummary(turn) {
  const parts = [];
  if (turn.note) parts.push(turn.note);
  if (turn.myEntries?.length) parts.push(`Io entra: ${turn.myEntries.join(" / ")}`);
  if (turn.opponentEntries?.length) parts.push(`Lui entra: ${turn.opponentEntries.join(" / ")}`);
  const mySwitchText = switchText(turn.mySwitchPairs, turn.mySwitches);
  const opponentSwitchText = switchText(turn.opponentSwitchPairs, turn.opponentSwitches);
  if (mySwitchText) parts.push(`Io switch: ${mySwitchText}`);
  if (opponentSwitchText) parts.push(`Lui switch: ${opponentSwitchText}`);
  if (turn.myKos?.length) parts.push(`Io KO: ${turn.myKos.join(" / ")}`);
  if (turn.opponentKos?.length) parts.push(`Lui KO: ${turn.opponentKos.join(" / ")}`);
  return parts.join(" | ") || "No note";
}

function turnEventGroups(turn) {
  return [
    { label: "My entry", names: turn.myEntries ?? [] },
    { label: "Opp entry", names: turn.opponentEntries ?? [] },
    { label: "My switch", names: switchLabels(turn.mySwitchPairs, turn.mySwitches) },
    { label: "Opp switch", names: switchLabels(turn.opponentSwitchPairs, turn.opponentSwitches) },
    { label: "My KO", names: turn.myKos ?? [], tone: "ko" },
    { label: "Opp KO", names: turn.opponentKos ?? [], tone: "ko" },
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
  turnGroup.append(el("div", "group-title", "Turno chiave"));
  const turnGrid = el("div", "review-turn-list");
  const turns = draft.turns;
  if (!draft.errorTurn) draft.errorTurn = String(turns[0].number);
  turns.forEach((turn) => {
    const card = el("div", "review-turn-card");
    const board = boardBeforeTurn(draft, turn.number);
    const boardStart = previewBoard(board, turn, { includeSwitches: false, includeKos: false });
    const boardAfter = previewBoard(board, turn);
    const pick = el("button", "review-turn-pick");
    pick.type = "button";
    pick.classList.toggle("is-selected", draft.errorTurn === String(turn.number));
    pick.append(
      el("strong", "", `Turn ${turn.number}`),
      el("span", "review-turn-badge", draft.errorTurn === String(turn.number) ? "Turno chiave" : "Select")
    );
    pick.addEventListener("click", () => {
      draft.errorTurn = String(turn.number);
      render();
    });

    const feedbackField = el("div", "field compact-field");
    const feedbackLabel = el("label", "", "Feedback");
    feedbackLabel.htmlFor = `turnFeedback${turn.number}`;
    const feedback = el("input", "mini-input");
    feedback.id = `turnFeedback${turn.number}`;
    feedback.value = turn.feedback ?? "";
    feedback.placeholder = "Cosa cambierei / cosa ho imparato";
    feedback.addEventListener("input", () => {
      turn.feedback = feedback.value;
      feedback.value = turn.feedback;
    });
    feedbackField.append(feedbackLabel, feedback);

    card.append(pick, boardPanel("Start", boardStart.myActive, boardStart.opponentActive));
    if (turn.note) card.append(el("p", "archive-note", turn.note));
    const events = rosterBlock("Turn events", turnEventGroups(turn), false);
    if (events) card.append(events);
    card.append(boardPanel("After", boardAfter.myActive, boardAfter.opponentActive), feedbackField);
    turnGrid.append(card);
  });
  turnGroup.append(turnGrid);

  const takeawayField = el("div", "field");
  const takeawayLabel = el("label", "", "Takeaway");
  takeawayLabel.htmlFor = "takeaway";
  const takeaway = el("textarea", "takeaway-note");
  takeaway.id = "takeaway";
  takeaway.rows = 3;
  takeaway.value = draft.takeaway ?? "";
  takeaway.placeholder = "Una cosa che mi porto via da questa partita";
  takeaway.addEventListener("input", () => {
    draft.takeaway = takeaway.value;
    takeaway.value = draft.takeaway;
  });
  takeawayField.append(takeawayLabel, takeaway);

  const saveButton = el("button", "primary", "Save");
  saveButton.type = "button";
  saveButton.addEventListener("click", () => {
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
  const controls = el("div", "dashboard-filters");
  const rangeGroup = el("div", "filter-cluster");
  rangeGroup.append(el("div", "dash-label", "Range"));
  const rangeRow = el("div", "segment-row");
  [
    ["day", "Day"],
    ["week", "Week"],
    ["month", "Month"],
    ["global", "Global"],
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
  rangeGroup.append(rangeRow);

  const resultsGroup = el("div", "filter-cluster");
  resultsGroup.append(el("div", "dash-label", "Results"));
  const resultRow = el("div", "filter-row");
  [
    ["all", "All results"],
    ["Win", "Wins"],
    ["Loss", "Losses"],
  ].forEach(([value, label]) => {
    const chip = el("button", "chip filter-chip", label);
    chip.type = "button";
    chip.classList.toggle("is-selected", state.dashboardResultFilter === value);
    chip.addEventListener("click", () => {
      state.dashboardResultFilter = value;
      render();
    });
    resultRow.append(chip);
  });
  resultsGroup.append(resultRow);
  controls.append(rangeGroup, resultsGroup);

  const filtered = getDashboardBattles();
  const performance = getDashboardPerformance(filtered);
  const kpis = getDashboardKpis(filtered);

  const kpiGrid = el("div", "kpi-grid");
  [
    ["Matches", String(kpis.matches), kpis.matchesSub],
    ["Win rate", `${kpis.winRate}%`, kpis.winRateSub],
    ["Reviewed", `${kpis.reviewRate}%`, kpis.reviewSub],
    ["Avg turns", kpis.avgTurns, kpis.avgTurnsSub],
  ].forEach(([label, value, sub]) => {
    const card = el("div", "dash-block kpi-card");
    card.append(
      el("div", "dash-label", label),
      el("div", "kpi-value", value),
      el("div", "kpi-sub", sub)
    );
    kpiGrid.append(card);
  });

  const performanceBlock = el("div", `dash-block trend-${performance.trend}`);
  const performanceLine = el("div", "performance-line");
  performanceLine.append(el("strong", "", `${performance.current}%`), el("span", "", performance.arrow));
  performanceBlock.append(
    el("div", "dash-label", "Performance"),
    performanceLine,
    performanceChart(performance.series),
    el("div", "dash-sub", `${rangeLabel()} · ${performance.matchesLabel}`)
  );

  const insights = el("div", "insight-grid");
  [
    ["Most faced", kpis.topArchetype],
    ["Common lead", kpis.topLead],
  ].forEach(([label, value]) => {
    const card = el("div", "dash-block");
    card.append(el("div", "dash-label", label), el("p", "dash-text", value));
    insights.append(card);
  });

  screen.append(controls, performanceBlock, kpiGrid, insights);
}

function renderTeams() {
  if (state.teamImportOpen || !state.teams.length) {
    renderImport();
    return;
  }

  const active = activeTeam();
  const activeBlock = el("div", "dash-block");
  activeBlock.append(el("div", "dash-label", "Active team"), teamNames(active.names));

  const savedGroup = el("div", "group");
  savedGroup.append(el("div", "group-title", "Saved teams"));
  const list = el("div", "team-list");
  state.teams.forEach((team) => {
    const row = el("div", "team-card");
    row.classList.toggle("is-active", team.id === state.activeTeamId);

    const body = el("div", "team-card-main");
    body.append(el("strong", "", team.name), el("span", "", team.names.join(" / ")));

    const actions = el("div", "team-card-actions");
    if (team.id === state.activeTeamId) {
      const activeTag = el("button", "tiny-button", "Active");
      activeTag.type = "button";
      activeTag.disabled = true;
      actions.append(activeTag);
    } else {
      const setActive = el("button", "tiny-button", "Set active");
      setActive.type = "button";
      setActive.addEventListener("click", () => activateTeam(team.id));

      const remove = el("button", "tiny-button", "Delete");
      remove.type = "button";
      remove.addEventListener("click", () => deleteTeam(team.id));
      actions.append(setActive, remove);
    }

    row.append(body, actions);
    list.append(row);
  });
  savedGroup.append(list);

  screen.append(activeBlock, savedGroup);
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

  if (!state.battles.length) {
    screen.append(el("div", "empty", "No saved games yet."));
    return;
  }

  const list = el("div", "archive-list");
  state.battles.forEach((battle, index) => {
    const card = el("button", "archive-card");
    card.type = "button";
    const myTeam = battle.teamNames?.length ? battle.teamNames : activeTeamNames();
    const myLead = battle.lead ?? battle.used?.slice(0, 2) ?? [];
    const myBack = battle.back ?? battle.used?.slice(2, 4) ?? [];
    const opponentTeam = (battle.opponentTeam ?? []).filter(Boolean);
    const opponentLead = battle.opponentLead ?? [];
    const opponentBack = observedOpponentBack(battle);
    const header = el("div", "archive-card-header");
    header.append(
      el("strong", "", formatDate(battle.savedAt ?? battle.createdAt)),
      resultChip(battle.result)
    );

    card.append(
      header,
      compactRosterRow("Io", myTeam, (name) => {
        if (myLead.includes(name)) return "lead";
        if (myBack.includes(name)) return "back";
        return "";
      }),
      compactRosterRow("Lui", opponentTeam, (name) => {
        if (opponentLead.includes(name)) return "lead";
        if (opponentBack.includes(name)) return "back";
        return "";
      })
    );
    if (battle.note) {
      const snapshot = el("div", "archive-card-copy");
      snapshot.append(el("div", "archive-card-label", "Battle snapshot"), el("p", "archive-card-text", battle.note));
      card.append(snapshot);
    }
    if (battle.takeaway) {
      const takeaway = el("div", "archive-card-copy");
      takeaway.append(el("div", "archive-card-label", "Takeaway"), el("p", "archive-card-text", battle.takeaway));
      card.append(takeaway);
    }
    card.addEventListener("click", () => {
      state.archiveDetailId = String(index);
      render();
    });
    list.append(card);
  });
  screen.append(list);
}

function renderArchiveDetail() {
  const battle = state.battles[Number(state.archiveDetailId)];
  if (!battle) {
    state.archiveDetailId = "";
    renderArchive();
    return;
  }

  const summary = el("div", "dash-block");
  summary.append(
    el("div", "dash-label", `${battle.result} · ${formatDate(battle.savedAt ?? battle.createdAt)}`),
    el("p", "dash-text", battle.archetypes.length ? battle.archetypes.join(" / ") : "Opponent unknown")
  );

  const opponent = rosterBlock("Opponent preview", [
    { label: "Team", names: (battle.opponentTeam ?? []).filter(Boolean) },
    { label: "Lead", names: battle.opponentLead ?? [] },
  ]);

  const team = rosterBlock("My preview", [
    { label: "Lead", names: battle.lead ?? battle.used.slice(0, 2), tone: "lead" },
    { label: "Back", names: battle.back ?? battle.used.slice(2, 4), tone: "back" },
  ]);

  const turns = el("div", "group");
  turns.append(el("div", "group-title", "Turn notes"));
  const turnList = el("div", "archive-turns");
  if (battle.turns?.length) {
    battle.turns.forEach((turn) => {
      const card = el("div", "archive-turn-card");
      const board = boardBeforeTurn(battle, turn.number);
      const boardStart = previewBoard(board, turn, { includeSwitches: false, includeKos: false });
      const boardAfter = previewBoard(board, turn);
      const header = el("div", "archive-turn-header");
      header.append(
        el("strong", "archive-turn-title", `Turn ${turn.number}`),
        battle.errorTurn === String(turn.number) ? el("span", "result-chip is-key", "Turno chiave") : el("span", "archive-turn-spacer")
      );
      card.append(header, boardPanel("Start", boardStart.myActive, boardStart.opponentActive));
      if (turn.note) card.append(el("p", "archive-note", turn.note));
      const events = rosterBlock("Turn events", turnEventGroups(turn), false);
      if (events) card.append(events);
      card.append(boardPanel("After", boardAfter.myActive, boardAfter.opponentActive));

      const feedbackField = el("div", "field compact-field");
      const feedbackLabel = el("label", "", "Feedback");
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

  const review = el("div", "dash-block");
  review.append(el("div", "dash-label", "Review"));
  if (battle.errorTurn) {
    review.append(el("p", "dash-text", `Turno chiave: T${battle.errorTurn}`));
  }

  const snapshotField = el("div", "field compact-field");
  const snapshotLabel = el("label", "", "Battle snapshot");
  snapshotLabel.htmlFor = "archiveBattleSnapshot";
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
  snapshotField.append(snapshotLabel, snapshot);

  const takeawayField = el("div", "field compact-field");
  const takeawayLabel = el("label", "", "Takeaway");
  takeawayLabel.htmlFor = "archiveTakeaway";
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
  takeawayField.append(takeawayLabel, takeaway);

  review.append(snapshotField, takeawayField);

  [summary, opponent, team, turns, review].filter(Boolean).forEach((node) => screen.append(node));
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
  return el("span", `result-chip ${tone}`.trim(), result || "Open");
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
    el("p", "dash-text", "Export or import all local app data.")
  );

  const exportAll = el("button", "secondary", "Export all JSON");
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

  const importAll = el("button", "secondary", "Import all JSON");
  importAll.type = "button";
  importAll.addEventListener("click", () => importInput.click());

  const coachCsv = el("button", "secondary", "Export coach CSV");
  coachCsv.type = "button";
  coachCsv.addEventListener("click", () => {
    download("vgc-coach-export.csv", toCoachCsv(), "text/csv;charset=utf-8");
  });

  const actions = el("div", "settings-grid");
  actions.append(exportAll, importAll, coachCsv, importInput);

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
    if (state.dashboardResultFilter !== "all" && battle.result !== state.dashboardResultFilter) return false;
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
  const arrows = { improving: "^ improving", stable: "-> stable", declining: "v declining" };

  return {
    current,
    previous: prior,
    trend,
    arrow: arrows[trend],
    series: getDashboardSeries(decided),
    matchesLabel: recent.length && previous.length
      ? `Last 10 / previous 10: ${current}% / ${prior}%`
      : `${decided.length} decided matches`,
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
  const reviewed = filteredBattles.filter(hasReviewData);
  const avgTurns = filteredBattles.length
    ? (filteredBattles.reduce((sum, battle) => sum + (battle.turns?.length ?? 0), 0) / filteredBattles.length).toFixed(1)
    : "0.0";

  return {
    matches: filteredBattles.length,
    matchesSub: rangeLabel(),
    winRate: getRate(decided),
    winRateSub: decided.length ? `${decided.length} decided` : "No result yet",
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

function performanceChart(series) {
  const wrap = el("div", "chart-wrap");
  if (!series.length) {
    wrap.append(el("div", "chart-empty", "Play matches to draw trend."));
    return wrap;
  }

  const width = 320;
  const height = 116;
  const pad = 10;
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;
  const xStep = series.length > 1 ? usableWidth / (series.length - 1) : 0;
  const points = series.map((value, index) => {
    const x = pad + index * xStep;
    const y = pad + usableHeight - (value / 100) * usableHeight;
    return [x, y];
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${pad + xStep * (series.length - 1)} ${height - pad} L ${pad} ${height - pad} Z`;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Win rate trend chart" });
  [25, 50, 75].forEach((value) => {
    const y = pad + usableHeight - (value / 100) * usableHeight;
    svg.append(svgEl("line", { class: "chart-grid", x1: pad, y1: y, x2: width - pad, y2: y }));
  });
  svg.append(svgEl("path", { class: "chart-area", d: area }));
  svg.append(svgEl("path", { class: "chart-line", d: path }));
  points.forEach(([x, y]) => {
    svg.append(svgEl("circle", { class: "chart-point", cx: x, cy: y, r: 2.6 }));
  });

  wrap.append(svg);
  return wrap;
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
  return clean.charAt(0).toUpperCase() + clean.slice(1);
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
      alert("Backup non valido.");
    }
  });
  reader.readAsText(file);
}

function handleBattleReplayFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state.replayImport = parseShowdownReplayHtml(String(reader.result));
      render();
    } catch {
      alert("Replay HTML non valido.");
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
  state.draft = createDraft();
  state.archiveDetailId = "0";
  state.view = "archive";
  render();
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
      return;
    }

    if (kind === "turn") {
      currentTurnNumber = Number(parts[2] ?? 0);
      currentTurn = {
        number: currentTurnNumber,
        note: "",
        feedback: "",
        p1Entries: consumePendingEntries(sides.p1),
        p2Entries: consumePendingEntries(sides.p2),
        p1SwitchPairs: [],
        p2SwitchPairs: [],
        p1Kos: [],
        p2Kos: [],
      };
      turns.push(currentTurn);
      return;
    }

    if (kind === "faint") {
      applyReplayFaint(sides, currentTurn, parts[2] ?? "");
      return;
    }

    if (kind === "upkeep") {
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
  });

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
      note: "",
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
    "opponent_archetypes",
    "opponent_pokemon",
    "opponent_lead",
    "team_name",
    "team_pokemon",
    "lead",
    "back",
    "pokemon_used",
    "battle_note",
    "turn_notes",
    "my_entries",
    "opponent_entries",
    "my_active_start",
    "opponent_active_start",
    "my_active_end",
    "opponent_active_end",
    "my_switches",
    "opponent_switches",
    "my_kos",
    "opponent_kos",
    "turn_feedback",
    "key_turn",
    "takeaway",
  ];

  const rows = state.battles.map((battle, index) => {
    const team = battle.teamNames?.length ? battle.teamNames : battle.used ?? [];
    return [
      index + 1,
      battle.savedAt ?? battle.createdAt ?? "",
      battle.result ?? "",
      (battle.archetypes ?? []).join(" / "),
      (battle.opponentTeam ?? []).filter(Boolean).join(" / "),
      (battle.opponentLead ?? []).join(" / "),
      battle.teamName || (team.length >= 2 ? teamLabel(team) : ""),
      team.join(" / "),
      (battle.lead ?? battle.used?.slice(0, 2) ?? []).join(" / "),
      (battle.back ?? battle.used?.slice(2, 4) ?? []).join(" / "),
      (battle.used ?? []).join(" / "),
      battle.note ?? "",
      (battle.turns ?? []).map((turn) => `T${turn.number}: ${turn.note}`).join(" | "),
      (battle.turns ?? [])
        .filter((turn) => turn.myEntries?.length)
        .map((turn) => `T${turn.number}: ${turn.myEntries.join(" / ")}`)
        .join(" | "),
      (battle.turns ?? [])
        .filter((turn) => turn.opponentEntries?.length)
        .map((turn) => `T${turn.number}: ${turn.opponentEntries.join(" / ")}`)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const board = previewBoard(boardBeforeTurn(battle, turn.number), turn, { includeSwitches: false, includeKos: false });
          return board.myActive.length ? `T${turn.number}: ${board.myActive.join(" / ")}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const board = previewBoard(boardBeforeTurn(battle, turn.number), turn, { includeSwitches: false, includeKos: false });
          return board.opponentActive.length ? `T${turn.number}: ${board.opponentActive.join(" / ")}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const board = previewBoard(boardBeforeTurn(battle, turn.number), turn);
          return board.myActive.length ? `T${turn.number}: ${board.myActive.join(" / ")}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const board = previewBoard(boardBeforeTurn(battle, turn.number), turn);
          return board.opponentActive.length ? `T${turn.number}: ${board.opponentActive.join(" / ")}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const text = switchText(turn.mySwitchPairs, turn.mySwitches);
          return text ? `T${turn.number}: ${text}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .map((turn) => {
          const text = switchText(turn.opponentSwitchPairs, turn.opponentSwitches);
          return text ? `T${turn.number}: ${text}` : "";
        })
        .filter(Boolean)
        .join(" | "),
      (battle.turns ?? [])
        .filter((turn) => turn.myKos?.length)
        .map((turn) => `T${turn.number}: ${turn.myKos.join(" / ")}`)
        .join(" | "),
      (battle.turns ?? [])
        .filter((turn) => turn.opponentKos?.length)
        .map((turn) => `T${turn.number}: ${turn.opponentKos.join(" / ")}`)
        .join(" | "),
      (battle.turns ?? [])
        .filter((turn) => turn.feedback)
        .map((turn) => `T${turn.number}: ${turn.feedback}`)
        .join(" | "),
      battle.errorTurn ? `T${battle.errorTurn}` : "",
      battle.takeaway ?? battle.finalRule ?? battle.betterLine ?? "",
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
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

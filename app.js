const progressInput = document.getElementById("progress-input");
const progressFill = document.getElementById("progress-fill");
const progressCount = document.getElementById("progress-count");

const appForm = document.getElementById("app-form");
const appList = document.getElementById("app-list");
const routeViews = document.querySelectorAll("[data-route]");
const routeLinks = document.querySelectorAll("[data-route-link]");

const ideaForm = document.getElementById("idea-form");
const ideaList = document.getElementById("idea-list");

const calcForm = document.getElementById("calc-form");
const calcResult = document.getElementById("calc-result");

const convertForm = document.getElementById("convert-form");
const convertResult = document.getElementById("convert-result");

const checkinForm = document.getElementById("checkin-form");
const checkinResult = document.getElementById("checkin-result");

const timerDisplay = document.getElementById("timer-display");
const timerStart = document.getElementById("timer-start");
const timerPause = document.getElementById("timer-pause");
const timerReset = document.getElementById("timer-reset");

const detailTitle = document.getElementById("detail-title");
const detailDescription = document.getElementById("detail-description");
const detailPath = document.getElementById("detail-path");
const detailBack = document.getElementById("detail-back");

const STORAGE_KEYS = {
  apps: "app100.apps",
  ideas: "app100.ideas",
  progress: "app100.progress",
  checkin: "app100.checkin",
};

let state = {
  apps: [],
};

const defaultApps = [
  {
    name: "Business Atlas Builder",
    description: "App #2: create business docs and reusable templates.",
    path: "/apps/Docbuilder/index.html",
  },
  {
    name: "Momentum Pad",
    description: "Landing page to keep your daily momentum notes.",
    path: "/apps/momentum-pad/index.html",
  },
  {
    name: "Focus Sprint",
    description: "Pomodoro-style timer with a minimal UI.",
    path: "/apps/focus-sprint/index.html",
  },
  {
    name: "Mini Finance",
    description: "A quick expense tracker for the day.",
    path: "/apps/mini-finance/index.html",
  },
  {
    name: "Color Lab",
    description: "Palette generator and contrast checker.",
    path: "/apps/color-lab/index.html",
  },
];

const getStored = (key, fallback) => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const setStored = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const saveApps = (next) => {
  setStored(STORAGE_KEYS.apps, next);
  renderApps(next);
  state.apps = next;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getInitials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

const colorFromText = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 75% 48%)`;
};

const renderProgress = (value) => {
  const clamped = clamp(value, 0, 100);
  progressFill.style.width = `${clamped}%`;
  progressCount.textContent = `${clamped} / 100`;
  progressInput.value = clamped;
  setStored(STORAGE_KEYS.progress, clamped);
};

const renderApps = (apps) => {
  appList.innerHTML = "";
  apps.forEach((app) => {
    const item = document.createElement("div");
    item.className = "app-item";

    const icon = document.createElement("div");
    icon.className = "app-icon";
    icon.textContent = getInitials(app.name);
    icon.style.background = colorFromText(app.name);

    const details = document.createElement("div");
    details.className = "app-details";

    const title = document.createElement("strong");
    title.textContent = app.name;

    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = app.description;

    const meta = document.createElement("div");
    meta.className = "app-meta";
    meta.textContent = `Path: ${app.path}`;

    const actions = document.createElement("div");
    actions.className = "app-actions";

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.textContent = "View details";
    viewButton.addEventListener("click", () => {
      location.hash = `#/apps/${app.id}`;
    });

    const openLink = document.createElement("a");
    openLink.href = app.path;
    openLink.target = "_blank";
    openLink.rel = "noreferrer";
    openLink.textContent = "Open";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      const next = apps.filter((item) => item.id !== app.id);
      saveApps(next);
    });

    actions.append(viewButton, openLink, removeButton);

    details.append(title, desc, meta, actions);
    item.append(icon, details);
    appList.append(item);
  });
};

const renderIdeas = (ideas) => {
  ideaList.innerHTML = "";
  ideas.forEach((idea, index) => {
    const item = document.createElement("li");
    item.className = "idea-item";

    const text = document.createElement("span");
    text.textContent = idea;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const next = ideas.filter((_, itemIndex) => itemIndex !== index);
      setStored(STORAGE_KEYS.ideas, next);
      renderIdeas(next);
    });

    item.append(text, remove);
    ideaList.append(item);
  });
};

const loadState = () => {
  const apps = getStored(STORAGE_KEYS.apps, defaultApps).map((app, index) => ({
    id: app.id ?? `${app.name}-${index}`,
    ...app,
  }));
  const ideas = getStored(STORAGE_KEYS.ideas, []);
  const progress = getStored(STORAGE_KEYS.progress, 0);
  const checkin = getStored(STORAGE_KEYS.checkin, "--");

  renderApps(apps);
  renderIdeas(ideas);
  renderProgress(progress);
  checkinResult.textContent = `Latest: ${checkin}`;

  setStored(STORAGE_KEYS.apps, apps);

  return { apps };
};

progressInput.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  renderProgress(value);
});

appForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(appForm);
  const app = {
    id: `${Date.now()}`,
    name: formData.get("name").trim(),
    description: formData.get("description").trim(),
    path: formData.get("path").trim(),
  };
  const apps = getStored(STORAGE_KEYS.apps, defaultApps).map((item, index) => ({
    id: item.id ?? `${item.name}-${index}`,
    ...item,
  }));
  const next = [app, ...apps];
  saveApps(next);
  appForm.reset();
});

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(ideaForm);
  const idea = formData.get("idea").trim();
  const ideas = getStored(STORAGE_KEYS.ideas, []);
  const next = [idea, ...ideas];
  setStored(STORAGE_KEYS.ideas, next);
  renderIdeas(next);
  ideaForm.reset();
});

calcForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(calcForm);
  const a = Number(formData.get("a"));
  const b = Number(formData.get("b"));
  const op = formData.get("op");

  let result = 0;
  if (op === "+") {
    result = a + b;
  } else if (op === "-") {
    result = a - b;
  } else if (op === "*") {
    result = a * b;
  } else if (op === "/") {
    result = b === 0 ? "∞" : a / b;
  }

  calcResult.textContent = `Result: ${result}`;
});

convertForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(convertForm);
  const inches = Number(formData.get("inches"));
  const centimeters = inches * 2.54;
  convertResult.textContent = `Centimeters: ${centimeters.toFixed(2)}`;
});

checkinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(checkinForm);
  const checkin = formData.get("checkin").trim();
  setStored(STORAGE_KEYS.checkin, checkin);
  checkinResult.textContent = `Latest: ${checkin}`;
  checkinForm.reset();
});

let timerSeconds = 25 * 60;
let timerInterval = null;

const getRouteFromHash = () => {
  const hash = location.hash.replace("#", "");
  if (!hash || hash === "/") {
    return { name: "launcher" };
  }

  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "apps" && parts[1]) {
    return { name: "app-detail", id: parts[1] };
  }

  const validRoutes = new Set(["launcher", "ideas", "mini-apps"]);
  if (validRoutes.has(parts[0])) {
    return { name: parts[0] };
  }

  return { name: "launcher" };
};

const setActiveRoute = (routeName) => {
  routeViews.forEach((view) => {
    view.hidden = view.dataset.route !== routeName;
  });
  routeLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.routeLink === routeName);
  });
};

const renderAppDetail = (apps, id) => {
  const app = apps.find((item) => item.id === id);
  if (!app) {
    detailTitle.textContent = "App not found";
    detailDescription.textContent =
      "We couldn't find that app. Head back to the launcher to pick another one.";
    detailPath.textContent = "Back to launcher";
    detailPath.href = "#/launcher";
    return;
  }

  detailTitle.textContent = app.name;
  detailDescription.textContent = app.description;
  detailPath.textContent = app.path;
  detailPath.href = app.path;
};

const renderTimer = () => {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const startTimer = () => {
  if (timerInterval) {
    return;
  }
  timerInterval = setInterval(() => {
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    timerSeconds -= 1;
    renderTimer();
  }, 1000);
};

const pauseTimer = () => {
  clearInterval(timerInterval);
  timerInterval = null;
};

const resetTimer = () => {
  pauseTimer();
  timerSeconds = 25 * 60;
  renderTimer();
};

timerStart.addEventListener("click", startTimer);
timerPause.addEventListener("click", pauseTimer);
timerReset.addEventListener("click", resetTimer);

state = loadState();
renderTimer();

const handleRouteChange = () => {
  const route = getRouteFromHash();
  if (route.name === "app-detail") {
    renderAppDetail(state.apps, route.id);
  }
  setActiveRoute(route.name);
};

detailBack.addEventListener("click", () => {
  location.hash = "#/launcher";
});

window.addEventListener("hashchange", handleRouteChange);
handleRouteChange();

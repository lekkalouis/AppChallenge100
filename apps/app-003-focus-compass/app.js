const form = document.getElementById("task-form");
const taskList = document.getElementById("task-list");
const recommendation = document.getElementById("recommendation");
const clearAllButton = document.getElementById("clear-all");
const energyInput = document.getElementById("energy-level");

const STORAGE_KEY = "app100.focus-compass.tasks";

const energyMultiplier = {
  low: 0.85,
  medium: 1,
  high: 1.15,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStoredTasks = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const setStoredTasks = (tasks) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
};

const scoreTask = (task, selectedEnergy) => {
  const multiplier = energyMultiplier[selectedEnergy] ?? 1;
  return (task.impact * 2 - task.effort) * multiplier;
};

const renderTasks = (tasks) => {
  const currentEnergy = energyInput.value;
  const ranked = [...tasks].sort((a, b) => scoreTask(b, currentEnergy) - scoreTask(a, currentEnergy));

  taskList.innerHTML = "";

  if (!ranked.length) {
    recommendation.textContent = "Add at least one task to get a recommendation.";
    return;
  }

  const top = ranked[0];
  recommendation.textContent = `Start with “${top.title}”. It has the best score for your ${currentEnergy} energy right now.`;

  ranked.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task-item";

    const copy = document.createElement("div");
    copy.className = "task-copy";

    const title = document.createElement("strong");
    title.textContent = task.title;

    const meta = document.createElement("span");
    meta.className = "task-meta";
    meta.textContent = `Impact ${task.impact}/5 · Effort ${task.effort}/5`;

    const chip = document.createElement("span");
    chip.className = "score-chip";
    chip.textContent = `Score ${scoreTask(task, currentEnergy).toFixed(1)}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      const next = tasks.filter((entry) => entry.id !== task.id);
      setStoredTasks(next);
      renderTasks(next);
    });

    copy.append(title, meta);
    item.append(copy, chip, removeButton);
    taskList.append(item);
  });
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const task = {
    id: crypto.randomUUID(),
    title: data.get("title").trim(),
    impact: clamp(Number(data.get("impact")), 1, 5),
    effort: clamp(Number(data.get("effort")), 1, 5),
  };

  const tasks = getStoredTasks();
  const next = [task, ...tasks];
  setStoredTasks(next);
  renderTasks(next);
  form.reset();
  energyInput.value = "medium";
});

energyInput.addEventListener("change", () => {
  renderTasks(getStoredTasks());
});

clearAllButton.addEventListener("click", () => {
  setStoredTasks([]);
  renderTasks([]);
});

renderTasks(getStoredTasks());

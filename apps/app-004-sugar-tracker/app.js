const form = document.getElementById("entry-form");
const statsContainer = document.getElementById("stats");
const trendChart = document.getElementById("trend-chart");
const riskBars = document.getElementById("risk-bars");
const entryList = document.getElementById("entry-list");
const clearAllButton = document.getElementById("clear-all");

const STORAGE_KEY = "app100.sugar-tracker.entries";
const MEAL_ORDER = ["fasting", "breakfast", "lunch", "dinner"];

const riskColor = {
  inRange: "var(--good)",
  caution: "var(--warn)",
  highRisk: "var(--risk)",
};

const mealLabel = (mealType) => {
  if (mealType === "fasting") {
    return "Fasting";
  }
  if (mealType === "breakfast") {
    return "Breakfast";
  }
  if (mealType === "lunch") {
    return "Lunch";
  }
  if (mealType === "dinner") {
    return "Dinner";
  }
  return "Reading";
};

const inferMealType = (timeValue) => {
  if (typeof timeValue !== "string") {
    return "dinner";
  }

  const [hRaw, mRaw] = timeValue.split(":");
  const hours = Number(hRaw);
  const minutes = Number(mRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return "dinner";
  }

  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes < 7 * 60) {
    return "fasting";
  }
  if (totalMinutes < 11 * 60) {
    return "breakfast";
  }
  if (totalMinutes < 16 * 60) {
    return "lunch";
  }
  return "dinner";
};

const normalizeMealType = (value, fallbackTime) => {
  if (MEAL_ORDER.includes(value)) {
    return value;
  }
  return inferMealType(fallbackTime);
};

const classifyReading = (value) => {
  if (value < 4 || value > 9.5) {
    return "highRisk";
  }
  if (value > 7.8) {
    return "caution";
  }
  return "inRange";
};

const safeDate = (input) => {
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const safeDateTime = (entry) => safeDate(`${entry.date}T${entry.time || "00:00"}`);

const getEntries = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        const level = Number(entry.level);
        const time = typeof entry.time === "string" && entry.time ? entry.time : "00:00";
        return {
          id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
          date: typeof entry.date === "string" ? entry.date : "",
          time,
          level: Number.isFinite(level) ? level : null,
          mealType: normalizeMealType(entry.mealType, time),
        };
      })
      .filter((entry) => entry.date && entry.level !== null);
  } catch (error) {
    return [];
  }
};

const setEntries = (entries) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const gatherValues = (entries) => entries.map((entry) => entry.level).filter((value) => typeof value === "number");

const average = (values) => {
  if (!values.length) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

const getRiskSummary = (values) => {
  const summary = {
    inRange: 0,
    caution: 0,
    highRisk: 0,
  };

  values.forEach((value) => {
    summary[classifyReading(value)] += 1;
  });

  return summary;
};

const getMealCounts = (entries) => {
  const counts = {
    fasting: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };

  entries.forEach((entry) => {
    counts[entry.mealType] += 1;
  });

  return counts;
};

const labelFromRisk = (risk) => {
  if (risk === "highRisk") {
    return "High risk";
  }
  if (risk === "caution") {
    return "Caution";
  }
  return "In range";
};

const overallRisk = (summary) => {
  if (summary.highRisk > 0) {
    return "highRisk";
  }
  if (summary.caution > 0) {
    return "caution";
  }
  return "inRange";
};

const renderStats = (entries) => {
  const values = gatherValues(entries);
  const avg = average(values);
  const risk = getRiskSummary(values);
  const dominantRisk = overallRisk(risk);
  const uniqueDays = new Set(entries.map((entry) => entry.date));
  const mealCounts = getMealCounts(entries);

  const avgText = avg === null ? "--" : avg.toFixed(1);

  statsContainer.innerHTML = `
    <div class="stat">
      <small>Logged entries</small>
      <strong>${entries.length}</strong>
    </div>
    <div class="stat">
      <small>Days tracked</small>
      <strong>${uniqueDays.size}</strong>
    </div>
    <div class="stat">
      <small>Average glucose</small>
      <strong>${avgText} mmol/L</strong>
    </div>
    <div class="stat">
      <small>Current risk level</small>
      <span class="badge ${dominantRisk === "highRisk" ? "risk" : dominantRisk === "caution" ? "warn" : "good"}">${labelFromRisk(dominantRisk)}</span>
    </div>
    <div class="stat">
      <small>Fasting count</small>
      <strong>${mealCounts.fasting}</strong>
    </div>
    <div class="stat">
      <small>Breakfast count</small>
      <strong>${mealCounts.breakfast}</strong>
    </div>
    <div class="stat">
      <small>Lunch count</small>
      <strong>${mealCounts.lunch}</strong>
    </div>
    <div class="stat">
      <small>Dinner count</small>
      <strong>${mealCounts.dinner}</strong>
    </div>
  `;
};

const renderRiskBars = (entries) => {
  const values = gatherValues(entries);
  const summary = getRiskSummary(values);
  const total = values.length || 1;
  const rows = [
    ["In range", "inRange"],
    ["Caution", "caution"],
    ["High risk", "highRisk"],
  ];

  riskBars.innerHTML = "";

  rows.forEach(([label, key]) => {
    const percent = Math.round((summary[key] / total) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div>${label}: ${summary[key]} (${percent}%)</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${percent}%; background:${riskColor[key]};"></div>
      </div>
    `;
    riskBars.append(row);
  });
};

const renderTrendChart = (entries) => {
  const byDate = [...entries]
    .sort((a, b) => safeDateTime(a) - safeDateTime(b))
    .slice(-7)
    .map((entry) => ({
      label: `${entry.date} ${entry.time}`,
      value: entry.level,
    }));

  if (!byDate.length) {
    trendChart.innerHTML = '<text x="24" y="36" fill="#647089">Add entries to view your trend.</text>';
    return;
  }

  const min = Math.min(...byDate.map((p) => p.value), 3);
  const max = Math.max(...byDate.map((p) => p.value), 10);
  const width = 640;
  const height = 260;
  const padX = 40;
  const padY = 28;

  const scaleX = (index) => {
    if (byDate.length === 1) {
      return width / 2;
    }
    return padX + (index / (byDate.length - 1)) * (width - padX * 2);
  };

  const scaleY = (value) => {
    const ratio = (value - min) / (max - min || 1);
    return height - padY - ratio * (height - padY * 2);
  };

  const path = byDate
    .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(index)},${scaleY(point.value)}`)
    .join(" ");

  const circles = byDate
    .map(
      (point, index) =>
        `<circle cx="${scaleX(index)}" cy="${scaleY(point.value)}" r="4" fill="#8a74f0"><title>${point.label}: ${point.value.toFixed(1)}</title></circle>`,
    )
    .join("");

  const labels = byDate
    .map((point, index) => {
      const short = point.label.slice(5);
      return `<text x="${scaleX(index)}" y="246" text-anchor="middle" fill="#647089" font-size="10">${short}</text>`;
    })
    .join("");

  trendChart.innerHTML = `
    <rect x="0" y="0" width="640" height="260" fill="#fff" />
    <path d="${path}" fill="none" stroke="#8a74f0" stroke-width="3" stroke-linecap="round" />
    ${circles}
    ${labels}
  `;
};

const renderEntryList = (entries) => {
  entryList.innerHTML = "";

  const sorted = [...entries].sort((a, b) => safeDateTime(b) - safeDateTime(a));
  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry-item";
    item.innerHTML = `
      <strong>${entry.date} · ${entry.time}</strong>
      <span>${mealLabel(entry.mealType)} · ${entry.level.toFixed(1)} mmol/L</span>
    `;
    entryList.append(item);
  });
};

const renderAll = (entries) => {
  renderStats(entries);
  renderRiskBars(entries);
  renderTrendChart(entries);
  renderEntryList(entries);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);

  const rawLevel = data.get("level");
  const parsedLevel = Number(rawLevel);
  const time = data.get("time");
  const selectedMealType = data.get("mealType");
  const entry = {
    id: crypto.randomUUID(),
    date: data.get("date"),
    time,
    level: Number.isFinite(parsedLevel) && rawLevel !== "" ? parsedLevel : null,
    mealType: selectedMealType === "auto" ? inferMealType(time) : normalizeMealType(selectedMealType, time),
  };

  if (!entry.date || !entry.time || entry.level === null) {
    return;
  }

  const entries = getEntries();
  const next = [...entries, entry];
  setEntries(next);
  renderAll(next);

  const currentDate = entry.date;
  form.reset();
  form.date.value = currentDate;
  const now = new Date();
  const hh = `${now.getHours()}`.padStart(2, "0");
  const mm = `${now.getMinutes()}`.padStart(2, "0");
  form.time.value = `${hh}:${mm}`;
  form.mealType.value = "auto";
});

clearAllButton.addEventListener("click", () => {
  setEntries([]);
  renderAll([]);
});

const now = new Date();
const today = now.toISOString().slice(0, 10);
const hh = `${now.getHours()}`.padStart(2, "0");
const mm = `${now.getMinutes()}`.padStart(2, "0");
form.date.value = today;
form.time.value = `${hh}:${mm}`;
form.mealType.value = "auto";

renderAll(getEntries());

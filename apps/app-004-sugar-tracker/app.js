const form = document.getElementById("entry-form");
const statsContainer = document.getElementById("stats");
const trendChart = document.getElementById("trend-chart");
const riskBars = document.getElementById("risk-bars");
const entryList = document.getElementById("entry-list");
const clearAllButton = document.getElementById("clear-all");

const STORAGE_KEY = "app100.sugar-tracker.entries";
const slots = ["fasting", "breakfast", "lunch", "dinner"];

const riskColor = {
  inRange: "var(--good)",
  caution: "var(--warn)",
  highRisk: "var(--risk)",
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

const getEntries = () => {
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

const setEntries = (entries) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const gatherValues = (entries) =>
  entries.flatMap((entry) => slots.map((slot) => entry[slot]).filter((value) => typeof value === "number"));

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

  const avgText = avg === null ? "--" : avg.toFixed(1);

  statsContainer.innerHTML = `
    <div class="stat">
      <small>Logged days</small>
      <strong>${entries.length}</strong>
    </div>
    <div class="stat">
      <small>Average glucose</small>
      <strong>${avgText} mmol/L</strong>
    </div>
    <div class="stat">
      <small>Current risk level</small>
      <span class="badge ${dominantRisk === "highRisk" ? "risk" : dominantRisk === "caution" ? "warn" : "good"}">${labelFromRisk(dominantRisk)}</span>
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

const toDayAverage = (entry) => {
  const values = slots.map((slot) => entry[slot]).filter((value) => typeof value === "number");
  return average(values);
};

const renderTrendChart = (entries) => {
  const byDate = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7);
  const points = byDate
    .map((entry) => ({
      label: entry.date,
      value: toDayAverage(entry),
    }))
    .filter((entry) => entry.value !== null);

  if (!points.length) {
    trendChart.innerHTML = '<text x="24" y="36" fill="#647089">Add entries to view your trend.</text>';
    return;
  }

  const min = Math.min(...points.map((p) => p.value), 3);
  const max = Math.max(...points.map((p) => p.value), 10);
  const width = 640;
  const height = 260;
  const padX = 40;
  const padY = 28;

  const scaleX = (index) => {
    if (points.length === 1) {
      return width / 2;
    }
    return padX + (index / (points.length - 1)) * (width - padX * 2);
  };

  const scaleY = (value) => {
    const ratio = (value - min) / (max - min || 1);
    return height - padY - ratio * (height - padY * 2);
  };

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(index)},${scaleY(point.value)}`)
    .join(" ");

  const circles = points
    .map(
      (point, index) =>
        `<circle cx="${scaleX(index)}" cy="${scaleY(point.value)}" r="4" fill="#8a74f0"><title>${point.label}: ${point.value.toFixed(1)}</title></circle>`,
    )
    .join("");

  const labels = points
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

const readingText = (entry) =>
  slots
    .map((slot) => `${slot[0].toUpperCase()}${slot.slice(1)}: ${typeof entry[slot] === "number" ? entry[slot].toFixed(1) : "-"}`)
    .join(" · ");

const renderEntryList = (entries) => {
  entryList.innerHTML = "";

  const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry-item";
    item.innerHTML = `
      <strong>${entry.date}</strong>
      <span>${readingText(entry)}</span>
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

  const entry = {
    id: crypto.randomUUID(),
    date: data.get("date"),
  };

  slots.forEach((slot) => {
    const raw = data.get(slot);
    const parsed = Number(raw);
    entry[slot] = Number.isFinite(parsed) && raw !== "" ? parsed : null;
  });

  if (!entry.date) {
    return;
  }

  const entries = getEntries();
  const withoutSameDate = entries.filter((item) => item.date !== entry.date);
  const next = [...withoutSameDate, entry];
  setEntries(next);
  renderAll(next);
  form.reset();
  form.date.valueAsDate = new Date();
});

clearAllButton.addEventListener("click", () => {
  setEntries([]);
  renderAll([]);
});

form.date.valueAsDate = new Date();
renderAll(getEntries());

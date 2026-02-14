const form = document.getElementById("entry-form");
const statsContainer = document.getElementById("stats");
const trendChart = document.getElementById("trend-chart");
const riskBars = document.getElementById("risk-bars");
const entryList = document.getElementById("entry-list");
const clearAllButton = document.getElementById("clear-all");
const downloadExcelButton = document.getElementById("download-excel");
const referenceGuide = document.getElementById("reference-guide");
const tabLinks = document.querySelectorAll(".tab-link");
const tabPanels = document.querySelectorAll(".tab-panel");

const STORAGE_KEY = "app100.sugar-tracker.entries";
const MEAL_ORDER = ["fasting", "breakfast", "lunch", "dinner"];
const AUTO_CAPTURE_DELAY_MS = 2000;

const TARGETS = {
  fasting: { min: 3.9, max: 5.5, label: "3.9-5.5 mmol/L" },
  breakfast: { min: 4.0, max: 7.8, label: "4.0-7.8 mmol/L" },
  lunch: { min: 4.0, max: 7.8, label: "4.0-7.8 mmol/L" },
  dinner: { min: 4.0, max: 7.8, label: "4.0-7.8 mmol/L" },
};

const inferMealTypeFromTime = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return "dinner";

  const [hoursText = "0", minutesText = "0"] = timeValue.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "dinner";

  const minutesOfDay = hours * 60 + minutes;

  if (minutesOfDay < 8 * 60 + 30) return "fasting";
  if (minutesOfDay < 13 * 60) return "breakfast";
  if (minutesOfDay >= 13 * 60 && minutesOfDay < 17 * 60) return "lunch";
  return "dinner";
};

const parseLevelInput = (rawValue) => {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim().replace(",", ".");
  if (!/^\d\.\d$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 2 || parsed > 20) return null;
  return parsed;
};

const mealLabel = (mealType) => {
  if (mealType === "fasting") return "Fasting";
  if (mealType === "breakfast") return "Breakfast";
  if (mealType === "lunch") return "Lunch";
  if (mealType === "dinner") return "Dinner";
  return "Reading";
};

const normalizeMealType = (value) => (MEAL_ORDER.includes(value) ? value : "dinner");

const targetForMeal = (mealType) => TARGETS[normalizeMealType(mealType)];

const classifyReading = (entry) => {
  const target = targetForMeal(entry.mealType);
  const cautionBand = 0.3;

  if (entry.level < target.min - cautionBand || entry.level > target.max + cautionBand) return "highRisk";
  if (entry.level < target.min || entry.level > target.max) return "caution";
  return "inRange";
};

const safeDate = (input) => {
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const safeDateTime = (entry) => safeDate(`${entry.date}T${entry.time || "00:00"}`);

const generateEntryId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getEntries = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        const level = Number(entry.level);
        return {
          id: typeof entry.id === "string" ? entry.id : generateEntryId(),
          date: typeof entry.date === "string" ? entry.date : "",
          time: typeof entry.time === "string" && entry.time ? entry.time : "00:00",
          level: Number.isFinite(level) ? level : null,
          mealType: normalizeMealType(entry.mealType),
        };
      })
      .filter((entry) => entry.date && entry.level !== null)
      .sort((a, b) => safeDateTime(a) - safeDateTime(b));
  } catch (_error) {
    return [];
  }
};

const setEntries = (entries) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const labelFromRisk = (risk) => {
  if (risk === "inRange") return "In range";
  if (risk === "caution") return "Caution";
  return "High risk";
};

const renderStats = (entries) => {
  if (!entries.length) {
    statsContainer.innerHTML = '<p class="muted">No readings yet. Add your first capture.</p>';
    return;
  }

  const total = entries.length;
  const avgLevel = average(entries.map((entry) => entry.level));
  const inRangeCount = entries.filter((entry) => classifyReading(entry) === "inRange").length;

  statsContainer.innerHTML = `
    <div class="stat"><small>Readings</small><strong>${total}</strong></div>
    <div class="stat"><small>Average level</small><strong>${avgLevel.toFixed(1)} mmol/L</strong></div>
    <div class="stat"><small>In range</small><strong>${Math.round((inRangeCount / total) * 100)}%</strong></div>
  `;
};

const renderRiskBars = (entries) => {
  const counts = { inRange: 0, caution: 0, highRisk: 0 };
  entries.forEach((entry) => {
    counts[classifyReading(entry)] += 1;
  });

  const total = entries.length || 1;
  riskBars.innerHTML = ["inRange", "caution", "highRisk"]
    .map((risk) => {
      const percent = Math.round((counts[risk] / total) * 100);
      return `
        <div class="risk-row">
          <div class="risk-label">${labelFromRisk(risk)}</div>
          <div class="risk-track">
            <div class="risk-fill ${risk === "highRisk" ? "risk" : risk === "caution" ? "warn" : "good"}" style="width:${percent}%"></div>
          </div>
          <div class="risk-value">${percent}%</div>
        </div>
      `;
    })
    .join("");
};

const bucketByDate = (entries) => {
  const daily = new Map();
  entries.forEach((entry) => {
    const existing = daily.get(entry.date) || [];
    existing.push(entry.level);
    daily.set(entry.date, existing);
  });

  return [...daily.entries()]
    .map(([date, levels]) => ({
      date,
      avg: average(levels),
      label: date.slice(5),
      timestamp: safeDate(date),
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-7);
};

const renderTrendChart = (entries) => {
  const points = bucketByDate(entries);
  if (!points.length) {
    trendChart.innerHTML = '<text x="20" y="130" fill="#647089">No trend data yet.</text>';
    return;
  }

  const maxY = Math.max(...points.map((point) => point.avg), 8);
  const minY = Math.min(...points.map((point) => point.avg), 3);
  const chartWidth = 620;
  const chartHeight = 200;
  const xStep = points.length === 1 ? 0 : chartWidth / (points.length - 1);

  const toX = (index) => 10 + index * xStep;
  const toY = (value) => 30 + ((maxY - value) / Math.max(maxY - minY, 0.5)) * chartHeight;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)} ${toY(point.avg)}`)
    .join(" ");

  const circles = points
    .map((point, index) => `<circle cx="${toX(index)}" cy="${toY(point.avg)}" r="4" fill="#8a74f0" />`)
    .join("");

  const labels = points
    .map((point, index) => `<text x="${toX(index)}" y="246" text-anchor="middle" fill="#647089" font-size="10">${point.label}</text>`)
    .join("");

  trendChart.innerHTML = `<rect x="0" y="0" width="640" height="260" fill="#fff" /><path d="${path}" fill="none" stroke="#8a74f0" stroke-width="3" stroke-linecap="round" />${circles}${labels}`;
};

const renderEntryList = (entries) => {
  entryList.innerHTML = "";

  [...entries]
    .sort((a, b) => safeDateTime(b) - safeDateTime(a))
    .forEach((entry) => {
      const item = document.createElement("li");
      const target = targetForMeal(entry.mealType);
      const risk = classifyReading(entry);

      item.className = "entry-item";
      item.innerHTML = `
        <strong>${entry.date} · ${entry.time}</strong>
        <span>${mealLabel(entry.mealType)} · ${entry.level.toFixed(1)} mmol/L</span>
        <span class="entry-target">Target ${target.label} · <span class="badge ${risk === "highRisk" ? "risk" : risk === "caution" ? "warn" : "good"}">${labelFromRisk(risk)}</span></span>
      `;
      entryList.append(item);
    });
};

const renderReferenceGuide = () => {
  referenceGuide.innerHTML = `
    <article class="ref-card">
      <h3>Reference ranges used in this app (normal mode)</h3>
      <ul>
        <li><strong>Fasting:</strong> 3.9-5.5 mmol/L</li>
        <li><strong>Breakfast:</strong> 4.0-7.8 mmol/L</li>
        <li><strong>Lunch:</strong> 4.0-7.8 mmol/L</li>
        <li><strong>Dinner:</strong> 4.0-7.8 mmol/L</li>
      </ul>
      <p class="muted">Meal references are auto-detected from your capture time.</p>
    </article>
  `;
};

const renderAll = () => {
  const entries = getEntries();
  renderStats(entries);
  renderRiskBars(entries);
  renderTrendChart(entries);
  renderEntryList(entries);
  renderReferenceGuide();
};

const setActiveTab = (tabName) => {
  tabLinks.forEach((tabLink) => {
    tabLink.classList.toggle("active", tabLink.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
  });
};

tabLinks.forEach((tabLink) => {
  tabLink.addEventListener("click", () => {
    setActiveTab(tabLink.dataset.tab);
  });
});

const levelInput = form.elements.level;
const captureToast = document.getElementById("capture-toast");

let autoCaptureTimer = null;

const showCaptureToast = (message) => {
  if (!captureToast) return;
  captureToast.textContent = message;
  captureToast.classList.add("visible");
  window.setTimeout(() => {
    captureToast.classList.remove("visible");
  }, 1700);
};

const formatDateForExcel = (value) => {
  if (!value) return "";
  const [year = "", month = "", day = ""] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const escapeForCsv = (value) => {
  const textValue = String(value ?? "");
  const escaped = textValue.replaceAll('"', '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const buildExcelCompatibleCsv = (entries) => {
  const headers = ["Date", "Time", "Reading type", "Level (mmol/L)", "Target range", "Risk"];
  const rows = entries
    .slice()
    .sort((a, b) => safeDateTime(a) - safeDateTime(b))
    .map((entry) => {
      const target = targetForMeal(entry.mealType);
      const risk = labelFromRisk(classifyReading(entry));
      return [
        formatDateForExcel(entry.date),
        entry.time,
        mealLabel(entry.mealType),
        entry.level.toFixed(1),
        target.label,
        risk,
      ];
    });

  return [headers, ...rows].map((row) => row.map(escapeForCsv).join(",")).join("\r\n");
};

const downloadEntriesAsExcel = () => {
  const entries = getEntries();
  if (!entries.length) {
    showCaptureToast("No entries available to download.");
    return;
  }

  const csv = buildExcelCompatibleCsv(entries);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `sugar-tracker-${today}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showCaptureToast("Excel-ready file downloaded.");
};

const captureEntryFromForm = () => {
  const data = new FormData(form);
  const level = parseLevelInput(data.get("level"));
  const selectedMealType = data.get("mealType");

  const entry = {
    id: generateEntryId(),
    date: data.get("date"),
    time: data.get("time"),
    level,
    mealType: selectedMealType ? normalizeMealType(selectedMealType) : inferMealTypeFromTime(data.get("time")),
  };

  if (!entry.date || !entry.time || entry.level === null) return false;

  const entries = getEntries();
  setEntries([...entries, entry]);
  renderAll();

  const currentDate = entry.date;
  const currentTime = entry.time;
  form.reset();
  form.date.value = currentDate;
  form.time.value = currentTime;
  form.mealType.value = "";
  form.level.focus();
  showCaptureToast(`${entry.level.toFixed(1)} mmol/L captured as ${mealLabel(entry.mealType)}.`);
  return true;
};

const scheduleAutoCapture = () => {
  if (autoCaptureTimer) window.clearTimeout(autoCaptureTimer);

  const parsedLevel = parseLevelInput(levelInput.value);
  if (parsedLevel === null) return;

  autoCaptureTimer = window.setTimeout(() => {
    autoCaptureTimer = null;
    captureEntryFromForm();
  }, AUTO_CAPTURE_DELAY_MS);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (autoCaptureTimer) {
    window.clearTimeout(autoCaptureTimer);
    autoCaptureTimer = null;
  }
  captureEntryFromForm();
});

levelInput.addEventListener("input", () => {
  const normalized = levelInput.value.replace(/,/g, ".").replace(/[^\d.]/g, "").slice(0, 3);
  levelInput.value = normalized;
  scheduleAutoCapture();
});

clearAllButton.addEventListener("click", () => {
  setEntries([]);
  renderAll();
});

if (downloadExcelButton) {
  downloadExcelButton.addEventListener("click", downloadEntriesAsExcel);
}

const now = new Date();
form.date.value = now.toISOString().slice(0, 10);
form.time.value = `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
form.level.focus();

renderAll();

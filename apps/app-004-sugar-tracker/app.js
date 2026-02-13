const form = document.getElementById("entry-form");
const profileForm = document.getElementById("profile-form");
const toggleModeButton = document.getElementById("toggle-mode");
const modeCaption = document.getElementById("mode-caption");
const pregnancyWeekInput = document.getElementById("pregnancy-week");
const statsContainer = document.getElementById("stats");
const trendChart = document.getElementById("trend-chart");
const riskBars = document.getElementById("risk-bars");
const entryList = document.getElementById("entry-list");
const clearAllButton = document.getElementById("clear-all");
const referenceGuide = document.getElementById("reference-guide");
const tabLinks = document.querySelectorAll(".tab-link");
const tabPanels = document.querySelectorAll(".tab-panel");

const STORAGE_KEY = "app100.sugar-tracker.entries";
const PROFILE_STORAGE_KEY = "app100.sugar-tracker.profile";
const MEAL_ORDER = ["fasting", "breakfast", "lunch", "dinner"];

const riskColor = {
  inRange: "var(--good)",
  caution: "var(--warn)",
  highRisk: "var(--risk)",
};

const defaultProfile = {
  mode: "normal",
  pregnancyWeek: "",
  hyperthyroidism: "yes",
  insulinResistance: "yes",
};

const mealLabel = (mealType) => {
  if (mealType === "fasting") return "Fasting";
  if (mealType === "breakfast") return "Breakfast";
  if (mealType === "lunch") return "Lunch";
  if (mealType === "dinner") return "Dinner";
  return "Reading";
};

const inferMealType = (timeValue) => {
  if (typeof timeValue !== "string") return "dinner";
  const [hRaw, mRaw] = timeValue.split(":");
  const hours = Number(hRaw);
  const minutes = Number(mRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "dinner";

  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 7 * 60) return "fasting";
  if (totalMinutes < 11 * 60) return "breakfast";
  if (totalMinutes < 16 * 60) return "lunch";
  return "dinner";
};

const normalizeMealType = (value, fallbackTime) => (MEAL_ORDER.includes(value) ? value : inferMealType(fallbackTime));

const getProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...defaultProfile };
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === "pregnant" ? "pregnant" : "normal",
      pregnancyWeek: typeof parsed.pregnancyWeek === "string" ? parsed.pregnancyWeek : "",
      hyperthyroidism: parsed.hyperthyroidism === "no" ? "no" : "yes",
      insulinResistance: parsed.insulinResistance === "no" ? "no" : "yes",
    };
  } catch (error) {
    return { ...defaultProfile };
  }
};

const setProfile = (profile) => {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
};

const getTargetRange = (mealType, profile) => {
  if (profile.mode === "pregnant") {
    if (mealType === "fasting") {
      return { min: 3.5, max: 5.3, label: "3.5-5.3 mmol/L" };
    }
    return { min: 3.5, max: 7.8, label: "3.5-7.8 mmol/L" };
  }

  return { min: 3.5, max: 7.0, label: "3.5-7.0 mmol/L" };
};

const thyroidRiskPoints = (symptom) => {
  if (symptom === "severe") return 2;
  if (symptom === "moderate") return 1;
  return 0;
};

const classifyReading = (entry, profile) => {
  const target = getTargetRange(entry.mealType, profile);
  const cautionBand = 0.3;
  let score = 0;

  if (entry.level < target.min - cautionBand || entry.level > target.max + cautionBand) {
    score += 2;
  } else if (entry.level < target.min || entry.level > target.max) {
    score += 1;
  }

  if (profile.insulinResistance === "yes" && entry.carbsGrams > 60) score += 1;
  if (entry.activityMinutes < 10) score += 1;
  if (profile.hyperthyroidism === "yes") score += thyroidRiskPoints(entry.thyroidSymptoms);
  if (entry.sleepHours < 6) score += 1;
  if (entry.stressLevel >= 7) score += 1;
  if (entry.heartRate > 100) score += 1;

  if (score >= 3) return "highRisk";
  if (score >= 1) return "caution";
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
        const carbsGrams = Number(entry.carbsGrams);
        const activityMinutes = Number(entry.activityMinutes);
        const sleepHours = Number(entry.sleepHours);
        const stressLevel = Number(entry.stressLevel);
        const heartRate = Number(entry.heartRate);
        const time = typeof entry.time === "string" && entry.time ? entry.time : "00:00";

        return {
          id: typeof entry.id === "string" ? entry.id : generateEntryId(),
          date: typeof entry.date === "string" ? entry.date : "",
          time,
          level: Number.isFinite(level) ? level : null,
          mealType: normalizeMealType(entry.mealType, time),
          carbsGrams: Number.isFinite(carbsGrams) ? carbsGrams : 0,
          activityMinutes: Number.isFinite(activityMinutes) ? activityMinutes : 0,
          thyroidSymptoms:
            entry.thyroidSymptoms === "mild" || entry.thyroidSymptoms === "moderate" || entry.thyroidSymptoms === "severe"
              ? entry.thyroidSymptoms
              : "none",
          sleepHours: Number.isFinite(sleepHours) ? sleepHours : 0,
          stressLevel: Number.isFinite(stressLevel) ? stressLevel : 0,
          heartRate: Number.isFinite(heartRate) ? heartRate : 0,
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

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const getRiskSummary = (entries, profile) => {
  const summary = { inRange: 0, caution: 0, highRisk: 0 };
  entries.forEach((entry) => {
    summary[classifyReading(entry, profile)] += 1;
  });
  return summary;
};

const labelFromRisk = (risk) => {
  if (risk === "highRisk") return "High risk";
  if (risk === "caution") return "Caution";
  return "In range";
};

const overallRisk = (summary) => {
  if (summary.highRisk > 0) return "highRisk";
  if (summary.caution > 0) return "caution";
  return "inRange";
};

const renderModeState = (profile) => {
  const isPregnant = profile.mode === "pregnant";
  toggleModeButton.textContent = isPregnant ? "Switch to normal mode" : "Switch to pregnant mode";
  modeCaption.textContent = isPregnant
    ? `Using pregnant standards${profile.pregnancyWeek ? ` (week ${profile.pregnancyWeek})` : ""}.`
    : "Using non-pregnant glucose standards.";

  pregnancyWeekInput.required = isPregnant;
  pregnancyWeekInput.disabled = !isPregnant;
  pregnancyWeekInput.value = profile.pregnancyWeek;
  profileForm.hyperthyroidism.value = profile.hyperthyroidism;
  profileForm.insulinResistance.value = profile.insulinResistance;
};

const renderStats = (entries, profile) => {
  const avg = average(entries.map((entry) => entry.level));
  const risk = getRiskSummary(entries, profile);
  const dominantRisk = overallRisk(risk);
  const uniqueDays = new Set(entries.map((entry) => entry.date));

  const avgCarbs = average(entries.map((entry) => entry.carbsGrams));
  const avgActivity = average(entries.map((entry) => entry.activityMinutes));
  const avgSleep = average(entries.map((entry) => entry.sleepHours));
  const avgStress = average(entries.map((entry) => entry.stressLevel));
  const avgHeartRate = average(entries.map((entry) => entry.heartRate));

  statsContainer.innerHTML = `
    <div class="stat"><small>Logged entries</small><strong>${entries.length}</strong></div>
    <div class="stat"><small>Days tracked</small><strong>${uniqueDays.size}</strong></div>
    <div class="stat"><small>Average glucose</small><strong>${avg === null ? "--" : avg.toFixed(1)} mmol/L</strong></div>
    <div class="stat"><small>Target basis</small><strong>${profile.mode === "pregnant" ? "Pregnant" : "Standard"}</strong></div>
    <div class="stat"><small>Current risk level</small><span class="badge ${dominantRisk === "highRisk" ? "risk" : dominantRisk === "caution" ? "warn" : "good"}">${labelFromRisk(dominantRisk)}</span></div>
    <div class="stat"><small>Avg carbs</small><strong>${avgCarbs === null ? "--" : avgCarbs.toFixed(0)} g</strong></div>
    <div class="stat"><small>Avg activity</small><strong>${avgActivity === null ? "--" : avgActivity.toFixed(0)} min</strong></div>
    <div class="stat"><small>Avg sleep</small><strong>${avgSleep === null ? "--" : avgSleep.toFixed(1)} h</strong></div>
    <div class="stat"><small>Avg stress</small><strong>${avgStress === null ? "--" : avgStress.toFixed(1)}/10</strong></div>
    <div class="stat"><small>Avg resting HR</small><strong>${avgHeartRate === null ? "--" : avgHeartRate.toFixed(0)} bpm</strong></div>
    <div class="stat"><small>Comorbidity flags</small><strong>Thyroid: ${profile.hyperthyroidism === "yes" ? "Yes" : "No"} · IR: ${profile.insulinResistance === "yes" ? "Yes" : "No"}</strong></div>
  `;
};

const renderRiskBars = (entries, profile) => {
  const summary = getRiskSummary(entries, profile);
  const total = entries.length || 1;
  riskBars.innerHTML = "";

  [["In range", "inRange"], ["Caution", "caution"], ["High risk", "highRisk"]].forEach(([label, key]) => {
    const percent = Math.round((summary[key] / total) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div>${label}: ${summary[key]} (${percent}%)</div>
      <div class="bar-track"><div class="bar-fill" style="width:${percent}%; background:${riskColor[key]};"></div></div>
    `;
    riskBars.append(row);
  });
};

const renderTrendChart = (entries) => {
  const dailyBuckets = new Map();
  [...entries]
    .sort((a, b) => safeDateTime(a) - safeDateTime(b))
    .forEach((entry) => {
      if (!dailyBuckets.has(entry.date)) {
        dailyBuckets.set(entry.date, []);
      }
      dailyBuckets.get(entry.date).push(entry.level);
    });

  const byDate = [...dailyBuckets.entries()]
    .slice(-7)
    .map(([date, levels]) => ({ label: date, count: levels.length, value: average(levels) }))
    .filter((point) => point.value !== null);

  if (!byDate.length) {
    trendChart.innerHTML = '<text x="24" y="36" fill="#647089">Add entries to view your trend.</text>';
    return;
  }

  const min = Math.min(...byDate.map((point) => point.value), 3);
  const max = Math.max(...byDate.map((point) => point.value), 10);
  const width = 640;
  const height = 260;
  const padX = 40;
  const padY = 28;

  const scaleX = (index) => (byDate.length === 1 ? width / 2 : padX + (index / (byDate.length - 1)) * (width - padX * 2));
  const scaleY = (value) => {
    const ratio = (value - min) / (max - min || 1);
    return height - padY - ratio * (height - padY * 2);
  };

  const path = byDate.map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(index)},${scaleY(point.value)}`).join(" ");
  const circles = byDate
    .map(
      (point, index) =>
        `<circle cx="${scaleX(index)}" cy="${scaleY(point.value)}" r="4" fill="#8a74f0"><title>${point.label}: avg ${point.value.toFixed(1)} mmol/L (${point.count} reading${point.count === 1 ? "" : "s"})</title></circle>`,
    )
    .join("");

  const labels = byDate
    .map((point, index) => `<text x="${scaleX(index)}" y="246" text-anchor="middle" fill="#647089" font-size="10">${point.label}</text>`)
    .join("");

  trendChart.innerHTML = `<rect x="0" y="0" width="640" height="260" fill="#fff" /><path d="${path}" fill="none" stroke="#8a74f0" stroke-width="3" stroke-linecap="round" />${circles}${labels}`;
};

const renderEntryList = (entries, profile) => {
  entryList.innerHTML = "";

  [...entries]
    .sort((a, b) => safeDateTime(b) - safeDateTime(a))
    .forEach((entry) => {
      const item = document.createElement("li");
      const target = getTargetRange(entry.mealType, profile);
      const risk = classifyReading(entry, profile);

      item.className = "entry-item";
      item.innerHTML = `
        <strong>${entry.date} · ${entry.time}</strong>
        <span>${mealLabel(entry.mealType)} · ${entry.level.toFixed(1)} mmol/L</span>
        <span>Carbs: ${entry.carbsGrams}g · Activity: ${entry.activityMinutes} min · Sleep: ${entry.sleepHours}h</span>
        <span>Stress: ${entry.stressLevel}/10 · Resting HR: ${entry.heartRate} bpm · Thyroid: ${entry.thyroidSymptoms}</span>
        <span class="entry-target">Target ${target.label} · <span class="badge ${risk === "highRisk" ? "risk" : risk === "caution" ? "warn" : "good"}">${labelFromRisk(risk)}</span></span>
      `;
      entryList.append(item);
    });
};

const renderReferenceGuide = (profile) => {
  const standard = "Standard adult target: 3.5–7.0 mmol/L";
  const pregnantFasting = "Pregnant fasting target: 3.5–5.3 mmol/L";
  const pregnantPostMeal = "Pregnant post-meal target: 3.5–7.8 mmol/L";

  referenceGuide.innerHTML = `
    <article class="ref-card">
      <h3>Glucose target ranges</h3>
      <ul>
        <li>${standard}</li>
        <li>${pregnantFasting}</li>
        <li>${pregnantPostMeal}</li>
      </ul>
      <p class="muted">Current mode: <strong>${profile.mode === "pregnant" ? "Pregnant" : "Normal"}</strong></p>
    </article>
    <article class="ref-card">
      <h3>Extra levels that improve calculations</h3>
      <ul>
        <li><strong>Carbs (g):</strong> shows potential glucose load impact.</li>
        <li><strong>Activity (min):</strong> helps estimate insulin sensitivity changes.</li>
        <li><strong>Sleep (hours):</strong> low sleep can increase glucose variability.</li>
        <li><strong>Stress (0-10):</strong> higher stress can raise sugar levels.</li>
        <li><strong>Resting HR:</strong> gives additional physiologic stress context.</li>
        <li><strong>Thyroid symptoms:</strong> adds context for hyperthyroidism-related volatility.</li>
      </ul>
    </article>
  `;
};

const renderAll = () => {
  const entries = getEntries();
  const profile = getProfile();
  renderModeState(profile);
  renderStats(entries, profile);
  renderRiskBars(entries, profile);
  renderTrendChart(entries);
  renderEntryList(entries, profile);
  renderReferenceGuide(profile);
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

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const profile = {
    mode: getProfile().mode,
    pregnancyWeek: pregnancyWeekInput.value.trim(),
    hyperthyroidism: profileForm.hyperthyroidism.value,
    insulinResistance: profileForm.insulinResistance.value,
  };

  if (!profile.hyperthyroidism || !profile.insulinResistance) return;
  if (profile.mode === "pregnant" && !profile.pregnancyWeek) return;

  setProfile(profile);
  renderAll();
});

toggleModeButton.addEventListener("click", () => {
  const current = getProfile();
  const nextMode = current.mode === "pregnant" ? "normal" : "pregnant";
  const next = { ...current, mode: nextMode };

  if (nextMode === "normal") {
    next.pregnancyWeek = "";
  }

  setProfile(next);
  renderAll();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const rawLevel = data.get("level");
  const parsedLevel = Number(rawLevel);
  const time = data.get("time");
  const selectedMealType = data.get("mealType");

  const entry = {
    id: generateEntryId(),
    date: data.get("date"),
    time,
    level: Number.isFinite(parsedLevel) && rawLevel !== "" ? parsedLevel : null,
    mealType: selectedMealType === "auto" ? inferMealType(time) : normalizeMealType(selectedMealType, time),
    carbsGrams: Number(data.get("carbsGrams")),
    activityMinutes: Number(data.get("activityMinutes")),
    thyroidSymptoms: data.get("thyroidSymptoms"),
    sleepHours: Number(data.get("sleepHours")),
    stressLevel: Number(data.get("stressLevel")),
    heartRate: Number(data.get("heartRate")),
  };

  if (
    !entry.date ||
    !entry.time ||
    entry.level === null ||
    Number.isNaN(entry.carbsGrams) ||
    Number.isNaN(entry.activityMinutes) ||
    Number.isNaN(entry.sleepHours) ||
    Number.isNaN(entry.stressLevel) ||
    Number.isNaN(entry.heartRate) ||
    !entry.thyroidSymptoms
  ) {
    return;
  }

  const entries = getEntries();
  setEntries([...entries, entry]);
  renderAll();

  const currentDate = entry.date;
  form.reset();
  form.date.value = currentDate;
  const now = new Date();
  form.time.value = `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
  form.mealType.value = "auto";
});

clearAllButton.addEventListener("click", () => {
  setEntries([]);
  renderAll();
});

const now = new Date();
form.date.value = now.toISOString().slice(0, 10);
form.time.value = `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
form.mealType.value = "auto";

if (!localStorage.getItem(PROFILE_STORAGE_KEY)) {
  setProfile({ ...defaultProfile });
}

renderAll();

import { useState, useEffect, useReducer, useRef } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => {
  const dow = new Date(year, month, 1).getDay();
  return dow === 0 ? 6 : dow - 1; // Mon=0 ... Sun=6
};

const DAY_LABELS   = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const MONTH_NAMES  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getWeekStart(d = new Date()) {
  const day  = new Date(d);
  const dow  = day.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setDate(day.getDate() + diff);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function addWeeks(weekStart, n) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function getWeekCompletionRate(habits, completions, weekStart) {
  const days = getWeekDays(weekStart);
  const activeHabits = habits.filter(h => !h.paused);
  if (!activeHabits.length) return 0;
  // Each habit contributes a 0-100 score; over-completion on one habit
  // never masks a shortfall on another.
  const pcts = activeHabits.map(h => {
    const count = days.filter(d => completions[h.id]?.[dateKey(d)]).length;
    if (h.goal) {
      if (h.goal.period === "week") return Math.min(count / h.goal.target, 1) * 100;
      if (h.goal.period === "month") return Math.min(count / (h.goal.target / 4.33), 1) * 100;
      return Math.min(count / (h.goal.target / 52), 1) * 100;
    }
    // No goal: daily habits use 7-day target, weekly habits need 1 completion
    if (h.freq === "daily") return Math.min(count / 7, 1) * 100;
    return days.some(d => completions[h.id]?.[dateKey(d)]) ? 100 : 0;
  });
  return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
}

function getWeekNotes(habits, notes, ratings, weekStart) {
  const days = getWeekDays(weekStart);
  const entries = [];
  habits.forEach(habit => {
    days.forEach(d => {
      const key = dateKey(d);
      const note   = notes[habit.id]?.[key];
      const rating = ratings[habit.id]?.[key];
      if (note || rating) entries.push({ habit, date: key, dateObj: d, note: note || "", rating: rating || 0 });
    });
  });
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function getMonthCompletionRate(habitId, completions, year, month) {
  const days = getDaysInMonth(year, month);
  let done = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (completions[habitId]?.[key]) done++;
  }
  return days > 0 ? Math.round((done / days) * 100) : 0;
}

function getStreak(habitId, completions) {
  let streak = 0;
  const d = new Date();
  if (!completions[habitId]?.[dateKey(d)]) d.setDate(d.getDate() - 1);
  while (completions[habitId]?.[dateKey(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getBestStreak(habitId, completions) {
  const hc   = completions[habitId] || {};
  const days = Object.keys(hc).filter(k => hc[k]).sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]) - new Date(days[i-1])) / 86400000;
    if (diff === 1) { cur++; if (cur > best) best = cur; } else { cur = 1; }
  }
  return best;
}

function getWeeklyCount(habitId, completions) {
  return getWeekDays(getWeekStart()).filter(d => completions[habitId]?.[dateKey(d)]).length;
}

function getTodayDone(habits, completions) {
  const today = dateKey();
  return habits.filter(h => completions[h.id]?.[today]).length;
}

function getGoalProgress(habitId, completions, goal) {
  if (!goal) return null;
  const now = new Date();
  let count = 0, periodLabel = "", daysInPeriod = 0, daysPassed = 0;
  if (goal.period === "week") {
    const weekDays = getWeekDays(getWeekStart(now));
    weekDays.forEach(d => { if (completions[habitId]?.[dateKey(d)]) count++; });
    daysInPeriod = 7;
    daysPassed = weekDays.filter(d => d <= now).length;
    periodLabel = "this week";
  } else if (goal.period === "month") {
    const year = now.getFullYear(), month = now.getMonth();
    daysInPeriod = getDaysInMonth(year, month);
    daysPassed = now.getDate();
    for (let d = 1; d <= daysPassed; d++) {
      const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (completions[habitId]?.[key]) count++;
    }
    periodLabel = "this month";
  } else {
    const year = now.getFullYear();
    daysInPeriod = 365;
    daysPassed = Math.floor((now - new Date(year, 0, 1)) / 86400000) + 1;
    for (let d = 0; d < daysPassed; d++) {
      const date = new Date(year, 0, 1 + d);
      if (completions[habitId]?.[dateKey(date)]) count++;
    }
    periodLabel = "this year";
  }
  const pct      = goal.target > 0 ? Math.min(count / goal.target, 2) * 100 : 0;
  const expected = daysInPeriod > 0 ? (daysPassed / daysInPeriod) * goal.target : 0;
  const onTrack  = count >= expected * 0.85;
  return { count, target: goal.target, pct, periodLabel, onTrack, period: goal.period };
}

// ─── Milestones ───────────────────────────────────────────────────────────────
const STREAK_MILESTONES    = [7, 14, 30, 60, 90, 180, 365];
const COUNT_MILESTONES     = [10, 25, 50, 100, 250, 500];
const WEEK_GOAL_MILESTONES = [4, 8, 13, 26, 52, 104, 156];

const STREAK_MESSAGES = {
  7: "A full week. The habit is taking root.",
  14: "Two weeks straight. This is becoming real.",
  30: "A month of showing up.",
  60: "Two months. Consistency is a skill, and you have it.",
  90: "Ninety days. This is who you are now.",
  180: "Half a year. Most people never get here.",
  365: "A year. One full loop around the sun.",
};
const COUNT_MESSAGES = {
  10: "Ten times done. The pattern has begun.",
  25: "Twenty-five. A quarter century of this habit.",
  50: "Fifty completions. Halfway to one hundred.",
  100: "One hundred. A genuine practice.",
  250: "Two hundred and fifty. Uncommonly dedicated.",
  500: "Five hundred. Extraordinary.",
};
const WEEK_GOAL_MESSAGES = {
  4:   "Four weeks hitting your goal. The rhythm is real.",
  8:   "Two months of consistent weeks. You're building something.",
  13:  "A quarter year of showing up to your goal, week after week.",
  26:  "Half a year of goal weeks. Quietly extraordinary.",
  52:  "A full year of hitting your goal every week.",
  104: "Two years of weekly goal weeks. This is just who you are.",
  156: "Three years. Some people only dream of this kind of consistency.",
};

function isGoalMetForWeek(habitId, completions, goal, days) {
  if (goal.period === "week") {
    return days.filter(d => completions[habitId]?.[dateKey(d)]).length >= goal.target;
  }
  return days.some(d => completions[habitId]?.[dateKey(d)]);
}

function getConsecutiveGoalWeeks(habitId, completions, goal) {
  if (!goal) return 0;
  let count = 0;
  let weekStart = getWeekStart();
  if (!isGoalMetForWeek(habitId, completions, goal, getWeekDays(weekStart))) {
    weekStart = addWeeks(weekStart, -1);
  }
  while (true) {
    const days = getWeekDays(weekStart);
    if (!isGoalMetForWeek(habitId, completions, goal, days)) break;
    count++;
    weekStart = addWeeks(weekStart, -1);
    if (count > 520) break;
  }
  return count;
}

function checkMilestones(habit, completions, milestones) {
  const streak   = getStreak(habit.id, completions);
  const total    = Object.values(completions[habit.id] || {}).filter(Boolean).length;
  const achieved = milestones[habit.id] || [];

  for (const n of STREAK_MILESTONES) {
    const key = `streak-${n}`;
    if (streak >= n && !achieved.includes(key))
      return { key, type: "streak", n, message: STREAK_MESSAGES[n] };
  }
  for (const n of COUNT_MILESTONES) {
    const key = `count-${n}`;
    if (total >= n && !achieved.includes(key))
      return { key, type: "count", n, message: COUNT_MESSAGES[n] };
  }
  if (habit.goal) {
    const goalWeeks = getConsecutiveGoalWeeks(habit.id, completions, habit.goal);
    for (const n of WEEK_GOAL_MILESTONES) {
      const key = `goalweeks-${n}`;
      if (goalWeeks >= n && !achieved.includes(key))
        return { key, type: "goalweeks", n, message: WEEK_GOAL_MESSAGES[n] };
    }
  }
  return null;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "habitTracker_v18";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const old = localStorage.getItem("habitTracker_v17") ||
        localStorage.getItem("habitTracker_v16") ||
        localStorage.getItem("habitTracker_v15") ||
        localStorage.getItem("habitTracker_v14") ||
        localStorage.getItem("habitTracker_v13") ||
        localStorage.getItem("habitTracker_v12") ||
        localStorage.getItem("habitTracker_v11") ||
        localStorage.getItem("habitTracker_v10") ||
        localStorage.getItem("habitTracker_v9")  ||
        localStorage.getItem("habitTracker_v8")  ||
        localStorage.getItem("habitTracker_v7")  ||
        localStorage.getItem("habitTracker_v6")  ||
        localStorage.getItem("habitTracker_v5")  ||
        localStorage.getItem("habitTracker_v4")  ||
        localStorage.getItem("habitTracker_v3")  ||
        localStorage.getItem("habitTracker_v2");
      if (old) return JSON.parse(old);
    }
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ─── Export helpers ───────────────────────────────────────────────────────────
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(state) {
  const data = {
    exportedAt: new Date().toISOString(),
    version: "9",
    habits: state.habits,
    completions: state.completions,
    notes: state.notes,
    ratings: state.ratings,
  };
  downloadFile(`habits-backup-${dateKey()}.json`, JSON.stringify(data, null, 2), "application/json");
}

function exportCSV(state) {
  const rows = [];
  const allDates = new Set();
  state.habits.forEach(h => {
    const comp = state.completions[h.id] || {};
    Object.keys(comp).forEach(d => { if (comp[d]) allDates.add(d); });
  });
  const sortedDates = Array.from(allDates).sort();
  rows.push(["Date", ...state.habits.map(h => h.name), ...state.habits.map(h => h.name + " note")].join(","));
  sortedDates.forEach(date => {
    const row = [date,
      ...state.habits.map(h => state.completions[h.id]?.[date] ? "1" : "0"),
      ...state.habits.map(h => `"${(state.notes[h.id]?.[date] || "").replace(/"/g, '""')}"`)
    ];
    rows.push(row.join(","));
  });
  downloadFile(`habits-export-${dateKey()}.csv`, rows.join("\n"), "text/csv");
}

// ─── Default data ─────────────────────────────────────────────────────────────
const DEFAULT_HABITS = [
  { id: "h1", name: "Morning pages", emoji: "✍️", freq: "daily",  color: "#8B7355" },
  { id: "h2", name: "Move 30 min",   emoji: "🏃", freq: "daily",  color: "#5C7A5C" },
  { id: "h3", name: "Read",          emoji: "📖", freq: "daily",  color: "#5C6B8A" },
  { id: "h4", name: "Call someone",  emoji: "📞", freq: "weekly", color: "#8A5C6B" },
];

const COLORS = [
  "#8B7355","#7A6248","#A08060","#6B5340",
  "#9A6B4A","#8A5A38","#B07850","#7A5030",
  "#9A7848","#8A6838","#B08850","#7A6838",
  "#9A8A4A","#8A7A38","#A89048","#7A7038",
  "#8A8A48","#7A7A38","#9A9A50","#6B6B30",
  "#5C7A5C","#4A6B4A","#6B8A6B","#5C7A6B",
  "#5C7A78","#4A6B68","#6B8A88","#507A6B",
  "#5C6B8A","#4A5C7A","#6B7A8A","#5C6B7A",
  "#8A5C6B","#7A4A5C","#8A6B7A","#6B5C6B",
  "#7A5C7A","#6B4A6B","#8A6B8A","#6B5C7A",
];

const EMOJIS = ["✍️","🏃","🧗","📖","📞","💧","🧘","🎯","💪","🥗","😴","🎨","🌿","⚡","🧠","🙏","🎵","🚴","🏊","🥾"];

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100dvh",
    background: "#F7F4EF",
    color: "#2C2923",
    fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    paddingBottom: "calc(40px + env(safe-area-inset-bottom))",
    paddingTop: "env(safe-area-inset-top)",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
    WebkitTextSizeAdjust: "100%",
    maxWidth: 430,
    margin: "0 auto",
    position: "relative",
  },
  header: { padding: "20px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  dateLabel: { fontSize: 13, letterSpacing: "0.08em", color: "#9E9184", fontFamily: "sans-serif", fontWeight: 400, textTransform: "uppercase", marginBottom: 2 },
  todayLabel: { fontSize: 32, fontWeight: 400, lineHeight: 1.1, color: "#2C2923", letterSpacing: "-0.02em" },
  iconBtn: { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", borderRadius: 12, color: "#6B6259", WebkitTapHighlightColor: "transparent", flexShrink: 0 },
  weekStrip: { padding: "0 24px 20px", display: "flex", gap: 6 },
  dayCol: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
  dayLetter: { fontSize: 10, color: "#B5ADA5", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" },
  dayDot: (filled, isToday) => ({
    width: 28, height: 28, borderRadius: "50%",
    border: isToday ? "1.5px solid #8B7355" : "1.5px solid transparent",
    background: filled > 0 ? `rgba(139,115,85,${Math.min(0.15 + filled * 0.25, 0.9)})` : "#EDE8E1",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 9, color: filled > 0.6 ? "#5C4A2A" : "#C0B8AF",
    fontFamily: "sans-serif", fontWeight: 500, transition: "background 0.3s ease",
  }),
  divider: { height: 1, background: "#E8E3DC", margin: "0 24px 20px" },
  sectionHead: { padding: "0 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "#B5ADA5", fontFamily: "sans-serif", fontWeight: 500 },
  habitRow: { padding: "12px 24px 12px", display: "flex", alignItems: "center", gap: 14, minHeight: 64, cursor: "pointer", WebkitTapHighlightColor: "transparent", userSelect: "none" },
  checkBtn: (done, color) => ({
    width: 36, height: 36, borderRadius: "50%", border: "none",
    background: done ? color : "transparent",
    boxShadow: done ? "none" : `inset 0 0 0 1.5px #D4CEC8`,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent",
    transition: "background 0.15s ease, box-shadow 0.15s ease",
  }),
  habitName: (done) => ({
    fontSize: 17, fontWeight: 400, lineHeight: 1.25, color: done ? "#B5ADA5" : "#2C2923",
    textDecoration: done ? "line-through" : "none",
    textDecorationColor: "#C0B8AF", transition: "color 0.2s ease",
    overflow: "hidden", textOverflow: "ellipsis",
  }),
  habitMeta: { fontSize: 12, color: "#B5ADA5", fontFamily: "sans-serif", marginTop: 2 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(30,25,20,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  sheet: { background: "#F7F4EF", borderRadius: "20px 20px 0 0", paddingBottom: "calc(20px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, background: "#D4CEC8", margin: "14px auto 0" },
  sheetTitle: { fontSize: 20, fontWeight: 400, color: "#2C2923", padding: "16px 24px 0" },
  input: { width: "100%", padding: "12px 14px", fontSize: 17, fontFamily: "'Palatino Linotype',Georgia,serif", background: "#EFEAE3", border: "none", borderRadius: 12, color: "#2C2923", outline: "none", boxSizing: "border-box" },
  btn: (variant, color) => {
    if (variant === "primary") return { width: "100%", padding: "15px", fontSize: 17, fontFamily: "'Palatino Linotype',Georgia,serif", background: color || "#8B7355", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontWeight: 400 };
    if (variant === "ghost")   return { background: "none", border: "none", cursor: "pointer", color: "#9E9184", fontSize: 15, fontFamily: "sans-serif", padding: "10px 0" };
    if (variant === "chip")    return { padding: "6px 14px", borderRadius: 20, border: "1.5px solid #D4CEC8", background: "transparent", fontSize: 14, color: "#6B6259", cursor: "pointer", fontFamily: "sans-serif", WebkitTapHighlightColor: "transparent" };
    return {};
  },
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "TOGGLE": {
      const { habitId, date } = action;
      const prev = state.completions[habitId]?.[date];
      const newCompletions = { ...state.completions, [habitId]: { ...state.completions[habitId], [date]: !prev } };
      const newNotes   = { ...state.notes };
      const newRatings = { ...state.ratings };
      if (prev) {
        if (newNotes[habitId]?.[date])   { newNotes[habitId]   = { ...newNotes[habitId] };   delete newNotes[habitId][date]; }
        if (newRatings[habitId]?.[date]) { newRatings[habitId] = { ...newRatings[habitId] }; delete newRatings[habitId][date]; }
      }
      return { ...state, completions: newCompletions, notes: newNotes, ratings: newRatings };
    }
    case "SET_NOTE":
      return { ...state, notes: { ...state.notes, [action.habitId]: { ...state.notes[action.habitId], [action.date]: action.note } } };
    case "SET_RATING":
      return { ...state, ratings: { ...state.ratings, [action.habitId]: { ...state.ratings[action.habitId], [action.date]: action.rating } } };
    case "ADD_HABIT":
      return { ...state, habits: [...state.habits, action.habit] };
    case "REMOVE_HABIT": {
      const completions = { ...state.completions };
      const notes       = { ...state.notes };
      const ratings     = { ...state.ratings };
      delete completions[action.id]; delete notes[action.id]; delete ratings[action.id];
      return { ...state, habits: state.habits.filter(h => h.id !== action.id), completions, notes, ratings };
    }
    case "EDIT_HABIT":
      return { ...state, habits: state.habits.map(h => h.id === action.habit.id ? action.habit : h) };
    case "PAUSE_HABIT":
      return { ...state, habits: state.habits.map(h => h.id !== action.id ? h : {
        ...h, paused: true, pauseLog: [...(h.pauseLog || []), { since: dateKey(), until: null, note: action.note || "" }]
      })};
    case "RESUME_HABIT":
      return { ...state, habits: state.habits.map(h => h.id !== action.id ? h : {
        ...h, paused: false, pauseLog: (h.pauseLog || []).map((p, i, arr) => i === arr.length - 1 ? { ...p, until: dateKey() } : p)
      })};
    case "MARK_MILESTONE":
      return { ...state, milestones: { ...state.milestones, [action.habitId]: [...(state.milestones[action.habitId] || []), action.key] } };
    case "REORDER": {
      const habits = [...state.habits];
      const [moved] = habits.splice(action.from, 1);
      habits.splice(action.to, 0, moved);
      return { ...state, habits };
    }
    default: return state;
  }
}

// ─── SVG components ───────────────────────────────────────────────────────────
function Check({ size = 12, color = "white" }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 12 10" fill="none">
      <path d="M1 5L4.5 8.5L11 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Ring({ done, total, size = 72 }) {
  const r    = (size - 8) / 2;
  const c    = 2 * Math.PI * r;
  const dash = total === 0 ? 0 : (done / total) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EDE8E1" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#8B7355" strokeWidth={5}
        strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={c * 0.25}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1)" }}/>
    </svg>
  );
}

function ConcentricRing({ pct, color = "#8B7355", size = 72 }) {
  const innerPct = Math.min(pct / 100, 1);
  const outerPct = pct > 100 ? Math.min((pct - 100) / 100, 1) : 0;
  const hasOverflow = outerPct > 0;
  const gap = 6, outerStroke = 4, innerStroke = 5;
  const outerR = (size - outerStroke) / 2;
  const innerR = outerR - outerStroke / 2 - gap - innerStroke / 2;
  const innerC = 2 * Math.PI * innerR;
  const outerC = 2 * Math.PI * outerR;
  const innerDash = innerPct * innerC;
  const outerDash = outerPct * outerC;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {hasOverflow && <circle cx={size/2} cy={size/2} r={outerR} fill="none" stroke="#EDE8E1" strokeWidth={outerStroke}/>}
      {hasOverflow && <circle cx={size/2} cy={size/2} r={outerR} fill="none" stroke={color} strokeWidth={outerStroke}
        strokeDasharray={`${outerDash} ${outerC - outerDash}`} strokeDashoffset={outerC * 0.25}
        strokeLinecap="round" opacity={0.45} style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1)" }}/>}
      <circle cx={size/2} cy={size/2} r={innerR} fill="none" stroke="#EDE8E1" strokeWidth={innerStroke}/>
      <circle cx={size/2} cy={size/2} r={innerR} fill="none" stroke={color} strokeWidth={innerStroke}
        strokeDasharray={`${innerDash} ${innerC - innerDash}`} strokeDashoffset={innerC * 0.25}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1)" }}/>
    </svg>
  );
}

function GoalArc({ pct, color, size = 28, onTrack }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const innerPct = Math.min(pct / 100, 1);
  const overPct  = pct > 100 ? Math.min((pct - 100) / 100, 1) : 0;
  const dash     = innerPct * c;
  const overDash = overPct * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EDE8E1" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={onTrack ? color : "#C4A882"} strokeWidth={stroke}
        strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={c * 0.25}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.4s ease" }}/>
      {overPct > 0 && <circle cx={size/2} cy={size/2} r={r - stroke - 1} fill="none" stroke={color} strokeWidth={stroke - 1}
        strokeDasharray={`${overDash} ${c - overDash}`} strokeDashoffset={c * 0.25}
        strokeLinecap="round" opacity={0.5}/>}
    </svg>
  );
}

function GoalBar({ progress, color }) {
  if (!progress) return null;
  const { count, target, pct, periodLabel, onTrack } = progress;
  const barPct  = Math.min(pct, 100);
  const overPct = pct > 100 ? Math.min(pct - 100, 100) : 0;
  return (
    <div style={{ padding: "10px 24px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif" }}>
          Goal · {count}/{target} {periodLabel}
        </span>
        <span style={{ fontSize: 12, color: onTrack ? color : "#C4A882", fontFamily: "sans-serif", fontWeight: 500 }}>
          {Math.round(pct)}%{!onTrack && " · behind"}
        </span>
      </div>
      <div style={{ height: 3, background: "#E8E3DC", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barPct}%`, background: onTrack ? color : "#C4A882", borderRadius: 2, transition: "width 0.4s ease" }}/>
      </div>
      {overPct > 0 && (
        <div style={{ height: 2, background: "#E8E3DC", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
          <div style={{ height: "100%", width: `${overPct}%`, background: color, opacity: 0.5, borderRadius: 2 }}/>
        </div>
      )}
    </div>
  );
}

// ─── NoteSheet ────────────────────────────────────────────────────────────────
function NoteSheet({ habit, date, existingNote, existingRating, onSave, onSaveRating, onClose }) {
  const initialText = existingNote || (habit.template?.trim() ? habit.template : "");
  const [text,   setText]   = useState(initialText);
  const [rating, setRating] = useState(existingRating || 0);

  const handleSave = () => {
    onSave(text);
    if (onSaveRating) onSaveRating(rating);
    onClose();
  };

  return (
    <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.sheet}>
        <div style={S.sheetHandle}/>
        <div style={{ padding: "16px 24px 0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{habit.emoji}</span>
          <div>
            <div style={{ fontSize: 17, color: "#2C2923" }}>{habit.name}</div>
            <div style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif" }}>{date}</div>
          </div>
        </div>

        {habit.ratingEnabled && (
          <div style={{ padding: "14px 24px 0" }}>
            <div style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>Quality</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRating(rating === n ? 0 : n)}
                  style={{ flex: 1, height: 40, borderRadius: 10, border: "none", cursor: "pointer",
                    background: rating >= n ? habit.color : "#EFEAE3",
                    color: rating >= n ? "#fff" : "#9E9184", fontSize: 16 }}>
                  {rating >= n ? "★" : "☆"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "14px 24px 0" }}>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder="How did it go?"
            autoFocus
            style={{ ...S.input, minHeight: 100, resize: "none", lineHeight: 1.6 }}
          />
        </div>

        <div style={{ padding: "12px 24px 0", display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...S.btn("chip"), flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Cancel</button>
          <button onClick={handleSave} style={{ ...S.btn("primary", habit.color), flex: 2 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── MilestoneSheet ───────────────────────────────────────────────────────────
function MilestoneSheet({ habit, milestone, onClose }) {
  const icon  = milestone.type === "streak" ? "🔥" : milestone.type === "goalweeks" ? "⬡" : "✦";
  const label = milestone.type === "streak"
    ? `${milestone.n} day streak`
    : milestone.type === "goalweeks"
    ? `${milestone.n} consecutive goal weeks`
    : `${milestone.n} completions`;

  return (
    <div style={{ ...S.backdrop, alignItems: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#F7F4EF", borderRadius: 24, padding: "32px 28px", margin: "0 24px", textAlign: "center", maxWidth: 340 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{icon}</div>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9E9184", fontFamily: "sans-serif", marginBottom: 8 }}>
          {habit.name}
        </div>
        <div style={{ fontSize: 22, color: "#2C2923", marginBottom: 12, lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 16, color: "#6B6259", lineHeight: 1.6, marginBottom: 28 }}>{milestone.message}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {milestone.type === "streak" ? "🔥" : milestone.type === "goalweeks" ? "⬡" : "✦"}
          <span style={{ fontSize: 13, color: "#9E9184", fontFamily: "sans-serif" }}>
            {milestone.type === "streak" ? `${milestone.n} day streak` : milestone.type === "goalweeks" ? ` goal weeks` : ` completions`}
          </span>
        </div>
        <button onClick={onClose} style={{ ...S.btn("primary", habit.color), marginTop: 8 }}>Continue</button>
      </div>
    </div>
  );
}

// ─── WeeklyReview ─────────────────────────────────────────────────────────────
function WeeklyReview({ habits, completions, notes, ratings, onClose }) {
  const now = new Date();
  const [weekStart, setWeekStart] = useState(getWeekStart(now));
  const isCurrentWeek = weekStart.getTime() === getWeekStart(now).getTime();
  const days          = getWeekDays(weekStart);
  const activeHabits  = habits.filter(h => !h.paused);
  const today         = dateKey();
  const thisRate      = getWeekCompletionRate(habits, completions, weekStart);
  const prevRate      = getWeekCompletionRate(habits, completions, addWeeks(weekStart, -1));
  const weekNotes     = getWeekNotes(activeHabits, notes, ratings, weekStart);

  const fmt = d => `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;

  return (
    <div style={{ ...S.root, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Header */}
      <div style={{ ...S.header, borderBottom: "1px solid #E8E3DC", paddingBottom: 16 }}>
        <button onClick={onClose} style={S.iconBtn}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {isCurrentWeek ? "This week" : `${fmt(weekStart)} – ${fmt(addWeeks(weekStart, 0))}`}
          </div>
          <div style={{ fontSize: 20, color: "#2C2923" }}>
            {fmt(weekStart)} – {fmt(days[6])}
          </div>
        </div>
        <div style={{ width: 44 }}/>
      </div>

      {/* Week nav */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 24px" }}>
        <button onClick={() => setWeekStart(w => addWeeks(w, -1))} style={S.iconBtn}>‹</button>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(getWeekStart(now))} style={{ ...S.btn("ghost"), fontSize: 13 }}>This week</button>
        )}
        <button onClick={() => !isCurrentWeek && setWeekStart(w => addWeeks(w, 1))}
          style={{ ...S.iconBtn, opacity: isCurrentWeek ? 0.3 : 1 }} disabled={isCurrentWeek}>›</button>
      </div>

      {/* Summary card */}
      <div style={{ margin: "0 24px 20px", padding: "16px 20px", background: "#EFEAE3", borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, color: "#2C2923" }}>{thisRate}%</div>
            <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>This week</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, color: thisRate >= prevRate ? "#5C7A5C" : "#9E9184" }}>
              {thisRate >= prevRate ? "+" : ""}{thisRate - prevRate}%
            </div>
            <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>vs last week</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, color: "#2C2923" }}>{prevRate}%</div>
            <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Last week</div>
          </div>
        </div>
      </div>

      {/* Day labels */}
      <div style={{ display: "flex", padding: "0 24px", gap: 4, marginBottom: 6 }}>
        {DAY_LABELS.map(l => (
          <div key={l} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#B5ADA5", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
        ))}
      </div>

      {/* Per-habit rows */}
      {activeHabits.map(habit => {
        const streak    = getStreak(habit.id, completions);
        const bestStreak = getBestStreak(habit.id, completions);
        const isAtBest  = streak > 0 && streak >= bestStreak && bestStreak > 0;
        const progress  = habit.goal ? getGoalProgress(habit.id, completions, habit.goal) : null;
        return (
          <div key={habit.id} style={{ padding: "8px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{habit.emoji}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 15, color: "#2C2923" }}>{habit.name}</span>
                {isAtBest && <span style={{ fontSize: 11, color: "#C4933F", marginLeft: 6 }}>★ PB</span>}
              </div>
              {progress && <ConcentricRing pct={progress.pct} color={habit.color} size={28}/>}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {days.map((d, i) => {
                const dk   = dateKey(d);
                const done = completions[habit.id]?.[dk];
                const isFuture = dk > today;
                return (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 3,
                    background: done ? habit.color : isFuture ? "transparent" : "#E8E3DC",
                    border: isFuture ? "1px dashed #E8E3DC" : "none" }}/>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Notes */}
      {weekNotes.length > 0 && (
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ fontSize: 11, color: "#B5ADA5", letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "sans-serif", marginBottom: 12 }}>Notes this week</div>
          {weekNotes.map((entry, i) => (
            <div key={i} style={{ marginBottom: 12, padding: "12px 14px", background: "#EFEAE3", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{entry.habit.emoji}</span>
                <span style={{ fontSize: 13, color: "#6B6259" }}>{entry.habit.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#B5ADA5", fontFamily: "sans-serif" }}>{entry.date}</span>
              </div>
              {entry.rating > 0 && (
                <div style={{ fontSize: 12, color: entry.habit.color, marginBottom: 4 }}>
                  {"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}
                </div>
              )}
              {entry.note && <div style={{ fontSize: 14, color: "#2C2923", lineHeight: 1.5 }}>{entry.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HistorySheet ─────────────────────────────────────────────────────────────
function HistorySheet({ habit, completions, notes, ratings, milestones, onToggle, onSetNote, onClose }) {
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const streak      = getStreak(habit.id, completions);
  const bestStreak  = getBestStreak(habit.id, completions);
  const isAtBest    = streak > 0 && streak >= bestStreak && bestStreak > 0;
  const rate        = getMonthCompletionRate(habit.id, completions, viewYear, viewMonth);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const goalProgress = habit.goal ? getGoalProgress(habit.id, completions, habit.goal) : null;

  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const today       = dateKey();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Pause log relevance
  const pauseLog     = habit.pauseLog || [];
  const activePause  = pauseLog.find(p => !p.until);
  const relevantPauses = pauseLog.filter(p => {
    const start = p.since;
    const end   = p.until || dateKey();
    const mStart = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;
    return end >= mStart && start <= `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-31`;
  });

  return (
    <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.sheet}>
        <div style={S.sheetHandle}/>

        {/* Habit header */}
        <div style={{ padding: "16px 24px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>{habit.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, color: "#2C2923" }}>{habit.name}</div>
            <div style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif", marginTop: 2 }}>
              {streak > 0 ? `${streak} day streak${isAtBest ? " ★" : ""}` : "No current streak"} · {rate}% this month
            </div>
          </div>
          {goalProgress && <ConcentricRing pct={goalProgress.pct} color={habit.color} size={44}/>}
        </div>

        {/* Streak stats */}
        <div style={{ display: "flex", gap: 10, padding: "14px 24px 0" }}>
          <div style={{ flex: 1, background: "#EFEAE3", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Current</div>
            <div style={{ fontSize: 24, color: habit.color }}>{streak}<span style={{ fontSize: 13, color: "#9E9184", marginLeft: 3 }}>days</span></div>
          </div>
          <div style={{ flex: 1, background: "#EFEAE3", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Best <span style={{ color: "#C4933F" }}>★</span>
            </div>
            <div style={{ fontSize: 24, color: isAtBest ? "#C4933F" : "#2C2923" }}>{bestStreak}<span style={{ fontSize: 13, color: "#9E9184", marginLeft: 3 }}>days</span></div>
          </div>
        </div>

        {/* Pause banner */}
        {activePause && (
          <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "rgba(176,122,58,0.1)", borderRadius: 10, borderLeft: "3px solid #B07A3A" }}>
            <div style={{ fontSize: 11, color: "#B07A3A", fontWeight: 600, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paused</div>
            {activePause.note && <div style={{ fontSize: 13, color: "#5a4a3a" }}>{activePause.note}</div>}
          </div>
        )}

        {/* Goal progress */}
        {goalProgress && <GoalBar progress={goalProgress} color={habit.color}/>}

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 8px" }}>
          <button onClick={prevMonth} style={S.iconBtn}>‹</button>
          <div style={{ fontSize: 16, color: "#2C2923" }}>{MONTH_NAMES[viewMonth]} {viewYear}</div>
          <button onClick={nextMonth} style={{ ...S.iconBtn, opacity: isCurrentMonth ? 0.3 : 1 }} disabled={isCurrentMonth}>›</button>
        </div>

        {/* Day labels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 16px", gap: 2 }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, color: "#B5ADA5", fontFamily: "sans-serif", padding: "2px 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "4px 16px 16px", gap: 3 }}>
          {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`}/>)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dk      = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const done    = completions[habit.id]?.[dk] || false;
            const isToday = dk === today;
            const isFuture = dk > today;
            const hasNote = notes[habit.id]?.[dk];
            const isPaused = relevantPauses.some(p => p.since <= dk && (p.until ? p.until >= dk : true));
            return (
              <button key={dk}
                onClick={() => !isFuture && !isPaused && onToggle(habit.id, dk)}
                disabled={isFuture || isPaused}
                style={{ aspectRatio: "1", borderRadius: "50%", border: isToday ? `2px solid ${habit.color}` : "2px solid transparent",
                  background: done ? habit.color : isPaused ? "repeating-linear-gradient(45deg,#f0ece6,#f0ece6 2px,transparent 2px,transparent 6px)" : "#EFEAE3",
                  cursor: isFuture || isPaused ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1, padding: 0 }}>
                <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: done ? "#fff" : isFuture ? "#D4CEC8" : "#6B6259" }}>{day}</span>
                {hasNote && <div style={{ width: 3, height: 3, borderRadius: "50%", background: done ? "rgba(255,255,255,0.7)" : habit.color }}/>}
              </button>
            );
          })}
        </div>

        {/* Recent notes */}
        {notes[habit.id] && Object.keys(notes[habit.id]).some(k => notes[habit.id][k]) && (
          <div style={{ padding: "0 24px 8px" }}>
            <div style={{ fontSize: 11, color: "#B5ADA5", letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "sans-serif", marginBottom: 10 }}>Notes</div>
            {Object.entries(notes[habit.id] || {}).filter(([, v]) => v).sort(([a], [b]) => b.localeCompare(a)).slice(0, 5).map(([dk, n]) => (
              <div key={dk} style={{ marginBottom: 8, padding: "10px 12px", background: "#EFEAE3", borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: "#B5ADA5", fontFamily: "sans-serif", marginBottom: 3 }}>{dk}</div>
                {ratings[habit.id]?.[dk] && (
                  <div style={{ fontSize: 12, color: "#C4933F", marginBottom: 3 }}>
                    {"★".repeat(ratings[habit.id][dk])}{"☆".repeat(5 - ratings[habit.id][dk])}
                  </div>
                )}
                <div style={{ fontSize: 14, color: "#2C2923", lineHeight: 1.5 }}>{n}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HabitSheet (add/edit) ────────────────────────────────────────────────────
function HabitSheet({ habit, onSave, onDelete, onClose }) {
  const isNew = !habit?.id;
  const [name,           setName]           = useState(habit?.name || "");
  const [emoji,          setEmoji]          = useState(habit?.emoji || "✍️");
  const [color,          setColor]          = useState(habit?.color || COLORS[0]);
  const [freq,           setFreq]           = useState(habit?.freq || "daily");
  const [template,       setTemplate]       = useState(habit?.template || "");
  const [ratingEnabled,  setRatingEnabled]  = useState(habit?.ratingEnabled || false);
  const [goalOn,         setGoalOn]         = useState(!!habit?.goal);
  const [goalPeriod,     setGoalPeriod]     = useState(habit?.goal?.period || "week");
  const [goalTarget,     setGoalTarget]     = useState(habit?.goal?.target || 3);
  const [showDelete,     setShowDelete]     = useState(false);
  const [pauseNote,      setPauseNote]      = useState("");
  const [showPauseInput, setShowPauseInput] = useState(false);

  const annualEq = goalPeriod === "week" ? goalTarget * 52 : goalPeriod === "month" ? goalTarget * 12 : goalTarget;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...(habit || {}),
      id: habit?.id || `h${Date.now()}`,
      name: name.trim(), emoji, color, freq, template,
      ratingEnabled,
      goal: goalOn ? { period: goalPeriod, target: goalTarget } : null,
    });
  };

  return (
    <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.sheet}>
        <div style={S.sheetHandle}/>
        <div style={{ ...S.sheetTitle }}>{isNew ? "New habit" : "Edit habit"}</div>

        {/* Name */}
        <div style={{ padding: "14px 24px 0" }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Habit name" style={S.input}/>
        </div>

        {/* Emoji */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Icon</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ width: 42, height: 42, borderRadius: 10, border: e === emoji ? `2px solid ${color}` : "2px solid transparent",
                  background: e === emoji ? "#EFEAE3" : "transparent", fontSize: 22, cursor: "pointer" }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Color</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: c === color ? "3px solid #2C2923" : "3px solid transparent",
                  background: c, cursor: "pointer", outline: "none" }}/>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Frequency</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["daily", "weekly"].map(f => (
              <button key={f} onClick={() => setFreq(f)}
                style={{ flex: 1, height: 44, borderRadius: 12, border: "none",
                  background: f === freq ? color : "#EFEAE3",
                  color: f === freq ? "#fff" : "#6B6259",
                  fontSize: 15, cursor: "pointer", textTransform: "capitalize" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Goal */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: goalOn ? 12 : 0 }}>
            <div style={{ fontSize: 15, color: "#2C2923" }}>Set a goal</div>
            <button onClick={() => setGoalOn(g => !g)}
              style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                background: goalOn ? color : "#D4CEC8", position: "relative" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: goalOn ? 23 : 3, transition: "left 0.2s" }}/>
            </button>
          </div>
          {goalOn && (
            <div style={{ background: "#EFEAE3", borderRadius: 14, padding: "14px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["week","month","year"].map(p => (
                  <button key={p} onClick={() => setGoalPeriod(p)}
                    style={{ flex: 1, height: 34, borderRadius: 8, border: "none",
                      background: p === goalPeriod ? color : "#E0DAD2",
                      color: p === goalPeriod ? "#fff" : "#6B6259",
                      fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
                    {p}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button onClick={() => setGoalTarget(t => Math.max(1, t - 1))}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#E0DAD2", fontSize: 20, cursor: "pointer" }}>−</button>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 28, color: color }}>{goalTarget}</div>
                  <div style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif" }}>times per {goalPeriod}</div>
                </div>
                <button onClick={() => setGoalTarget(t => t + 1)}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#E0DAD2", fontSize: 20, cursor: "pointer" }}>+</button>
              </div>
              <div style={{ fontSize: 11, color: "#B5ADA5", textAlign: "center", marginTop: 10, fontFamily: "sans-serif" }}>~{annualEq} times per year</div>
            </div>
          )}
        </div>

        {/* Rating */}
        <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, color: "#2C2923" }}>Quality rating</div>
            <div style={{ fontSize: 12, color: "#9E9184", fontFamily: "sans-serif", marginTop: 2 }}>Rate 1–5 after each completion</div>
          </div>
          <button onClick={() => setRatingEnabled(r => !r)}
            style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
              background: ratingEnabled ? color : "#D4CEC8", position: "relative" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3, left: ratingEnabled ? 23 : 3, transition: "left 0.2s" }}/>
          </button>
        </div>

        {/* Template */}
        <div style={{ padding: "14px 24px 0" }}>
          <div style={{ fontSize: 11, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Note template</div>
          <input value={template} onChange={e => setTemplate(e.target.value)}
            placeholder="Pre-fill the note field…"
            style={{ ...S.input, fontSize: 15 }}/>
        </div>

        {/* Pause (edit only) */}
        {!isNew && !habit?.paused && (
          <div style={{ padding: "14px 24px 0" }}>
            <button onClick={() => setShowPauseInput(p => !p)}
              style={{ ...S.btn("ghost"), width: "100%", textAlign: "left", padding: "10px 0" }}>
              Pause this habit…
            </button>
            {showPauseInput && (
              <div style={{ marginTop: 8 }}>
                <input value={pauseNote} onChange={e => setPauseNote(e.target.value)}
                  placeholder="Reason (optional)…" style={{ ...S.input, fontSize: 15 }}/>
                <button onClick={() => { onSave({ ...habit, paused: true }, pauseNote); }}
                  style={{ ...S.btn("primary", "#9E9184"), marginTop: 10 }}>
                  Pause habit
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delete (edit only) */}
        {!isNew && (
          <div style={{ padding: "14px 24px 0" }}>
            {!showDelete ? (
              <button onClick={() => setShowDelete(true)}
                style={{ ...S.btn("ghost"), color: "#C05050", width: "100%", textAlign: "left", padding: "10px 0" }}>
                Delete habit…
              </button>
            ) : (
              <div style={{ background: "rgba(192,80,80,0.06)", borderRadius: 12, padding: "14px" }}>
                <div style={{ fontSize: 14, color: "#2C2923", marginBottom: 12 }}>Delete <strong>{habit.name}</strong> and all history?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowDelete(false)}
                    style={{ flex: 1, height: 44, borderRadius: 12, border: "1.5px solid #D4CEC8", background: "transparent", color: "#6B6259", fontSize: 15, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={onDelete}
                    style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: "#C05050", color: "#fff", fontSize: 15, cursor: "pointer", fontWeight: 500 }}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save */}
        <div style={{ padding: "16px 24px 0" }}>
          <button onClick={handleSave} disabled={!name.trim()}
            style={{ ...S.btn("primary", name.trim() ? color : "#D4CEC8") }}>
            {isNew ? "Add habit" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PausedSection ────────────────────────────────────────────────────────────
function PausedSection({ habits, onResume, onEdit, onOpenHistory }) {
  const [expanded, setExpanded] = useState(false);
  if (!habits.length) return null;
  return (
    <div style={{ marginTop: 24, opacity: 0.7 }}>
      <div style={{ ...S.sectionHead, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <span style={S.sectionLabel}>Paused · {habits.length}</span>
        <span style={{ fontSize: 12, color: "#B5ADA5", fontFamily: "sans-serif" }}>{expanded ? "Hide" : "Show"}</span>
      </div>
      {expanded && habits.map(habit => (
        <div key={habit.id} style={{ ...S.habitRow, opacity: 0.8 }} onClick={() => onOpenHistory(habit)}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EFEAE3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>{habit.emoji}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.habitName(false)}>{habit.name}</div>
            <div style={S.habitMeta}>
              {habit.pauseLog?.find(p => !p.until)?.note || "Paused"}
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); onResume(habit.id); }}
            style={{ ...S.btn("chip"), fontSize: 13 }}>Resume</button>
          <button onClick={e => { e.stopPropagation(); onEdit(habit); }}
            style={S.iconBtn}>···</button>
        </div>
      ))}
    </div>
  );
}

// ─── SortableHabitList ────────────────────────────────────────────────────────
function SortableHabitList({ habits, completions, notes, ratings, milestones, today, onToggle, onOpenHistory, onEdit, onOpenNote, onDispatch, onMilestone }) {
  const [dragging,    setDragging]    = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [poppedId,    setPoppedId]    = useState(null);
  const listRef = useRef(null);

  const handleCheck = (e, habit) => {
    e.stopPropagation();
    onToggle(habit.id, today);
    // Pop animation
    setPoppedId(habit.id);
    setTimeout(() => setPoppedId(null), 400);
    // Check milestones after toggle
    const willBeDone = !completions[habit.id]?.[today];
    if (willBeDone) {
      const newCompletions = { ...completions, [habit.id]: { ...completions[habit.id], [today]: true } };
      const milestone = checkMilestones(habit, newCompletions, milestones);
      if (milestone) onMilestone(habit, milestone);
    }
  };

  // Drag-to-reorder
  const handleDragStart = (e, idx) => {
    setDragging(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOver(idx);
  };
  const handleDrop = (idx) => {
    if (dragging !== null && dragging !== idx) {
      onDispatch({ type: "REORDER", from: dragging, to: idx });
    }
    setDragging(null); setDragOver(null);
  };

  const dailyHabits  = habits.filter(h => h.freq === "daily");
  const weeklyHabits = habits.filter(h => h.freq === "weekly");

  const renderHabit = (habit, realIdx) => {
    const isDone       = completions[habit.id]?.[today] || false;
    const streak       = getStreak(habit.id, completions);
    const bestStreak   = getBestStreak(habit.id, completions);
    const isAtBest     = streak > 0 && streak >= bestStreak && bestStreak > 0;
    const weekCount    = getWeeklyCount(habit.id, completions);
    const hasNote      = notes[habit.id]?.[today];
    const todayRating  = ratings[habit.id]?.[today] || 0;
    const popping      = poppedId === habit.id;
    const isDragging   = dragging === realIdx;
    const isOver       = dragOver === realIdx;
    const goalProgress = habit.goal ? getGoalProgress(habit.id, completions, habit.goal) : null;

    return (
      <div key={habit.id}
        draggable
        onDragStart={e => handleDragStart(e, realIdx)}
        onDragOver={e => handleDragOver(e, realIdx)}
        onDrop={() => handleDrop(realIdx)}
        onDragEnd={() => { setDragging(null); setDragOver(null); }}
        style={{ opacity: isDragging ? 0.4 : 1, borderTop: isOver ? `2px solid ${habit.color}` : "2px solid transparent" }}>

        <div style={S.habitRow} onClick={() => onOpenHistory(habit)}>
          {/* Check button */}
          <button
            onClick={e => handleCheck(e, habit)}
            style={{ ...S.checkBtn(isDone, habit.color), transform: popping ? "scale(1.25)" : "scale(1)", transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease, box-shadow 0.15s ease" }}>
            {isDone && <Check size={14}/>}
          </button>

          {/* Habit info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{habit.emoji}</span>
              <span style={S.habitName(isDone)}>{habit.name}</span>
            </div>
            <div style={S.habitMeta}>
              {habit.freq === "daily"
                ? streak > 0 ? `${streak} day streak${isAtBest ? " ★" : ""}` : "Start today"
                : `${weekCount}× this week`}
              {hasNote && <span style={{ marginLeft: 6, color: habit.color, opacity: 0.8 }}>· note</span>}
              {habit.ratingEnabled && todayRating > 0 && (
                <span style={{ marginLeft: 6, color: habit.color, opacity: 0.8 }}>
                  {"★".repeat(todayRating)}
                </span>
              )}
            </div>
          </div>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {goalProgress && <GoalArc pct={goalProgress.pct} color={habit.color} size={28} onTrack={goalProgress.onTrack}/>}
            {isDone && (
              <button onClick={e => { e.stopPropagation(); onOpenNote(habit); }}
                style={{ ...S.iconBtn, width: 34, height: 34, color: hasNote ? habit.color : "#B5ADA5" }}>✎</button>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit(habit); }}
              style={{ ...S.iconBtn, width: 34, height: 34 }}>···</button>
          </div>
        </div>

        {goalProgress && goalProgress.pct > 0 && (
          <div style={{ padding: "0 24px 8px", marginTop: -4 }}>
            <GoalBar progress={goalProgress} color={habit.color}/>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={listRef}>
      {dailyHabits.length > 0 && (
        <>
          <div style={S.sectionHead}>
            <span style={S.sectionLabel}>Daily</span>
          </div>
          {dailyHabits.map(h => renderHabit(h, habits.indexOf(h)))}
        </>
      )}
      {weeklyHabits.length > 0 && (
        <>
          <div style={{ ...S.sectionHead, marginTop: 20 }}>
            <span style={S.sectionLabel}>Weekly</span>
          </div>
          {weeklyHabits.map(h => renderHabit(h, habits.indexOf(h)))}
        </>
      )}
    </div>
  );
}

// ─── HabitTracker (root) ──────────────────────────────────────────────────────
function HabitTracker() {
  const savedState = loadState();
  const [state, dispatch] = useReducer(reducer, {
    habits:      savedState?.habits      ?? DEFAULT_HABITS,
    completions: savedState?.completions ?? {},
    notes:       savedState?.notes       ?? {},
    ratings:     savedState?.ratings     ?? {},
    milestones:  savedState?.milestones  ?? {},
  });

  useEffect(() => { saveState(state); }, [state]);

  const [view,           setView]           = useState("main");
  const [editHabit,      setEditHabit]      = useState(null);
  const [historyHabit,   setHistoryHabit]   = useState(null);
  const [noteHabit,      setNoteHabit]      = useState(null);
  const [milestone,      setMilestone]      = useState(null); // { habit, milestone }
  const [showExport,     setShowExport]     = useState(false);

  const today         = dateKey();
  const todayDate     = new Date();
  const activeHabits  = state.habits.filter(h => !h.paused);
  const pausedHabits  = state.habits.filter(h => h.paused);
  const todayDone     = getTodayDone(activeHabits.filter(h => h.freq === "daily"), state.completions);
  const todayTotal    = activeHabits.filter(h => h.freq === "daily").length;

  // 7-day strip
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
  });

  const dayLabel = todayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const handleSaveHabit = (habit, pauseNote) => {
    if (habit.id && state.habits.find(h => h.id === habit.id)) {
      if (pauseNote !== undefined) {
        dispatch({ type: "PAUSE_HABIT", id: habit.id, note: pauseNote });
      }
      dispatch({ type: "EDIT_HABIT", habit });
    } else {
      dispatch({ type: "ADD_HABIT", habit });
    }
    setEditHabit(null);
  };

  if (view === "weekly") {
    return <WeeklyReview habits={state.habits} completions={state.completions}
      notes={state.notes} ratings={state.ratings} onClose={() => setView("main")}/>;
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.dateLabel}>{dayLabel}</div>
          <div style={S.todayLabel}>{todayDone}/{todayTotal}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShowExport(e => !e)} style={S.iconBtn} title="Export">⬇</button>
          <button onClick={() => setView("weekly")} style={S.iconBtn} title="Weekly review">📊</button>
          <button onClick={() => setEditHabit({})} style={S.iconBtn} title="Add habit">+</button>
        </div>
      </div>

      {/* Export panel */}
      {showExport && (
        <div style={{ padding: "0 24px 16px", display: "flex", gap: 10 }}>
          <button onClick={() => { exportJSON(state); setShowExport(false); }}
            style={{ ...S.btn("chip"), flex: 1 }}>Export JSON</button>
          <button onClick={() => { exportCSV(state); setShowExport(false); }}
            style={{ ...S.btn("chip"), flex: 1 }}>Export CSV</button>
        </div>
      )}

      {/* 7-day strip */}
      <div style={S.weekStrip}>
        {last7.map((d, i) => {
          const dk       = dateKey(d);
          const isToday  = dk === today;
          const doneCount = activeHabits.filter(h => h.freq === "daily" && state.completions[h.id]?.[dk]).length;
          const total     = activeHabits.filter(h => h.freq === "daily").length;
          const filled    = total > 0 ? doneCount / total : 0;
          return (
            <div key={i} style={S.dayCol}>
              <div style={{ ...S.dayLetter, color: isToday ? "#8B7355" : "#B5ADA5", fontWeight: isToday ? 700 : 400 }}>
                {DAY_LABELS[i]}
              </div>
              <div style={S.dayDot(filled, isToday)}>
                {filled === 1 && "✓"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.divider}/>

      {/* Habit list */}
      <SortableHabitList
        habits={activeHabits}
        completions={state.completions}
        notes={state.notes}
        ratings={state.ratings}
        milestones={state.milestones}
        today={today}
        onToggle={(habitId, date) => dispatch({ type: "TOGGLE", habitId, date })}
        onOpenHistory={setHistoryHabit}
        onEdit={setEditHabit}
        onOpenNote={setNoteHabit}
        onDispatch={dispatch}
        onMilestone={(habit, m) => setMilestone({ habit, milestone: m })}
      />

      {/* Paused section */}
      <PausedSection
        habits={pausedHabits}
        onResume={id => dispatch({ type: "RESUME_HABIT", id })}
        onEdit={setEditHabit}
        onOpenHistory={setHistoryHabit}
      />

      {/* Sheets */}
      {editHabit !== null && (
        <HabitSheet
          habit={editHabit}
          onSave={handleSaveHabit}
          onDelete={() => { dispatch({ type: "REMOVE_HABIT", id: editHabit.id }); setEditHabit(null); }}
          onClose={() => setEditHabit(null)}
        />
      )}
      {historyHabit && (
        <HistorySheet
          habit={historyHabit}
          completions={state.completions}
          notes={state.notes}
          ratings={state.ratings}
          milestones={state.milestones}
          onToggle={(habitId, date) => dispatch({ type: "TOGGLE", habitId, date })}
          onSetNote={(habitId, date, note) => dispatch({ type: "SET_NOTE", habitId, date, note })}
          onClose={() => setHistoryHabit(null)}
        />
      )}
      {noteHabit && (
        <NoteSheet
          habit={noteHabit}
          date={today}
          existingNote={state.notes[noteHabit.id]?.[today] || ""}
          existingRating={state.ratings[noteHabit.id]?.[today] || 0}
          onSave={note => dispatch({ type: "SET_NOTE", habitId: noteHabit.id, date: today, note })}
          onSaveRating={rating => dispatch({ type: "SET_RATING", habitId: noteHabit.id, date: today, rating })}
          onClose={() => setNoteHabit(null)}
        />
      )}
      {milestone && (
        <MilestoneSheet
          habit={milestone.habit}
          milestone={milestone.milestone}
          onClose={() => {
            dispatch({ type: "MARK_MILESTONE", habitId: milestone.habit.id, key: milestone.milestone.key });
            setMilestone(null);
          }}
        />
      )}
    </div>
  );
}

export default HabitTracker;

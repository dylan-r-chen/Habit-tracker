// ─────────────────────────────────────────────────────────────────────────────
// Habit Tracker — Source File
// Edit this file, then compile with build.sh to produce habits.html
//
// Last built from working HTML: June 2026
// Storage key: habitTracker_v18
// ─────────────────────────────────────────────────────────────────────────────

const { useState, useEffect, useReducer, useCallback, useRef } = React;

// ─── Date helpers ─────────────────────────────────────────────────────────────
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getLast7 = () => getWeekDays(getWeekStart(new Date()));

// ─── Week helpers ─────────────────────────────────────────────────────────────
function getWeekStart() {
  let d = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();
  const day = new Date(d);
  const dow = day.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  day.setDate(day.getDate() + diff);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getWeekDays(weekStart) {
  return Array.from({
    length: 7
  }, (_, i) => {
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
  var days = getWeekDays(weekStart);
  var activeHabits = habits.filter(function(h) { return !h.paused; });
  if (!activeHabits.length) return 0;
  // Each habit contributes 0-100; over-completion on one never masks a shortfall on another.
  var pcts = activeHabits.map(function(h) {
    var count = days.filter(function(d) { return completions[h.id] && completions[h.id][dateKey(d)]; }).length;
    if (h.goal) {
      var goal = h.goal;
      if (goal.period === "week") return Math.min(count / goal.target, 1) * 100;
      if (goal.period === "month") { var p1 = goal.target / 4.33; return p1 === 0 ? 0 : Math.min(count / p1, 1) * 100; }
      var p2 = goal.target / 52; return p2 === 0 ? 0 : Math.min(count / p2, 1) * 100;
    }
    if (h.freq === "daily") return Math.min(count / 7, 1) * 100;
    return days.some(function(d) { return completions[h.id] && completions[h.id][dateKey(d)]; }) ? 100 : 0;
  });
  return Math.round(pcts.reduce(function(a, b) { return a + b; }, 0) / pcts.length);
}

function getWeekNotes(habits, notes, ratings, weekStart) {
  const days = getWeekDays(weekStart);
  const entries = [];
  habits.forEach(habit => {
    days.forEach(d => {
      const key = dateKey(d);
      const note = notes[habit.id]?.[key];
      const rating = ratings[habit.id]?.[key];
      if (note || rating) entries.push({
        habit,
        date: key,
        dateObj: d,
        note: note || "",
        rating: rating || 0
      });
    });
  });
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}


// ─── Month helpers ────────────────────────────────────────────────────────────
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => {
  const dow = new Date(year, month, 1).getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1; // shift to Mon=0 ... Sun=6
};
const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


// ─── Default data ─────────────────────────────────────────────────────────────
const DEFAULT_HABITS = [{
  id: "h1",
  name: "Morning pages",
  emoji: "✍️",
  freq: "daily",
  color: "#8B7355"
}, {
  id: "h2",
  name: "Move 30 min",
  emoji: "🏃",
  freq: "daily",
  color: "#5C7A5C"
}, {
  id: "h3",
  name: "Read",
  emoji: "📖",
  freq: "daily",
  color: "#5C6B8A"
}, {
  id: "h4",
  name: "Call someone",
  emoji: "📞",
  freq: "weekly",
  color: "#8A5C6B"
}];
const COLORS = [
// Warm browns & tans
"#8B7355", "#7A6248", "#A08060", "#6B5340",
// Burnt orange & terracotta
"#9A6B4A", "#8A5A38", "#B07850", "#7A5030",
// Muted orange & amber
"#9A7848", "#8A6838", "#B08850", "#7A6838",
// Dusty yellow & ochre
"#9A8A4A", "#8A7A38", "#A89048", "#7A7038",
// Warm olive & mustard
"#8A8A48", "#7A7A38", "#9A9A50", "#6B6B30",
// Greens
"#5C7A5C", "#4A6B4A", "#6B8A6B", "#5C7A6B",
// Teals & sage
"#5C7A78", "#4A6B68", "#6B8A88", "#507A6B",
// Blues & slates
"#5C6B8A", "#4A5C7A", "#6B7A8A", "#5C6B7A",
// Roses & mauves
"#8A5C6B", "#7A4A5C", "#8A6B7A", "#6B5C6B",
// Purples & dusty violet
"#7A5C7A", "#6B4A6B", "#8A6B8A", "#6B5C7A"];
const EMOJIS = ["✍️", "🏃", "🧗", "📖", "📞", "💧", "🧘", "🎯", "💪", "🥗", "😴", "🎨", "🌿", "⚡", "🧠", "🙏", "🎵", "🚴", "🏊", "🥾"];

// ─── Milestone definitions ────────────────────────────────────────────────────
const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];
const COUNT_MILESTONES = [10, 25, 50, 100, 250, 500];
const STREAK_MESSAGES = {
  7: "A full week. The habit is taking root.",
  14: "Two weeks straight. This is becoming real.",
  30: "A month of showing up.",
  60: "Two months. Consistency is a skill, and you have it.",
  90: "Ninety days. This is who you are now.",
  180: "Half a year. Most people never get here.",
  365: "A year. One full loop around the sun."
};
const COUNT_MESSAGES = {
  10: "Ten times done. The pattern has begun.",
  25: "Twenty-five. A quarter century of this habit.",
  50: "Fifty completions. Halfway to one hundred.",
  100: "One hundred. A genuine practice.",
  250: "Two hundred and fifty. Uncommonly dedicated.",
  500: "Five hundred. Extraordinary."
};
const WEEK_GOAL_MILESTONES = [4, 8, 13, 26, 52, 104, 156];
const WEEK_GOAL_MESSAGES = {
  4: "Four weeks hitting your goal. The rhythm is real.",
  8: "Two months of consistent weeks. You're building something.",
  13: "A quarter year of showing up to your goal, week after week.",
  26: "Half a year of goal weeks. Quietly extraordinary.",
  52: "A full year of hitting your goal every week.",
  104: "Two years of weekly goal weeks. This is just who you are.",
  156: "Three years. Some people only dream of this kind of consistency."
};


// ─── Milestone helpers ────────────────────────────────────────────────────────
function getConsecutiveGoalWeeks(habitId, completions, goal) {
  if (!goal) return 0;
  let count = 0;
  // Start from the most recently completed week and go back
  const now = new Date();
  let weekStart = getWeekStart(now);

  // if current week isn't done yet, start checking from last week
  const currentWeekDays = getWeekDays(weekStart);
  const currentWeekMet = isGoalMetForWeek(habitId, completions, goal, currentWeekDays);
  if (!currentWeekMet) {
    weekStart = addWeeks(weekStart, -1);
  }
  while (true) {
    const days = getWeekDays(weekStart);
    const met = isGoalMetForWeek(habitId, completions, goal, days);
    if (!met) break;
    count++;
    weekStart = addWeeks(weekStart, -1);
    // Safety cap — don't scan more than 10 years back
    if (count > 520) break;
  }
  return count;
}

function isGoalMetForWeek(habitId, completions, goal, days) {
  if (goal.period === "week") {
    const done = days.filter(d => completions[habitId]?.[dateKey(d)]).length;
    return done >= goal.target;
  }
  // For month/year goals, check if the week's days contributed toward a met period
  // Simplified: just check if any day in the week was completed
  return days.some(d => completions[habitId]?.[dateKey(d)]);
}

function checkMilestones(habit, completions, milestones) {
  const streak = getStreak(habit.id, completions);
  const total = Object.values(completions[habit.id] || {}).filter(Boolean).length;
  const achieved = milestones[habit.id] || [];

  // Check streak milestones
  for (const n of STREAK_MILESTONES) {
    const key = `streak-${n}`;
    if (streak >= n && !achieved.includes(key)) {
      return {
        key,
        type: "streak",
        n,
        message: STREAK_MESSAGES[n]
      };
    }
  }
  // Check count milestones
  for (const n of COUNT_MILESTONES) {
    const key = `count-${n}`;
    if (total >= n && !achieved.includes(key)) {
      return {
        key,
        type: "count",
        n,
        message: COUNT_MESSAGES[n]
      };
    }
  }
  // Check consecutive goal week milestones
  if (habit.goal) {
    const goalWeeks = getConsecutiveGoalWeeks(habit.id, completions, habit.goal);
    for (const n of WEEK_GOAL_MILESTONES) {
      const key = `goalweeks-${n}`;
      if (goalWeeks >= n && !achieved.includes(key)) {
        return {
          key,
          type: "goalweeks",
          n,
          message: WEEK_GOAL_MESSAGES[n]
        };
      }
    }
  }
  return null;
}


// ─── localStorage ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "habitTracker_v18";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const old = localStorage.getItem("habitTracker_v17") || localStorage.getItem("habitTracker_v16") || localStorage.getItem("habitTracker_v15") || localStorage.getItem("habitTracker_v14") || localStorage.getItem("habitTracker_v13") || localStorage.getItem("habitTracker_v12") || localStorage.getItem("habitTracker_v11") || localStorage.getItem("habitTracker_v10") || localStorage.getItem("habitTracker_v9") || localStorage.getItem("habitTracker_v8") || localStorage.getItem("habitTracker_v7") || localStorage.getItem("habitTracker_v6") || localStorage.getItem("habitTracker_v5") || localStorage.getItem("habitTracker_v4") || localStorage.getItem("habitTracker_v3") || localStorage.getItem("habitTracker_v2");
      if (old) return JSON.parse(old);
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}


// ─── Export helpers ───────────────────────────────────────────────────────────
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], {
    type: mimeType
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function exportJSON(state) {
  const data = {
    exportedAt: new Date().toISOString(),
    version: "9",
    habits: state.habits,
    completions: state.completions,
    notes: state.notes,
    ratings: state.ratings
  };
  downloadFile(`habits-backup-${dateKey()}.json`, JSON.stringify(data, null, 2), "application/json");
}

function exportCSV(state) {
  // Build a flat row per habit per date that has any activity
  const rows = [];
  const allDates = new Set();

  // Gather all dates that have any completion
  state.habits.forEach(h => {
    const comp = state.completions[h.id] || {};
    Object.keys(comp).forEach(d => {
      if (comp[d]) allDates.add(d);
    });
  });
  const sortedDates = Array.from(allDates).sort();
  sortedDates.forEach(date => {
    state.habits.forEach(habit => {
      const done = !!state.completions[habit.id]?.[date];
      if (!done) return;
      const note = state.notes[habit.id]?.[date] || "";
      const rating = state.ratings[habit.id]?.[date] || "";
      rows.push([date, habit.name, habit.freq, "1", rating, JSON.stringify(note)]);
    });
  });
  const header = "date,habit,frequency,completed,rating,note";
  const csv = [header, ...rows.map(r => r.join(","))].join("\n");
  downloadFile(`habits-${dateKey()}.csv`, csv, "text/csv");
}


// ─── Goal helpers ─────────────────────────────────────────────────────────────
// goal shape: { target: number, period: "week" | "month" | "year" }
function getGoalProgress(habitId, completions, goal) {
  if (!goal) return null;
  const now = new Date();
  let count = 0;
  let periodLabel = "";
  let daysInPeriod = 0;
  let daysPassed = 0;
  if (goal.period === "week") {
    // fixed Mon–Sun week
    const weekDays = getWeekDays(getWeekStart(now));
    weekDays.forEach(d => {
      if (completions[habitId]?.[dateKey(d)]) count++;
    });
    daysInPeriod = 7;
    // days passed = how far into the week we are (Mon=1 ... Sun=7)
    const dow = now.getDay();
    daysPassed = dow === 0 ? 7 : dow; // Sun=7, Mon=1...Sat=6
    // adjust: Mon=1 but we want Mon=1 so (dow === 0 ? 7 : dow) works
    // more precisely: Mon=1,Tue=2,...Sat=6,Sun=7
    const dowAdj = now.getDay() === 0 ? 7 : now.getDay();
    daysPassed = dowAdj;
    periodLabel = "this week";
  } else if (goal.period === "month") {
    const y = now.getFullYear(),
      m = now.getMonth();
    const days = getDaysInMonth(y, m);
    for (let d = 1; d <= now.getDate(); d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (completions[habitId]?.[key]) count++;
    }
    daysInPeriod = days;
    daysPassed = now.getDate();
    periodLabel = MONTH_SHORT[m];
  } else if (goal.period === "year") {
    const y = now.getFullYear();
    const start = new Date(y, 0, 1);
    const d = new Date(start);
    while (d <= now) {
      if (completions[habitId]?.[dateKey(d)]) count++;
      d.setDate(d.getDate() + 1);
    }
    const isLeap = y % 4 === 0 && y % 100 !== 0 || y % 400 === 0;
    daysInPeriod = isLeap ? 366 : 365;
    daysPassed = Math.ceil((now - start) / 86400000) + 1;
    periodLabel = String(y);
  }
  const pct = Math.min(count / goal.target, 1);
  const onTrack = daysInPeriod > 0 ? count >= Math.floor(daysPassed / daysInPeriod * goal.target) : false;
  return {
    count,
    target: goal.target,
    pct,
    onTrack,
    periodLabel,
    period: goal.period
  };
}


// ─── Streak / count helpers ───────────────────────────────────────────────────
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
  const hc = completions[habitId] || {};
  const days = Object.keys(hc).filter(k => hc[k]).sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
    if (diff === 1) { cur++; if (cur > best) best = cur; } else { cur = 1; }
  }
  return best;
}

function getWeeklyCount(habitId, completions) {
  const days = getWeekDays(getWeekStart(new Date()));
  return days.filter(d => completions[habitId]?.[dateKey(d)]).length;
}

function getTodayDone(habits, completions) {
  const today = dateKey();
  return habits.filter(h => completions[h.id]?.[today]).length;
}

function getMonthCompletionRate(habitId, completions, year, month) {
  const days = getDaysInMonth(year, month);
  let done = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (completions[habitId]?.[key]) done++;
  }
  return days > 0 ? Math.round(done / days * 100) : 0;
}


// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "TOGGLE":
      {
        const habitId = action.habitId,
          date = action.date;
        const prev = state.completions[habitId]?.[date];
        const newCompletions = {
          ...state.completions,
          [habitId]: {
            ...state.completions[habitId],
            [date]: !prev
          }
        };
        const newNotes = {
          ...state.notes
        };
        const newRatings = {
          ...state.ratings
        };
        if (prev) {
          if (newNotes[habitId]?.[date]) {
            newNotes[habitId] = {
              ...newNotes[habitId]
            };
            delete newNotes[habitId][date];
          }
          if (newRatings[habitId]?.[date]) {
            newRatings[habitId] = {
              ...newRatings[habitId]
            };
            delete newRatings[habitId][date];
          }
        }
        return {
          ...state,
          completions: newCompletions,
          notes: newNotes,
          ratings: newRatings
        };
      }
    case "SET_NOTE":
      {
        const habitId = action.habitId,
          date = action.date,
          note = action.note;
        return {
          ...state,
          notes: {
            ...state.notes,
            [habitId]: {
              ...state.notes[habitId],
              [date]: note
            }
          }
        };
      }
    case "SET_RATING":
      {
        const habitId = action.habitId,
          date = action.date,
          rating = action.rating;
        return {
          ...state,
          ratings: {
            ...state.ratings,
            [habitId]: {
              ...state.ratings[habitId],
              [date]: rating
            }
          }
        };
      }
    case "ADD_HABIT":
      return {
        ...state,
        habits: [...state.habits, action.habit]
      };
    case "REMOVE_HABIT":
      {
        const completions = {
          ...state.completions
        };
        const notes = {
          ...state.notes
        };
        const ratings = {
          ...state.ratings
        };
        delete completions[action.id];
        delete notes[action.id];
        delete ratings[action.id];
        return {
          ...state,
          habits: state.habits.filter(h => h.id !== action.id),
          completions,
          notes,
          ratings
        };
      }
    case "EDIT_HABIT":
      return {
        ...state,
        habits: state.habits.map(h => h.id === action.habit.id ? action.habit : h)
      };
    case "PAUSE_HABIT":
      {
        const id = action.id,
          note = action.note;
        return {
          ...state,
          habits: state.habits.map(h => h.id !== id ? h : {
            ...h,
            paused: true,
            pauseLog: [...(h.pauseLog || []), {
              since: dateKey(),
              until: null,
              note: note || ""
            }]
          })
        };
      }
    case "RESUME_HABIT":
      {
        const id = action.id;
        return {
          ...state,
          habits: state.habits.map(h => h.id !== id ? h : {
            ...h,
            paused: false,
            pauseLog: (h.pauseLog || []).map((p, i, arr) => i === arr.length - 1 ? {
              ...p,
              until: dateKey()
            } : p)
          })
        };
      }
    case "MARK_MILESTONE":
      {
        const habitId = action.habitId,
          key = action.key;
        return {
          ...state,
          milestones: {
            ...state.milestones,
            [habitId]: [...(state.milestones[habitId] || []), key]
          }
        };
      }
    case "REORDER":
      {
        const habits = [...state.habits];
        const _habits$splice = habits.splice(action.from, 1),
          _habits$splice2 = _slicedToArray(_habits$splice, 1),
          moved = _habits$splice2[0];
        habits.splice(action.to, 0, moved);
        return {
          ...state,
          habits
        };
      }
    default:
      return state;
  }
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100dvh",
    background: "#F7F4EF",
    color: "#2C2923",
    fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    paddingBottom: "calc(40px + env(safe-area-inset-bottom))",
    paddingTop: "env(safe-area-inset-top)",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
    WebkitTextSizeAdjust: "100%",
    maxWidth: 430,
    margin: "0 auto",
    position: "relative"
  },
  header: {
    padding: "20px 24px 8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  dateLabel: {
    fontSize: 13,
    letterSpacing: "0.08em",
    color: "#9E9184",
    fontFamily: "sans-serif",
    fontWeight: 400,
    textTransform: "uppercase",
    marginBottom: 2
  },
  todayLabel: {
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.1,
    color: "#2C2923",
    letterSpacing: "-0.02em"
  },
  iconBtn: {
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
    borderRadius: 12,
    color: "#6B6259",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0
  },
  // ring styles removed (progress ring removed from main view)
  weekStrip: {
    padding: "0 24px 20px",
    display: "flex",
    gap: 6
  },
  dayCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5
  },
  dayLetter: {
    fontSize: 10,
    color: "#B5ADA5",
    fontFamily: "sans-serif",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  },
  dayDot: (filled, isToday) => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: isToday ? "1.5px solid #8B7355" : "1.5px solid transparent",
    background: filled > 0 ? `rgba(139,115,85,${Math.min(0.15 + filled * 0.25, 0.9)})` : "#EDE8E1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    color: filled > 0.6 ? "#5C4A2A" : "#C0B8AF",
    fontFamily: "sans-serif",
    fontWeight: 500,
    transition: "background 0.3s ease"
  }),
  divider: {
    height: 1,
    background: "#E8E3DC",
    margin: "0 24px 20px"
  },
  sectionHead: {
    padding: "0 24px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: "0.10em",
    color: "#B5ADA5",
    textTransform: "uppercase",
    fontFamily: "sans-serif",
    fontWeight: 500
  },
  addBtn: {
    fontSize: 22,
    color: "#8B7355",
    background: "none",
    border: "none",
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 4px",
    WebkitTapHighlightColor: "transparent",
    width: 44,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end"
  },
  emptyState: {
    padding: "32px 24px",
    textAlign: "center",
    color: "#B5ADA5",
    fontFamily: "sans-serif",
    fontSize: 14,
    lineHeight: 1.6
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(44,41,35,0.35)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)"
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    background: "#FAF8F4",
    borderRadius: "20px 20px 0 0",
    padding: "20px 24px",
    paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
    boxShadow: "0 -4px 40px rgba(44,41,35,0.12)"
  },
  sheetHandle: {
    width: 36,
    height: 4,
    background: "#D4CEC7",
    borderRadius: 2,
    margin: "0 auto 20px"
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 400,
    color: "#2C2923",
    marginBottom: 20,
    letterSpacing: "-0.01em"
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 16,
    fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
    color: "#2C2923",
    background: "#F0EBE3",
    border: "1px solid transparent",
    borderRadius: 12,
    outline: "none",
    boxSizing: "border-box",
    WebkitAppearance: "none"
  },
  label: {
    fontSize: 11,
    letterSpacing: "0.10em",
    color: "#B5ADA5",
    textTransform: "uppercase",
    fontFamily: "sans-serif",
    fontWeight: 500,
    marginBottom: 8,
    display: "block"
  },
  emojiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: 6,
    marginBottom: 20
  },
  emojiCell: sel => ({
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    borderRadius: 10,
    background: sel ? "#E8E3DC" : "transparent",
    border: sel ? "1.5px solid #C0B0A0" : "1.5px solid transparent",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent"
  }),
  colorRow: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap"
  },
  colorDot: (sel, color) => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: color,
    border: sel ? "2px solid #2C2923" : "2px solid transparent",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    boxSizing: "border-box",
    outline: sel ? "2px solid #F7F4EF" : "none",
    outlineOffset: -3
  }),
  freqToggle: {
    display: "flex",
    background: "#EDE8E1",
    borderRadius: 12,
    padding: 3
  },
  freqBtn: active => ({
    flex: 1,
    padding: "10px 0",
    fontSize: 14,
    fontFamily: "sans-serif",
    fontWeight: 500,
    color: active ? "#2C2923" : "#9E9184",
    background: active ? "#FAF8F4" : "transparent",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.2s ease",
    WebkitTapHighlightColor: "transparent"
  }),
  saveBtn: disabled => ({
    width: "100%",
    padding: "15px 0",
    fontSize: 16,
    fontFamily: "sans-serif",
    fontWeight: 500,
    color: disabled ? "#C0B8AF" : "#FAF8F4",
    background: disabled ? "#EDE8E1" : "#8B7355",
    border: "none",
    borderRadius: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    WebkitTapHighlightColor: "transparent",
    letterSpacing: "0.02em"
  }),
  widgetWrap: {
    minHeight: "100dvh",
    background: "#F7F4EF",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "calc(24px + env(safe-area-inset-bottom))"
  },
  widgetCard: {
    width: "100%",
    maxWidth: 380,
    background: "rgba(247,244,239,0.92)",
    borderRadius: 26,
    padding: "20px",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 4px 32px rgba(44,41,35,0.08)"
  },
  widgetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14
  },
  widgetTitle: {
    fontSize: 13,
    fontFamily: "sans-serif",
    color: "#9E9184",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 500
  },
  widgetCount: {
    fontSize: 32,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "#2C2923",
    lineHeight: 1,
    fontFamily: "'Palatino Linotype', Palatino, Georgia, serif"
  },
  widgetBar: {
    height: 4,
    background: "#EDE8E1",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 16
  },
  widgetBarFill: pct => ({
    height: "100%",
    width: `${pct}%`,
    background: "#8B7355",
    borderRadius: 2,
    transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)"
  }),
  widgetExpand: {
    marginTop: 14,
    width: "100%",
    padding: "10px 0",
    fontSize: 13,
    fontFamily: "sans-serif",
    color: "#9E9184",
    background: "none",
    border: "none",
    cursor: "pointer",
    letterSpacing: "0.04em",
    WebkitTapHighlightColor: "transparent"
  }
};


// ─── Components ───────────────────────────────────────────────────────────────
function ConcentricRing(_ref) {
  var pct = _ref.pct, _ref$size = _ref.size, size = _ref$size === void 0 ? 72 : _ref$size, _ref$color = _ref.color, color = _ref$color === void 0 ? "#8B7355" : _ref$color;
  var innerPct = Math.min(pct / 100, 1);
  var outerPct = pct > 100 ? Math.min((pct - 100) / 100, 1) : 0;
  var hasOverflow = outerPct > 0;
  var gap = 6, outerStroke = 4, innerStroke = 5;
  var outerR = (size - outerStroke) / 2;
  var innerR = outerR - outerStroke / 2 - gap - innerStroke / 2;
  var innerC = 2 * Math.PI * innerR;
  var outerC = 2 * Math.PI * outerR;
  var innerDash = innerPct * innerC;
  var outerDash = outerPct * outerC;
  return React.createElement("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, style: { flexShrink: 0 } },
    hasOverflow && React.createElement("circle", { cx: size/2, cy: size/2, r: outerR, fill: "none", stroke: "#EDE8E1", strokeWidth: outerStroke }),
    hasOverflow && React.createElement("circle", { cx: size/2, cy: size/2, r: outerR, fill: "none", stroke: color, strokeWidth: outerStroke,
      strokeDasharray: outerDash + " " + (outerC - outerDash), strokeDashoffset: outerC * 0.25,
      strokeLinecap: "round", opacity: 0.45, style: { transition: "stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1)" } }),
    React.createElement("circle", { cx: size/2, cy: size/2, r: innerR, fill: "none", stroke: "#EDE8E1", strokeWidth: innerStroke }),
    React.createElement("circle", { cx: size/2, cy: size/2, r: innerR, fill: "none", stroke: color, strokeWidth: innerStroke,
      strokeDasharray: innerDash + " " + (innerC - innerDash), strokeDashoffset: innerC * 0.25,
      strokeLinecap: "round", style: { transition: "stroke-dasharray 0.5s cubic-bezier(0.4,0,0.2,1)" } })
  );
}

function GoalArc(_ref2) {
  var pct = _ref2.pct, color = _ref2.color, _ref2$size = _ref2.size, size = _ref2$size === void 0 ? 28 : _ref2$size, onTrack = _ref2.onTrack;
  var innerPct = Math.min(pct, 1);
  var outerPct = pct > 1 ? Math.min(pct - 1, 1) : 0;
  var hasOverflow = outerPct > 0;
  var done = pct >= 1;
  var gap = 3, outerStroke = 2, innerStroke = 2.5;
  var outerR = (size - outerStroke) / 2;
  var innerR = outerR - outerStroke / 2 - gap - innerStroke / 2;
  var innerC = 2 * Math.PI * innerR;
  var outerC = 2 * Math.PI * outerR;
  var innerDash = innerPct * innerC;
  var outerDash = outerPct * outerC;
  var stroke = done ? color : onTrack ? color : "#C8B99A";
  var opacity = done ? 1 : onTrack ? 0.85 : 0.55;
  return React.createElement("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, style: { flexShrink: 0 } },
    hasOverflow && React.createElement("circle", { cx: size/2, cy: size/2, r: outerR, fill: "none", stroke: "#EDE8E1", strokeWidth: outerStroke }),
    hasOverflow && React.createElement("circle", { cx: size/2, cy: size/2, r: outerR, fill: "none", stroke: color, strokeWidth: outerStroke,
      strokeDasharray: outerDash + " " + (outerC - outerDash), strokeDashoffset: outerC * 0.25,
      strokeLinecap: "round", opacity: 0.45, style: { transition: "stroke-dasharray 0.4s ease" } }),
    React.createElement("circle", { cx: size/2, cy: size/2, r: innerR, fill: "none", stroke: "#EDE8E1", strokeWidth: innerStroke }),
    React.createElement("circle", { cx: size/2, cy: size/2, r: innerR, fill: "none", stroke: stroke, strokeWidth: innerStroke,
      strokeDasharray: innerDash + " " + (innerC - innerDash), strokeDashoffset: innerC * 0.25,
      strokeLinecap: "round", opacity: opacity, style: { transition: "stroke-dasharray 0.4s ease" } }),
    done && !hasOverflow && React.createElement("circle", { cx: size/2, cy: size/2, r: innerR - 2, fill: color, opacity: 0.12 })
  );
}

function GoalBar(_ref4) {
  let progress = _ref4.progress,
    color = _ref4.color;
  if (!progress) return null;
  const count = progress.count,
    target = progress.target,
    pct = progress.pct,
    onTrack = progress.onTrack,
    periodLabel = progress.periodLabel,
    period = progress.period;
  const done = pct >= 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#F0EBE3",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      color: "#6B6259",
      fontWeight: 500,
      marginBottom: 2
    }
  }, "Goal \xB7 ", period === "week" ? "Weekly" : period === "month" ? "Monthly" : "Yearly"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      color: "#2C2923",
      letterSpacing: "-0.02em"
    }
  }, count, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "#B5ADA5"
    }
  }, "/", target), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      marginLeft: 6
    }
  }, periodLabel))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: "sans-serif",
      fontWeight: 500,
      letterSpacing: "0.04em",
      color: done ? color : onTrack ? color : "#C8B99A",
      background: done ? `${color}18` : onTrack ? `${color}12` : "rgba(200,185,154,0.15)",
      padding: "4px 10px",
      borderRadius: 20,
      display: "inline-block"
    }
  }, done ? "✦ Complete" : onTrack ? "On track" : "Behind"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      marginTop: 4
    }
  }, Math.round(pct * 100), pct > 1 ? "% ↑" : "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      background: "#E0D8CE",
      borderRadius: 3,
      overflow: "hidden",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${Math.min(Math.round(pct * 100), 100)}%`,
      background: done ? color : onTrack ? color : "#C8B99A",
      borderRadius: 3,
      opacity: done ? 1 : onTrack ? 0.85 : 0.6,
      transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4
    }
  }, Array.from({
    length: target
  }, (_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      background: i < count ? color : "#E0D8CE",
      opacity: i < count ? 0.8 : 0.4,
      transition: "background 0.3s ease",
      maxWidth: 24
    }
  }))));
}

function NoteSheet(_ref5) {
  let habit = _ref5.habit,
    date = _ref5.date,
    existingNote = _ref5.existingNote,
    existingRating = _ref5.existingRating,
    onSave = _ref5.onSave,
    onSaveRating = _ref5.onSaveRating,
    onClose = _ref5.onClose;
  const initialText = existingNote || (habit.template?.trim() ? habit.template : "");
  const _useState = useState(initialText),
    _useState2 = _slicedToArray(_useState, 2),
    text = _useState2[0],
    setText = _useState2[1];
  const _useState3 = useState(existingRating || 0),
    _useState4 = _slicedToArray(_useState3, 2),
    rating = _useState4[0],
    setRating = _useState4[1];
  const textareaRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      // if pre-filled from template, place cursor at end of first line so user types right away
      if (!existingNote && habit.template?.trim()) {
        const firstLineEnd = text.indexOf("\n");
        const pos = firstLineEnd === -1 ? text.length : firstLineEnd;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 200);
    return () => clearTimeout(t);
  }, []);
  const displayDate = (() => {
    const _date$split$map = date.split("-").map(Number),
      _date$split$map2 = _slicedToArray(_date$split$map, 3),
      y = _date$split$map2[0],
      m = _date$split$map2[1],
      d = _date$split$map2[2];
    const obj = new Date(y, m - 1, d);
    return date === dateKey() ? "Today" : `${MONTH_SHORT[obj.getMonth()]} ${obj.getDate()}`;
  })();
  return /*#__PURE__*/React.createElement("div", {
    style: S.backdrop,
    onClick: e => {
      if (e.target === e.currentTarget) {
        onSave(text.trim());
        if (habit.ratingEnabled && rating) onSaveRating(rating);
        onClose();
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.sheet,
      paddingBottom: "calc(16px + env(safe-area-inset-bottom))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sheetHandle
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: `${habit.color}18`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, habit.emoji), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "#2C2923"
    }
  }, habit.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 1
    }
  }, displayDate)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onSave(text.trim());
      if (habit.ratingEnabled && rating) onSaveRating(rating);
      onClose();
    },
    style: {
      marginLeft: "auto",
      fontSize: 15,
      fontFamily: "sans-serif",
      color: "#8B7355",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontWeight: 500,
      padding: "8px 4px",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Save")), habit.ratingEnabled && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: "0.08em",
      color: "#B5ADA5",
      textTransform: "uppercase",
      fontFamily: "sans-serif",
      fontWeight: 500,
      marginBottom: 10
    }
  }, "How was it?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("div", {
    key: n,
    onClick: () => setRating(rating === n ? 0 : n),
    style: {
      flex: 1,
      aspectRatio: "1",
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      background: rating >= n ? habit.color : "#EDE8E1",
      transition: "all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
      transform: rating === n ? "scale(1.12)" : "scale(1)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: rating >= n ? "white" : "#9E9184"
    }
  }, n)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 6
    }
  }, ["Poor", "", "Okay", "", "Great"].map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      textAlign: i === 0 ? "left" : i === 4 ? "right" : "center",
      fontSize: 10,
      color: "#C0B8AF",
      fontFamily: "sans-serif"
    }
  }, l)))), /*#__PURE__*/React.createElement("textarea", {
    ref: textareaRef,
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "How did it go? Add a note\u2026",
    maxLength: 500,
    style: {
      width: "100%",
      minHeight: 120,
      padding: "14px",
      fontSize: 16,
      lineHeight: 1.55,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      color: "#2C2923",
      background: "#F0EBE3",
      border: "1px solid transparent",
      borderRadius: 14,
      outline: "none",
      resize: "none",
      boxSizing: "border-box",
      WebkitAppearance: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#C0B8AF",
      fontFamily: "sans-serif"
    }
  }, text.length, "/500"), existingNote && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onSave("");
      onSaveRating(0);
      onClose();
    },
    style: {
      fontSize: 12,
      color: "#C0392B",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: "sans-serif",
      padding: "4px 0",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Clear note"))));
}

function MilestoneSheet(_ref6) {
  let habit = _ref6.habit,
    milestone = _ref6.milestone,
    onClose = _ref6.onClose;
  const icon = milestone.type === "streak" ? "🔥" : milestone.type === "goalweeks" ? "⬡" : "✦";
  const label = milestone.type === "streak" ? `${milestone.n} day streak` : milestone.type === "goalweeks" ? `${milestone.n} consecutive goal weeks` : `${milestone.n} completions`;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.backdrop,
      alignItems: "center"
    },
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "calc(100% - 48px)",
      maxWidth: 340,
      background: "#FAF8F4",
      borderRadius: 24,
      padding: "36px 28px 28px",
      boxShadow: "0 8px 48px rgba(44,41,35,0.18)",
      textAlign: "center",
      animation: "milestoneIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 16,
      background: habit.color + "18",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 28,
      margin: "0 auto 16px"
    }
  }, habit.emoji), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: "sans-serif",
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: habit.color,
      marginBottom: 8
    }
  }, icon, " ", label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      color: "#2C2923",
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      marginBottom: 14,
      letterSpacing: "-0.01em"
    }
  }, habit.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "#6B6259",
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      lineHeight: 1.65,
      marginBottom: 28,
      fontStyle: "italic"
    }
  }, "\"", milestone.message, "\""), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: "100%",
      padding: "14px 0",
      fontSize: 15,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: "#FAF8F4",
      background: habit.color,
      border: "none",
      borderRadius: 14,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      letterSpacing: "0.02em"
    }
  }, "Keep going")));
}

function WeeklyReview(_ref7) {
  let habits = _ref7.habits,
    completions = _ref7.completions,
    notes = _ref7.notes,
    ratings = _ref7.ratings,
    onClose = _ref7.onClose;
  const now = new Date();
  const _useState5 = useState(getWeekStart(now)),
    _useState6 = _slicedToArray(_useState5, 2),
    weekStart = _useState6[0],
    setWeekStart = _useState6[1];
  const isCurrentWeek = weekStart.getTime() === getWeekStart(now).getTime();
  const days = getWeekDays(weekStart);
  const activeHabits = habits.filter(h => !h.paused);
  const today = dateKey();
  const thisRate = getWeekCompletionRate(habits, completions, weekStart);
  const lastRate = getWeekCompletionRate(habits, completions, addWeeks(weekStart, -1));
  const rateDiff = thisRate - lastRate;
  const weekLabel = (() => {
    const s = days[0],
      e = days[6];
    if (isCurrentWeek) return "This week";
    const sStr = `${MONTH_SHORT[s.getMonth()]} ${s.getDate()}`;
    const eStr = s.getMonth() === e.getMonth() ? String(e.getDate()) : `${MONTH_SHORT[e.getMonth()]} ${e.getDate()}`;
    return `${sStr} – ${eStr}`;
  })();
  const noteEntries = getWeekNotes(activeHabits, notes, ratings, weekStart);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.root,
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.header,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: onClose,
    "aria-label": "Back"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 20 20",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M13 4L7 10L13 16",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#9E9184",
      fontFamily: "sans-serif",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontWeight: 500
    }
  }, "Weekly Review")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 24px 0"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: () => setWeekStart(w => addWeeks(w, -1)),
    "aria-label": "Previous week"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 13L7 9L11 5",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "#2C2923",
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      letterSpacing: "-0.01em"
    }
  }, weekLabel), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, MONTH_SHORT[days[0].getMonth()], " ", days[0].getDate(), " \u2013 ", MONTH_SHORT[days[6].getMonth()], " ", days[6].getDate(), ", ", days[6].getFullYear())), /*#__PURE__*/React.createElement("button", {
    style: {
      ...S.iconBtn,
      opacity: isCurrentWeek ? 0.3 : 1
    },
    onClick: () => !isCurrentWeek && setWeekStart(w => addWeeks(w, 1)),
    disabled: isCurrentWeek,
    "aria-label": "Next week"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 5L11 9L7 13",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "16px 24px",
      background: "#F0EBE3",
      borderRadius: 16,
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: "sans-serif",
      color: "#9E9184",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontWeight: 500,
      marginBottom: 4
    }
  }, "Goal progress"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 38,
      fontWeight: 400,
      color: "#2C2923",
      letterSpacing: "-0.03em",
      lineHeight: 1,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif"
    }
  }, thisRate, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20,
      color: "#B5ADA5"
    }
  }, "%")), lastRate > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontFamily: "sans-serif",
      marginTop: 4,
      color: rateDiff >= 0 ? "#5C7A5C" : "#8A5C6B"
    }
  }, rateDiff >= 0 ? "▲" : "▼", " ", Math.abs(rateDiff), "% vs last week")), /*#__PURE__*/React.createElement(ConcentricRing, { pct: thisRate, size: 64, color: "#8B7355" })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr repeat(7, 28px)",
      gap: 4,
      padding: "0 24px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null), days.map(d => /*#__PURE__*/React.createElement("div", {
    key: dateKey(d),
    style: {
      textAlign: "center",
      fontSize: 10,
      fontFamily: "sans-serif",
      color: dateKey(d) === today ? "#8B7355" : "#B5ADA5",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      fontWeight: dateKey(d) === today ? 600 : 400
    }
  }, ["M", "T", "W", "T", "F", "S", "S"][d.getDay() === 0 ? 6 : d.getDay() - 1]))), activeHabits.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: S.emptyState
  }, "No active habits to review."), activeHabits.map(habit => {
    const weekDays = habit.freq === "daily" ? days : [days.find(d => completions[habit.id]?.[dateKey(d)]) || days[0]];
    const doneCount = days.filter(d => completions[habit.id]?.[dateKey(d)]).length;
    const possible = habit.freq === "daily" ? 7 : 1;
    const avgRating = (() => {
      if (!habit.ratingEnabled) return 0;
      const rs = days.map(d => ratings[habit.id]?.[dateKey(d)] || 0).filter(r => r > 0);
      return rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1) : 0;
    })();
    const goalProgress = (() => {
      if (!habit.goal) return null;
      const count = days.filter(d => completions[habit.id]?.[dateKey(d)]).length;
      const goal = habit.goal;
      let target, periodLabel;
      if (goal.period === "week") { target = goal.target; periodLabel = "this week"; }
      else if (goal.period === "month") { target = Math.round(goal.target / 4.33); periodLabel = "est. weekly"; }
      else { target = Math.round(goal.target / 52); periodLabel = "est. weekly"; }
      if (!target) return null;
      const pct = Math.min(count / target, 1);
      const isCurrentWeek = weekStart.getTime() === getWeekStart(now).getTime();
      let onTrack = true;
      if (isCurrentWeek) {
        const dow = now.getDay() === 0 ? 7 : now.getDay();
        onTrack = count >= Math.floor(dow / 7 * target);
      }
      return { count, target, pct, onTrack, periodLabel };
    })();
    const hasAnyNote = days.some(d => notes[habit.id]?.[dateKey(d)]);
    return /*#__PURE__*/React.createElement("div", {
      key: habit.id,
      style: {
        padding: "12px 24px",
        borderBottom: "1px solid #F0EBE3"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr repeat(7, 28px)",
        gap: 4,
        alignItems: "center",
        marginBottom: goalProgress || avgRating ? 8 : 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: 8,
        background: habit.color + "18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        flexShrink: 0
      }
    }, habit.emoji), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "#2C2923",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, habit.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#B5ADA5",
        fontFamily: "sans-serif",
        marginTop: 1
      }
    }, doneCount, "/", habit.freq === "daily" ? 7 : "1 target", avgRating > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        color: habit.color
      }
    }, "\u2605 ", avgRating), hasAnyNote && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        color: habit.color,
        opacity: 0.7
      }
    }, "\xB7 notes")))), days.map(d => {
      const key = dateKey(d);
      const done = !!completions[habit.id]?.[key];
      const isFuture = d > now && key !== today;
      const isToday = key === today;
      const r = ratings[habit.id]?.[key] || 0;
      return /*#__PURE__*/React.createElement("div", {
        key: key,
        style: {
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: done ? habit.color : isFuture ? "transparent" : "#EDE8E1",
          border: isToday && !done ? `1.5px solid ${habit.color}` : done && r > 0 ? `2px solid ${habit.color}` : "1.5px solid transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isFuture ? 0.3 : 1
        }
      }, done && r > 0 && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          fontFamily: "sans-serif",
          color: "white",
          fontWeight: 600
        }
      }, r), done && !r && /*#__PURE__*/React.createElement(Check, {
        size: 9
      }));
    })), goalProgress && /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: 36,
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 3,
        background: "#EDE8E1",
        borderRadius: 2,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${Math.min(Math.round(goalProgress.pct * 100), 100)}%`,
        background: goalProgress.pct >= 1 ? habit.color : goalProgress.onTrack ? habit.color : "#C8B99A",
        borderRadius: 2,
        opacity: goalProgress.pct >= 1 ? 1 : goalProgress.onTrack ? 0.8 : 0.5
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontFamily: "sans-serif",
        color: goalProgress.pct >= 1 ? habit.color : goalProgress.onTrack ? "#9E9184" : "#C8B99A",
        flexShrink: 0,
        whiteSpace: "nowrap"
      }
    }, goalProgress.pct >= 1 ? "✦ Goal met" : `${goalProgress.count}/${goalProgress.target} ${goalProgress.periodLabel}`)));
  }), noteEntries.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "24px 24px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sectionLabel
  }, "Notes this week"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, noteEntries.map(_ref8 => {
    let habit = _ref8.habit,
      date = _ref8.date,
      dateObj = _ref8.dateObj,
      note = _ref8.note,
      rating = _ref8.rating;
    return /*#__PURE__*/React.createElement("div", {
      key: habit.id + date,
      style: {
        marginBottom: 16,
        paddingBottom: 16,
        borderBottom: "1px solid #F0EBE3"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 24,
        height: 24,
        borderRadius: 7,
        background: habit.color + "18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13
      }
    }, habit.emoji), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "#6B6259",
        fontFamily: "sans-serif"
      }
    }, habit.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "#B5ADA5",
        fontFamily: "sans-serif",
        marginLeft: "auto"
      }
    }, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()]), rating > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontFamily: "sans-serif",
        color: habit.color,
        background: habit.color + "18",
        padding: "2px 7px",
        borderRadius: 10
      }
    }, "\u2605 ", rating)), note ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "#4A4038",
        lineHeight: 1.6,
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
        paddingLeft: 32
      }
    }, note) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#C0B8AF",
        fontFamily: "sans-serif",
        paddingLeft: 32
      }
    }, "Rating only"));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 40
    }
  }), /*#__PURE__*/React.createElement("style", null, `* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        body { margin: 0; background: #F7F4EF; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes milestoneIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }`));
}

function HistorySheet(_ref9) {
  let habit = _ref9.habit,
    completions = _ref9.completions,
    notes = _ref9.notes,
    ratings = _ref9.ratings,
    milestones = _ref9.milestones,
    onToggle = _ref9.onToggle,
    onSetNote = _ref9.onSetNote,
    onClose = _ref9.onClose;
  const now = new Date();
  const _useState7 = useState(now.getFullYear()),
    _useState8 = _slicedToArray(_useState7, 2),
    viewYear = _useState8[0],
    setViewYear = _useState8[1];
  const _useState9 = useState(now.getMonth()),
    _useState0 = _slicedToArray(_useState9, 2),
    viewMonth = _useState0[0],
    setViewMonth = _useState0[1];
  const _useState1 = useState(null),
    _useState10 = _slicedToArray(_useState1, 2),
    selectedDay = _useState10[0],
    setSelectedDay = _useState10[1];
  const today = dateKey();
  const todayObj = new Date();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const streak = getStreak(habit.id, completions);
  const bestStreak = getBestStreak(habit.id, completions);
  const isAtBest = streak > 0 && streak >= bestStreak && bestStreak > 0;
  const rate = getMonthCompletionRate(habit.id, completions, viewYear, viewMonth);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const goalProgress = habit.goal ? getGoalProgress(habit.id, completions, habit.goal) : null;
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const selectedNote = selectedDay ? notes[habit.id]?.[selectedDay] : null;
  const selectedDone = selectedDay ? !!completions[habit.id]?.[selectedDay] : false;
  return /*#__PURE__*/React.createElement("div", {
    style: S.backdrop,
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.sheet,
      maxHeight: "90dvh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sheetHandle
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 13,
      background: `${habit.color}18`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22
    }
  }, habit.emoji), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 400,
      color: "#2C2923",
      letterSpacing: "-0.01em"
    }
  }, habit.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, streak > 0 ? `${streak} day streak${isAtBest ? " ★" : ""}` : "No current streak", " \xB7 ", rate, "% this month"))), habit.pauseLog?.length > 0 && (() => {
    const relevant = habit.pauseLog.filter(p => {
      const start = p.since;
      const end = p.until || dateKey();
      const mStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const mEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(getDaysInMonth(viewYear, viewMonth)).padStart(2, "0")}`;
      return start <= mEnd && end >= mStart;
    });
    if (!relevant.length) return null;
    return relevant.map((p, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: "#F0EBE3",
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: 12,
        display: "flex",
        alignItems: "flex-start",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        marginTop: 1
      }
    }, "\u23F8"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "#6B6259",
        fontWeight: 500
      }
    }, "Paused ", p.since, p.until ? ` – ${p.until}` : " · ongoing"), p.note && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "#4A4038",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
        marginTop: 3,
        lineHeight: 1.5
      }
    }, p.note))));
  })(), goalProgress && /*#__PURE__*/React.createElement(GoalBar, {
    progress: goalProgress,
    color: habit.color
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: prevMonth,
    "aria-label": "Previous month"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 13L7 9L11 5",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "#2C2923",
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif"
    }
  }, MONTH_NAMES[viewMonth], " ", viewYear), /*#__PURE__*/React.createElement("button", {
    style: {
      ...S.iconBtn,
      opacity: isCurrentMonth ? 0.3 : 1
    },
    onClick: nextMonth,
    disabled: isCurrentMonth,
    "aria-label": "Next month"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 5L11 9L7 13",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 4,
      marginBottom: 6
    }
  }, DAY_LABELS.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      textAlign: "center",
      fontSize: 10,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      padding: "2px 0"
    }
  }, d))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 4,
      marginBottom: 20
    }
  }, cells.map((day, i) => {
    if (!day) return /*#__PURE__*/React.createElement("div", {
      key: `e${i}`
    });
    const cellDate = new Date(viewYear, viewMonth, day);
    const key = dateKey(cellDate);
    const done = !!completions[habit.id]?.[key];
    const hasNote = !!notes[habit.id]?.[key];
    const isFuture = cellDate > todayObj && key !== today;
    const isToday = key === today;
    const isSelected = key === selectedDay;
    return /*#__PURE__*/React.createElement("div", {
      key: key,
      onClick: () => !isFuture && setSelectedDay(isSelected ? null : key),
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        cursor: isFuture ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
        paddingBottom: 2
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        aspectRatio: "1",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontFamily: "sans-serif",
        background: done ? habit.color : isSelected ? "#EDE8E1" : "transparent",
        border: isToday && !done ? `1.5px solid ${habit.color}` : isSelected && !done ? "1.5px solid #C0B0A0" : "1.5px solid transparent",
        color: done ? "white" : isFuture ? "#D4CEC7" : "#2C2923",
        transition: "all 0.15s ease",
        fontWeight: isToday ? 500 : 400
      }
    }, done ? /*#__PURE__*/React.createElement(Check, {
      size: 11,
      color: "white"
    }) : day), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: hasNote ? habit.color : "transparent",
        opacity: hasNote ? 0.75 : 0,
        transition: "opacity 0.2s ease",
        flexShrink: 0
      }
    }));
  })), selectedDay && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#F0EBE3",
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 20,
      animation: "fadeIn 0.2s ease"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: selectedNote ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#6B6259",
      fontFamily: "sans-serif",
      fontWeight: 500
    }
  }, (() => {
    const _selectedDay$split$ma = selectedDay.split("-").map(Number),
      _selectedDay$split$ma2 = _slicedToArray(_selectedDay$split$ma, 3),
      y = _selectedDay$split$ma2[0],
      m = _selectedDay$split$ma2[1],
      d = _selectedDay$split$ma2[2];
    const obj = new Date(y, m - 1, d);
    return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][obj.getDay()]}, ${MONTH_SHORT[obj.getMonth()]} ${d}`;
  })()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, selectedDone && /*#__PURE__*/React.createElement("button", {
    onClick: () => onSetNote(habit.id, selectedDay),
    style: {
      fontSize: 12,
      color: "#8B7355",
      background: "rgba(139,115,85,0.1)",
      border: "none",
      cursor: "pointer",
      fontFamily: "sans-serif",
      padding: "4px 8px",
      borderRadius: 8,
      WebkitTapHighlightColor: "transparent"
    }
  }, selectedNote ? "Edit note" : "+ Note"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onToggle(habit.id, selectedDay),
    style: {
      fontSize: 12,
      fontFamily: "sans-serif",
      padding: "4px 10px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      background: selectedDone ? "rgba(192,57,43,0.1)" : habit.color,
      color: selectedDone ? "#C0392B" : "white"
    }
  }, selectedDone ? "Undo" : "Mark done"))), habit.ratingEnabled && selectedDay && ratings[habit.id]?.[selectedDay] > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      marginTop: 8
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: (ratings[habit.id]?.[selectedDay] || 0) >= n ? habit.color : "#E0D8CE",
      opacity: (ratings[habit.id]?.[selectedDay] || 0) >= n ? 0.85 : 0.4
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginLeft: 4,
      alignSelf: "center"
    }
  }, ["", "Poor", "", "Okay", "", "Great"][ratings[habit.id]?.[selectedDay] || 0])), selectedNote && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "#4A4038",
      lineHeight: 1.55,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      borderTop: "1px solid #E0D8CE",
      paddingTop: 10,
      marginTop: 4
    }
  }, selectedNote), !selectedNote && selectedDone && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      marginTop: 6
    }
  }, "No note for this day."), !selectedNote && !selectedDone && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#B5ADA5",
      fontFamily: "sans-serif",
      marginTop: 6
    }
  }, "Tap \"Mark done\" to log this day.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 20
    }
  }, [{
    label: "Streak",
    value: streak > 0 ? `${streak}d` : "—"
  }, {
    label: "This month",
    value: `${rate}%`
  }, {
    label: "Total",
    value: Object.values(completions[habit.id] || {}).filter(Boolean).length
  }].map(_ref0 => {
    let label = _ref0.label,
      value = _ref0.value;
    return /*#__PURE__*/React.createElement("div", {
      key: label,
      style: {
        flex: 1,
        background: "#F0EBE3",
        borderRadius: 12,
        padding: "12px 10px",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 18,
        color: "#2C2923",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif"
      }
    }, value), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#9E9184",
        fontFamily: "sans-serif",
        marginTop: 2,
        letterSpacing: "0.04em"
      }
    }, label));
  })), milestones[habit.id]?.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: "0.10em",
      color: "#B5ADA5",
      textTransform: "uppercase",
      fontFamily: "sans-serif",
      fontWeight: 500,
      marginBottom: 10
    }
  }, "Milestones"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8
    }
  }, (milestones[habit.id] || []).map(key => {
    const _key$split = key.split("-"),
      _key$split2 = _slicedToArray(_key$split, 2),
      type = _key$split2[0],
      n = _key$split2[1];
    return /*#__PURE__*/React.createElement("div", {
      key: key,
      style: {
        fontSize: 12,
        fontFamily: "sans-serif",
        color: habit.color,
        background: habit.color + "12",
        padding: "4px 10px",
        borderRadius: 20,
        letterSpacing: "0.02em"
      }
    }, type === "streak" ? "🔥" : type === "goalweeks" ? "⬡" : "✦", " ", n, type === "streak" ? " day streak" : type === "goalweeks" ? " goal weeks" : " completions");
  }))), /*#__PURE__*/React.createElement("button", {
    style: S.saveBtn(false),
    onClick: onClose
  }, "Done")));
}

function HabitSheet(_ref1) {
  let habit = _ref1.habit,
    onSave = _ref1.onSave,
    onDelete = _ref1.onDelete,
    onClose = _ref1.onClose;
  const _useState11 = useState(habit?.name || ""),
    _useState12 = _slicedToArray(_useState11, 2),
    name = _useState12[0],
    setName = _useState12[1];
  const _useState13 = useState(habit?.emoji || "✍️"),
    _useState14 = _slicedToArray(_useState13, 2),
    emoji = _useState14[0],
    setEmoji = _useState14[1];
  const _useState15 = useState(habit?.color || COLORS[0]),
    _useState16 = _slicedToArray(_useState15, 2),
    color = _useState16[0],
    setColor = _useState16[1];
  const _useState17 = useState(habit?.freq || "daily"),
    _useState18 = _slicedToArray(_useState17, 2),
    freq = _useState18[0],
    setFreq = _useState18[1];
  const _useState19 = useState(false),
    _useState20 = _slicedToArray(_useState19, 2),
    confirming = _useState20[0],
    setConfirming = _useState20[1];

  // Goal state
  const _useState21 = useState(!!habit?.goal),
    _useState22 = _slicedToArray(_useState21, 2),
    goalEnabled = _useState22[0],
    setGoalEnabled = _useState22[1];
  const _useState23 = useState(habit?.goal?.target || 3),
    _useState24 = _slicedToArray(_useState23, 2),
    goalTarget = _useState24[0],
    setGoalTarget = _useState24[1];
  const _useState25 = useState(habit?.goal?.period || "week"),
    _useState26 = _slicedToArray(_useState25, 2),
    goalPeriod = _useState26[0],
    setGoalPeriod = _useState26[1];

  // Template state
  const _useState27 = useState(habit?.template || ""),
    _useState28 = _slicedToArray(_useState27, 2),
    template = _useState28[0],
    setTemplate = _useState28[1];

  // Rating state
  const _useState29 = useState(!!habit?.ratingEnabled),
    _useState30 = _slicedToArray(_useState29, 2),
    ratingEnabled = _useState30[0],
    setRatingEnabled = _useState30[1];

  // Pause state
  const _useState31 = useState(!!habit?.paused),
    _useState32 = _slicedToArray(_useState31, 2),
    pauseEnabled = _useState32[0],
    setPauseEnabled = _useState32[1];
  const _useState33 = useState(habit?.pauseLog?.length ? habit.pauseLog[habit.pauseLog.length - 1].note : ""),
    _useState34 = _slicedToArray(_useState33, 2),
    pauseNote = _useState34[0],
    setPauseNote = _useState34[1];
  const valid = name.trim().length > 0;
  const handleSave = () => {
    if (!valid) return;
    const goal = goalEnabled ? {
      target: goalTarget,
      period: goalPeriod
    } : null;
    onSave({
      id: habit?.id || `h${Date.now()}`,
      name: name.trim(),
      emoji,
      color,
      freq,
      goal,
      template: template.trim(),
      ratingEnabled
    }, pauseEnabled, pauseNote);
    onClose();
  };

  // Suggested targets by period
  const periodDefaults = {
    week: 3,
    month: 12,
    year: 100
  };
  const handlePeriodChange = p => {
    setGoalPeriod(p);
    if (!habit?.goal) setGoalTarget(periodDefaults[p]);
  };
  const maxTarget = goalPeriod === "week" ? 7 : goalPeriod === "month" ? 31 : 365;
  return /*#__PURE__*/React.createElement("div", {
    style: S.backdrop,
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.sheet,
      maxHeight: "92dvh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sheetHandle
  }), /*#__PURE__*/React.createElement("p", {
    style: S.sheetTitle
  }, habit ? "Edit habit" : "New habit"), /*#__PURE__*/React.createElement("label", {
    style: S.label
  }, "Name"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...S.input,
      marginBottom: 20
    },
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "e.g. Morning walk",
    autoFocus: true,
    maxLength: 40
  }), /*#__PURE__*/React.createElement("label", {
    style: S.label
  }, "Icon"), /*#__PURE__*/React.createElement("div", {
    style: S.emojiGrid
  }, EMOJIS.map(em => /*#__PURE__*/React.createElement("div", {
    key: em,
    style: S.emojiCell(emoji === em),
    onClick: () => setEmoji(em)
  }, em))), /*#__PURE__*/React.createElement("label", {
    style: S.label
  }, "Color"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(8, 1fr)",
      gap: 8,
      marginBottom: 20
    }
  }, COLORS.map(c => /*#__PURE__*/React.createElement("div", {
    key: c,
    style: S.colorDot(color === c, c),
    onClick: () => setColor(c)
  }))), /*#__PURE__*/React.createElement("label", {
    style: S.label
  }, "Frequency"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.freqToggle,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: S.freqBtn(freq === "daily"),
    onClick: () => setFreq("daily")
  }, "Daily"), /*#__PURE__*/React.createElement("button", {
    style: S.freqBtn(freq === "weekly"),
    onClick: () => setFreq("weekly")
  }, "Weekly")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid #E8E3DC",
      paddingTop: 20,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: goalEnabled ? 18 : 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: "#2C2923",
      letterSpacing: "0.02em"
    }
  }, "Set a goal"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, "Track how often you want to do this")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setGoalEnabled(g => !g),
    style: {
      width: 44,
      height: 26,
      borderRadius: 13,
      cursor: "pointer",
      background: goalEnabled ? "#8B7355" : "#D4CEC7",
      position: "relative",
      transition: "background 0.2s ease",
      WebkitTapHighlightColor: "transparent",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 3,
      left: goalEnabled ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "white",
      transition: "left 0.2s ease",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
    }
  }))), goalEnabled && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeIn 0.2s ease"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      ...S.label,
      marginBottom: 8
    }
  }, "Period"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.freqToggle,
      marginBottom: 18
    }
  }, ["week", "month", "year"].map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    style: S.freqBtn(goalPeriod === p),
    onClick: () => handlePeriodChange(p)
  }, p.charAt(0).toUpperCase() + p.slice(1)))), /*#__PURE__*/React.createElement("label", {
    style: {
      ...S.label,
      marginBottom: 8
    }
  }, "Target \u2014 ", goalTarget, "\xD7 per ", goalPeriod), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setGoalTarget(t => Math.max(1, t - 1)),
    style: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: "#EDE8E1",
      border: "none",
      fontSize: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#6B6259",
      WebkitTapHighlightColor: "transparent",
      flexShrink: 0
    }
  }, "\u2212"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 6,
      background: "#EDE8E1",
      borderRadius: 3,
      position: "relative",
      cursor: "pointer"
    },
    onClick: e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      setGoalTarget(Math.max(1, Math.min(maxTarget, Math.round(pct * maxTarget))));
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${goalTarget / maxTarget * 100}%`,
      background: color,
      borderRadius: 3,
      transition: "width 0.1s ease"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "50%",
      left: `${goalTarget / maxTarget * 100}%`,
      transform: "translate(-50%, -50%)",
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "white",
      border: `2px solid ${color}`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      transition: "left 0.1s ease"
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setGoalTarget(t => Math.min(maxTarget, t + 1)),
    style: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: "#EDE8E1",
      border: "none",
      fontSize: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#6B6259",
      WebkitTapHighlightColor: "transparent",
      flexShrink: 0
    }
  }, "+")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: "10px 14px",
      background: `${color}10`,
      borderRadius: 10,
      fontSize: 13,
      color: "#6B6259",
      fontFamily: "sans-serif",
      lineHeight: 1.5
    }
  }, goalTarget, "\xD7 per ", goalPeriod, goalPeriod === "week" && ` · about ${Math.round(goalTarget * 52)} times a year`, goalPeriod === "month" && ` · about ${goalTarget * 12} times a year`, goalPeriod === "year" && ` · about ${Math.round(goalTarget / 12)} times a month`))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid #E8E3DC",
      paddingTop: 20,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: "#2C2923",
      letterSpacing: "0.02em"
    }
  }, "Note template"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, "Pre-fills the note when empty"))), /*#__PURE__*/React.createElement("textarea", {
    value: template,
    onChange: e => setTemplate(e.target.value),
    placeholder: "e.g.\nDistance: \nPace: \nFelt: \nNotes: ",
    maxLength: 300,
    rows: 4,
    style: {
      width: "100%",
      padding: "12px 14px",
      fontSize: 15,
      lineHeight: 1.6,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      color: "#2C2923",
      background: "#F0EBE3",
      border: "1px solid transparent",
      borderRadius: 12,
      outline: "none",
      resize: "none",
      boxSizing: "border-box",
      WebkitAppearance: "none"
    }
  }), template.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#C0B8AF",
      fontFamily: "sans-serif"
    }
  }, template.length, "/300"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTemplate(""),
    style: {
      fontSize: 12,
      color: "#B5ADA5",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: "sans-serif",
      padding: 0,
      WebkitTapHighlightColor: "transparent"
    }
  }, "Clear")), template.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, [{
    label: "Running",
    text: "Distance: \nPace: \nFelt: \nNotes: "
  }, {
    label: "Reading",
    text: "Book: \nPages: \nThoughts: "
  }, {
    label: "Workout",
    text: "Exercise: \nSets/Reps: \nFelt: "
  }, {
    label: "Journal",
    text: "Highlight: \nGrateful for: \nTomorrow: "
  }].map(_ref10 => {
    let label = _ref10.label,
      text = _ref10.text;
    return /*#__PURE__*/React.createElement("button", {
      key: label,
      onClick: () => setTemplate(text),
      style: {
        fontSize: 12,
        color: "#8B7355",
        background: `${color}10`,
        border: `1px solid ${color}30`,
        borderRadius: 20,
        padding: "4px 10px",
        cursor: "pointer",
        fontFamily: "sans-serif",
        WebkitTapHighlightColor: "transparent"
      }
    }, label);
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid #E8E3DC",
      paddingTop: 20,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: "#2C2923",
      letterSpacing: "0.02em"
    }
  }, "Quality rating"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, "Rate 1\u20135 after each completion")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setRatingEnabled(r => !r),
    style: {
      width: 44,
      height: 26,
      borderRadius: 13,
      cursor: "pointer",
      background: ratingEnabled ? "#8B7355" : "#D4CEC7",
      position: "relative",
      transition: "background 0.2s ease",
      WebkitTapHighlightColor: "transparent",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 3,
      left: ratingEnabled ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "white",
      transition: "left 0.2s ease",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
    }
  }))), ratingEnabled && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      lineHeight: 1.5,
      padding: "8px 12px",
      background: color + "18",
      borderRadius: 10
    }
  }, "A 1\u20135 prompt appears after marking done. Use it for effort, focus, quality \u2014 whatever fits.")), habit && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid #E8E3DC",
      paddingTop: 20,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: pauseEnabled ? 14 : 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: "sans-serif",
      fontWeight: 500,
      color: "#2C2923",
      letterSpacing: "0.02em"
    }
  }, "Pause habit"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9E9184",
      fontFamily: "sans-serif",
      marginTop: 2
    }
  }, "Hide from daily view, preserve history")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setPauseEnabled(p => !p),
    style: {
      width: 44,
      height: 26,
      borderRadius: 13,
      cursor: "pointer",
      background: pauseEnabled ? "#8B7355" : "#D4CEC7",
      position: "relative",
      transition: "background 0.2s ease",
      WebkitTapHighlightColor: "transparent",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 3,
      left: pauseEnabled ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "white",
      transition: "left 0.2s ease",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
    }
  }))), pauseEnabled && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeIn 0.2s ease"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      ...S.label,
      marginBottom: 8
    }
  }, "Reason (optional)"), /*#__PURE__*/React.createElement("textarea", {
    value: pauseNote,
    onChange: e => setPauseNote(e.target.value),
    placeholder: "e.g. Strained hamstring, physio says 3 weeks off",
    maxLength: 200,
    rows: 2,
    style: {
      width: "100%",
      padding: "12px 14px",
      fontSize: 15,
      lineHeight: 1.5,
      fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
      color: "#2C2923",
      background: "#F0EBE3",
      border: "1px solid transparent",
      borderRadius: 12,
      outline: "none",
      resize: "none",
      boxSizing: "border-box"
    }
  }))), /*#__PURE__*/React.createElement("button", {
    style: S.saveBtn(!valid),
    onClick: handleSave,
    disabled: !valid
  }, habit ? "Save changes" : "Add habit"), habit && !confirming && /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirming(true),
    style: {
      width: "100%",
      padding: "14px 0",
      marginTop: 10,
      fontSize: 15,
      fontFamily: "sans-serif",
      color: "#C0392B",
      background: "none",
      border: "none",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Remove habit"), habit && confirming && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "14px",
      background: "#FDF0EE",
      borderRadius: 12,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "#2C2923",
      fontFamily: "sans-serif",
      marginBottom: 12
    }
  }, "Remove \"", habit.name, "\"? All history will be lost."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirming(false),
    style: {
      flex: 1,
      padding: "10px 0",
      fontSize: 14,
      fontFamily: "sans-serif",
      color: "#6B6259",
      background: "#EDE8E1",
      border: "none",
      borderRadius: 10,
      cursor: "pointer"
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onDelete(habit.id);
      onClose();
    },
    style: {
      flex: 1,
      padding: "10px 0",
      fontSize: 14,
      fontFamily: "sans-serif",
      color: "white",
      background: "#C0392B",
      border: "none",
      borderRadius: 10,
      cursor: "pointer"
    }
  }, "Remove")))));
}

function PausedSection(_ref11) {
  let habits = _ref11.habits,
    onResume = _ref11.onResume,
    onEdit = _ref11.onEdit,
    onOpenHistory = _ref11.onOpenHistory;
  const _useState35 = useState(false),
    _useState36 = _slicedToArray(_useState35, 2),
    expanded = _useState36[0],
    setExpanded = _useState36[1];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      opacity: 0.7
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.sectionHead,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    },
    onClick: () => setExpanded(e => !e)
  }, /*#__PURE__*/React.createElement("span", {
    style: S.sectionLabel
  }, "Paused \xB7 ", habits.length), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    style: {
      transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.2s ease",
      opacity: 0.5
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6L8 10L12 6",
    stroke: "#9E9184",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), expanded && /*#__PURE__*/React.createElement("div", {
    style: {
      animation: "fadeIn 0.2s ease"
    }
  }, habits.map(habit => {
    const latestPause = habit.pauseLog?.[habit.pauseLog.length - 1];
    return /*#__PURE__*/React.createElement("div", {
      key: habit.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        borderBottom: "1px solid #F0EBE3"
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: () => onOpenHistory(habit),
      style: {
        width: 40,
        height: 40,
        borderRadius: 12,
        background: "#EDE8E1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        flexShrink: 0,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        filter: "grayscale(0.4)"
      }
    }, habit.emoji), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        color: "#9E9184",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, habit.name), latestPause?.note ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#B5ADA5",
        fontFamily: "sans-serif",
        marginTop: 2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, latestPause.note) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#C0B8AF",
        fontFamily: "sans-serif",
        marginTop: 2
      }
    }, "Since ", latestPause?.since || "—")), /*#__PURE__*/React.createElement("button", {
      onClick: () => onEdit(habit),
      style: {
        fontSize: 13,
        fontFamily: "sans-serif",
        color: "#9E9184",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 4px",
        WebkitTapHighlightColor: "transparent",
        opacity: 0.7
      }
    }, "Edit"), /*#__PURE__*/React.createElement("button", {
      onClick: () => onResume(habit.id),
      style: {
        fontSize: 13,
        fontFamily: "sans-serif",
        color: "#8B7355",
        background: "rgba(139,115,85,0.1)",
        border: "none",
        cursor: "pointer",
        padding: "6px 12px",
        borderRadius: 20,
        WebkitTapHighlightColor: "transparent"
      }
    }, "Resume"));
  })));
}

function SortableHabitList(_ref12) {
  let habits = _ref12.habits,
    completions = _ref12.completions,
    notes = _ref12.notes,
    ratings = _ref12.ratings,
    milestones = _ref12.milestones,
    today = _ref12.today,
    onToggle = _ref12.onToggle,
    onOpenHistory = _ref12.onOpenHistory,
    onEdit = _ref12.onEdit,
    onOpenNote = _ref12.onOpenNote,
    onDispatch = _ref12.onDispatch,
    onMilestone = _ref12.onMilestone;
  const _useState37 = useState(null),
    _useState38 = _slicedToArray(_useState37, 2),
    dragging = _useState38[0],
    setDragging = _useState38[1];
  const _useState39 = useState(null),
    _useState40 = _slicedToArray(_useState39, 2),
    dragOver = _useState40[0],
    setDragOver = _useState40[1];
  const _useState41 = useState(null),
    _useState42 = _slicedToArray(_useState41, 2),
    poppedId = _useState42[0],
    setPoppedId = _useState42[1];
  const dragRef = useRef(null);
  const touchStartY = useRef(null);
  const touchDragIdx = useRef(null);
  const handleToggle = habitId => {
    const wasDone = !!completions[habitId]?.[today];
    onToggle(habitId);
    if (!wasDone) {
      // Check milestones after toggle — simulate the new completions state
      const simulatedCompletions = {
        ...completions,
        [habitId]: {
          ...completions[habitId],
          [today]: true
        }
      };
      const habit = habits.find(h => h.id === habitId);
      if (habit) {
        const m = checkMilestones(habit, simulatedCompletions, milestones);
        if (m) {
          setTimeout(() => onMilestone(habit, m), 400);
        } else {
          setTimeout(() => onOpenNote(habitId, today), 350);
        }
      }
    }
    setPoppedId(habitId);
    setTimeout(() => setPoppedId(null), 400);
  };
  const onTouchStart = (e, idx) => {
    dragRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30);
      touchDragIdx.current = idx;
      setDragging(idx);
      touchStartY.current = e.touches[0].clientY;
    }, 300);
  };
  const onTouchMove = e => {
    if (dragRef.current) {
      clearTimeout(dragRef.current);
      dragRef.current = null;
    }
    if (dragging === null || touchDragIdx.current === null) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - touchStartY.current;
    const newIdx = Math.max(0, Math.min(habits.length - 1, touchDragIdx.current + Math.round(dy / 72)));
    setDragOver(newIdx);
  };
  const onTouchEnd = () => {
    if (dragRef.current) {
      clearTimeout(dragRef.current);
      dragRef.current = null;
    }
    if (dragging !== null && dragOver !== null && dragging !== dragOver) {
      onDispatch({
        type: "REORDER",
        from: dragging,
        to: dragOver
      });
    }
    setDragging(null);
    setDragOver(null);
    touchDragIdx.current = null;
  };
  const displayHabits = [...habits];
  if (dragging !== null && dragOver !== null && dragging !== dragOver) {
    const _displayHabits$splice = displayHabits.splice(dragging, 1),
      _displayHabits$splice2 = _slicedToArray(_displayHabits$splice, 1),
      moved = _displayHabits$splice2[0];
    displayHabits.splice(dragOver, 0, moved);
  }
  if (habits.length === 0) return /*#__PURE__*/React.createElement("div", {
    style: S.emptyState
  }, "No habits yet. Tap + to add one.");
  return /*#__PURE__*/React.createElement("div", null, displayHabits.map(habit => {
    const realIdx = habits.findIndex(h => h.id === habit.id);
    const done = !!completions[habit.id]?.[today];
    const hasNote = !!notes[habit.id]?.[today];
    const todayRating = ratings[habit.id]?.[today] || 0;
    const streak = getStreak(habit.id, completions);
    const bestStreak = getBestStreak(habit.id, completions);
    const isAtBest = streak > 0 && streak >= bestStreak && bestStreak > 0;
    const weekCount = getWeeklyCount(habit.id, completions);
    const popping = poppedId === habit.id;
    const isDragging = dragging === realIdx;
    const goalProgress = habit.goal ? getGoalProgress(habit.id, completions, habit.goal) : null;
    return /*#__PURE__*/React.createElement("div", {
      key: habit.id,
      style: {
        padding: "12px 24px 12px",
        background: isDragging ? "rgba(139,115,85,0.06)" : done ? "rgba(139,115,85,0.03)" : "transparent",
        borderBottom: "1px solid #F0EBE3",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 0.15s, background 0.15s",
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 3.5,
        padding: "8px 4px 8px 0",
        cursor: "grab",
        flexShrink: 0,
        opacity: 0.3
      },
      onTouchStart: e => onTouchStart(e, realIdx),
      onTouchMove: onTouchMove,
      onTouchEnd: onTouchEnd,
      onTouchCancel: () => {
        if (dragRef.current) clearTimeout(dragRef.current);
        setDragging(null);
        setDragOver(null);
      }
    }, [0, 1, 2].map(i => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        width: 16,
        height: 1.5,
        background: "#9E9184",
        borderRadius: 1
      }
    }))), /*#__PURE__*/React.createElement("div", {
      onClick: () => onOpenHistory(habit),
      style: {
        width: 40,
        height: 40,
        borderRadius: 12,
        background: `${habit.color}18`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        flexShrink: 0,
        transform: popping ? "scale(1.2)" : "scale(1)",
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent"
      }
    }, habit.emoji), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent"
      },
      onClick: () => onOpenHistory(habit)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 17,
        color: done ? "#B5ADA5" : "#2C2923",
        textDecoration: done ? "line-through" : "none",
        textDecorationColor: "#C0B8AF",
        transition: "color 0.2s ease",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, habit.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#B5ADA5",
        fontFamily: "sans-serif",
        marginTop: 2
      }
    }, habit.freq === "daily" ? streak > 0 ? `${streak} day streak${isAtBest ? " ★" : ""}` : "Start today" : `${weekCount}× this week`, hasNote && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        color: habit.color,
        opacity: 0.8
      }
    }, "\xB7 note"), habit.ratingEnabled && todayRating > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        color: habit.color,
        opacity: 0.8
      }
    }, "\xB7 ", "★".repeat(todayRating)), goalProgress && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        color: goalProgress.pct >= 1 ? habit.color : goalProgress.onTrack ? "#9E9184" : "#C8B99A"
      }
    }, "\xB7 ", goalProgress.count, "/", goalProgress.target, " ", goalProgress.periodLabel))), goalProgress && /*#__PURE__*/React.createElement(GoalArc, {
      pct: goalProgress.pct,
      color: habit.color,
      onTrack: goalProgress.onTrack,
      size: 28
    }), done && /*#__PURE__*/React.createElement("button", {
      onClick: () => onOpenNote(habit.id, today),
      style: {
        ...S.iconBtn,
        width: 34,
        height: 34,
        opacity: hasNote ? 0.8 : 0.3,
        flexShrink: 0
      },
      "aria-label": "Add note"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "16",
      height: "16",
      viewBox: "0 0 16 16",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 12V14H4L11.5 6.5L9.5 4.5L2 12Z",
      stroke: hasNote ? habit.color : "#6B6259",
      strokeWidth: "1.4",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: hasNote ? `${habit.color}20` : "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9.5 4.5L11.5 6.5L13 5L11 3L9.5 4.5Z",
      stroke: hasNote ? habit.color : "#6B6259",
      strokeWidth: "1.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: () => onEdit(habit),
      style: {
        ...S.iconBtn,
        width: 34,
        height: 34,
        opacity: 0.3,
        flexShrink: 0
      },
      "aria-label": "Edit"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 16 16",
      fill: "none"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "8",
      r: "1.5",
      fill: "#6B6259"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "3",
      r: "1.5",
      fill: "#6B6259"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "13",
      r: "1.5",
      fill: "#6B6259"
    }))), /*#__PURE__*/React.createElement("div", {
      onClick: () => handleToggle(habit.id),
      style: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: `1.5px solid ${done ? habit.color : "#D4CEC7"}`,
        background: done ? habit.color : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: popping && !done ? "scale(0.8)" : popping && done ? "scale(1.15)" : "scale(1)",
        WebkitTapHighlightColor: "transparent"
      }
    }, done && /*#__PURE__*/React.createElement(Check, null))), goalProgress && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 8,
        marginLeft: 76,
        marginRight: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 3,
        background: "#EDE8E1",
        borderRadius: 2,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${Math.round(goalProgress.pct * 100)}%`,
        background: goalProgress.pct >= 1 ? habit.color : goalProgress.onTrack ? habit.color : "#C8B99A",
        borderRadius: 2,
        opacity: goalProgress.pct >= 1 ? 1 : goalProgress.onTrack ? 0.7 : 0.5,
        transition: "width 0.4s ease"
      }
    }))));
  }));
}

function HabitTracker() {
  const savedState = loadState();
  const _useReducer = useReducer(reducer, {
      habits: savedState?.habits ?? DEFAULT_HABITS,
      completions: savedState?.completions ?? {},
      notes: savedState?.notes ?? {},
      ratings: savedState?.ratings ?? {},
      milestones: savedState?.milestones ?? {}
    }),
    _useReducer2 = _slicedToArray(_useReducer, 2),
    state = _useReducer2[0],
    dispatch = _useReducer2[1];
  useEffect(() => {
    saveState(state);
  }, [state]);
  const _useState43 = useState("main"),
    _useState44 = _slicedToArray(_useState43, 2),
    view = _useState44[0],
    setView = _useState44[1]; // "main" | "widget" | "week"
  const _useState45 = useState(null),
    _useState46 = _slicedToArray(_useState45, 2),
    milestonePrompt = _useState46[0],
    setMilestonePrompt = _useState46[1]; // { habit, milestone }
  const _useState47 = useState(null),
    _useState48 = _slicedToArray(_useState47, 2),
    sheet = _useState48[0],
    setSheet = _useState48[1];
  const _useState49 = useState(null),
    _useState50 = _slicedToArray(_useState49, 2),
    historyHabit = _useState50[0],
    setHistoryHabit = _useState50[1];
  const _useState51 = useState(null),
    _useState52 = _slicedToArray(_useState51, 2),
    notePrompt = _useState52[0],
    setNotePrompt = _useState52[1];
  const today = dateKey();
  const now = new Date();
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
  const dateStr = `${MONTH_SHORT[now.getMonth()]} ${now.getDate()}`;
  const dailyHabits = state.habits.filter(h => h.freq === "daily" && !h.paused);
  const weeklyHabits = state.habits.filter(h => h.freq === "weekly" && !h.paused);
  const pausedHabits = state.habits.filter(h => h.paused);
  const dailyDone = dailyHabits.filter(h => state.completions[h.id]?.[today]).length;
  const totalDaily = dailyHabits.length;
  const last7 = getLast7();
  const toggle = useCallback(function (habitId) {
    let date = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : today;
    dispatch({
      type: "TOGGLE",
      habitId,
      date
    });
  }, [today]);
  const openNote = useCallback((habitId, date) => {
    setNotePrompt({
      habitId,
      date
    });
  }, []);
  const activeNoteHabit = notePrompt ? state.habits.find(h => h.id === notePrompt.habitId) : null;

  // ── Weekly review ──────────────────────────────────────────────────────────
  if (view === "week") {
    return /*#__PURE__*/React.createElement(WeeklyReview, {
      habits: state.habits,
      completions: state.completions,
      notes: state.notes,
      ratings: state.ratings,
      onClose: () => setView("main")
    });
  }

  if (view === "settings") {
    const handleExport = () => {
      exportJSON(state);
    };
    const handleImport = () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json";
      input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            if (!parsed.habits || !Array.isArray(parsed.habits)) { alert("Not a valid habits backup file."); return; }
            if (!window.confirm("Replace all current data with this backup?")) return;
            localStorage.setItem(STORAGE_KEY, ev.target.result);
            window.location.reload();
          } catch(e) { alert("Import failed: " + e.message); }
        };
        reader.readAsText(file);
      };
      document.body.appendChild(input); input.click(); document.body.removeChild(input);
    };
    return /*#__PURE__*/React.createElement("div", { style: S.root },
      /*#__PURE__*/React.createElement("div", { style: S.header },
        /*#__PURE__*/React.createElement("button", { style: S.iconBtn, onClick: () => setView("main"), "aria-label": "Back" },
          /*#__PURE__*/React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
            /*#__PURE__*/React.createElement("path", { d: "M13 4L7 10L13 16", stroke: "#6B6259", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))),
        /*#__PURE__*/React.createElement("div", { style: { flex: 1, textAlign: "center" } },
          /*#__PURE__*/React.createElement("div", { style: { fontSize: 13, color: "#9E9184", fontFamily: "sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 } }, "Settings")),
        /*#__PURE__*/React.createElement("div", { style: { width: 44 } })),
      /*#__PURE__*/React.createElement("div", { style: { padding: "32px 24px", display: "flex", flexDirection: "column", gap: 12 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 11, fontFamily: "sans-serif", color: "#9E9184", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, marginBottom: 4 } }, "Data"),
        /*#__PURE__*/React.createElement("button", {
          onClick: handleExport,
          style: { width: "100%", padding: "16px 20px", background: "#F0EBE3", border: "none", borderRadius: 14, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, WebkitTapHighlightColor: "transparent" }
        },
          /*#__PURE__*/React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, background: "#8B7355", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } },
            /*#__PURE__*/React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none" },
              /*#__PURE__*/React.createElement("path", { d: "M9 2v9M9 11l-3-3M9 11l3-3M3 13v1a2 2 0 002 2h8a2 2 0 002-2v-1", stroke: "white", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))),
          /*#__PURE__*/React.createElement("div", null,
            /*#__PURE__*/React.createElement("div", { style: { fontSize: 15, color: "#2C2923", marginBottom: 2 } }, "Export Backup"),
            /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, color: "#9E9184", fontFamily: "sans-serif" } }, "Save all habits & history as a JSON file"))),
        /*#__PURE__*/React.createElement("button", {
          onClick: handleImport,
          style: { width: "100%", padding: "16px 20px", background: "#F0EBE3", border: "none", borderRadius: 14, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, WebkitTapHighlightColor: "transparent" }
        },
          /*#__PURE__*/React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, background: "#5C6B8A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } },
            /*#__PURE__*/React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none" },
              /*#__PURE__*/React.createElement("path", { d: "M9 11V2M9 2L6 5M9 2l3 3M3 13v1a2 2 0 002 2h8a2 2 0 002-2v-1", stroke: "white", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))),
          /*#__PURE__*/React.createElement("div", null,
            /*#__PURE__*/React.createElement("div", { style: { fontSize: 15, color: "#2C2923", marginBottom: 2 } }, "Restore from Backup"),
            /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, color: "#9E9184", fontFamily: "sans-serif" } }, "Load a previously exported JSON file"))),
        /*#__PURE__*/React.createElement("div", { style: { marginTop: 24, padding: "14px 16px", background: "#F0EBE3", borderRadius: 12 } },
          /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, color: "#9E9184", fontFamily: "sans-serif", lineHeight: 1.6 } },
            "⚠️ iOS tip: Export regularly and save to Files app. Data stored in home screen bookmarks can be lost if the bookmark is deleted."))),
      /*#__PURE__*/React.createElement("style", null, "* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } body { margin: 0; background: #F7F4EF; }"));
  }

  // ── Widget ─────────────────────────────────────────────────────────────────
  if (view === "widget") {
    const pct = state.habits.length === 0 ? 0 : getTodayDone(state.habits, state.completions) / state.habits.length * 100;
    return /*#__PURE__*/React.createElement("div", {
      style: S.widgetWrap
    }, /*#__PURE__*/React.createElement("div", {
      style: S.widgetCard
    }, /*#__PURE__*/React.createElement("div", {
      style: S.widgetHeader
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: S.widgetTitle
    }, "Today"), /*#__PURE__*/React.createElement("div", {
      style: S.widgetCount
    }, getTodayDone(state.habits, state.completions), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18,
        color: "#B5ADA5"
      }
    }, "/", state.habits.length))), /*#__PURE__*/React.createElement(Ring, {
      done: getTodayDone(state.habits, state.completions),
      total: state.habits.length,
      size: 56
    })), /*#__PURE__*/React.createElement("div", {
      style: S.widgetBar
    }, /*#__PURE__*/React.createElement("div", {
      style: S.widgetBarFill(pct)
    })), state.habits.map((habit, i) => {
      const done = !!state.completions[habit.id]?.[today];
      const goalProgress = habit.goal ? getGoalProgress(habit.id, state.completions, habit.goal) : null;
      const isLast = i === state.habits.length - 1;
      return /*#__PURE__*/React.createElement("div", {
        key: habit.id,
        style: {
          borderBottom: isLast ? "none" : "1px solid rgba(232,227,220,0.6)",
          paddingBottom: goalProgress ? 6 : 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 0",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent"
        },
        onClick: () => toggle(habit.id)
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: done ? habit.color : "transparent",
          border: `1.5px solid ${done ? habit.color : "#D4CEC7"}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)"
        }
      }, done && /*#__PURE__*/React.createElement(Check, {
        size: 10
      })), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          flexShrink: 0
        }
      }, habit.emoji), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          fontSize: 15,
          color: done ? "#B5ADA5" : "#2C2923",
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: "#C0B8AF",
          fontFamily: "'Palatino Linotype', Palatino, Georgia, serif"
        }
      }, habit.name), goalProgress && /*#__PURE__*/React.createElement(GoalArc, {
        pct: goalProgress.pct,
        color: habit.color,
        onTrack: goalProgress.onTrack,
        size: 22
      })), goalProgress && /*#__PURE__*/React.createElement("div", {
        style: {
          height: 2,
          background: "#EDE8E1",
          borderRadius: 1,
          overflow: "hidden",
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          width: `${Math.round(goalProgress.pct * 100)}%`,
          background: goalProgress.pct >= 1 ? habit.color : goalProgress.onTrack ? habit.color : "#C8B99A",
          borderRadius: 1,
          opacity: goalProgress.pct >= 1 ? 1 : 0.7,
          transition: "width 0.4s ease"
        }
      })));
    }), /*#__PURE__*/React.createElement("button", {
      style: S.widgetExpand,
      onClick: () => setView("main")
    }, "Open full view \u2192")));
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return /*#__PURE__*/React.createElement("div", {
    style: S.root
  }, /*#__PURE__*/React.createElement("div", {
    style: S.header
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: S.dateLabel
  }, dateStr), /*#__PURE__*/React.createElement("div", {
    style: S.todayLabel
  }, dayName)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: () => setView("week"),
    "aria-label": "Weekly review"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 20 20",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "14",
    height: "13",
    rx: "2",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 8h14",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 2v3M13 2v3",
    stroke: "#6B6259",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "12",
    r: "1",
    fill: "#6B6259"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "12",
    r: "1",
    fill: "#6B6259"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "13",
    cy: "12",
    r: "1",
    fill: "#6B6259"
  }))), /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: () => setView("widget"),
    "aria-label": "Widget view"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 20 20",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "7",
    height: "7",
    rx: "2",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "11",
    y: "2",
    width: "7",
    height: "7",
    rx: "2",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "11",
    width: "7",
    height: "7",
    rx: "2",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "11",
    y: "11",
    width: "7",
    height: "7",
    rx: "2",
    stroke: "#6B6259",
    strokeWidth: "1.5"
  }))), /*#__PURE__*/React.createElement("button", {
    style: S.iconBtn,
    onClick: () => setView("settings"),
    "aria-label": "Settings"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20", height: "20", viewBox: "0 0 20 20", fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "10", cy: "10", r: "2.5", stroke: "#6B6259", strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42",
    stroke: "#6B6259", strokeWidth: "1.5", strokeLinecap: "round"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: S.weekStrip
  }, last7.map(d => {
    const k = dateKey(d);
    const isToday = k === today;
    const doneForDay = dailyHabits.filter(h => state.completions[h.id]?.[k]).length;
    const fill = totalDaily === 0 ? 0 : doneForDay / totalDaily;
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      style: S.dayCol
    }, /*#__PURE__*/React.createElement("div", {
      style: S.dayLetter
    }, DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]), /*#__PURE__*/React.createElement("div", {
      style: S.dayDot(fill, isToday)
    }, doneForDay > 0 ? doneForDay : ""));
  })), /*#__PURE__*/React.createElement("div", {
    style: S.divider
  }), /*#__PURE__*/React.createElement("div", {
    style: S.sectionHead
  }, /*#__PURE__*/React.createElement("span", {
    style: S.sectionLabel
  }, "Daily"), /*#__PURE__*/React.createElement("button", {
    style: S.addBtn,
    onClick: () => setSheet({
      freq: "daily"
    }),
    "aria-label": "Add"
  }, "+")), /*#__PURE__*/React.createElement(SortableHabitList, {
    habits: dailyHabits,
    completions: state.completions,
    notes: state.notes,
    ratings: state.ratings,
    milestones: state.milestones,
    today: today,
    onToggle: toggle,
    onOpenHistory: setHistoryHabit,
    onEdit: setSheet,
    onOpenNote: openNote,
    onDispatch: dispatch,
    onMilestone: (habit, m) => {
      dispatch({
        type: "MARK_MILESTONE",
        habitId: habit.id,
        key: m.key
      });
      setMilestonePrompt({
        habit,
        milestone: m
      });
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.sectionHead,
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: S.sectionLabel
  }, "Weekly"), /*#__PURE__*/React.createElement("button", {
    style: S.addBtn,
    onClick: () => setSheet({
      freq: "weekly"
    }),
    "aria-label": "Add"
  }, "+")), /*#__PURE__*/React.createElement(SortableHabitList, {
    habits: weeklyHabits,
    completions: state.completions,
    notes: state.notes,
    ratings: state.ratings,
    milestones: state.milestones,
    today: today,
    onToggle: toggle,
    onOpenHistory: setHistoryHabit,
    onEdit: setSheet,
    onOpenNote: openNote,
    onDispatch: dispatch,
    onMilestone: (habit, m) => {
      dispatch({
        type: "MARK_MILESTONE",
        habitId: habit.id,
        key: m.key
      });
      setMilestonePrompt({
        habit,
        milestone: m
      });
    }
  }), pausedHabits.length > 0 && /*#__PURE__*/React.createElement(PausedSection, {
    habits: pausedHabits,
    onResume: id => dispatch({
      type: "RESUME_HABIT",
      id
    }),
    onEdit: setSheet,
    onOpenHistory: setHistoryHabit
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px 24px 0",
      fontSize: 12,
      color: "#C0B8AF",
      fontFamily: "sans-serif",
      textAlign: "center",
      lineHeight: 1.5
    }
  }, "Tap emoji to view history \xB7 Hold \u2261 to reorder"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "24px 24px 0",
      display: "flex",
      gap: 10,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => exportCSV(state),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 13,
      fontFamily: "sans-serif",
      color: "#8B7355",
      background: "rgba(139,115,85,0.08)",
      border: "1px solid rgba(139,115,85,0.2)",
      borderRadius: 20,
      padding: "8px 16px",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1v8M4 6l3 3 3-3M2 11h10",
    stroke: "#8B7355",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), "Export CSV")), sheet && /*#__PURE__*/React.createElement(HabitSheet, {
    habit: sheet?.id ? sheet : null,
    onSave: (habit, pauseEnabled, pauseNote) => {
      const wasPaused = !!sheet?.paused;
      const cleanHabit = {
        ...habit,
        freq: sheet?.freq || habit.freq
      };
      if (sheet?.id) {
        dispatch({
          type: "EDIT_HABIT",
          habit: cleanHabit
        });
        if (pauseEnabled && !wasPaused) dispatch({
          type: "PAUSE_HABIT",
          id: habit.id,
          note: pauseNote
        });else if (!pauseEnabled && wasPaused) dispatch({
          type: "RESUME_HABIT",
          id: habit.id
        });
      } else {
        dispatch({
          type: "ADD_HABIT",
          habit: cleanHabit
        });
      }
    },
    onDelete: id => dispatch({
      type: "REMOVE_HABIT",
      id
    }),
    onClose: () => setSheet(null)
  }), historyHabit && /*#__PURE__*/React.createElement(HistorySheet, {
    habit: state.habits.find(h => h.id === historyHabit.id) || historyHabit,
    completions: state.completions,
    notes: state.notes,
    ratings: state.ratings,
    milestones: state.milestones,
    onToggle: (habitId, date) => dispatch({
      type: "TOGGLE",
      habitId,
      date
    }),
    onSetNote: (habitId, date) => setNotePrompt({
      habitId,
      date
    }),
    onClose: () => setHistoryHabit(null)
  }), notePrompt && activeNoteHabit && /*#__PURE__*/React.createElement(NoteSheet, {
    habit: activeNoteHabit,
    date: notePrompt.date,
    existingNote: state.notes[notePrompt.habitId]?.[notePrompt.date] || "",
    existingRating: state.ratings[notePrompt.habitId]?.[notePrompt.date] || 0,
    onSave: text => dispatch({
      type: "SET_NOTE",
      habitId: notePrompt.habitId,
      date: notePrompt.date,
      note: text
    }),
    onSaveRating: rating => dispatch({
      type: "SET_RATING",
      habitId: notePrompt.habitId,
      date: notePrompt.date,
      rating
    }),
    onClose: () => setNotePrompt(null)
  }), milestonePrompt && /*#__PURE__*/React.createElement(MilestoneSheet, {
    habit: milestonePrompt.habit,
    milestone: milestonePrompt.milestone,
    onClose: () => {
      setMilestonePrompt(null);
      openNote(milestonePrompt.habit.id, today);
    }
  }), /*#__PURE__*/React.createElement("style", null, `
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        body { margin: 0; background: #F7F4EF; }
        input::placeholder, textarea::placeholder { color: #C0B8AF; }
        input:focus, textarea:focus { border-color: #C0B0A0 !important; background: #FAF8F4 !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `));
}


// ─── Mount ────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(HabitTracker));

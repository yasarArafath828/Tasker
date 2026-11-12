<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  getCheckList,
  getResult,
  checklistVersion,
  resultVersion,
} from "../essentials/checklist.js";

const checklists = ref([]);
const results = ref([]);
const selectedView = ref("checklists");

const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const emit = defineEmits(["open-history"]);

function openHistory(status) {
  emit("open-history", status);
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getStatus(checklistId, taskId, scheduledDate) {
  return (
    results.value.find(
      (result) =>
        result.checklistId === checklistId &&
        result.taskId === taskId &&
        result.scheduledDate === scheduledDate
    )?.status || null
  );
}

function isScheduled(checklist, date) {
  const key = dateKey(date);

  if (!checklist.startDate || key < checklist.startDate) return false;
  if (checklist.endDate && key > checklist.endDate) return false;

  return Boolean(checklist.notificationDays?.[weekdayKeys[date.getDay()]]);
}

function getOccurrences(checklist, fromDate, toDate) {
  const occurrences = [];
  if (!checklist.startDate) return occurrences;

  const start = parseDate(checklist.startDate);
  const first = new Date(Math.max(start.getTime(), fromDate.getTime()));

  for (const date = first; date <= toDate; date.setDate(date.getDate() + 1)) {
    if (!isScheduled(checklist, date)) continue;

    const scheduledDate = dateKey(date);

    for (const task of checklist.tasks || []) {
      if (!task.id || !task.name || !task.notificationTime) continue;

      const [hours, minutes] = task.notificationTime.split(":").map(Number);

      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Count only tasks whose scheduled time has passed.
      if (scheduledAt > toDate) continue;

      const savedStatus = getStatus(checklist.id, task.id, scheduledDate);

      // An unanswered task whose time has passed is unfinished.
      const status =
        savedStatus || (scheduledDate < dateKey(now.value) ? "missed" : "pending");

      occurrences.push({
        checklistId: checklist.id,
        checklistName: checklist.name,
        taskId: task.id,
        taskName: task.name,
        scheduledDate,
        time: task.notificationTime,
        status,
      });
    }
  }

  return occurrences;
}

const now = ref(new Date());

const occurrences = computed(() => {
  const currentTime = now.value;

  return checklists.value.flatMap((checklist) => {
    if (!checklist.startDate) return [];

    return getOccurrences(checklist, parseDate(checklist.startDate), currentTime);
  });
});

function summarize(items) {
  const done = items.filter((item) => item.status === "done").length;
  const nope = items.filter((item) => item.status === "nope").length;
  const later = items.filter((item) => item.status === "later").length;
  const missed = items.filter((item) => item.status === "missed").length;
  const pending = items.filter((item) => item.status === "pending").length;
  const total = items.length;

  return {
    done,
    nope,
    later,
    missed,
    pending,
    total,
    score: total ? Math.round((done / total) * 100) : 0,
  };
}

const overall = computed(() => summarize(occurrences.value));

const checklistStats = computed(() =>
  checklists.value.map((checklist) => {
    const items = occurrences.value.filter((item) => item.checklistId === checklist.id);

    return {
      id: checklist.id,
      name: checklist.name,
      ...summarize(items),
    };
  })
);

const taskStats = computed(() => {
  const grouped = new Map();

  for (const item of occurrences.value) {
    const key = `${item.checklistId}:${item.taskId}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: item.taskName,
        checklistName: item.checklistName,
        items: [],
      });
    }

    grouped.get(key).items.push(item);
  }

  return [...grouped.values()]
    .map((task) => ({
      ...task,
      ...summarize(task.items),
    }))
    .sort((a, b) => b.total - a.total);
});

const lastSevenDays = computed(() => {
  const today = now.value;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    const key = dateKey(date);
    const items = occurrences.value.filter((item) => item.scheduledDate === key);

    const done = items.filter((item) => item.status === "done").length;

    return {
      key,
      label: date.toLocaleDateString(undefined, {
        weekday: "short",
      }),
      done,
      total: items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  });
});

function statusLabel(status) {
  return (
    {
      done: "Done",
      nope: "Skipped",
      later: "Later",
      missed: "Missed",
      pending: "Unfinished",
    }[status] || status
  );
}

function refreshDashboardData() {
  checklists.value = getCheckList();
  results.value = getResult();
  now.value = new Date();
}

onMounted(refreshDashboardData);

watch([checklistVersion, resultVersion], refreshDashboardData);
</script>

<template>
  <main class="dashboard">
    <header class="dashboard-header">
      <div>
        <p class="eyebrow">YOUR PROGRESS</p>
        <h2>Performance Dashboard</h2>
        <p class="subtitle">Track your consistency and achievements.</p>
      </div>
    </header>

    <section class="score-card">
      <div class="score-copy">
        <span>Overall performance</span>
        <strong>{{ overall.score }}%</strong>
        <small>{{ overall.done }} completed out of {{ overall.total }} due tasks</small>
      </div>

      <div
        class="score-ring"
        :style="{ '--score': `${overall.score}%` }"
        role="img"
        :aria-label="`Performance score ${overall.score}%`"
      >
        <span>{{ overall.score }}%</span>
      </div>
    </section>

    <section class="stats-grid">
      <article
        class="stat-card done-stat"
        role="button"
        tabindex="0"
        @click="openHistory('done')"
        @keydown.enter="openHistory('done')"
      >
        <span>Completed</span>
        <strong>{{ overall.done }}</strong>
      </article>

      <article
        class="stat-card missed-stat"
        role="button"
        tabindex="0"
        @click="openHistory('missed')"
        @keydown.enter="openHistory('missed')"
      >
        <span>Missed</span>
        <strong>{{ overall.missed }}</strong>
      </article>

      <article
        class="stat-card skipped-stat"
        role="button"
        tabindex="0"
        @click="openHistory('nope')"
        @keydown.enter="openHistory('nope')"
      >
        <span>Skipped</span>
        <strong>{{ overall.nope }}</strong>
      </article>

      <article
        class="stat-card pending-stat"
        role="button"
        tabindex="0"
        @click="openHistory('unfinished')"
        @keydown.enter="openHistory('unfinished')"
      >
        <span>Unfinished</span>
        <strong>{{ overall.pending + overall.later }}</strong>
      </article>
    </section>

    <section class="panel">
      <h3>Last 7 days</h3>
      <p class="panel-description">Completed tasks by day</p>

      <div class="weekly-chart">
        <div v-for="day in lastSevenDays" :key="day.key" class="chart-column">
          <strong>{{ day.done }}</strong>
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{
                height: `${day.percent}%`,
                minHeight: day.done ? '4px' : '0',
              }"
            ></div>
          </div>
          <span>{{ day.label }}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h3>Performance breakdown</h3>
        <div class="view-switch">
          <button
            :class="{ active: selectedView === 'checklists' }"
            @click="selectedView = 'checklists'"
          >
            Checklists
          </button>
          <button
            :class="{ active: selectedView === 'tasks' }"
            @click="selectedView = 'tasks'"
          >
            Tasks
          </button>
        </div>
      </div>

      <template v-if="selectedView === 'checklists'">
        <p v-if="!checklistStats.length" class="empty">No due tasks to measure yet.</p>

        <article v-for="item in checklistStats" :key="item.id" class="performance-row">
          <div class="row-top">
            <strong>{{ item.name }}</strong>
            <span>{{ item.score }}%</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${item.score}%` }"></div>
          </div>

          <small>{{ item.done }} / {{ item.total }} completed</small>
        </article>
      </template>

      <template v-else>
        <p v-if="!taskStats.length" class="empty">No task history to display yet.</p>

        <article v-for="task in taskStats" :key="task.id" class="performance-row">
          <div class="row-top">
            <strong>{{ task.name }}</strong>
            <span>{{ task.score }}%</span>
          </div>

          <small>{{ task.checklistName }}</small>

          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${task.score}%` }"></div>
          </div>

          <small>{{ task.done }} / {{ task.total }} completed</small>
        </article>
      </template>
    </section>

    <p class="footnote">
      Performance is based on scheduled tasks whose notification time has passed. Future
      tasks are excluded.
    </p>
  </main>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 0;
  margin-bottom: 0;
  color: #fff;
  background: #000;
}

.dashboard-header {
  padding: 8px 2px;
}

.eyebrow {
  color: #8b9de0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.5px;
  margin: 0 0 6px;
}

.dashboard-header h2 {
  font-size: 23px;
  margin: 0 0 6px;
  color: #fff;
}

.subtitle,
.panel-description {
  margin: 0;
  font-size: 12px;
  color: #aaa;
}

/* Overall performance score */
.score-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: 18px;
  background: #1c1c1c;
  border: 1px solid #383838;
  color: #fff;
}

.score-copy {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.score-copy span {
  font-size: 13px;
  color: #ccc;
}

.score-copy strong {
  font-size: 38px;
  line-height: 1.1;
  color: #fff;
}

.score-copy small {
  font-size: 11px;
  color: #aaa;
}

.score-ring {
  width: 82px;
  height: 82px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#8b9de0 var(--score), #444 var(--score));
  position: relative;
}

.score-ring::before {
  content: "";
  position: absolute;
  inset: 6px;
  background: #1c1c1c;
  border-radius: 50%;
}

.score-ring span {
  position: relative;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
}

/* Statistics cards */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px;
  border: 1px solid #383838;
  border-radius: 13px;
  background: #1c1c1c;
  color: #fff;
}

.stat-card span {
  color: #bbb;
  font-size: 12px;
}

.stat-card strong {
  font-size: 24px;
  color: #fff;
}

.stat-card {
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.stat-card:active {
  transform: scale(0.97);
  border-color: #7187d0;
}

.stat-card:focus-visible {
  outline: 2px solid #8b9de0;
  outline-offset: 3px;
}

.done-stat strong {
  color: #4dcc91;
}

.missed-stat strong {
  color: #ff7070;
}

.skipped-stat strong {
  color: #aaa;
}

.pending-stat strong {
  color: #e6b65c;
}

/* Dashboard panels */
.panel {
  padding: 16px;
  border: 1px solid #383838;
  border-radius: 15px;
  background: #1c1c1c;
  color: #fff;
}

.panel h3 {
  font-size: 15px;
  margin: 0 0 6px;
  color: #fff;
}

/* Weekly chart */
.weekly-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  height: 145px;
  padding-top: 16px;
}

.chart-column {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.chart-column strong {
  font-size: 10px;
  color: #eee;
}

.chart-column span {
  font-size: 10px;
  color: #aaa;
}

.bar-track {
  width: 100%;
  max-width: 24px;
  height: 88px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  border-radius: 6px;
  background: #383838;
}

.bar-fill {
  width: 100%;
  background: #7187d0;
  border-radius: 6px;
  transition: height 0.2s ease;
}

/* Checklist/task performance heading */
.panel-heading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.view-switch {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.view-switch button {
  border: 1px solid #444;
  border-radius: 8px;
  padding: 7px 12px;
  background: #292929;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
}

.view-switch button.active {
  background: #5c70b0;
  color: #fff;
  border-color: #5c70b0;
}

/* Individual performance rows */
.performance-row {
  padding: 12px 0;
  border-bottom: 1px solid #383838;
}

.performance-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.row-top strong {
  font-size: 13px;
  color: #f5f5f5;
  overflow-wrap: anywhere;
}

.row-top span {
  color: #9aabf0;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}

.progress-track {
  height: 7px;
  background: #383838;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: #7187d0;
  border-radius: 10px;
}

.performance-row small {
  color: #aaa;
  font-size: 11px;
}

/* Empty states and notes */
.empty {
  text-align: center;
  padding: 20px 8px;
  color: #aaa;
  font-size: 12px;
}

.footnote {
  color: #999;
  font-size: 11px;
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 360px) {
  .score-card {
    padding: 14px;
  }

  .score-copy strong {
    font-size: 32px;
  }

  .score-ring {
    width: 68px;
    height: 68px;
  }

  .stats-grid {
    gap: 8px;
  }

  .stat-card {
    padding: 11px;
  }
}
</style>

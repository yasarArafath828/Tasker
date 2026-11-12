<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  getCheckList,
  getResult,
  setResult,
  checklistVersion,
  resultVersion,
} from "../essentials/checklist.js";
import { cancelTaskNotification } from "../essentials/notification.js";

const checklists = ref([]);
const results = ref([]);
const loading = ref(true);
const error = ref("");
const showUpNext = ref(true);
const showCompleted = ref(true);
const showSkipped = ref(true);

const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

function resultFor(checklistId, taskId, date) {
  return results.value.find(
    (result) =>
      result.checklistId === checklistId &&
      result.taskId === taskId &&
      result.scheduledDate === date
  );
}

function isScheduledForDay(checklist, date) {
  if (!checklist.startDate || date < checklist.startDate) {
    return false;
  }

  if (checklist.endDate && date > checklist.endDate) {
    return false;
  }

  const day = parseDate(date);
  return Boolean(checklist.notificationDays?.[weekdayKeys[day.getDay()]]);
}

function saveStatus(checklist, task, date, status) {
  const result = {
    checklistId: checklist.id,
    taskId: task.id,
    scheduledDate: date,
    status,
    updatedAt: new Date().toISOString(),
  };

  const index = results.value.findIndex(
    (item) =>
      item.checklistId === checklist.id &&
      item.taskId === task.id &&
      item.scheduledDate === date
  );

  const next = [...results.value];

  if (index >= 0) {
    next[index] = result;
  } else {
    next.push(result);
  }

  results.value = next;
  setResult(next);
}

async function markTask(item, status) {
  error.value = "";

  try {
    // Save the choice first so it remains recorded if cancellation fails.
    saveStatus(item.checklist, item.task, today.value, status);

    await cancelTaskNotification(item.checklist.id, item.task.id, today.value);
  } catch (err) {
    console.error("Unable to cancel task notification:", err);
    error.value = "Your choice was saved, but the reminder could not be canceled.";
  }
}

const today = ref(dateKey(new Date()));

const todayItems = computed(() => {
  const items = [];

  for (const checklist of checklists.value) {
    if (!isScheduledForDay(checklist, today.value)) continue;

    for (const task of checklist.tasks || []) {
      if (!task.id || !task.name || !task.notificationTime) continue;

      const result = resultFor(checklist.id, task.id, today.value);

      items.push({
        checklist,
        task,
        time: task.notificationTime,
        status: result?.status || "pending",
      });
    }
  }

  return items.sort((a, b) => a.time.localeCompare(b.time));
});

const completedItems = computed(() =>
  todayItems.value.filter((item) => item.status === "done")
);

const pendingItems = computed(() =>
  todayItems.value.filter((item) => item.status === "pending")
);

const skippedItems = computed(() =>
  todayItems.value.filter((item) => item.status === "nope")
);

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function markPreviousTasksMissed() {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  const next = [...results.value];

  for (const checklist of checklists.value) {
    if (!checklist.startDate) continue;

    const start = parseDate(checklist.startDate);
    const end = checklist.endDate ? parseDate(checklist.endDate) : yesterday;

    const finalDate = new Date(Math.min(end.getTime(), yesterday.getTime()));

    for (const day = new Date(start); day <= finalDate; day.setDate(day.getDate() + 1)) {
      const scheduledDate = dateKey(day);

      if (!isScheduledForDay(checklist, scheduledDate)) continue;

      for (const task of checklist.tasks || []) {
        if (!task.id || !task.name || !task.notificationTime) continue;

        const exists = next.some(
          (result) =>
            result.checklistId === checklist.id &&
            result.taskId === task.id &&
            result.scheduledDate === scheduledDate
        );

        if (exists) continue;

        const [hours, minutes] = task.notificationTime.split(":").map(Number);

        const scheduledAt = new Date(day);
        scheduledAt.setHours(hours, minutes, 0, 0);

        // Don't mark tasks missed if their scheduled time hasn't passed.
        if (scheduledAt > now) continue;

        next.push({
          checklistId: checklist.id,
          taskId: task.id,
          scheduledDate,
          status: "missed",
          updatedAt: now.toISOString(),
        });
      }
    }
  }

  results.value = next;
  setResult(next);
}

function refreshTaskData() {
  checklists.value = getCheckList();
  results.value = getResult();
}

watch([checklistVersion, resultVersion], refreshTaskData);

onMounted(() => {
  try {
    checklists.value = getCheckList();
    results.value = getResult();

    markPreviousTasksMissed();
  } catch (err) {
    console.error(err);
    error.value = "Unable to load today's tasks.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="today-panel">
    <div class="panel-header">
      <div>
        <h2>Today's Tasks</h2>
        <p>{{ today }}</p>
      </div>
      <span class="task-count">{{ pendingItems.length }} remaining</span>
    </div>

    <p v-if="loading" class="empty">Loading tasks...</p>

    <p v-else-if="!todayItems.length" class="empty">
      No tasks scheduled for today. Enjoy your day!
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- Up next -->
    <template v-if="pendingItems.length">
      <button
        class="section-heading"
        @click="showUpNext = !showUpNext"
        :aria-expanded="showUpNext"
      >
        <span>Up next ({{ pendingItems.length }})</span>
        <span class="arrow">{{ showUpNext ? '⌃' : '⌄' }}</span>
      </button>

      <div v-if="showUpNext">
        <div
          v-for="item in pendingItems"
          :key="`${item.checklist.id}-${item.task.id}`"
          class="task-card"
        >
          <div class="task-info">
            <span class="task-time">{{ formatTime(item.time) }}</span>
            <strong>{{ item.task.name }} - {{ item.checklist.name }}</strong>
          </div>

          <div class="actions">
            <button class="done-btn" @click="markTask(item, 'done')">
              Done
            </button>
            <button class="nope-btn" @click="markTask(item, 'nope')">
              Nope
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Completed -->
    <template v-if="completedItems.length">
      <button
        class="section-heading"
        @click="showCompleted = !showCompleted"
        :aria-expanded="showCompleted"
      >
        <span>Completed ({{ completedItems.length }})</span>
        <span class="arrow">{{ showCompleted ? '⌃' : '⌄' }}</span>
      </button>

      <div v-if="showCompleted">
        <div
          v-for="item in completedItems"
          :key="`${item.checklist.id}-${item.task.id}`"
          class="task-card completed"
        >
          <div class="task-info">
            <span class="task-time">{{ formatTime(item.time) }}</span>
            <strong>{{ item.task.name }} - {{ item.checklist.name }}</strong>
          </div>
          <span class="status">Done ✓</span>
        </div>
      </div>
    </template>

    <!-- Skipped -->
    <template v-if="skippedItems.length">
      <button
        class="section-heading"
        @click="showSkipped = !showSkipped"
        :aria-expanded="showSkipped"
      >
        <span>Skipped ({{ skippedItems.length }})</span>
        <span class="arrow">{{ showSkipped ? '⌃' : '⌄' }}</span>
      </button>

      <div v-if="showSkipped">
        <div
          v-for="item in skippedItems"
          :key="`${item.checklist.id}-${item.task.id}`"
          class="task-card skipped"
        >
          <div class="task-info">
            <span class="task-time">{{ formatTime(item.time) }}</span>
            <strong>{{ item.task.name }} - {{ item.checklist.name }}</strong>
          </div>
          <span class="status">Nope</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.today-panel {
  margin: 8px 0 24px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

h2 {
  margin: 0 0 4px;
  font-size: 22px;
}

.panel-header p {
  margin: 0;
  color: #777;
  font-size: 12px;
}

.task-count {
  background: #edf0fa;
  color: #465c9a;
  border-radius: 20px;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}


/* Left-align task time and task details */
.task-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  flex: 1;
  text-align: left;
}

.task-time {
  display: block;
  align-self: flex-start;
  text-align: left;
  margin: 0;
  line-height: 1.2;
}

.task-info strong {
  display: block;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
  font-size: 13px;
  color: #fff;
}

/* Collapsible section heading */
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 10px;
  margin: 12px 0 7px;
  background: #292929;
  border: 1px solid #484848;
  border-radius: 8px;
  color: #e8e8e8;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.section-heading:active {
  background: #353535;
}

.arrow {
  font-size: 19px;
  line-height: 1;
  color: #c4c4c4;
  margin-left: 10px;
}


.section-title {
  margin: 16px 0 8px;
  font-size: 14px;
  color: #666;
}

/* Compact completed and skipped task cards */
.task-card.completed,
.task-card.skipped {
  padding: 4px 8px;
  margin-bottom: 3px;
  border-radius: 6px;
  gap: 4px;
}

.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  margin-bottom: 4px;
  border: 1px solid #e7e9ef;
  border-radius: 12px;
  background: rgb(61, 61, 61);
}

.actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.actions button {
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  color: white;
  cursor: pointer;
}

.done-btn {
  background: #26865d;
}

.nope-btn {
  background: #777;
}

.completed {
  background: #e9fff2;
  border-color: #ccebd8;
}

/* Reduce text spacing and size */
.completed .task-info,
.skipped .task-info {
  gap: 2px;
}

.completed .task-info strong,
.skipped .task-info strong {
  font-size: 12px;
  font-weight: 500;
  color: #777;
}

.completed .task-time,
.skipped .task-time {
  font-size: 10px;
}

.skipped {
  background: #ffe3e2;
  border-color: #e8e8e8;
}

.status {
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  color: #26865d;
}

.skipped .status {
  color: #777;
}

.empty {
  padding: 18px;
  background: #f8fafc;
  border-radius: 12px;
  color: #777;
  text-align: center;
  font-size: 13px;
}

.error {
  color: #b42318;
  font-size: 12px;
}
</style>

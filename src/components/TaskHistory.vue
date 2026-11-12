<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  getCheckList,
  getResult,
  setResult,
  checklistVersion,
  resultVersion,
} from "../essentials/checklist.js";

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
});

const checklists = ref([]);
const results = ref([]);
const editingId = ref(null);

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

const today = ref(dateKey(new Date()));

function refreshData() {
  checklists.value = getCheckList();
  results.value = getResult();
  today.value = dateKey(new Date());
}

function isScheduled(checklist, date) {
  const key = dateKey(date);

  if (!checklist.startDate || key < checklist.startDate) return false;
  if (checklist.endDate && key > checklist.endDate) return false;

  return Boolean(checklist.notificationDays?.[weekdayKeys[date.getDay()]]);
}

function getSavedStatus(checklistId, taskId, scheduledDate) {
  return results.value.find(
    (result) =>
      result.checklistId === checklistId &&
      result.taskId === taskId &&
      result.scheduledDate === scheduledDate
  )?.status;
}

const allTasks = computed(() => {
  const items = [];
  const now = new Date();

  for (const checklist of checklists.value) {
    if (!checklist.startDate) continue;

    const start = parseDate(checklist.startDate);

    for (const date = new Date(start); date <= now; date.setDate(date.getDate() + 1)) {
      if (!isScheduled(checklist, date)) continue;

      const scheduledDate = dateKey(date);

      for (const task of checklist.tasks || []) {
        if (!task.id || !task.name?.trim() || !task.notificationTime) {
          continue;
        }

        const [hours, minutes] = task.notificationTime.split(":").map(Number);

        const scheduledAt = new Date(date);
        scheduledAt.setHours(hours, minutes, 0, 0);

        // Future tasks should never appear in history.
        if (scheduledAt > now) continue;

        const savedStatus = getSavedStatus(checklist.id, task.id, scheduledDate);

        // Previous days with no saved response are missed.
        // Today's unanswered tasks remain unfinished.
        const status =
          savedStatus || (scheduledDate < today.value ? "missed" : "pending");

        items.push({
          id: `${checklist.id}:${task.id}:${scheduledDate}`,
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
  }

  return items.sort((a, b) => {
    const dateComparison = b.scheduledDate.localeCompare(a.scheduledDate);

    if (dateComparison !== 0) return dateComparison;

    return a.time.localeCompare(b.time);
  });
});

const filteredTasks = computed(() => {
  if (props.status === "unfinished") {
    return allTasks.value.filter((item) => ["pending", "later"].includes(item.status));
  }

  return allTasks.value.filter((item) => item.status === props.status);
});

const groupedTasks = computed(() => {
  const groups = new Map();

  for (const item of filteredTasks.value) {
    if (!groups.has(item.scheduledDate)) {
      groups.set(item.scheduledDate, []);
    }

    groups.get(item.scheduledDate).push(item);
  }

  return [...groups.entries()].map(([date, tasks]) => ({
    date,
    label: formatDate(date),
    tasks,
  }));
});

function formatDate(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  return (
    {
      done: "Completed",
      nope: "Skipped",
      missed: "Missed",
      pending: "Unfinished",
      later: "Later",
    }[status] || status
  );
}

function startEditing(item) {
  if (item.status !== "missed") return;
  editingId.value = item.id;
}

function updateMissedTask(item, newStatus) {
  if (item.status !== "missed" || !["done", "nope"].includes(newStatus)) {
    return;
  }

  const next = [...results.value];

  const index = next.findIndex(
    (result) =>
      result.checklistId === item.checklistId &&
      result.taskId === item.taskId &&
      result.scheduledDate === item.scheduledDate
  );

  const updatedResult = {
    checklistId: item.checklistId,
    taskId: item.taskId,
    scheduledDate: item.scheduledDate,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    next[index] = updatedResult;
  } else {
    next.push(updatedResult);
  }

  results.value = next;
  setResult(next);

  editingId.value = null;
}

onMounted(refreshData);

watch([checklistVersion, resultVersion], refreshData);
</script>

<template>
  <main class="history-page">
    <header class="history-header">
      <div>
        <p class="eyebrow">YOUR PROGRESS</p>
        <h2>{{ statusLabel(status) }} Tasks</h2>
        <p class="subtitle">Your task history, newest first.</p>
      </div>
    </header>

    <div v-if="!groupedTasks.length" class="empty">
      No {{ statusLabel(status).toLowerCase() }} tasks to display.
    </div>

    <section v-for="group in groupedTasks" :key="group.date" class="date-group">
      <h3 class="date-heading">{{ group.label }}</h3>

      <article v-for="item in group.tasks" :key="item.id" class="history-card">
        <div class="task-info">
          <span class="task-time">{{ formatTime(item.time) }}</span>
          <strong>{{ item.taskName }} - {{ item.checklistName }}</strong>
        </div>

        <div class="task-actions">
          <span class="status" :class="item.status">
            {{ statusLabel(item.status) }}
          </span>

          <template v-if="item.status === 'missed'">
            <button
              v-if="editingId !== item.id"
              class="edit-button"
              @click="startEditing(item)"
              aria-label="Edit missed task"
              title="Edit"
            >
              <Icon icon="mdi:pencil-outline" />
            </button>

            <div v-else class="edit-actions">
              <button class="done-button" @click="updateMissedTask(item, 'done')">
                Done
              </button>

              <button class="skip-button" @click="updateMissedTask(item, 'nope')">
                Skipped
              </button>

              <button class="cancel-button" @click="editingId = null">Cancel</button>
            </div>
          </template>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #fff;
  background: #000;
  padding-bottom: 16px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 2px;
  width: 100%;
  box-sizing: border-box;
}

.history-header > div {
  width: 100%;
}

.back-button {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid #444;
  border-radius: 9px;
  background: #292929;
  color: #fff;
  font-size: 25px;
  cursor: pointer;
}

.eyebrow {
  color: #8b9de0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.5px;
  margin: 0 0 5px;
}

.history-header h2 {
  margin: 0 0 5px;
  font-size: 21px;
}

.subtitle {
  margin: 0;
  color: #aaa;
  font-size: 12px;
}

.date-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-heading {
  margin: 0;
  padding: 5px 2px;
  color: #9aabf0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.history-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  margin-bottom: 4px;
  border: 1px solid #383838;
  border-radius: 12px;
  background: rgb(61, 61, 61);
  box-sizing: border-box;
}

.task-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  flex: 1;
  text-align: left;
}

.task-time,
.task-info small {
  color: #aaa;
  font-size: 11px;
}

.task-info strong {
  display: block;
  width: 100%;
  text-align: left;
  color: #f5f5f5;
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.task-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
  flex-shrink: 0;
}

.status {
  font-size: 11px;
  font-weight: 700;
}

.status.done {
  color: #4dcc91;
}

.status.nope {
  color: #aaa;
}

.status.missed {
  color: #ff7070;
}

.status.pending,
.status.later {
  color: #e6b65c;
}

.edit-button,
.done-button,
.skip-button,
.cancel-button {
  border: 0;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.edit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  padding: 0;
  border: 1px solid #5c70b0;
  border-radius: 7px;
  background: #5c70b0;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.edit-button :deep(svg) {
  font-size: 16px;
}

.edit-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
  max-width: 190px;
}

.done-button {
  background: #26865d;
  color: white;
}

.skip-button {
  background: #666;
  color: white;
}

.cancel-button {
  background: #383838;
  color: #ddd;
}

.empty {
  padding: 25px 12px;
  border-radius: 12px;
  background: #1c1c1c;
  color: #aaa;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 360px) {
  .history-card {
    padding: 10px;
  }

  .edit-actions {
    max-width: 130px;
  }
}
</style>

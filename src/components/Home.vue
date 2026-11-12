<script setup>
import { ref, watch } from "vue";
import { v4 as uuidv4 } from "uuid";
import { Icon } from "@iconify/vue";
import { getCheckList, setCheckList, checklistVersion } from "../essentials/checklist.js";
import {
  scheduleChecklistNotifications,
  rescheduleChecklistNotifications,
  cancelChecklistNotifications,
} from "../essentials/notification.js";
import TodayTasks from "../components/TodayTasks.vue";
import PerformanceDashboard from "../components/PerformanceDashboard.vue";
import TaskHistory from "../components/TaskHistory.vue";

const checklist = ref({
  id: "",
  name: "",
  startDate: "",
  endDate: "",
  notificationDays: {
    mon: false,
    tue: false,
    wed: false,
    thu: false,
    fri: false,
    sat: false,
    sun: false,
  },
});
const tasks = ref([
  {
    id: uuidv4(),
    name: "",
    notificationTime: "",
  },
]);

const isAdd = ref(false);
const isEdit = ref(false);
const isDashboard = ref(false);
const isHistory = ref(false);
const selectedHistoryStatus = ref("");

const mainChecklist = ref(getCheckList());

function notificationDaysEmpty(notificationDays) {
  return !Object.values(notificationDays).some((day) => day);
}

function openTaskHistory(status) {
  selectedHistoryStatus.value = status;
  isHistory.value = true;
}

function goBack() {
  if (isHistory.value) {
    isHistory.value = false;
    selectedHistoryStatus.value = "";
    return;
  }

  isDashboard.value = false;
  isAdd.value = false;
  isEdit.value = false;

  setDefaultChecklist();
  setDefaultTask();
}

function saveCheckList() {
  if (notificationDaysEmpty(checklist.value.notificationDays)) {
    alert("Please select at least one day");
    return;
  }
  if (isAdd.value) {
    addChecklist();
  } else if (isEdit.value) {
    updateChecklist();
  }
}

function addChecklist() {
  const newChecklist = {
    ...checklist.value,
    id: uuidv4(),
    tasks: tasks.value.map((task) => ({
      ...task,
      id: task.id || uuidv4(),
    })),
  };

  mainChecklist.value.push(newChecklist);
  setCheckList(mainChecklist.value);

  scheduleChecklistNotifications(newChecklist);

  setDefaultChecklist();
  setDefaultTask();
  isAdd.value = false;
}

async function updateChecklist() {
  const index = mainChecklist.value.findIndex((item) => item.id === checklist.value.id);

  if (index === -1) return;

  const updatedChecklist = {
    ...checklist.value,
    tasks: tasks.value.map((task) => ({
      ...task,
      id: task.id || uuidv4(),
    })),
  };

  mainChecklist.value[index] = updatedChecklist;
  setCheckList(mainChecklist.value);

  await rescheduleChecklistNotifications(updatedChecklist);

  isEdit.value = false;
  setDefaultChecklist();
  setDefaultTask();
}

function add() {
  isAdd.value = true;
}

function setDefaultChecklist() {
  checklist.value = {
    id: "",
    name: "",
    startDate: "",
    endDate: "",
    notificationDays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  };
}

function editChecklist(item) {
  checklist.value = {
    ...item,
    notificationDays: { ...item.notificationDays },
  };
  tasks.value = [...item.tasks];
  isEdit.value = true;
}

async function deleteChecklist(id) {
  const confirmed = window.confirm(
    "Are you sure you want to delete this checklist? This action cannot be undone."
  );

  if (!confirmed) return;

  try {
    await cancelChecklistNotifications(id);

    mainChecklist.value = mainChecklist.value.filter(
      (item) => item.id !== id
    );

    setCheckList(mainChecklist.value);
  } catch (error) {
    console.error("Unable to delete checklist:", error);
    alert("Unable to delete checklist. Please try again.");
  }
}

function openPicker(event) {
  if (event.target.showPicker) {
    event.target.showPicker();
  }
}

function setDefaultTask() {
  tasks.value = [
    {
      id: uuidv4(),
      name: "",
      notificationTime: "",
    },
  ];
}

watch(checklistVersion, () => {
  mainChecklist.value = getCheckList();
});

watch(
  () => checklist.value.startDate,
  (newStartDate) => {
    const endDate = checklist.value.endDate;

    if (endDate && newStartDate && endDate < newStartDate) {
      checklist.value.endDate = "";
    }
  }
);
</script>
<template>
  <main class="mainClass">
    <div class="header">
      <button
        v-if="isAdd || isEdit || isDashboard || isHistory"
        class="back-button"
        @click="goBack"
      >
        <Icon icon="mdi:arrow-left" />
      </button>

      <button
        v-if="!isAdd && !isEdit && !isDashboard && mainChecklist.length > 0"
        class="dashboard-button"
        aria-label="View performance dashboard"
        title="Performance dashboard"
        @click="isDashboard = true"
      >
        <Icon icon="mdi:chart-box-outline" />
      </button>

      <h1>Task Tracker</h1>
      <p>Manage your tasks efficiently</p>
    </div>
    <PerformanceDashboard
      v-if="isDashboard && !isHistory"
      @open-history="openTaskHistory"
    />

    <TaskHistory v-if="isHistory" :status="selectedHistoryStatus" @back="goBack" />
    <div v-if="!isAdd && !isEdit && !isDashboard" class="checklist-container">
      <!-- Show today's tasks only if checklists exist -->
      <TodayTasks v-if="mainChecklist.length > 0" />

      <h2>My Checklists</h2>

      <div v-if="mainChecklist.length === 0" class="empty-state">
        Start creating checklists ✨
      </div>

      <div v-else class="checklist-list">
        <div v-for="item in mainChecklist" :key="item.id" class="checklist-card">
          <span class="checklist-icon">
            <Icon icon="boxicons:dashboard" />
          </span>

          <span class="checklist-name" @click="editChecklist(item)">
            {{ item.name }}
          </span>

          <div class="checklist-actions">
            <Icon
              icon="mdi:delete-outline"
              class="delete-icon"
              @click.stop="deleteChecklist(item.id)"
            />
          </div>

          <span class="checklist-arrow">›</span>
        </div>
      </div>
    </div>
    <form v-if="isAdd || isEdit" @submit.prevent="saveCheckList">
      <label> Checklist Name: </label>
      <input v-model="checklist.name" placeholder="Checklist Name" required />
      <label> Start Date: </label>
      <input type="date" v-model="checklist.startDate" required @click="openPicker" />
      <label> End Date (optional): </label>
      <input
        type="date"
        v-model="checklist.endDate"
        :min="checklist.startDate"
        :disabled="!checklist.startDate"
        @click="openPicker"
      />
      <div class="notification-days">
        <label v-for="day in Object.keys(checklist.notificationDays)" :key="day">
          <input type="checkbox" v-model="checklist.notificationDays[day]" />
          {{ day }}
        </label>
      </div>
      <div class="task-section">
        <div v-for="(task, index) in tasks" :key="task.id" class="task-row">
          <span class="task-number">{{ index + 1 }}</span>

          <div class="task-fields">
            <input
              v-model="task.name"
              placeholder="Task name"
              aria-label="Task name"
              required
            />

            <input
              type="time"
              v-model="task.notificationTime"
              @click="openPicker"
              aria-label="Notification time"
              required
            />
            <Icon
              icon="mdi:delete"
              @click="tasks.length > 1 ? tasks.splice(index, 1) : null"
              style="cursor: pointer; color: #ff4d4f"
            />
          </div>
        </div>

        <button
          type="button"
          class="add-task-btn"
          @click="
            tasks.push({
              id: uuidv4(),
              name: '',
              notificationTime: '',
            })
          "
        >
          + Add task
        </button>
      </div>
      <button type="submit">{{ isAdd ? "Create Checklist" : "Update Checklist" }}</button>
    </form>
    <button v-if="!isAdd && !isEdit && !isDashboard" class="fab-button" @click="add">
      +
    </button>
  </main>
</template>

<style scoped>
.mainClass {
  width: 100%;
  max-width: 480px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 16px 0;
}

.header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
  padding: 24px 16px 20px;
  background: #5c70b0;
  color: white;
  border-radius: 0 0 20px 20px;
  box-shadow: 0 4px 12px #00000015;
}

.header h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.header p {
  margin: 0;
  font-size: 13px;
  color: #e6eaff;
}

.back-button {
  position: absolute;
  left: 14px;
  top: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid #ffffff50;
  border-radius: 12px;
  background: #ffffff18;
  color: white;
  font-size: 20px;
  cursor: pointer;
}

.dashboard-button {
  position: absolute;
  right: 14px;
  top: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid #ffffff50;
  border-radius: 12px;
  background: #ffffff18;
  color: white;
  font-size: 22px;
  cursor: pointer;
}

.checklist-container {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 0;
}

.checklist-container h2 {
  font-size: 22px;
  margin-bottom: 18px;
}

.checklist-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.checklist-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px;
  background: #5c70b0;
  border-radius: 14px;
}

.checklist-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: white;
  overflow-wrap: anywhere;
}

.checklist-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 0px;
  color: white;
  font-size: 18px;
  font-weight: bold;
}

.checklist-arrow {
  color: #333;
  font-size: 24px;
}

.checklist-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.checklist-actions :deep(svg) {
  font-size: 19px;
  cursor: pointer;
  color: white;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: #888;
  background: #f8faf9;
  border: 1px dashed #cbd5d0;
  border-radius: 14px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

input:not([type="checkbox"]) {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.notification-days {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  justify-content: space-between;
}

.notification-days label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid #1f1c1c;
  border-radius: 10px;
  background: #1f1c1c;
  cursor: pointer;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

.notification-days input[type="checkbox"] {
  accent-color: #42b883;
  margin: 0;
}

.task-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #1f1c1c;
  border-radius: 10px;
}

.task-number {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  min-width: 16px;
}

.task-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.task-fields input {
  min-width: 0;
  width: 0;
  flex: 1;
  padding: 9px 6px;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-sizing: border-box;
  font-size: 13px;
}

.task-fields input[type="time"] {
  flex: 0 0 110px;
}

.task-fields :deep(svg) {
  flex-shrink: 0;
  font-size: 20px;
  color: #ff4d4f;
  cursor: pointer;
}

.add-task-btn {
  background: #42b883;
  color: #333;
  border: 1px dashed #5c70b0;
  border-radius: 8px;
}

button {
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #5c70b0;
  color: white;
}

.fab-button {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #5c70b0;
  color: white;
  font-size: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px #0003;
  cursor: pointer;
  z-index: 1000;
}

label {
  font-size: 14px;
  align-self: flex-start;
}

@media (max-width: 480px) {
  .mainClass {
    max-width: 100%;
    padding: 0 12px 0;
  }

  .header {
    margin-bottom: 20px;
  }

  .checklist-container h2 {
    font-size: 20px;
  }
}
</style>

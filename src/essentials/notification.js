
import { LocalNotifications } from "@capacitor/local-notifications";
import { getResult, setResult } from "./checklist.js";

const NOTIFICATION_IDS_KEY = "checklist-notification-ids";
const EXTENSION_KEY = "checklist-notification-extensions";
const INITIAL_DAYS = 5;

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function getNotificationIds() {
  return readJSON(NOTIFICATION_IDS_KEY, {});
}

function getExtensions() {
  return readJSON(EXTENSION_KEY, {});
}

function saveNotificationIds(mapping) {
  localStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(mapping));
}

function saveExtensions(mapping) {
  localStorage.setItem(EXTENSION_KEY, JSON.stringify(mapping));
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function hashCode(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return hash & 0x7fffffff || 1;
}

function allocateId(key, usedIds) {
  let id = hashCode(key);

  while (usedIds.has(id)) {
    id = id >= 2147483647 ? 1 : id + 1;
  }

  usedIds.add(id);
  return id;
}

function createNotifications(checklist, usedIds = new Set()) {
  const notifications = [];

  if (!checklist.startDate) return notifications;

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const startDate = parseDate(checklist.startDate);

  let endDate;

  if (checklist.endDate) {
    endDate = parseDate(checklist.endDate);
  } else {
    const extension = getExtensions()[checklist.id] || { days: [] };

    endDate = new Date(todayStart);
    endDate.setDate(
      endDate.getDate() + INITIAL_DAYS - 1 + extension.days.length
    );
  }

  const firstDate = new Date(
    Math.max(startDate.getTime(), todayStart.getTime())
  );

  const weekdayKeys = [
    "sun", "mon", "tue", "wed", "thu", "fri", "sat",
  ];

  const results = getResult();

  for (
    const date = new Date(firstDate);
    date <= endDate;
    date.setDate(date.getDate() + 1)
  ) {
    if (!checklist.notificationDays?.[weekdayKeys[date.getDay()]]) {
      continue;
    }

    const scheduledDate = dateKey(date);

    for (const task of checklist.tasks || []) {
      if (!task.id || !task.name || !task.notificationTime) continue;

      // Do not schedule tasks already handled for this date.
      const alreadyHandled = results.some(
        (result) =>
          result.checklistId === checklist.id &&
          result.taskId === task.id &&
          result.scheduledDate === scheduledDate &&
          ["done", "nope", "later"].includes(result.status)
      );

      if (alreadyHandled) continue;

      const [hours, minutes] = task.notificationTime
        .split(":")
        .map(Number);

      const at = new Date(date);
      at.setHours(hours, minutes, 0, 0);

      // Never schedule reminders in the past.
      if (at <= now) continue;

      const id = allocateId(
        `${checklist.id}|${task.id}|${scheduledDate}`,
        usedIds
      );

      notifications.push({
        id,
        title: checklist.name,
        body: `It's time for ${task.name}`,
        schedule: { at },
        taskId: task.id,
        date: scheduledDate,
      });
    }
  }

  return notifications;
}

export async function cancelTaskNotification(
  checklistId,
  taskId,
  date
) {
  const mapping = getNotificationIds();
  const entries = mapping[checklistId] || [];

  const matches = entries.filter(
    (entry) => entry.taskId === taskId && entry.date === date
  );

  if (matches.length) {
    await LocalNotifications.cancel({
      notifications: matches.map(({ id }) => ({ id })),
    });
  }

  mapping[checklistId] = entries.filter(
    (entry) => entry.taskId !== taskId || entry.date !== date
  );

  saveNotificationIds(mapping);
}

export async function cancelChecklistNotifications(checklistId) {
  const mapping = getNotificationIds();
  const entries = mapping[checklistId] || [];

  if (entries.length) {
    await LocalNotifications.cancel({
      notifications: entries.map(({ id }) => ({ id })),
    });
  }

  delete mapping[checklistId];
  saveNotificationIds(mapping);
}

export async function scheduleChecklistNotifications(checklist) {
  const permission = await LocalNotifications.requestPermissions();

  if (permission.display !== "granted") return;

  const mapping = getNotificationIds();

  // Keep numeric IDs belonging to other checklists reserved.
  const usedIds = new Set(
    Object.entries(mapping)
      .filter(([id]) => id !== checklist.id)
      .flatMap(([, entries]) => entries.map((entry) => entry.id))
  );

  const notifications = createNotifications(checklist, usedIds);

  const entries = notifications.map(({ id, taskId, date }) => ({
    id,
    taskId,
    date,
  }));

  if (notifications.length) {
    await LocalNotifications.schedule({
      notifications: notifications.map(
        ({ taskId, date, ...notification }) => notification
      ),
    });
  }

  mapping[checklist.id] = entries;
  saveNotificationIds(mapping);
}

export async function rescheduleChecklistNotifications(checklist) {
  await cancelChecklistNotifications(checklist.id);
  await scheduleChecklistNotifications(checklist);
}

export async function recordTaskResult({
  checklist,
  taskId,
  scheduledDate,
  status,
}) {
  if (!["done", "nope", "later"].includes(status)) {
    throw new Error("Invalid task status");
  }

  const results = getResult();

  const existingIndex = results.findIndex(
    (item) =>
      item.checklistId === checklist.id &&
      item.taskId === taskId &&
      item.scheduledDate === scheduledDate
  );

  const result = {
    checklistId: checklist.id,
    taskId,
    scheduledDate,
    status,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    results[existingIndex] = result;
  } else {
    results.push(result);
  }

  setResult(results);

  // Cancel today's pending notification for this task.
  await cancelTaskNotification(checklist.id, taskId, scheduledDate);

  // Fixed-end-date checklists never extend.
  if (checklist.endDate || !checklist.startDate) return;

  // Only actions taken for today's tasks can extend the window.
  const today = new Date();
  const todayKey = dateKey(today);

  if (scheduledDate !== todayKey) return;

  const extensions = getExtensions();
  const extension = extensions[checklist.id] || { days: [] };

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const baseStart = parseDate(checklist.startDate);
  const activeStart = new Date(
    Math.max(baseStart.getTime(), todayStart.getTime())
  );

  const activeEnd = new Date(activeStart);
  activeEnd.setDate(
    activeEnd.getDate() + INITIAL_DAYS - 1 + extension.days.length
  );

  const actionDate = parseDate(scheduledDate);

  if (actionDate < activeStart || actionDate > activeEnd) return;

  // Extend once per day, regardless of how many tasks are handled.
  if (!extension.days.includes(scheduledDate)) {
    extension.days.push(scheduledDate);
    extensions[checklist.id] = extension;
    saveExtensions(extensions);

    await rescheduleChecklistNotifications(checklist);
  }
}

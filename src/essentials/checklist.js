
import { ref } from "vue";

export const checklistVersion = ref(0);
export const resultVersion = ref(0);

const checkListKey = "checkList-v1";
const resultKey = "result-v1";

export function notifyChecklistsChanged() {
  checklistVersion.value++;
}

export function notifyResultsChanged() {
  resultVersion.value++;
}

export function getCheckList() {
  try {
    const stored = localStorage.getItem(checkListKey);
    const parsed = stored ? JSON.parse(stored) : [];
    console.log("parsed ", parsed)
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Unable to load checklists:", error);
    return [];
  }
}

export function setCheckList(checklists) {
  localStorage.setItem(checkListKey, JSON.stringify(checklists));
  notifyChecklistsChanged();
}

export function getResult() {
  try {
    const stored = localStorage.getItem(resultKey);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Unable to load task results:", error);
    return [];
  }
}

export function setResult(results) {
  localStorage.setItem(resultKey, JSON.stringify(results));
  notifyResultsChanged();
}

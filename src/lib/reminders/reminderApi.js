// Client for the reminders backend: one read, one write, one delete.
//
// Every write goes through the saveReminder function, which owns the limits
// (one basal, one meal, three custom) and the field rules. This module never
// decides those itself.

import { base44 } from "@/api/base44Client";

export const remindersKey = (userId) => ["reminders", userId];

export async function loadReminders() {
  const rows = await base44.entities.Reminder.list({ sort: "created_date", limit: 20 });
  return Array.isArray(rows) ? rows : rows?.items || [];
}

async function call(payload) {
  const response = await base44.functions.invoke("saveReminder", payload);
  const data = response?.data || {};
  if (data.ok !== true) {
    const error = new Error(data.reason || "request_failed");
    error.reason = data.reason || "request_failed";
    throw error;
  }
  return data;
}

export const saveReminder = (payload) => call(payload);
export const toggleReminder = (id, enabled) => call({ action: "toggle", id, enabled });
export const deleteReminder = (id) => call({ action: "delete", id });
/** Production task-list content decoding behind the store boundary. */
import { defineKindRegistration } from "../../registry.js";
import { parseTaskListRecord } from "./parser.js";
import { checkTaskListRecord } from "./check.js";

/** Decode header fields without applying the task scanner's admission rules. */
export const TASK_LIST_REGISTRATION = defineKindRegistration({
  kind: "work-item/task-list",
  check: (input) => Promise.resolve(checkTaskListRecord(input)),
  parser: (content: string) => ({ success: true as const, data: parseTaskListRecord(content) }),
});

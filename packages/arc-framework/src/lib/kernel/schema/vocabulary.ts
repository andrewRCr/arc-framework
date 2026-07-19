/**
 * Schema-backed work-unit vocabulary shared across CLI subsystems.
 */

import { z } from "zod";

/** Runtime authority for codified work-unit lifecycle states. */
export const WorkUnitStateSchema = z.enum(["Planning", "Active", "Integrating", "Shipped"]);

/** A codified work-unit lifecycle state. */
export type WorkUnitState = z.infer<typeof WorkUnitStateSchema>;

/** Lifecycle progression used only after ancestry cannot order candidates. */
export const WORK_UNIT_STATE_ORDER: Readonly<Record<WorkUnitState, number>> = {
  Planning: 0,
  Active: 1,
  Integrating: 2,
  Shipped: 3,
};

/**
 * Narrow a raw State field while preserving the established unknown fallback.
 *
 * @param value - Raw State field value, or `null` when absent.
 * @returns The codified state or `"unknown"`.
 */
export function validateState(value: string | null): WorkUnitState | "unknown" {
  const result = WorkUnitStateSchema.safeParse(value);
  return result.success ? result.data : "unknown";
}

/** Runtime authority for resolved work-unit weight display values. */
export const WorkClassSchema = z.enum(["Light", "Heavy", "Novel"]);

/** A resolved work-unit weight. */
export type WorkClass = z.infer<typeof WorkClassSchema>;

/**
 * Normalize a raw Class field to its display value or pre-classification sentinel.
 *
 * @param value - Raw Class field value, or `null` when absent.
 * @returns The normalized class or `"[TBD]"`.
 */
export function validateClass(value: string | null): WorkClass | "[TBD]" {
  const normalized = value?.trim().toLowerCase();
  return WorkClassSchema.options.find((candidate) => candidate.toLowerCase() === normalized) ?? "[TBD]";
}

/** Runtime authority for codified work-unit priority levels. */
export const PrioritySchema = z.enum(["P1", "P2", "P3"]);

/** A codified work-unit priority level. */
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * Narrow a raw Priority field while preserving the established P3 default.
 *
 * @param value - Raw Priority field value, or `null` when absent.
 * @returns The codified priority, defaulting to `"P3"`.
 */
export function validatePriority(value: string | null): Priority {
  const result = PrioritySchema.safeParse(value);
  return result.success ? result.data : "P3";
}

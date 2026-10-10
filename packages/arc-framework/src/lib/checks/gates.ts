/** Cumulative gate membership and request-derived result kind. */
import type { CheckDeclaration } from "./declaration.js";
import type { CheckForm, CheckGate } from "./request.js";
import { assertNever } from "../kernel/index.js";
const membership: Record<CheckGate, readonly CheckGate[]> = {
  commit: ["commit"], push: ["commit", "push"], merge: ["commit", "push", "merge"],
};
export type CheckResultKind = "enforcement" | "feedback";
/**
 * Derive the event whose included checks enforce this request.
 * @param form - Validated request form
 * @returns Its deadline gate, or no deadline for an explicit named request
 */
export function checkRequestDeadline(form: CheckForm): CheckGate | undefined {
  switch (form.kind) {
    case "gate": return form.gate;
    case "increment": case "pre-commit": return "commit";
    case "segment": case "new-head": case "pre-push": return "push";
    case "run": return undefined;
    default: return assertNever(form);
  }
}
/**
 * Select declaration entries belonging to a form's cumulative gates or explicit identifiers.
 * @param checks - Validated entries in declaration order
 * @param form - Requested gates or identifiers
 * @returns Every requested entry, including CI-only entries for explicit exclusion reporting
 */
export function selectRequestChecks(checks: CheckDeclaration["checks"], form: CheckForm): [string, CheckDeclaration["checks"][string]][] {
  const deadline = checkRequestDeadline(form);
  return Object.entries(checks).filter(([id, check]) => {
    if (form.kind === "run") return form.ids.includes(id);
    if (check.gate !== undefined && deadline !== undefined && membership[deadline].includes(check.gate)) return true;
    return form.kind === "increment" && check.gate === "push" && check.mode === "files";
  });
}
/**
 * Label a check from this request's deadline without reading approval or interlock policy.
 * @param form - Validated request form
 * @param check - Validated declaration entry
 * @returns Enforcement at an included deadline, feedback otherwise
 */
export function checkResultKind(form: CheckForm, check: CheckDeclaration["checks"][string]): CheckResultKind {
  const deadline = checkRequestDeadline(form);
  return deadline !== undefined && check.gate !== undefined && membership[deadline].includes(check.gate) ? "enforcement" : "feedback";
}

/** Derive exact restore targets and leases from the held window and saved consumption decision. */
import type { WindowRecord } from "./hold.js";
import type { WindowRestoreDecision } from "./restore-decision-document.js";
import type { WindowFinding } from "./result.js";
import { isStateRef } from "../../lib/store/ref/manifest.js";
import { isWindowStoreWorkingRef } from "./preflight.js";

/** Fresh values observed before the first restore push. */
export interface WindowRestoreSnapshot {
  local: Readonly<Record<string, string>>; origin: Readonly<Record<string, string>>;
  tracking: Readonly<Record<string, string>>; identity: string | null;
}
/** One target state leased on the exact value observed before mutation. */
export interface WindowRestoreRefChange { ref: string; current: string | null; next: string | null }
/** Complete admission findings and target changes for both sides. */
export interface WindowRestoreRefPlan { origin: WindowRestoreRefChange[]; local: WindowRestoreRefChange[]; findings: WindowFinding[] }

/** Check all values before allowing any restore push. */
export function planWindowRestoreLeases(record: WindowRecord, decision: WindowRestoreDecision,
  snapshot: WindowRestoreSnapshot): WindowRestoreRefPlan {
  const findings: WindowFinding[] = [];
  const origin = changesFor(record.refs.origin, snapshot.origin);
  for (const change of origin) {
    const allowed = originAllowedValues(record, decision, snapshot, change.ref);
    if (!allowed.includes(change.current)) findings.push(leaseFinding("origin", change, allowed));
  }
  const local = changesFor(record.refs.local, snapshot.local);
  for (const change of local) {
    if (isStateRef(change.ref) || isWindowStoreWorkingRef(change.ref)) continue;
    const allowed = allowedValues(record.refs.local, decision, change.ref);
    if (!allowed.includes(change.current)) findings.push(leaseFinding("local", change, allowed));
  }
  return { origin, local: [...local, ...changesFor(record.refs.tracking, snapshot.tracking)], findings };
}

function originAllowedValues(record: WindowRecord, decision: WindowRestoreDecision,
  snapshot: WindowRestoreSnapshot, ref: string): (string | null)[] {
  const allowed = allowedValues(record.refs.origin, decision, ref);
  if (!publishable(ref, snapshot.identity)) return allowed;
  const tracking = snapshot.tracking[`refs/arc-remotes/origin/${ref.slice("refs/arc/".length)}`];
  return [...allowed, ...[tracking, snapshot.local[ref]].filter((tip): tip is string => tip !== undefined)];
}

function allowedValues(held: Readonly<Record<string, string>>, decision: WindowRestoreDecision, ref: string): (string | null)[] {
  const allowed = [held[ref] ?? null, ...decision.accepted.filter(item => item.ref === ref).map(item => item.value)];
  if (/^refs\/arc\/user\/[^/]+\/errands$/u.test(ref) && decision.regime !== "unconsumed"
    && decision.identities.some(item => item.ref === ref && (item.outcome === "equal" || item.outcome === "accepted"))) allowed.push(null);
  return allowed;
}

function publishable(ref: string, identity: string | null): boolean {
  return isStateRef(ref) && (!ref.startsWith("refs/arc/user/") || identity !== null
    && (ref === `refs/arc/user/${identity}/personal` || ref === `refs/arc/user/${identity}/claims`));
}

function changesFor(held: Readonly<Record<string, string>>, current: Readonly<Record<string, string>>): WindowRestoreRefChange[] {
  return [...new Set([...Object.keys(held), ...Object.keys(current)])].flatMap(ref => {
    const next = held[ref] ?? null, actual = current[ref] ?? null;
    return next === actual ? [] : [{ ref, current: actual, next }];
  });
}

function leaseFinding(side: "origin" | "local", change: WindowRestoreRefChange, allowed: readonly (string | null)[]): WindowFinding {
  return { subject: `${side}:${change.ref}`,
    condition: `Found ${change.current ?? "absent"}; the window's allowed values are ${[...new Set(allowed)].map(tip => tip ?? "absent").join(", ")}.`,
    remedy: `Settle the changed ${side} ref, then supply --accept ${change.ref}=${change.current ?? "absent"} and retry restore.` };
}

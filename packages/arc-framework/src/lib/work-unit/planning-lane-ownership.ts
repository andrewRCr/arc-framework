/** Pure host-policy eligibility and CODEOWNERS edit policy for the planning lane. */

export type PlanningLaneOwnershipMechanism = "branch-protection" | "rules" | "merge-queue";

export type PlanningLaneOwnershipSurface = {
  state: "checked";
  requiredContext: boolean;
  baseCurrency: boolean;
} | {
  state: "forbidden";
};

export interface PlanningLaneOwnershipFacts {
  branchProtection: PlanningLaneOwnershipSurface;
  rules: PlanningLaneOwnershipSurface;
  mergeQueue: PlanningLaneOwnershipSurface;
}

export interface PlanningLaneOwnershipEligibility {
  eligible: boolean;
  requiredContext: {
    satisfied: boolean;
    mechanisms: PlanningLaneOwnershipMechanism[];
  };
  baseCurrency: {
    satisfied: boolean;
    mechanisms: PlanningLaneOwnershipMechanism[];
  };
  surfaces: {
    branchProtection: "configured" | "checked-not-configured" | "not-permitted-to-check";
    rules: "configured" | "checked-not-configured" | "not-permitted-to-check";
    mergeQueue: "configured" | "checked-not-configured" | "not-permitted-to-check";
  };
  reasons: string[];
}

export const PLANNING_LANE_RECEIPT_PATTERN = "/.arc/system/.internal/retirement-receipts/*.json";

export type PlanningLaneOwnershipEdit = {
  state: "applied";
  content: string;
} | {
  state: "unchanged" | "refused";
  content: string;
  reason: string;
};

const MECHANISMS = ["branch-protection", "rules", "merge-queue"] as const;

function surfaceFor(
  facts: PlanningLaneOwnershipFacts,
  mechanism: PlanningLaneOwnershipMechanism,
): PlanningLaneOwnershipSurface {
  if (mechanism === "branch-protection") return facts.branchProtection;
  if (mechanism === "merge-queue") return facts.mergeQueue;
  return facts.rules;
}

/**
 * Resolve the opt-in ownership exception's two host guards.
 *
 * @param facts - Independently read branch-protection, rules, and merge-queue facts.
 * @returns Eligibility with per-guard provenance and per-surface read posture.
 */
export function assessPlanningLaneOwnershipEligibility(
  facts: PlanningLaneOwnershipFacts,
): PlanningLaneOwnershipEligibility {
  const requiredMechanisms = MECHANISMS.filter((mechanism) => {
    const surface = surfaceFor(facts, mechanism);
    return surface.state === "checked" && surface.requiredContext;
  });
  const currencyMechanisms = MECHANISMS.filter((mechanism) => {
    const surface = surfaceFor(facts, mechanism);
    return surface.state === "checked" && surface.baseCurrency;
  });
  const forbidden = MECHANISMS.filter((mechanism) => surfaceFor(facts, mechanism).state === "forbidden");
  const surfaces = Object.fromEntries(MECHANISMS.map((mechanism) => {
    const surface = surfaceFor(facts, mechanism);
    const state = surface.state === "forbidden"
      ? "not-permitted-to-check"
      : surface.requiredContext || surface.baseCurrency
      ? "configured"
      : "checked-not-configured";
    return [mechanism === "branch-protection" ? "branchProtection" : mechanism === "merge-queue"
      ? "mergeQueue"
      : "rules", state];
  })) as PlanningLaneOwnershipEligibility["surfaces"];
  const reasons = [
    ...forbidden.map((mechanism) => `${mechanism}:not-permitted-to-check`),
    ...(requiredMechanisms.length === 0 ? ["required-context:not-configured"] : []),
    ...(currencyMechanisms.length === 0 ? ["base-currency:not-configured"] : []),
  ];
  return {
    eligible: reasons.length === 0,
    requiredContext: {
      satisfied: requiredMechanisms.length > 0,
      mechanisms: [...requiredMechanisms],
    },
    baseCurrency: {
      satisfied: currencyMechanisms.length > 0,
      mechanisms: [...currencyMechanisms],
    },
    surfaces,
    reasons,
  };
}

interface OwnershipEntry {
  line: number;
  pattern: string;
  owned: boolean;
}

function ownershipEntries(content: string): OwnershipEntry[] {
  return content.split(/\r?\n/u).flatMap((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) return [];
    const fields = trimmed.split(/\s+/u);
    const pattern = fields[0];
    if (pattern === undefined) return [];
    return [{ line: index, pattern, owned: fields.length > 1 }];
  });
}

/**
 * Append the receipt namespace only inside an ownership file's trailing unowned region.
 *
 * @param content - Current CODEOWNERS bytes decoded as UTF-8.
 * @returns The proposed bytes, an idempotent result, or a closed refusal.
 */
export function applyPlanningLaneOwnershipException(content: string): PlanningLaneOwnershipEdit {
  const entries = ownershipEntries(content);
  const lastOwnedLine = entries.filter(({ owned }) => owned).at(-1)?.line ?? -1;
  const trailingUnowned = entries.filter(({ line, owned }) => line > lastOwnedLine && !owned);
  const existing = entries.find(({ pattern }) => pattern === PLANNING_LANE_RECEIPT_PATTERN);
  if (existing !== undefined && existing.line > lastOwnedLine && !existing.owned) {
    return { state: "unchanged", content, reason: "receipt-namespace-already-unowned" };
  }
  if (existing !== undefined && entries.some(({ line, owned }) => line > existing.line && owned)) {
    return { state: "refused", content, reason: "owning-entry-follows-receipt-namespace" };
  }
  if (trailingUnowned.length === 0) {
    return { state: "refused", content, reason: "ownership-file-has-no-trailing-unowned-block" };
  }
  const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
  return {
    state: "applied",
    content: `${prefix}${PLANNING_LANE_RECEIPT_PATTERN}\n`,
  };
}

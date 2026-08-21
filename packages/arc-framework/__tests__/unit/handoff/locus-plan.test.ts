/** Handoff action derivation from the exact entering checkout row. */

import { describe, expect, it } from "vitest";

import { deriveHandoffLocusPlan } from "../../../src/lib/handoff/locus-plan.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

const CLAIM = "c".repeat(32);

function row(overrides: Partial<DerivedCheckoutRow> = {}): DerivedCheckoutRow {
  return {
    kind: "free-primary",
    checkout: { path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: null,
    ...overrides,
  } as DerivedCheckoutRow;
}

function frame(entering: DerivedCheckoutRow, siblings: readonly DerivedCheckoutRow[] = []): DerivedLocusFrame {
  return {
    roster: [entering, ...siblings],
    entering: { kind: "selected", row: entering },
    primaryAvailability: { kind: "free", checkoutPath: "/repo" },
    identityDiscovery: { kind: "absent" },
    active: entering.kind === "work-unit" && entering.subject.kind === "work-unit"
      && entering.context !== null
      ? { checkoutPath: entering.checkout.path, subject: entering.subject, context: entering.context }
      : null,
  };
}

function workUnit(): DerivedCheckoutRow {
  return row({
    kind: "work-unit",
    checkout: { path: "/repo.demo", head: "b".repeat(40), branch: "feat/demo", detached: false, primary: false },
    subject: { kind: "work-unit", key: "demo" },
    context: {
      kind: "resolved",
      metaPath: ".arc/active/meta-demo.md",
      owner: "test-user",
      branch: "feat/demo",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: null,
      cohortDocPath: null,
      loadSet: { manifestVersion: 1, entries: [] },
      integrationBoundary: null,
    },
    lifecycleLocation: "active",
  });
}

function transient(kind: "errand" | "groom" | "housekeep" | "partial-errand", warm = true): DerivedCheckoutRow {
  const key = kind === "groom" ? "groom-demo" : kind === "housekeep" ? "sweep" : "fix-one";
  const subject = kind === "partial-errand"
    ? { kind, key, claimId: null } as const
    : { kind, key, claimId: CLAIM } as const;
  return row({
    kind: "transient",
    subject,
    markerGeneration: `sha256:${"d".repeat(64)}`,
    parentCheckoutPath: warm ? "/repo.demo" : null,
    identity: kind === "errand" ? {
      kind: "errand",
      key,
      claimId: CLAIM,
      protection: "full",
      branch: "chore/fix-one",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    } : kind === "groom" ? {
      kind: "groom",
      key,
      claimId: CLAIM,
      purpose: null,
      anchorStub: "demo",
      members: ["demo"],
      openedBaseHead: "1".repeat(40),
      protection: "full",
      branch: "chore/groom-demo",
      state: "open",
      savedHead: null,
      changeRequest: null,
    } : null,
  });
}

describe("deriveHandoffLocusPlan", () => {
  it("projects a resolved WU with only its checkout and workflow context", () => {
    expect(deriveHandoffLocusPlan(frame(workUnit()))).toEqual({
      kind: "release-work-unit",
      subject: { kind: "work-unit", key: "demo" },
      checkoutPath: "/repo.demo",
      workflow: "process-task-loop",
      sessionType: "execution",
    });
  });

  it.each([["warm", true], ["cold", false]] as const)(
    "projects a %s ordinary Errand from marker and identity agreement",
    (_label, warm) => {
      expect(deriveHandoffLocusPlan(frame(transient("errand", warm)))).toEqual({
        kind: "leave-errand",
        subject: { kind: "errand", key: "fix-one", claimId: CLAIM },
        checkoutPath: "/repo",
        parentCheckoutPath: warm ? "/repo.demo" : null,
      });
    },
  );

  it.each([
    ["groom", "groom-incomplete"],
    ["housekeep", "housekeep-incomplete"],
    ["partial-errand", "partial-handoff-forbidden"],
  ] as const)("keeps %s on its workflow-specific refusal", (kind, reason) => {
    expect(deriveHandoffLocusPlan(frame(transient(kind)))).toMatchObject({
      kind: "refused",
      reason,
      subject: { kind },
      checkoutPath: "/repo",
      parentCheckoutPath: "/repo.demo",
    });
  });

  it("treats a free or unmanaged entering checkout as between work units", () => {
    expect(deriveHandoffLocusPlan(frame(row()))).toEqual({
      kind: "between-work-units",
      checkoutPath: "/repo",
    });
    expect(deriveHandoffLocusPlan(frame(row({ kind: "unmanaged-checkout" })))).toEqual({
      kind: "between-work-units",
      checkoutPath: "/repo",
    });
  });

  it("does not let a malformed sibling refuse a healthy entering WU", () => {
    const malformed = row({
      kind: "unresolved-checkout",
      checkout: { path: "/repo.bad", head: "e".repeat(40), branch: null, detached: true, primary: false },
      diagnostics: [{ code: "authority-conflict", message: "bad sibling" }],
    });

    expect(deriveHandoffLocusPlan(frame(workUnit(), [malformed]))).toMatchObject({
      kind: "release-work-unit",
      checkoutPath: "/repo.demo",
    });
  });

  it("emits no record or lease identifiers in any handoff arm", () => {
    const plans = [
      deriveHandoffLocusPlan(frame(workUnit())),
      deriveHandoffLocusPlan(frame(transient("errand"))),
      deriveHandoffLocusPlan(frame(transient("partial-errand"))),
      deriveHandoffLocusPlan(frame(row())),
    ];
    const wire = JSON.stringify(plans);

    expect(wire).not.toContain("recordId");
    expect(wire).not.toContain("leaseId");
  });

  it("refuses an unresolved entering checkout from only its own diagnostics", () => {
    const unresolved: DerivedLocusFrame = {
      roster: [],
      entering: {
        kind: "unresolved",
        checkoutPath: "/repo",
        diagnostics: [{ code: "entering-checkout-unavailable", message: "missing" }],
      },
      primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["missing"] },
      identityDiscovery: { kind: "absent" },
      active: null,
    };

    expect(deriveHandoffLocusPlan(unresolved)).toEqual({
      kind: "refused",
      reason: "locus-unresolved",
      subject: null,
      checkoutPath: "/repo",
      parentCheckoutPath: null,
      recommendedPromptText: "Current checkout handoff facts are unresolved: missing",
    });
  });
});

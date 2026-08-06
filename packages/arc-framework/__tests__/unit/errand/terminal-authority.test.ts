/** Subject-scoped authority for Errand terminal operations. */

import { describe, expect, it } from "vitest";

import {
  authorizeErrandTerminal,
  type ErrandTerminalSubject,
} from "../../../src/lib/errand/terminal-authority.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/index.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

const SUBJECT: Extract<ErrandTerminalSubject, { kind: "errand" }> = {
  kind: "errand",
  slug: "repair",
  claimId: "a".repeat(32),
};
const GENERATION = `errand-v1/${SUBJECT.slug}/${SUBJECT.claimId}`;

function identity(): Extract<LocusIdentityV1, { kind: "errand"; purpose: "errand" }> {
  return {
    kind: "errand",
    key: SUBJECT.slug,
    claimId: SUBJECT.claimId,
    protection: "full",
    branch: `chore/${SUBJECT.slug}`,
    purpose: "errand",
    origin: "description",
    originEntry: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
}

function transientRow(path = "/repo/repair"): DerivedCheckoutRow {
  return {
    kind: "transient",
    checkout: {
      path,
      head: "b".repeat(40),
      branch: `chore/${SUBJECT.slug}`,
      detached: false,
      primary: false,
    },
    markerGeneration: `sha256:${"c".repeat(64)}`,
    parentCheckoutPath: "/repo",
    origin: null,
    identity: identity(),
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "errand", key: SUBJECT.slug, claimId: SUBJECT.claimId },
  };
}

function frame(row = transientRow(), entering = row): DerivedLocusFrame {
  return {
    roster: [row],
    entering: { kind: "selected", row: entering },
    primaryAvailability: { kind: "unsafe", checkoutPath: "/repo", reasons: ["occupied"] },
    identityDiscovery: { kind: "complete", identities: [identity()], diagnostics: [] },
    active: null,
  };
}

function foreignEnteringRow(): DerivedCheckoutRow {
  return {
    kind: "free-primary",
    checkout: {
      path: "/repo",
      head: "d".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: null,
  };
}

function partialRow(): DerivedCheckoutRow {
  return {
    kind: "transient",
    checkout: {
      path: "/repo",
      head: "e".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    parentCheckoutPath: null,
    markerGeneration: `sha256:${"c".repeat(64)}`,
    identity: null,
    origin: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "partial-errand", key: "direct-fix", claimId: null },
  };
}

describe("Errand terminal authority", () => {
  it("authorizes the exact subject from its current checkout without confirmation", () => {
    expect(authorizeErrandTerminal({ frame: frame(), operation: "close", subject: SUBJECT })).toMatchObject({
      kind: "authorized",
      authority: "current-checkout",
      subject: SUBJECT,
      checkoutPath: "/repo/repair",
      parentCheckoutPath: "/repo",
      generation: GENERATION,
    });
  });

  it("returns an exact-generation confirmation for a foreign terminal act", () => {
    const row = transientRow();

    expect(authorizeErrandTerminal({
      frame: frame(row, foreignEnteringRow()),
      operation: "close",
      subject: SUBJECT,
    })).toEqual({
      kind: "confirmation-required",
      operation: "close",
      subject: SUBJECT,
      checkoutPath: "/repo/repair",
      generation: GENERATION,
      destructiveEffect: "close and retire this Errand",
      recommendedPromptText: `Retry with: arc errand close repair --confirm-foreign-generation ${GENERATION}`,
    });
  });

  it("authorizes a foreign terminal act only for its freshly derived generation", () => {
    const row = transientRow();

    expect(authorizeErrandTerminal({
      frame: frame(row, foreignEnteringRow()),
      operation: "abandon",
      subject: SUBJECT,
      confirmForeignGeneration: GENERATION,
    })).toMatchObject({
      kind: "authorized",
      authority: "confirmed-foreign",
      subject: SUBJECT,
      checkoutPath: "/repo/repair",
      generation: GENERATION,
    });
  });

  it("refuses a supplied stale or malformed generation instead of offering it as authority", () => {
    const row = transientRow();
    const foreign = frame(row, foreignEnteringRow());

    for (const generation of ["errand-v1/repair/stale", "not-a-generation"]) {
      expect(authorizeErrandTerminal({
        frame: foreign,
        operation: "close",
        subject: SUBJECT,
        confirmForeignGeneration: generation,
      })).toEqual({
        kind: "refused",
        reason: "generation-mismatch",
        message: "The supplied foreign confirmation does not match the current Errand generation.",
      });
    }
  });

  it("fails identity-backed mutations closed when the shared identity basis is incomplete", () => {
    const rootFailure = {
      ...frame(),
      identityDiscovery: { kind: "error" as const, stage: "tree" as const, message: "unreadable ref" },
    };
    const entryFailure = {
      ...frame(),
      identityDiscovery: {
        kind: "complete" as const,
        identities: [identity()],
        diagnostics: [{ kind: "malformed" as const, key: "other", message: "bad JSON" }],
      },
    };

    for (const value of [rootFailure, entryFailure]) {
      expect(authorizeErrandTerminal({ frame: value, operation: "leave", subject: SUBJECT })).toEqual({
        kind: "refused",
        reason: "identity-conflict",
        message: "The shared Errand identity basis is incomplete.",
      });
    }
  });

  it("uses the exact marker digest for an identity-free partial Errand", () => {
    const row = partialRow();
    const partialFrame: DerivedLocusFrame = {
      ...frame(row, row),
      identityDiscovery: { kind: "error", stage: "tree", message: "identity ref unavailable" },
    };

    expect(authorizeErrandTerminal({
      frame: partialFrame,
      operation: "close",
      subject: { kind: "partial-errand", slug: "direct-fix", claimId: null },
    })).toMatchObject({
      kind: "authorized",
      authority: "current-checkout",
      generation: `sha256:${"c".repeat(64)}`,
    });
  });

  it("contains unrelated malformed checkouts while refusing unresolved target evidence", () => {
    const row = transientRow();
    const malformedSibling: DerivedCheckoutRow = {
      ...foreignEnteringRow(),
      kind: "unresolved-checkout",
      subject: null,
      diagnostics: [{ code: "marker-unreadable", message: "bad sibling marker" }],
    };
    const contained = { ...frame(row, row), roster: [row, malformedSibling] };
    const unresolvedTarget: DerivedCheckoutRow = {
      ...row,
      kind: "unresolved-checkout",
      diagnostics: [{ code: "branch-mismatch", message: "target branch changed" }],
    };

    expect(authorizeErrandTerminal({ frame: contained, operation: "close", subject: SUBJECT })).toMatchObject({
      kind: "authorized",
      authority: "current-checkout",
    });
    expect(authorizeErrandTerminal({
      frame: frame(unresolvedTarget, unresolvedTarget),
      operation: "close",
      subject: SUBJECT,
    })).toMatchObject({ kind: "refused", reason: "authority-unresolved" });
  });

  it("requires the identity generation when a retained Errand has no local checkout", () => {
    const entering = foreignEnteringRow();
    const identityOnly: DerivedLocusFrame = {
      ...frame(entering, entering),
      roster: [entering],
    };

    expect(authorizeErrandTerminal({
      frame: identityOnly,
      operation: "close",
      subject: SUBJECT,
    })).toMatchObject({
      kind: "confirmation-required",
      subject: SUBJECT,
      checkoutPath: null,
      generation: GENERATION,
    });
    expect(authorizeErrandTerminal({
      frame: identityOnly,
      operation: "close",
      subject: SUBJECT,
      confirmForeignGeneration: GENERATION,
    })).toMatchObject({
      kind: "authorized",
      authority: "confirmed-foreign",
      checkoutPath: null,
      generation: GENERATION,
      row: null,
    });
  });

  it("does not treat an unresolved entering checkout as an absent local occupancy", () => {
    const unresolvedEntering: DerivedCheckoutRow = {
      ...foreignEnteringRow(),
      kind: "unresolved-checkout",
      subject: null,
      diagnostics: [{ code: "authority-evidence-unreadable", source: "marker", message: "bad entering marker" }],
    };
    const unresolvedFrame: DerivedLocusFrame = {
      ...frame(unresolvedEntering, unresolvedEntering),
      roster: [unresolvedEntering],
    };

    expect(authorizeErrandTerminal({
      frame: unresolvedFrame,
      operation: "close",
      subject: SUBJECT,
    })).toEqual({
      kind: "refused",
      reason: "authority-unresolved",
      message: "The entering checkout cannot prove terminal absence.",
    });
  });
});

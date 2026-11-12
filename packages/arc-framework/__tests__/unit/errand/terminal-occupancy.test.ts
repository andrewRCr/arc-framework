/** Marker- and topology-owned terminal occupancy settlement. */

import { describe, expect, it } from "vitest";

import type { WorktreeRemovalResult } from "../../../src/lib/git/worktree-removal.js";
import type { ErrandTerminalAuthority } from "../../../src/lib/errand/terminal-authority.js";
import {
  settleTerminalOccupancy,
  type TerminalOccupancyIO,
} from "../../../src/lib/errand/terminal-occupancy.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

const SUBJECT = { kind: "errand", slug: "repair", claimId: "a".repeat(32) } as const;
const MARKER_GENERATION = `sha256:${"b".repeat(64)}`;
const HEAD = "c".repeat(40);

function row(primary = false): DerivedCheckoutRow {
  return {
    kind: "transient",
    checkout: {
      folderPresent: true,
      path: primary ? "/repo" : "/repo/repair",
      head: HEAD,
      branch: "chore/repair",
      detached: false,
      primary,
    },
    markerGeneration: MARKER_GENERATION,
    parentCheckoutPath: "/repo",
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "errand", key: SUBJECT.slug, claimId: SUBJECT.claimId },
  };
}

function authority(target = row()): Extract<ErrandTerminalAuthority, { kind: "authorized" }> {
  return {
    kind: "authorized",
    authority: "current-checkout",
    subject: SUBJECT,
    checkoutPath: target.checkout.path,
    parentCheckoutPath: target.parentCheckoutPath,
    generation: `errand-v1/${SUBJECT.slug}/${SUBJECT.claimId}`,
    row: target,
  };
}

function io(result: WorktreeRemovalResult | { kind: "absent" } = { kind: "removed" }): TerminalOccupancyIO {
  return {
    inspect: async () => ({
      branch: "chore/repair",
      head: HEAD,
      dirty: false,
      markerGeneration: MARKER_GENERATION,
    }),
    removePrimary: async () => "removed",
    removeSpawned: async () => result,
  };
}

describe("terminal occupancy settlement", () => {
  it("removes a clean exact marker and topology generation", async () => {
    await expect(settleTerminalOccupancy({
      authority: authority(),
      primaryCheckoutPath: "/repo",
      io: io(),
    })).resolves.toEqual({
      kind: "applied",
      checkoutPath: "/repo/repair",
      parentCheckoutPath: "/repo",
    });
  });

  it("refuses dirty, branch, HEAD, or marker disagreement before removal", async () => {
    const cases: Array<[Partial<Awaited<ReturnType<TerminalOccupancyIO["inspect"]>>>, string]> = [
      [{ dirty: true }, "preservation-unproven"],
      [{ branch: "chore/other" }, "preservation-unproven"],
      [{ head: "d".repeat(40) }, "preservation-unproven"],
      [{ markerGeneration: `sha256:${"e".repeat(64)}` }, "generation-mismatch"],
    ];

    for (const [inspection, reason] of cases) {
      const boundaries = io();
      boundaries.inspect = async () => ({
        branch: "chore/repair",
        head: HEAD,
        dirty: false,
        markerGeneration: MARKER_GENERATION,
        ...inspection,
      });
      await expect(settleTerminalOccupancy({
        authority: authority(inspection.dirty ? row(true) : row()),
        primaryCheckoutPath: "/repo",
        io: boundaries,
      })).resolves.toMatchObject({ kind: "refused", reason });
    }
  });
});

describe("spawned removal outcomes", () => {
  it.each(["removed", "pruned"] as const)("maps %s to applied", async (kind) => {
    expect(await settleTerminalOccupancy({ authority: authority(), primaryCheckoutPath: "/repo", io: io({ kind }) }))
      .toMatchObject({ kind: "applied" });
  });
  it("retains a check's refusal and remedy", async () => {
    expect(await settleTerminalOccupancy({ authority: authority(), primaryCheckoutPath: "/repo",
      io: io({ kind: "refused", check: { kind: "refused", reason: "unobservable", detail: "status failed" } }),
    })).toMatchObject({ kind: "refused", reason: "unobservable", message: expect.stringContaining("status failed") });
  });
  it("maps a refused persist step to a refusal carrying its remedy", async () => {
    expect(await settleTerminalOccupancy({ authority: authority(), primaryCheckoutPath: "/repo",
      io: io({ kind: "failed", step: "persist", detail: "blocked", remedy: { text: "Save the projection.", argv: ["arc", "save"] } }),
    })).toMatchObject({ kind: "refused", message: "Save the projection." });
  });
  it("reports a failed removal as an error", async () => {
    expect(await settleTerminalOccupancy({ authority: authority(), primaryCheckoutPath: "/repo",
      io: io({ kind: "failed", step: "remove", detail: "Git failed" }),
    })).toMatchObject({ kind: "error", message: expect.stringContaining("Git failed") });
  });
  it("treats an absent registration as idempotent", async () => {
    expect(await settleTerminalOccupancy({ authority: authority(), primaryCheckoutPath: "/repo", io: io({ kind: "absent" }) }))
      .toMatchObject({ kind: "idempotent" });
  });
});

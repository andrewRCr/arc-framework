/** Marker- and topology-owned terminal occupancy settlement. */

import { describe, expect, it } from "vitest";

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

function io(result: "removed" | "absent" | "changed" = "removed"): TerminalOccupancyIO {
  return {
    inspect: async () => ({
      branch: "chore/repair",
      head: HEAD,
      dirty: false,
      markerGeneration: MARKER_GENERATION,
    }),
    removePrimary: async () => result,
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
        authority: authority(),
        primaryCheckoutPath: "/repo",
        io: boundaries,
      })).resolves.toMatchObject({ kind: "refused", reason });
    }
  });
});

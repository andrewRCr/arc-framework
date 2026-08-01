/**
 * Read-only current-WU reconcile facts for session entry.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const realpathMock = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>());

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  realpath: realpathMock,
}));

import {
  classifyCurrentWuLocusRole,
  runCurrentWuReconcileSessionProbe,
} from "../../../src/lib/session-init/current-wu-reconcile.js";
import { LocusStateV1Schema } from "../../../src/lib/locus/schema/index.js";
import { buildLifecycleIndexFromMetas } from "../../../src/lib/work-unit/lifecycle-index.js";

const META_PATH = ".arc/active/meta-dependent.md";

function meta(dependsOn: string): string {
  return `# Metadata: dependent\n\n- **State:** Active\n- **Depends On:** ${dependsOn}\n`;
}

describe("runCurrentWuReconcileSessionProbe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    realpathMock.mockImplementation(async (path) => path.replace(/^\/alias(?=\/|$)/u, "/physical"));
  });

  it("surfaces pending tracked edits without exposing a write boundary", async () => {
    let reads = 0;
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([
        { path: META_PATH, content: meta("`retired`") },
        { path: ".arc/active/meta-successor.md", content: "# Metadata: successor\n\n- **State:** Active\n" },
      ]),
      queryDisposition: () => Promise.resolve({
        status: "unique",
        evidenceQuality: "reachable",
        receiptId: "sha256:receipt",
        disposition: { kind: "retarget", targetSlug: "successor" },
      }),
      readFile: () => {
        reads += 1;
        return Promise.resolve(meta("`retired`"));
      },
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "pending",
      slug: "dependent",
      dependency: { before: ["retired"], after: ["successor"] },
      recommendedAction: "surface",
      recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--apply", "--json"],
    });
    expect(result.recommendedPromptText).toContain("arc wu reconcile dependent --apply --json");
    expect(reads).toBe(1);
  });

  it("surfaces a typed conflict without mutation", async () => {
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([{ path: META_PATH, content: meta("`retired`") }]),
      queryDisposition: () => Promise.resolve({ status: "ambiguous", receiptIds: ["one", "two"] }),
      readFile: () => Promise.resolve(meta("`retired`")),
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "conflict",
      reason: "ambiguous-evidence",
      recommendedAction: "surface",
      recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--json"],
    });
    expect(result.recommendedPromptText).toMatch(/blocked.*ambiguous-evidence/iu);
  });

  it("keeps a clean reconcile silent", async () => {
    const result = await runCurrentWuReconcileSessionProbe({
      index: buildLifecycleIndexFromMetas([{ path: META_PATH, content: meta("[none]") }]),
      queryDisposition: () => Promise.resolve({ status: "absent" }),
      readFile: () => Promise.resolve(meta("[none]")),
    }, { slug: "dependent", metaPath: META_PATH });

    expect(result).toMatchObject({
      status: "clean",
      recommendedAction: "skip",
      recommendedCommand: null,
      recommendedPromptText: "",
    });
  });

  it("classifies an aliased current checkout by its filesystem identity", async () => {
    const state = LocusStateV1Schema.parse({
      roster: {
        mode: "locus",
        ok: true,
        primaryPath: "/physical/repo",
        rows: [{
          kind: "unmanaged-checkout",
          checkoutPath: "/physical/repo",
          primary: false,
          recordId: null,
          role: null,
          identity: null,
          lease: null,
          frame: "idle",
          derived: null,
          diagnostics: [],
        }],
        diagnostics: [],
      },
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/physical/repo" },
      inFlightIdentities: [],
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    });

    expect(await classifyCurrentWuLocusRole(state, "/alias/repo", "dependent")).toBe("missing");
  });
});

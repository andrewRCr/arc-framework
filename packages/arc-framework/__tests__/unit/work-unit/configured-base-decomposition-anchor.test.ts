import { describe, expect, it } from "vitest";

import { canonicalize, digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
  resolveConfiguredBaseDecompositionAnchorByReceiptId,
  type ConfiguredBaseDecompositionAnchorDependencies,
} from "../../../src/lib/work-unit/configured-base-decomposition-anchor.js";
import {
  deriveDecompositionLocalCleanupEligibility,
} from "../../../src/lib/work-unit/decomposition-local-cleanup.js";
import { v3DecomposeReceiptPath } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  composeLandedDecompositionHandoff,
} from "../../../src/lib/work-unit/landed-decomposition-handoff.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const MERGE_HEAD = "e".repeat(40);
const BASE_REF = "refs/heads/main";
const RECORD_OID = "1".repeat(40);

function harness(options: {
  landing?: "fast-forward" | "merge" | "unlanded";
  baseReread?: string;
  namespace?: "receipt" | "absent" | "corrupt";
  wrongCandidateTree?: boolean;
  changedPaths?: string[];
  receiptPreexisting?: boolean;
} = {}): {
  deps: ConfiguredBaseDecompositionAnchorDependencies;
  calls: string[];
} {
  const fixture = v3DecompositionEvidenceFixture();
  const receipt = fixture.receipt;
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const landing = options.landing ?? "fast-forward";
  const baseHead = landing === "merge" ? MERGE_HEAD : CANDIDATE_HEAD;
  const candidateTree = options.wrongCandidateTree ? "f".repeat(40) : CANDIDATE_TREE;
  const calls: string[] = [];
  let baseRefReads = 0;
  const blobBytes = new Map<string, Uint8Array>();
  const blobOids = new Map<string, string>();
  const knownPreimages = [
    "cohort topology",
    "result 0",
    "result 1",
    "roadmap before",
    "roadmap after",
  ];
  for (const [index, label] of knownPreimages.entries()) {
    const bytes = new TextEncoder().encode(canonicalize(label));
    const digest = digestBytes(bytes);
    const oid = `${index + 2}`.repeat(40);
    blobBytes.set(oid, bytes);
    blobOids.set(digest, oid);
  }
  const namespaceLine = `100644 blob ${RECORD_OID}\t${receiptPath}\0`;
  blobBytes.set(RECORD_OID, new TextEncoder().encode(canonicalize(receipt)));

  return {
    calls,
    deps: {
      exec: async (_command, args) => {
        calls.push(args.join(" "));
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          baseRefReads += 1;
          return {
            stdout: `${baseRefReads === 1 ? baseHead : options.baseReread ?? baseHead}\n`,
          };
        }
        if (args[0] === "ls-tree" && args.includes(".arc/system/.internal/retirement-receipts")) {
          if (options.namespace === "absent") return { stdout: "" };
          if (options.namespace === "corrupt") return { stdout: "bad\0" };
          return { stdout: namespaceLine };
        }
        if (args[0] === "show") return { stdout: canonicalize(receipt) };
        if (args[0] === "rev-list") {
          if (landing === "unlanded") {
            return { stdout: `${CANDIDATE_HEAD} ${"a".repeat(40)}\n` };
          }
          if (args.at(-1) === CANDIDATE_HEAD) {
            return { stdout: `${CANDIDATE_HEAD} ${PREPARED_BASE}\n` };
          }
          if (landing === "merge") {
            return { stdout: `${MERGE_HEAD} ${PREPARED_BASE} ${CANDIDATE_HEAD}\n` };
          }
          return { stdout: `${CANDIDATE_HEAD} ${PREPARED_BASE}\n` };
        }
        if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}") === true) {
          return { stdout: `${args[1].startsWith(CANDIDATE_HEAD) ? candidateTree : CANDIDATE_TREE}\n` };
        }
        if (args[0] === "diff-tree") {
          const paths = options.changedPaths ?? [
            ...receipt.finalized.transitionPatch.map(({ path }) => path),
            receiptPath,
          ];
          return { stdout: `${paths.join("\0")}\0` };
        }
        if (args[0] === "ls-tree" && args[1] === "-z") {
          const ref = args[2];
          const path = args.at(-1) ?? "";
          if (path === receiptPath) {
            return ref === PREPARED_BASE && !options.receiptPreexisting
              ? { stdout: "" }
              : { stdout: `100644 blob ${RECORD_OID}\t${path}\0` };
          }
          const patch = receipt.finalized.transitionPatch.find((entry) => entry.path === path);
          const state = ref === PREPARED_BASE ? patch?.before : patch?.after;
          if (state === undefined || state.kind === "absent") return { stdout: "" };
          const oid = blobOids.get(state.contentDigest);
          return oid === undefined
            ? { stdout: "" }
            : { stdout: `${state.mode} blob ${oid}\t${path}\0` };
        }
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
      readBlob: async (oid) => {
        const bytes = blobBytes.get(oid);
        if (bytes === undefined) throw new Error("missing blob");
        return bytes;
      },
    },
  };
}

describe("resolveConfiguredBaseDecompositionAnchor", () => {
  it.each(["fast-forward", "merge"] as const)(
    "derives an exact %s landing from pinned commit topology and receipt-bound tree bytes",
    async (landing) => {
      const h = harness({ landing });
      const result = await resolveConfiguredBaseDecompositionAnchor(BASE_REF, "origin", h.deps);
      expect(result.status).toBe("resolved");
      if (result.status !== "resolved") return;
      expect(result.anchor.landing.kind).toBe(landing);
      expect(result.anchor.candidateCommitHead).toBe(CANDIDATE_HEAD);
      expect(result.anchor.currentBaseHead).toBe(landing === "merge" ? MERGE_HEAD : CANDIDATE_HEAD);
      expect(h.calls.at(-1)).toBe(`rev-parse --verify ${BASE_REF}^{commit}`);
    },
  );

  it("returns no authority for prepared-only, candidate-only, other-origin, or unlanded evidence", async () => {
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ namespace: "absent" }).deps,
    )).toEqual({ status: "absent" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "other-origin",
      harness().deps,
    )).toEqual({ status: "absent" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "unlanded" }).deps,
    )).toEqual({ status: "not-landed" });
  });

  it("refuses descendant, candidate-tree, transition-path, receipt-prestate, namespace, and configured-ref races", async () => {
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "unlanded" }).deps,
    )).toEqual({ status: "not-landed" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "merge", wrongCandidateTree: true }).deps,
    )).toEqual({ status: "refused", reason: "transition-tree" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ changedPaths: [".arc/foreign.md"] }).deps,
    )).toEqual({ status: "refused", reason: "transition-tree" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ receiptPreexisting: true }).deps,
    )).toEqual({ status: "refused", reason: "transition-tree" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ namespace: "corrupt" }).deps,
    )).toEqual({ status: "refused", reason: "namespace-corrupt" });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ baseReread: "f".repeat(40) }).deps,
    )).toEqual({ status: "stale", reason: "configured-base-raced" });
  });

  it("returns byte-equal shared authority for independent consumers of one pinned landing", async () => {
    const first = await resolveConfiguredBaseDecompositionAnchor(BASE_REF, "origin", harness().deps);
    const second = await resolveConfiguredBaseDecompositionAnchor(BASE_REF, "origin", harness().deps);
    expect(first.status).toBe("resolved");
    expect(second.status).toBe("resolved");
    if (first.status !== "resolved" || second.status !== "resolved") return;
    expect(canonicalize(first.anchor)).toBe(canonicalize(second.anchor));
  });

  it("selects the same exact landing by canonical receipt identity", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const result = await resolveConfiguredBaseDecompositionAnchorByReceiptId(
      BASE_REF,
      receipt.receiptId,
      harness().deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor.receiptId).toBe(receipt.receiptId);
  });

  it("supplies byte-equal anchor facts to start, landed handoff, and cleanup consumers", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const start = await resolveConfiguredBaseDecompositionAnchorByReceiptId(
      BASE_REF,
      receipt.receiptId,
      harness().deps,
    );
    const handoffSelection = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness().deps,
    );
    const cleanupSelection = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness().deps,
    );
    expect(start.status).toBe("resolved");
    expect(handoffSelection.status).toBe("resolved");
    expect(cleanupSelection.status).toBe("resolved");
    if (start.status !== "resolved"
      || handoffSelection.status !== "resolved"
      || cleanupSelection.status !== "resolved") return;

    const handoff = composeLandedDecompositionHandoff({
      originalSlug: "origin",
      integrationAnchor: handoffSelection.anchor,
      publication: {
        anchor: {
          ...receipt.finalized.publication.logicalAnchor,
          displayPath: ".arc/backlog/planned/origin",
        },
        entries: receipt.finalized.publication.entries.map((entry) =>
          entry.kind === "new-leaf"
            ? {
              kind: entry.kind,
              slug: entry.slug,
              displayPath: `.arc/backlog/planned/origin/${entry.slug}`,
              readiness: { kind: "ready" as const },
            }
            : {
              ...entry,
              displayPath: entry.target.kind === "document"
                ? entry.target.path
                : `.arc/backlog/planned/${entry.destinationId}`,
            }),
      },
    });
    const cleanup = deriveDecompositionLocalCleanupEligibility(cleanupSelection, {
      origin: "origin",
      branch: "plan/origin",
      head: "a".repeat(40),
      locality: "local",
    });
    expect(handoff.status).toBe("resolved");
    expect(cleanup.status).toBe("eligible");
    if (handoff.status !== "resolved" || cleanup.status !== "eligible") return;

    expect(canonicalize(start.anchor)).toBe(canonicalize(cleanup.cleanup.integrationAnchor));
    expect(handoff.handoff.authority).toMatchObject({
      configuredBaseHead: start.anchor.currentBaseHead,
      receiptId: start.anchor.receiptId,
      preparationId: start.anchor.preparationId,
      sourceHead: start.anchor.sourceHead,
      candidateCommitHead: start.anchor.candidateCommitHead,
      landedCommitHead: start.anchor.landedCommitHead,
      landedTree: start.anchor.landedTree,
    });
  });
});

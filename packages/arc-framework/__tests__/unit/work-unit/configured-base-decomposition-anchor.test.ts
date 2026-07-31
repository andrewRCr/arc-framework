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
import { RETIREMENT_RECORD_NAMESPACE } from "../../../src/lib/work-unit/retirement-record-store.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const MERGE_HEAD = "e".repeat(40);
const DESCENDANT_HEAD = "6".repeat(40);
const PREPARED_TREE = "7".repeat(40);
const DESCENDANT_TREE = "8".repeat(40);
const ADVANCED_CANDIDATE = "2".repeat(40);
const BASE_ADVANCE = "3".repeat(40);
const DESCENDANT_MERGE = "4".repeat(40);
const OFF_LINE_BASE = "5".repeat(40);
const ALT_CANDIDATE = "0".repeat(40);
const BASE_REF = "refs/heads/main";
const RECORD_OID = "1".repeat(40);
const CORRUPT_RECORD_OID = "9".repeat(40);
const CORRUPT_RECORD_PATH = `${
  RETIREMENT_RECORD_NAMESPACE
}/sha256-${"0".repeat(64)}.json`;

function harness(options: {
  landing?: "fast-forward" | "merge" | "unlanded" | "descendant" | "prepared-only" | "candidate-only";
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
  const baseHead = landing === "merge"
    ? MERGE_HEAD
    : landing === "descendant"
      ? DESCENDANT_HEAD
      : landing === "prepared-only" || landing === "candidate-only"
        ? PREPARED_BASE
        : CANDIDATE_HEAD;
  const candidateTree = options.wrongCandidateTree ? "f".repeat(40) : CANDIDATE_TREE;
  const commits = new Map<string, { tree: string; parents: string[] }>([
    [PREPARED_BASE, { tree: PREPARED_TREE, parents: ["a".repeat(40)] }],
    [CANDIDATE_HEAD, {
      tree: candidateTree,
      parents: landing === "unlanded" ? ["a".repeat(40)] : [PREPARED_BASE],
    }],
    [MERGE_HEAD, { tree: CANDIDATE_TREE, parents: [PREPARED_BASE, CANDIDATE_HEAD] }],
    [DESCENDANT_HEAD, { tree: DESCENDANT_TREE, parents: [CANDIDATE_HEAD] }],
  ]);
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
          const requested = args[2]?.replace(/\^\{commit\}$/u, "") ?? "";
          if (requested !== BASE_REF) {
            return { stdout: commits.has(requested) ? `${requested}\n` : "" };
          }
          baseRefReads += 1;
          return {
            stdout: `${baseRefReads === 1 ? baseHead : options.baseReread ?? baseHead}\n`,
          };
        }
        if (args[0] === "ls-tree" && args.includes(".arc/system/.internal/retirement-receipts")) {
          if (options.namespace === "absent"
            || landing === "prepared-only"
            || landing === "candidate-only") return { stdout: "" };
          if (options.namespace === "corrupt") {
            return {
              stdout: `100644 blob ${CORRUPT_RECORD_OID}\t${CORRUPT_RECORD_PATH}\0`,
            };
          }
          return { stdout: namespaceLine };
        }
        if (args[0] === "show") {
          return { stdout: args[1] === CORRUPT_RECORD_OID ? "{}" : canonicalize(receipt) };
        }
        if (args[0] === "rev-list") {
          if (args[1] === "--parents") {
            const head = args.at(-1) ?? "";
            const commit = commits.get(head);
            return commit === undefined
              ? { stdout: "" }
              : { stdout: `${head}${commit.parents.length === 0 ? "" : ` ${commit.parents.join(" ")}`}\n` };
          }
          if (args[1] === "--topo-order") {
            return landing === "descendant"
              ? { stdout: `${DESCENDANT_HEAD}\n${CANDIDATE_HEAD}\n` }
              : { stdout: "" };
          }
        }
        if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}") === true) {
          const head = args[1].slice(0, -"^{tree}".length);
          return { stdout: `${commits.get(head)?.tree ?? ""}\n` };
        }
        if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
          const ancestor = args[2] ?? "";
          const descendant = args[3] ?? "";
          const seen = new Set<string>();
          const stack = [descendant];
          while (stack.length > 0) {
            const current = stack.pop();
            if (current === undefined || seen.has(current)) continue;
            if (current === ancestor) return { stdout: "" };
            seen.add(current);
            stack.push(...(commits.get(current)?.parents ?? []));
          }
          const error = Object.assign(new Error("not ancestor"), { exitCode: 1 });
          throw error;
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
          const rawPath = args.at(-1) ?? "";
          const path = rawPath.startsWith(":(literal)") ? rawPath.slice(":(literal)".length) : rawPath;
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

function dagHarness(options: {
  baseHead: string;
  commits: ReadonlyMap<string, { tree: string; parents: string[] }>;
  enumeration: string[];
  replayingCandidates?: ReadonlySet<string>;
  changedByPair?: ReadonlyMap<string, string[]>;
  entryOidByRefPath?: ReadonlyMap<string, string | null>;
  receiptAbsentRefs?: ReadonlySet<string>;
  baseReread?: string;
}): {
  deps: ConfiguredBaseDecompositionAnchorDependencies;
  calls: string[];
} {
  const { receipt } = v3DecompositionEvidenceFixture();
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const expectedPaths = [
    ...receipt.finalized.transitionPatch.map(({ path }) => path),
    receiptPath,
  ];
  const replaying = options.replayingCandidates ?? new Set([CANDIDATE_HEAD]);
  const calls: string[] = [];
  let baseReads = 0;
  const blobBytes = new Map<string, Uint8Array>();
  const blobOids = new Map<string, string>();
  for (const [index, label] of [
    "cohort topology",
    "result 0",
    "result 1",
    "roadmap before",
    "roadmap after",
  ].entries()) {
    const bytes = new TextEncoder().encode(canonicalize(label));
    const oid = `${index + 2}`.repeat(40);
    blobBytes.set(oid, bytes);
    blobOids.set(digestBytes(bytes), oid);
  }
  blobBytes.set(RECORD_OID, new TextEncoder().encode(canonicalize(receipt)));
  const ancestorsOf = (head: string): Set<string> => {
    const found = new Set<string>();
    const stack = [head];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || found.has(current)) continue;
      found.add(current);
      stack.push(...(options.commits.get(current)?.parents ?? []));
    }
    return found;
  };
  return {
    calls,
    deps: {
      exec: async (_command, args) => {
        calls.push(args.join(" "));
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          const requested = args[2]?.replace(/\^\{commit\}$/u, "") ?? "";
          if (requested === BASE_REF) {
            baseReads += 1;
            return { stdout: `${baseReads === 1 ? options.baseHead : options.baseReread ?? options.baseHead}\n` };
          }
          return { stdout: options.commits.has(requested) ? `${requested}\n` : "" };
        }
        if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}") === true) {
          const head = args[1].slice(0, -"^{tree}".length);
          return { stdout: `${options.commits.get(head)?.tree ?? ""}\n` };
        }
        if (args[0] === "rev-list" && args[1] === "--parents") {
          const head = args.at(-1) ?? "";
          const commit = options.commits.get(head);
          return commit === undefined
            ? { stdout: "" }
            : { stdout: `${head}${commit.parents.length === 0 ? "" : ` ${commit.parents.join(" ")}`}\n` };
        }
        if (args[0] === "rev-list" && args[1] === "--topo-order") {
          return { stdout: options.enumeration.map((head) => `${head}\n`).join("") };
        }
        if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
          const ancestor = args[2] ?? "";
          const descendant = args[3] ?? "";
          if (ancestorsOf(descendant).has(ancestor)) return { stdout: "" };
          throw Object.assign(new Error("not ancestor"), { exitCode: 1 });
        }
        if (args[0] === "ls-tree" && args.includes(".arc/system/.internal/retirement-receipts")) {
          return { stdout: `100644 blob ${RECORD_OID}\t${receiptPath}\0` };
        }
        if (args[0] === "show") return { stdout: canonicalize(receipt) };
        if (args[0] === "diff-tree") {
          const before = args.at(-2) ?? "";
          const after = args.at(-1) ?? "";
          const paths = options.changedByPair?.get(`${before}\0${after}`)
            ?? (before === PREPARED_BASE && replaying.has(after)
              ? expectedPaths
              : [".arc/foreign.md"]);
          return { stdout: `${paths.join("\0")}\0` };
        }
        if (args[0] === "ls-tree" && args[1] === "-z") {
          const ref = args[2] ?? "";
          const rawPath = args.at(-1) ?? "";
          const path = rawPath.startsWith(":(literal)") ? rawPath.slice(":(literal)".length) : rawPath;
          const overrideKey = `${ref}\0${path}`;
          if (options.entryOidByRefPath?.has(overrideKey) === true) {
            const oid = options.entryOidByRefPath.get(overrideKey);
            return oid === null ? { stdout: "" } : { stdout: `100644 blob ${oid}\t${path}\0` };
          }
          if (path === receiptPath) {
            return ref === PREPARED_BASE || options.receiptAbsentRefs?.has(ref) === true
              ? { stdout: "" }
              : { stdout: `100644 blob ${RECORD_OID}\t${path}\0` };
          }
          const entry = receipt.finalized.transitionPatch.find((candidate) => candidate.path === path);
          const state = ref === PREPARED_BASE ? entry?.before : entry?.after;
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

function commitGraph(
  entries: Array<readonly [string, string, string[]]>,
): Map<string, { tree: string; parents: string[] }> {
  return new Map([
    [PREPARED_BASE, { tree: PREPARED_TREE, parents: ["a".repeat(40)] }],
    ...entries.map(([head, tree, parents]) => [head, { tree, parents }] as const),
  ]);
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
      expect(h.calls).toContain(
        `ls-tree -z ${CANDIDATE_HEAD} -- :(literal)${
          v3DecomposeReceiptPath(result.anchor.receiptId)
        }`,
      );
      expect(h.calls.at(-1)).toBe(`rev-parse --verify ${BASE_REF}^{commit}`);
      expect(h.calls.some((call) => call.startsWith("rev-list --topo-order"))).toBe(false);
    },
  );

  it("returns absent for prepared-only configured-base evidence", async () => {
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "prepared-only" }).deps,
    )).toEqual({ status: "absent" });
  });

  it("does not inspect an unlanded candidate branch when configured-base evidence is absent", async () => {
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "candidate-only" }).deps,
    )).toEqual({ status: "absent" });
  });

  it("returns no authority for another origin or a committed-unlanded receipt", async () => {
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

  it("derives the landed commit beneath a descendant configured base", async () => {
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "descendant" }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      currentBaseHead: DESCENDANT_HEAD,
      landedCommitHead: CANDIDATE_HEAD,
      landedTree: CANDIDATE_TREE,
      landing: { kind: "fast-forward" },
    });
  });

  it("recognizes an advanced two-parent candidate as a fast-forward landing", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [ADVANCED_CANDIDATE, CANDIDATE_TREE, [CANDIDATE_HEAD, PREPARED_BASE]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: ADVANCED_CANDIDATE,
        commits,
        enumeration: [],
        replayingCandidates: new Set([ADVANCED_CANDIDATE]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      candidateCommitHead: ADVANCED_CANDIDATE,
      landedCommitHead: ADVANCED_CANDIDATE,
      landing: { kind: "fast-forward" },
    });
  });

  it("recognizes a merge landing of an advanced candidate at the prepared base", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [ADVANCED_CANDIDATE, CANDIDATE_TREE, [CANDIDATE_HEAD, PREPARED_BASE]],
      [MERGE_HEAD, CANDIDATE_TREE, [PREPARED_BASE, ADVANCED_CANDIDATE]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: MERGE_HEAD,
        commits,
        enumeration: [],
        replayingCandidates: new Set([ADVANCED_CANDIDATE]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      candidateCommitHead: ADVANCED_CANDIDATE,
      landedCommitHead: MERGE_HEAD,
      landing: { kind: "merge" },
    });
  });

  it("selects a descendant landing merge over its replaying candidate", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [DESCENDANT_MERGE, "a".repeat(40), [BASE_ADVANCE, CANDIDATE_HEAD]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [DESCENDANT_MERGE]],
    ]);
    const changedByPair = new Map([
      [`${BASE_ADVANCE}\0${DESCENDANT_MERGE}`, [
        ...v3DecompositionEvidenceFixture().receipt.finalized.transitionPatch.map(({ path }) => path),
        v3DecomposeReceiptPath(v3DecompositionEvidenceFixture().receipt.receiptId),
      ]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, DESCENDANT_MERGE, BASE_ADVANCE, CANDIDATE_HEAD],
        changedByPair,
        receiptAbsentRefs: new Set([BASE_ADVANCE]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      currentBaseHead: DESCENDANT_HEAD,
      candidateCommitHead: CANDIDATE_HEAD,
      landedCommitHead: DESCENDANT_MERGE,
      landedTree: "a".repeat(40),
      landing: { kind: "merge" },
    });
  });

  it("selects an exact merge landing after the base advances beyond it", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [MERGE_HEAD, CANDIDATE_TREE, [PREPARED_BASE, CANDIDATE_HEAD]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [MERGE_HEAD]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, MERGE_HEAD, CANDIDATE_HEAD],
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      currentBaseHead: DESCENDANT_HEAD,
      landedCommitHead: MERGE_HEAD,
      landedTree: CANDIDATE_TREE,
      landing: { kind: "merge" },
    });
  });

  it("selects a descendant merge whose surviving candidate was itself advanced", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const expectedPaths = [
      ...receipt.finalized.transitionPatch.map(({ path }) => path),
      v3DecomposeReceiptPath(receipt.receiptId),
    ];
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [ADVANCED_CANDIDATE, CANDIDATE_TREE, [CANDIDATE_HEAD, PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [DESCENDANT_MERGE, "a".repeat(40), [BASE_ADVANCE, ADVANCED_CANDIDATE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [DESCENDANT_MERGE]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_MERGE, BASE_ADVANCE, ADVANCED_CANDIDATE, CANDIDATE_HEAD],
        replayingCandidates: new Set([ADVANCED_CANDIDATE]),
        changedByPair: new Map([[`${BASE_ADVANCE}\0${DESCENDANT_MERGE}`, expectedPaths]]),
        receiptAbsentRefs: new Set([BASE_ADVANCE]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor).toMatchObject({
      candidateCommitHead: ADVANCED_CANDIDATE,
      landedCommitHead: DESCENDANT_MERGE,
      landing: { kind: "merge" },
    });
  });

  it("admits a projection-only resolution in a descendant landing merge", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const projectionPath = receipt.prepared.prospectiveProjection.roadmap.path;
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [DESCENDANT_MERGE, "a".repeat(40), [BASE_ADVANCE, CANDIDATE_HEAD]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [DESCENDANT_MERGE]],
    ]);
    const expectedPaths = [
      ...receipt.finalized.transitionPatch.map(({ path }) => path),
      v3DecomposeReceiptPath(receipt.receiptId),
    ];
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_MERGE, CANDIDATE_HEAD],
        changedByPair: new Map([[`${BASE_ADVANCE}\0${DESCENDANT_MERGE}`, expectedPaths]]),
        entryOidByRefPath: new Map([[`${DESCENDANT_MERGE}\0${projectionPath}`, "f".repeat(40)]]),
        receiptAbsentRefs: new Set([BASE_ADVANCE]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
  });

  it("finds a landing that is off the current base's first-parent line", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [ALT_CANDIDATE, DESCENDANT_TREE, [CANDIDATE_HEAD]],
      [OFF_LINE_BASE, DESCENDANT_TREE, [BASE_ADVANCE, ALT_CANDIDATE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [OFF_LINE_BASE]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, OFF_LINE_BASE, BASE_ADVANCE, ALT_CANDIDATE, CANDIDATE_HEAD],
        changedByPair: new Map([[`${BASE_ADVANCE}\0${OFF_LINE_BASE}`, [".arc/foreign.md"]]]),
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor.landedCommitHead).toBe(CANDIDATE_HEAD);
  });

  it("does not replace the original landing with a later merge that already has the receipt", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
    const expectedPaths = [
      ...receipt.finalized.transitionPatch.map(({ path }) => path),
      receiptPath,
    ];
    const originalLanding = "d".repeat(40);
    const laterCandidate = "e".repeat(40);
    const laterMerge = "f".repeat(40);
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [originalLanding, "a".repeat(40), [BASE_ADVANCE, CANDIDATE_HEAD]],
      [laterCandidate, CANDIDATE_TREE, [PREPARED_BASE]],
      [laterMerge, "a".repeat(40), [originalLanding, laterCandidate]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: laterMerge,
        commits,
        enumeration: [laterMerge, originalLanding, BASE_ADVANCE, laterCandidate, CANDIDATE_HEAD],
        replayingCandidates: new Set([CANDIDATE_HEAD, laterCandidate]),
        changedByPair: new Map([
          [`${BASE_ADVANCE}\0${originalLanding}`, expectedPaths],
          [`${originalLanding}\0${laterMerge}`, []],
        ]),
        receiptAbsentRefs: new Set([BASE_ADVANCE]),
      }).deps,
    );

    expect(result).toEqual({ status: "ambiguous" });
  });

  it("keeps the original landing when a later merge reintroduces an already-contained candidate", async () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
    const expectedPaths = [
      ...receipt.finalized.transitionPatch.map(({ path }) => path),
      receiptPath,
    ];
    const originalLanding = "d".repeat(40);
    const receiptDeletion = "e".repeat(40);
    const laterMerge = "f".repeat(40);
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [originalLanding, "a".repeat(40), [BASE_ADVANCE, CANDIDATE_HEAD]],
      [receiptDeletion, DESCENDANT_TREE, [originalLanding]],
      [laterMerge, "a".repeat(40), [receiptDeletion, CANDIDATE_HEAD]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: laterMerge,
        commits,
        enumeration: [laterMerge, receiptDeletion, originalLanding, BASE_ADVANCE, CANDIDATE_HEAD],
        changedByPair: new Map([
          [`${BASE_ADVANCE}\0${originalLanding}`, expectedPaths],
          [`${receiptDeletion}\0${laterMerge}`, [receiptPath]],
        ]),
        receiptAbsentRefs: new Set([BASE_ADVANCE, receiptDeletion]),
      }).deps,
    );

    expect(result).toMatchObject({
      status: "resolved",
      anchor: {
        candidateCommitHead: CANDIDATE_HEAD,
        landedCommitHead: originalLanding,
      },
    });
  });

  it("discards non-replaying structural hits before selecting the landing", async () => {
    const commits = commitGraph([
      [ALT_CANDIDATE, CANDIDATE_TREE, [PREPARED_BASE]],
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [CANDIDATE_HEAD]],
    ]);
    const result = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [ALT_CANDIDATE, DESCENDANT_HEAD, CANDIDATE_HEAD],
      }).deps,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.anchor.landedCommitHead).toBe(CANDIDATE_HEAD);
  });

  it("returns ambiguous for incomparable replaying landing candidates", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [ALT_CANDIDATE, CANDIDATE_TREE, [PREPARED_BASE]],
      [OFF_LINE_BASE, DESCENDANT_TREE, [CANDIDATE_HEAD, ALT_CANDIDATE, PREPARED_BASE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [OFF_LINE_BASE]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [OFF_LINE_BASE, CANDIDATE_HEAD, ALT_CANDIDATE],
        replayingCandidates: new Set([CANDIDATE_HEAD, ALT_CANDIDATE]),
      }).deps,
    )).toEqual({ status: "ambiguous" });
  });

  it("does not enumerate when prepared-base history was replaced", async () => {
    const commits = commitGraph([
      [ALT_CANDIDATE, DESCENDANT_TREE, ["a".repeat(40)]],
    ]);
    const h = dagHarness({
      baseHead: ALT_CANDIDATE,
      commits,
      enumeration: [ALT_CANDIDATE],
      replayingCandidates: new Set(),
    });
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      h.deps,
    )).toEqual({ status: "not-landed" });
    expect(h.calls.some((call) => call.startsWith("rev-list --topo-order"))).toBe(false);
  });

  it("returns not-landed when no enumerated structural hit replays", async () => {
    const commits = commitGraph([
      [ALT_CANDIDATE, CANDIDATE_TREE, [PREPARED_BASE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [ALT_CANDIDATE]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, ALT_CANDIDATE],
        replayingCandidates: new Set(),
      }).deps,
    )).toEqual({ status: "not-landed" });
  });

  it("refuses a located landing that is not an ancestor of the pinned base", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [BASE_ADVANCE]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [CANDIDATE_HEAD],
      }).deps,
    )).toEqual({ status: "not-landed" });
  });

  it("closes a descendant derivation when the configured base moves before reread", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [CANDIDATE_HEAD]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, CANDIDATE_HEAD],
        baseReread: OFF_LINE_BASE,
      }).deps,
    )).toEqual({ status: "stale", reason: "configured-base-raced" });
  });

  it("refuses altered selected merge trees instead of electing their candidates", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [MERGE_HEAD, "f".repeat(40), [PREPARED_BASE, CANDIDATE_HEAD]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [MERGE_HEAD]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_HEAD, MERGE_HEAD, CANDIDATE_HEAD],
      }).deps,
    )).toEqual({ status: "refused", reason: "transition-tree" });
  });

  it("refuses descendant-merge composition drift instead of electing its candidate", async () => {
    const commits = commitGraph([
      [CANDIDATE_HEAD, CANDIDATE_TREE, [PREPARED_BASE]],
      [BASE_ADVANCE, DESCENDANT_TREE, [PREPARED_BASE]],
      [DESCENDANT_MERGE, "a".repeat(40), [BASE_ADVANCE, CANDIDATE_HEAD]],
      [DESCENDANT_HEAD, DESCENDANT_TREE, [DESCENDANT_MERGE]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: DESCENDANT_HEAD,
        commits,
        enumeration: [DESCENDANT_MERGE, CANDIDATE_HEAD],
        changedByPair: new Map([[`${BASE_ADVANCE}\0${DESCENDANT_MERGE}`, [".arc/foreign.md"]]]),
        receiptAbsentRefs: new Set([BASE_ADVANCE]),
      }).deps,
    )).toEqual({ status: "refused", reason: "transition-tree" });
  });

  it("refuses octopus commits that carry the prepared base beyond slot one", async () => {
    const commits = commitGraph([
      [BASE_ADVANCE, DESCENDANT_TREE, ["a".repeat(40)]],
      [OFF_LINE_BASE, DESCENDANT_TREE, [BASE_ADVANCE, "a".repeat(40), PREPARED_BASE]],
    ]);
    expect(await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      dagHarness({
        baseHead: OFF_LINE_BASE,
        commits,
        enumeration: [OFF_LINE_BASE],
        replayingCandidates: new Set(),
      }).deps,
    )).toEqual({ status: "not-landed" });
  });

  it("refuses candidate-tree, transition-path, receipt-prestate, namespace, and configured-ref races", async () => {
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
    )).toEqual({
      status: "refused",
      reason: "namespace-corrupt",
      ref: CANDIDATE_HEAD,
      record: CORRUPT_RECORD_PATH,
    });
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
      harness({ landing: "descendant" }).deps,
    );
    const handoffSelection = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "descendant" }).deps,
    );
    const cleanupSelection = await resolveConfiguredBaseDecompositionAnchor(
      BASE_REF,
      "origin",
      harness({ landing: "descendant" }).deps,
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

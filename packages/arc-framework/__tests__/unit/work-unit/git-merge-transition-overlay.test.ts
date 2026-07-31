import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalize,
  digestBytes,
} from "../../../src/lib/canonical/canonical-json.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import {
  resolveGitMergeTransitionOverlay,
  type GitMergeTransitionOverlayDependencies,
} from "../../../src/lib/work-unit/git-merge-transition-overlay.js";
import { v3DecomposeReceiptPath } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { parseV3DecomposeReceipt } from "../../../src/lib/work-unit/decompose-v3-receipt.js";
import { RETIREMENT_RECORD_NAMESPACE } from "../../../src/lib/work-unit/retirement-record-store.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const HEAD_OID = "1".repeat(40);
const MERGE_HEAD_OID = "2".repeat(40);
const SECOND_MERGE_HEAD_OID = "3".repeat(40);
const CANDIDATE_TREE_OID = "4".repeat(40);
const REBASE_HEAD = "5".repeat(40);
const SOURCE_HEAD_OID = "6".repeat(40);
const RACED_HEAD_OID = "7".repeat(40);
const RACED_BASE_OID = "8".repeat(40);
const RACED_TREE_OID = "9".repeat(40);
const MARKERS = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"] as const;

const execMock = vi.fn<GitExec>();
const readFileMock = vi.fn<GitMergeTransitionOverlayDependencies["fs"]["readFile"]>();
const readBlobMock = vi.fn<GitMergeTransitionOverlayDependencies["readBlob"]>();

function missingFile(): NodeJS.ErrnoException {
  return Object.assign(new Error("not found"), { code: "ENOENT" });
}

function resetMockDefaults(): void {
  execMock.mockImplementation(async (_command, args): Promise<ExecResult> => {
    const marker = MARKERS.find((candidate) => args.at(-1) === candidate);
    if (args[0] === "rev-parse" && args.includes("--git-path") && marker !== undefined) {
      return { stdout: `/git/${marker}\n`, stderr: "" };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  });
  readFileMock.mockImplementation(async (path) => {
    if (path === "/git/REBASE_HEAD") return `${REBASE_HEAD}\n`;
    throw missingFile();
  });
  readBlobMock.mockImplementation(async () => {
    throw new Error("non-merge operation must not read receipt objects");
  });
}

function dependencies(): GitMergeTransitionOverlayDependencies {
  return {
    cwd: "/repo",
    exec: execMock,
    fs: { readFile: readFileMock },
    readBlob: readBlobMock,
  };
}

interface TestTreeEntry {
  mode: "100644" | "100755";
  oid: string;
  bytes: Uint8Array;
}

interface InstalledMergeSnapshot {
  evidence: ReturnType<typeof v3DecompositionEvidenceFixture>;
  receiptPath: string;
  put(
    ref: string,
    path: string,
    bytes: Uint8Array,
    mode?: TestTreeEntry["mode"],
  ): void;
}

function installMergeSnapshot(options: {
  candidateReceipt?: boolean;
  mergeHeadOids?: readonly string[];
  receiptParents?: "none" | "head" | "merge-head" | "all-merge-heads";
  restatedParent?: "head" | "merge-head";
} = {}): InstalledMergeSnapshot {
  const sourceMetaPath = ".arc/active/meta-origin.md";
  const sourceMetaBytes = Buffer.from(renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    branch: "plan/origin",
    design: ["draft-origin.md"],
  }), "utf8");
  const sourceMetaArtifact = {
    path: sourceMetaPath,
    objectKind: "blob" as const,
    mode: "100644" as const,
    contentDigest: digestBytes(sourceMetaBytes),
  };
  const evidence = v3DecompositionEvidenceFixture({
    sourceHead: SOURCE_HEAD_OID,
    resultBaseHead: HEAD_OID,
    digestLabel: (label) => digestBytes(Buffer.from(label, "utf8")),
    additionalSourceArtifacts: [sourceMetaArtifact],
  });
  const mergeHeadOids = options.mergeHeadOids ?? [MERGE_HEAD_OID];
  const candidateReceiptPresent = options.candidateReceipt ?? true;
  const receiptParents = options.receiptParents ?? "merge-head";
  const receiptPath = v3DecomposeReceiptPath(evidence.receipt.receiptId);
  const sourcePath = evidence.preparation.facts.completedMap.machine.sourceUnits[0]!.sourcePath;
  const entries = new Map<string, Map<string, TestTreeEntry>>();
  const blobs = new Map<string, Uint8Array>();
  entries.set(HEAD_OID, new Map());
  for (const mergeHeadOid of mergeHeadOids) entries.set(mergeHeadOid, new Map());
  let objectIndex = 10;
  const put = (
    ref: string,
    path: string,
    bytes: Uint8Array,
    mode: TestTreeEntry["mode"] = "100644",
  ): void => {
    const oid = objectIndex.toString(16).padStart(40, "0");
    objectIndex += 1;
    blobs.set(oid, bytes);
    const tree = entries.get(ref) ?? new Map<string, TestTreeEntry>();
    tree.set(path, { mode, oid, bytes });
    entries.set(ref, tree);
  };
  const add = (
    ref: string,
    path: string,
    label: string,
    mode: TestTreeEntry["mode"] = "100644",
  ): void => {
    put(ref, path, Buffer.from(label, "utf8"), mode);
  };
  add(SOURCE_HEAD_OID, sourcePath, "source unit");
  put(SOURCE_HEAD_OID, sourceMetaPath, sourceMetaBytes);
  put(
    SOURCE_HEAD_OID,
    ".arc/backlog/planned/consumer/meta-consumer.md",
    Buffer.from(renderMetaFile("consumer", {
      state: "Planning",
      owner: "andrew",
      dependsOn: ["origin"],
    }), "utf8"),
  );
  for (const result of evidence.receipt.finalized.managedPathResults) {
    const label = result.path.endsWith("ROADMAP.md")
      ? "roadmap after"
      : result.path.endsWith("cohort-origin.md")
        ? "cohort topology"
        : result.path.includes("member-a")
          ? "result 0"
          : "result 1";
    add(CANDIDATE_TREE_OID, result.path, label);
  }
  add(HEAD_OID, ".arc/backlog/ROADMAP.md", "roadmap before");
  add(CANDIDATE_TREE_OID, receiptPath, canonicalize(evidence.receipt));
  const candidateReceipt = entries.get(CANDIDATE_TREE_OID)?.get(receiptPath);
  if (candidateReceipt === undefined) throw new Error("fixture receipt entry is missing");
  if (receiptParents === "none") {
    // Candidate-only evidence has no operation-parent provenance.
  } else if (receiptParents === "head") {
    entries.get(HEAD_OID)?.set(receiptPath, candidateReceipt);
  } else if (receiptParents === "all-merge-heads") {
    for (const mergeHeadOid of mergeHeadOids) {
      entries.get(mergeHeadOid)?.set(receiptPath, candidateReceipt);
    }
  } else {
    const firstMergeHead = mergeHeadOids[0];
    if (firstMergeHead === undefined) throw new Error("merge fixture requires one merge head");
    entries.get(firstMergeHead)?.set(receiptPath, candidateReceipt);
  }
  if (options.restatedParent !== undefined) {
    const previous = v3DecompositionEvidenceFixture({
      sourceHead: SOURCE_HEAD_OID,
      resultBaseHead: MERGE_HEAD_OID,
      digestLabel: (label) => digestBytes(Buffer.from(label, "utf8")),
      additionalSourceArtifacts: [sourceMetaArtifact],
    });
    const parent = options.restatedParent === "head" ? HEAD_OID : mergeHeadOids[0];
    if (parent === undefined) throw new Error("restated parent fixture requires one merge head");
    put(parent, receiptPath, Buffer.from(canonicalize(previous.receipt), "utf8"));
  }
  if (!candidateReceiptPresent) entries.get(CANDIDATE_TREE_OID)?.delete(receiptPath);

  readFileMock.mockImplementation(async (path) => {
    if (path === "/git/MERGE_HEAD") return `${mergeHeadOids.join("\n")}\n`;
    throw missingFile();
  });
  readBlobMock.mockImplementation(async (oid) => {
    const bytes = blobs.get(oid);
    if (bytes === undefined) throw new Error(`missing test blob: ${oid}`);
    return bytes;
  });
  execMock.mockImplementation(async (_command, args): Promise<ExecResult> => {
    const marker = MARKERS.find((candidate) => args.at(-1) === candidate);
    if (args[0] === "rev-parse" && args.includes("--git-path") && marker !== undefined) {
      return { stdout: `/git/${marker}\n`, stderr: "" };
    }
    if (args.join("\0") === ["rev-parse", "--verify", "HEAD^{commit}"].join("\0")) {
      return { stdout: `${HEAD_OID}\n`, stderr: "" };
    }
    if (args.join("\0") === ["rev-parse", "--verify", "refs/heads/main^{commit}"].join("\0")) {
      return { stdout: `${HEAD_OID}\n`, stderr: "" };
    }
    if (args[0] === "write-tree") {
      return { stdout: `${CANDIDATE_TREE_OID}\n`, stderr: "" };
    }
    if (args[0] === "diff-tree") {
      const paths = [
        ...evidence.receipt.finalized.transitionPatch.map(({ path }) => path),
        ...(candidateReceiptPresent ? [receiptPath] : []),
      ]
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
      return { stdout: `${paths.join("\0")}\0`, stderr: "" };
    }
    if (args[0] === "ls-tree" && args.includes(".arc/active")) {
      const ref = args.find((value) => entries.has(value));
      const records = ref === undefined ? [] : [...(entries.get(ref)?.entries() ?? [])]
        .map(([path, entry]) => `${entry.mode} blob ${path}`);
      return { stdout: records.length === 0 ? "" : `${records.join("\0")}\0`, stderr: "" };
    }
    if (args[0] === "ls-tree" && args.includes(RETIREMENT_RECORD_NAMESPACE)) {
      const ref = args.find((value) => entries.has(value));
      const records = ref === undefined ? [] : [...(entries.get(ref)?.entries() ?? [])]
        .filter(([path]) => path.startsWith(`${RETIREMENT_RECORD_NAMESPACE}/`))
        .map(([path, entry]) => `${entry.mode} blob ${entry.oid}\t${path}`);
      return { stdout: records.length === 0 ? "" : `${records.join("\0")}\0`, stderr: "" };
    }
    if (args[0] === "ls-tree") {
      const ref = args.find((value) => entries.has(value));
      const literal = args.find((value) => value.startsWith(":(literal)"));
      if (ref === undefined || literal === undefined) {
        throw new Error(`malformed test ls-tree invocation: ${args.join(" ")}`);
      }
      const path = literal.slice(":(literal)".length);
      const entry = entries.get(ref)?.get(path);
      return {
        stdout: entry === undefined ? "" : `${entry.mode} blob ${entry.oid}\t${path}\0`,
        stderr: "",
      };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  });
  return { evidence, receiptPath, put };
}

beforeEach(() => {
  vi.resetAllMocks();
  resetMockDefaults();
});

describe("resolveGitMergeTransitionOverlay", () => {
  it.each([
    "REBASE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
  ] as const)("returns no inferred overlay when %s is the only operation marker", async (marker) => {
    readFileMock.mockImplementation(async (path) => {
      if (path === `/git/${marker}`) return `${REBASE_HEAD}\n`;
      throw missingFile();
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "absent" });
  });

  it("selects canonical receipt authority inherited from one merge parent", async () => {
    const { evidence } = installMergeSnapshot();

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toMatchObject({
      status: "selected",
      receiptId: evidence.receipt.receiptId,
      overlay: {
        kind: "validated",
        origin: "origin",
        sourceBranch: "plan/origin",
      },
      provenance: [
        { kind: "candidate-tree" },
        { kind: "merge-head", index: 0, commitOid: MERGE_HEAD_OID },
      ],
    });
  });

  it("selects canonical receipt authority inherited from the first parent", async () => {
    const { evidence } = installMergeSnapshot({ receiptParents: "head" });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toMatchObject({
      status: "selected",
      receiptId: evidence.receipt.receiptId,
      provenance: [
        { kind: "candidate-tree" },
        { kind: "head", commitOid: HEAD_OID },
      ],
    });
  });

  it("classifies an authored-cut-preserving parent receipt as restated provenance", async () => {
    const { evidence } = installMergeSnapshot({ receiptParents: "head", restatedParent: "head" });

    expect(await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies())).toMatchObject({
      status: "selected",
      receiptId: evidence.receipt.receiptId,
      provenance: [
        { kind: "candidate-tree" },
        { kind: "restated", parent: "head", commitOid: HEAD_OID },
      ],
    });
  });

  it("deduplicates identical authority inherited through ordered merge parents", async () => {
    const { evidence } = installMergeSnapshot({
      mergeHeadOids: [MERGE_HEAD_OID, SECOND_MERGE_HEAD_OID],
      receiptParents: "all-merge-heads",
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toMatchObject({
      status: "selected",
      receiptId: evidence.receipt.receiptId,
      provenance: [
        { kind: "candidate-tree" },
        { kind: "merge-head", index: 0, commitOid: MERGE_HEAD_OID },
        { kind: "merge-head", index: 1, commitOid: SECOND_MERGE_HEAD_OID },
      ],
    });
  });

  it("refuses candidate-only receipt evidence without operation-parent provenance", async () => {
    installMergeSnapshot({ receiptParents: "none" });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "refused", reason: "invalid-snapshot" });
  });

  it("returns no authority for receipt evidence present only in an operation parent", async () => {
    installMergeSnapshot({ candidateReceipt: false });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "absent" });
  });

  it("ignores unchanged historical receipts in the candidate namespace", async () => {
    const { evidence, put } = installMergeSnapshot();
    const historical = v3DecompositionEvidenceFixture({
      origin: "historical-origin",
      resultBaseHead: HEAD_OID,
    });
    const historicalPath = v3DecomposeReceiptPath(historical.receipt.receiptId);
    const historicalBytes = Buffer.from(canonicalize(historical.receipt), "utf8");
    put(CANDIDATE_TREE_OID, historicalPath, historicalBytes);
    put(HEAD_OID, historicalPath, historicalBytes);

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toMatchObject({
      status: "selected",
      receiptId: evidence.receipt.receiptId,
    });
  });

  it("refuses conflicting bytes for one receipt identity across pinned trees", async () => {
    const { evidence, receiptPath, put } = installMergeSnapshot();
    const conflicting = structuredClone(evidence.receipt);
    conflicting.finalized.publication.initialContinuation = {
      kind: "selected",
      slugs: ["member-b"],
    };
    expect(parseV3DecomposeReceipt(conflicting)).not.toBeNull();
    put(HEAD_OID, receiptPath, Buffer.from(canonicalize(conflicting), "utf8"));

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({
      status: "refused",
      reason: "namespace-corrupt",
      ref: HEAD_OID,
      record: receiptPath,
    });
  });

  it("returns no partial overlay when a pinned object read fails", async () => {
    installMergeSnapshot();
    readBlobMock.mockRejectedValue(new Error("object disappeared"));

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "refused", reason: "git-read-failed" });
  });

  it("refuses a snapshot with conflicting operation markers", async () => {
    installMergeSnapshot();
    readFileMock.mockImplementation(async (path) => {
      if (path === "/git/MERGE_HEAD") return `${MERGE_HEAD_OID}\n`;
      if (path === "/git/REBASE_HEAD") return `${REBASE_HEAD}\n`;
      throw missingFile();
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "refused", reason: "invalid-snapshot" });
  });

  it("fails closed when MERGE_HEAD disappears before authority is granted", async () => {
    installMergeSnapshot();
    let mergeHeadReads = 0;
    readFileMock.mockImplementation(async (path) => {
      if (path === "/git/MERGE_HEAD") {
        mergeHeadReads += 1;
        if (mergeHeadReads === 1) return `${MERGE_HEAD_OID}\n`;
      }
      throw missingFile();
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "stale", reason: "snapshot-raced" });
  });

  it("fails closed when HEAD moves before authority is granted", async () => {
    installMergeSnapshot();
    const stableExec = execMock.getMockImplementation();
    if (stableExec === undefined) throw new Error("merge fixture did not install git");
    let headReads = 0;
    execMock.mockImplementation(async (command, args, options) => {
      if (args.join("\0") === ["rev-parse", "--verify", "HEAD^{commit}"].join("\0")) {
        headReads += 1;
        if (headReads > 1) return { stdout: `${RACED_HEAD_OID}\n`, stderr: "" };
      }
      return await stableExec(command, args, options);
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "stale", reason: "snapshot-raced" });
  });

  it("fails closed when the configured base moves before authority is granted", async () => {
    installMergeSnapshot();
    const stableExec = execMock.getMockImplementation();
    if (stableExec === undefined) throw new Error("merge fixture did not install git");
    let baseReads = 0;
    execMock.mockImplementation(async (command, args, options) => {
      if (args.join("\0") === [
        "rev-parse",
        "--verify",
        "refs/heads/main^{commit}",
      ].join("\0")) {
        baseReads += 1;
        if (baseReads > 1) return { stdout: `${RACED_BASE_OID}\n`, stderr: "" };
      }
      return await stableExec(command, args, options);
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "stale", reason: "snapshot-raced" });
  });

  it("fails closed when the index tree moves before authority is granted", async () => {
    installMergeSnapshot();
    const stableExec = execMock.getMockImplementation();
    if (stableExec === undefined) throw new Error("merge fixture did not install git");
    let treeWrites = 0;
    execMock.mockImplementation(async (command, args, options) => {
      if (args[0] === "write-tree") {
        treeWrites += 1;
        if (treeWrites > 1) return { stdout: `${RACED_TREE_OID}\n`, stderr: "" };
      }
      return await stableExec(command, args, options);
    });

    const result = await resolveGitMergeTransitionOverlay("refs/heads/main", dependencies());

    expect(result).toEqual({ status: "stale", reason: "snapshot-raced" });
  });
});

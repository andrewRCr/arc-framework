import { describe, expect, it } from "vitest";

import {
  canonicalize,
  digestBytes,
} from "../../../src/lib/canonical/canonical-json.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import {
  resolveGitLandedDecompositionHandoff,
  type GitLandedDecompositionHandoffDependencies,
} from "../../../src/lib/work-unit/git-landed-decomposition-handoff.js";
import { v3DecomposeReceiptPath } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const BASE_REF = "refs/heads/main";
const PREPARED_BASE = "b".repeat(40);
const LANDED_HEAD = "c".repeat(40);
const LANDED_TREE = "d".repeat(40);
const RECEIPT_OID = "1".repeat(40);
const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function meta(slug: string): string {
  return renderMetaFile(slug, {
    state: "Planning",
    owner: "andrew",
    branch: null,
    workClass: "Light",
    priority: "P1",
    cohort: "origin",
    dependsOn: [],
  });
}

function harness(options: {
  raceAfterProjection?: boolean;
  failAfterProjection?: boolean;
  publicationTree?: "ok" | "throw" | "malformed";
  mismatchMemberABlob?: boolean;
} = {}): {
  deps: GitLandedDecompositionHandoffDependencies;
  calls: string[];
} {
  const content = {
    "result 0": meta("member-a"),
    "result 1": meta("member-b"),
    "cohort topology": "# Cohort: `origin`\n\n**Purpose:** Published members\n",
    "roadmap before": "# Roadmap before\n",
    "roadmap after": "# Roadmap after\n",
  };
  const { receipt } = v3DecompositionEvidenceFixture({
    digestLabel: (label) => digestBytes(bytes(content[label as keyof typeof content] ?? label)),
  });
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const blobByOid = new Map<string, Uint8Array>([
    [RECEIPT_OID, bytes(canonicalize(receipt))],
  ]);
  const oidByDigest = new Map<string, string>();
  Object.values(content).forEach((value, index) => {
    const oid = `${index + 2}`.repeat(40);
    const valueBytes = bytes(value);
    blobByOid.set(oid, valueBytes);
    oidByDigest.set(digestBytes(valueBytes), oid);
  });
  const memberAOid = oidByDigest.get(digestBytes(bytes(content["result 0"])));
  if (memberAOid === undefined) throw new Error("fixture requires a member-a blob");
  const candidateFiles = receipt.finalized.managedPathResults.flatMap(({ path, after }) => {
    if (after.kind === "absent") return [];
    const oid = oidByDigest.get(after.contentDigest);
    if (oid === undefined) throw new Error(`fixture lacks blob for ${path}`);
    return [{ path, mode: after.mode, type: "blob", oid }];
  });
  const calls: string[] = [];
  let publicationTreeRead = false;

  return {
    calls,
    deps: {
      cwd: "/repo",
      readiness: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(
            candidates.map(({ slug }) => [slug, { kind: "ready" as const }]),
          ),
        },
      },
      exec: async (_command, args) => {
        calls.push(args.join(" "));
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          if (options.failAfterProjection === true && publicationTreeRead) {
            throw new Error("configured base became unreadable");
          }
          const raced = options.raceAfterProjection === true && publicationTreeRead;
          return { stdout: `${raced ? "f".repeat(40) : LANDED_HEAD}\n` };
        }
        if (args[0] === "ls-tree" && args.includes(".arc/system/.internal/retirement-receipts")) {
          return { stdout: `100644 blob ${RECEIPT_OID}\t${receiptPath}\0` };
        }
        if (args[0] === "show" && args[1] === RECEIPT_OID) {
          return { stdout: canonicalize(receipt) };
        }
        if (args[0] === "rev-list") {
          return { stdout: `${LANDED_HEAD} ${PREPARED_BASE}\n` };
        }
        if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}") === true) {
          return { stdout: `${LANDED_TREE}\n` };
        }
        if (args[0] === "diff-tree") {
          return {
            stdout: `${[
              ...receipt.finalized.transitionPatch.map(({ path }) => path),
              receiptPath,
            ].join("\0")}\0`,
          };
        }
        if (args[0] === "ls-tree" && args[1] === "-z") {
          const ref = args[2];
          const pathspec = args.at(-1) ?? "";
          const path = pathspec.startsWith(":(literal)")
            ? pathspec.slice(":(literal)".length)
            : pathspec;
          if (path === receiptPath) {
            return ref === PREPARED_BASE
              ? { stdout: "" }
              : { stdout: `100644 blob ${RECEIPT_OID}\t${path}\0` };
          }
          const transition = receipt.finalized.transitionPatch.find((entry) => entry.path === path);
          const state = ref === PREPARED_BASE ? transition?.before : transition?.after;
          if (state === undefined || state.kind === "absent") return { stdout: "" };
          const oid = oidByDigest.get(state.contentDigest);
          return oid === undefined
            ? { stdout: "" }
            : { stdout: `${state.mode} blob ${oid}\t${path}\0` };
        }
        if (args[0] === "ls-tree" && args.includes("--full-tree") && args.includes("-r")) {
          publicationTreeRead = true;
          if (options.publicationTree === "throw") throw new Error("tree read failed");
          if (options.publicationTree === "malformed") {
            return { stdout: "malformed tree entry\0" };
          }
          const separator = args.indexOf("--");
          if (separator < 0 || args.slice(separator + 1).some((path) => !path.startsWith(":(literal)"))) {
            throw new Error("publication pathspecs must be literal");
          }
          return {
            stdout: candidateFiles.map(
              ({ mode, type, oid, path }) => `${mode} ${type} ${oid}\t${path}\0`,
            ).join(""),
          };
        }
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
      readBlob: async (oid) => {
        if (options.mismatchMemberABlob === true && publicationTreeRead && oid === memberAOid) {
          return bytes(`${content["result 0"]}\nchanged\n`);
        }
        const value = blobByOid.get(oid);
        if (value === undefined) throw new Error(`missing blob ${oid}`);
        return value;
      },
    },
  };
}

describe("resolveGitLandedDecompositionHandoff", () => {
  it("resolves one exact landed handoff from the configured-base tree", async () => {
    const h = harness();

    const result = await resolveGitLandedDecompositionHandoff(BASE_REF, "origin", h.deps);

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff.authority.configuredBaseHead).toBe(LANDED_HEAD);
    expect(result.handoff.launchableSelected).toEqual([{
      slug: "member-a",
      displayPath: ".arc/backlog/planned/origin/member-a",
    }]);
    expect(h.calls.at(-1)).toBe(`rev-parse --verify ${BASE_REF}^{commit}`);
    expect(h.calls.every((call) =>
      /^(?:rev-parse|ls-tree|show|rev-list|diff-tree) /u.test(call))).toBe(true);
  });

  it("closes a configured-base race after live publication resolution", async () => {
    const result = await resolveGitLandedDecompositionHandoff(
      BASE_REF,
      "origin",
      harness({ raceAfterProjection: true }).deps,
    );

    expect(result).toEqual({ status: "stale-base" });
  });

  it.each(["throw", "malformed"] as const)(
    "maps a %s publication-tree read to a closed projection refusal",
    async (publicationTree) => {
      const result = await resolveGitLandedDecompositionHandoff(
        BASE_REF,
        "origin",
        harness({ publicationTree }).deps,
      );

      expect(result).toEqual({
        status: "projection-mismatch",
        reason: "tree-read-failed",
      });
    },
  );

  it("passes through a digest-mismatched landed publication refusal", async () => {
    const result = await resolveGitLandedDecompositionHandoff(
      BASE_REF,
      "origin",
      harness({ mismatchMemberABlob: true }).deps,
    );

    expect(result).toEqual({
      status: "projection-mismatch",
      reason: "destination-path-mismatch",
      locus: ".arc/backlog/planned/origin/member-a/meta-member-a.md",
    });
  });

  it("distinguishes a failed final base read from an observed base move", async () => {
    const result = await resolveGitLandedDecompositionHandoff(
      BASE_REF,
      "origin",
      harness({ failAfterProjection: true }).deps,
    );

    expect(result).toEqual({
      status: "namespace-corrupt",
      reason: "git-read-failed",
    });
  });
});

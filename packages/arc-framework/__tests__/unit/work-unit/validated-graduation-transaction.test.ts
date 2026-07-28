import { describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  produceDecompositionIntegrationAnchor,
} from "../../../src/lib/work-unit/decomposition-integration-anchor.js";
import {
  prepareValidatedGraduationTransaction,
  type GraduationStoredArtifact,
  type PrepareGraduationTransactionInput,
} from "../../../src/lib/work-unit/validated-graduation-transaction.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const ROOT = ".arc/backlog/planned/widget";
const TARGET = ".arc/active";

function artifact(basename: string, content: string, mode: "100644" | "100755" = "100644"): GraduationStoredArtifact {
  const bytes = new TextEncoder().encode(content);
  return {
    basename,
    sourcePath: `${ROOT}/${basename}`,
    targetPath: `${TARGET}/${basename}`,
    objectKind: "blob",
    mode,
    oid: "a".repeat(40),
    contentDigest: digestBytes(bytes),
    bytes,
  };
}

function input(options: {
  workflow?: "draft-design" | "create-spec" | "generate-tasks" | null;
  suppliedClass?: boolean;
} = {}): PrepareGraduationTransactionInput {
  const metaContent = renderMetaFile("widget", {
    state: "Planning",
    owner: "andrew",
    branch: null,
    workClass: options.suppliedClass ? "TBD" : "Heavy",
    design: ["draft-widget.md"],
    currentWorkflow: options.workflow === undefined ? "create-spec" : options.workflow,
  });
  const artifacts = [
    artifact("meta-widget.md", metaContent),
    artifact("draft-widget.md", "# Draft\n"),
  ];
  return {
    slug: "widget",
    location: "planned",
    sourceDirectory: ROOT,
    targetDirectory: TARGET,
    artifacts,
    destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
    anchor: null,
    classResolution: options.suppliedClass
      ? { kind: "supplied", value: "Light" }
      : { kind: "preserved", value: "Heavy" },
    occupation: {
      mode: "spawned",
      baseHead: "a".repeat(40),
      branch: { kind: "absent", ref: "refs/heads/plan/widget" },
      worktree: { kind: "absent", path: "/repo-widget" },
      indexTree: "b".repeat(40),
    },
  };
}

function markedInput(): PrepareGraduationTransactionInput {
  const base = input({ workflow: "draft-design" });
  const { receipt } = v3DecompositionEvidenceFixture();
  const resolved = produceDecompositionIntegrationAnchor({
    receipts: [receipt],
    preparedBaseHead: "b".repeat(40),
    candidateCommit: { head: "c".repeat(40), tree: "d".repeat(40) },
    receiptTransitionTree: "d".repeat(40),
    currentBaseHead: "c".repeat(40),
    landing: {
      kind: "fast-forward",
      beforeHead: "b".repeat(40),
      resultHead: "c".repeat(40),
      resultTree: "d".repeat(40),
    },
  });
  if (resolved.status !== "resolved") throw new Error("fixture anchor did not resolve");
  const metaContent = renderMetaFile("widget", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    design: ["draft-widget.md"],
    currentWorkflow: "draft-design",
    decompositionReceipt: resolved.anchor.receiptId,
  });
  base.artifacts[0] = artifact("meta-widget.md", metaContent);
  resolved.anchor.receipt.prepared.completedMap.machine.planningProfile = {
    kind: "draft",
    sourceDesign: ["draft-origin.md"],
  };
  resolved.anchor.receipt.finalized.publication.entries = [{ kind: "new-leaf", slug: "widget" }];
  resolved.anchor.receipt.finalized.managedPathResults = base.artifacts.map((entry) => ({
    path: entry.sourcePath,
    before: { kind: "absent" },
    after: {
      kind: "file",
      mode: entry.mode,
      contentDigest: digestBytes(entry.bytes),
    },
  }));
  base.anchor = resolved.anchor;
  return base;
}

describe("prepareValidatedGraduationTransaction", () => {
  it("preserves a valid recorded workflow and exact non-meta bytes", () => {
    const result = prepareValidatedGraduationTransaction(input());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transaction.policy.workflow).toEqual({ kind: "preserved", value: "create-spec" });
    expect(result.transaction.policy.class).toEqual({ kind: "preserved", value: "Heavy" });
    const draft = result.transaction.target.artifacts.find(({ basename }) => basename === "draft-widget.md");
    expect(draft?.mode).toBe("100644");
    expect(new TextDecoder().decode(draft?.bytes)).toBe("# Draft\n");
    expect(result.transaction.reconciliation.notice).toBeNull();
  });

  it("derives only an unset workflow and composes supplied Class into final meta bytes", () => {
    const result = prepareValidatedGraduationTransaction(input({ workflow: null, suppliedClass: true }));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transaction.policy.workflow).toEqual({ kind: "derived", value: "draft-design" });
    expect(result.transaction.policy.class).toEqual({ kind: "supplied", value: "Light" });
    const meta = parseMetaRecord(new TextDecoder().decode(result.transaction.target.metaBytes));
    expect(meta.branch).toBe("plan/widget");
    expect(meta.workClass).toBe("Light");
    expect(meta.currentWorkflow).toBe("draft-design");
    expect(meta.nextAction).toBe("[begin current workflow]");
  });

  it("removes landed decomposition provenance in the same complete target meta", () => {
    const result = prepareValidatedGraduationTransaction(markedInput());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transaction.policy.decompositionReceiptRemoved).toBe(true);
    const metaContent = new TextDecoder().decode(result.transaction.target.metaBytes);
    const meta = parseMetaRecord(metaContent);
    expect(meta.decompositionReceipt).toBeNull();
    expect(meta.design).toEqual(["draft-widget.md"]);
    expect(meta.taskList).toBeNull();
  });

  it("refuses source, destination, class, and tuple mismatches before producing authority", () => {
    const wrongDestination = input();
    wrongDestination.destinations[0] = {
      path: `${TARGET}/meta-widget.md`,
      state: { kind: "file", mode: "100644", contentDigest: "sha256:".concat("a".repeat(64)) as `sha256:${string}` },
    };
    expect(prepareValidatedGraduationTransaction(wrongDestination)).toMatchObject({
      status: "refused",
      reason: "destination-preimage",
      locus: `${TARGET}/meta-widget.md`,
    });

    const missingArtifact = input();
    missingArtifact.artifacts.pop();
    missingArtifact.destinations.pop();
    expect(prepareValidatedGraduationTransaction(missingArtifact)).toMatchObject({
      status: "refused",
      reason: "planning-tuple",
      locus: "draft-widget.md",
    });

    const wrongClass = input();
    wrongClass.classResolution = { kind: "preserved", value: "Light" };
    expect(prepareValidatedGraduationTransaction(wrongClass)).toMatchObject({
      status: "refused",
      reason: "class-mismatch",
      locus: "meta-widget.md#Class",
    });

    const staleSuppliedClass = input();
    staleSuppliedClass.classResolution = { kind: "supplied", value: "Light" };
    expect(prepareValidatedGraduationTransaction(staleSuppliedClass)).toMatchObject({
      status: "refused",
      reason: "class-mismatch",
      locus: "meta-widget.md#Class",
    });
  });
});

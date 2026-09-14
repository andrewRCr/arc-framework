import { describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  prepareValidatedGraduationTransaction,
  type GraduationStoredArtifact,
  type PrepareGraduationTransactionInput,
} from "../../../src/lib/work-unit/validated-graduation-transaction.js";
import { validatePlanningArtifactTuple } from "../../../src/lib/work-unit/planning-artifact-tuple.js";

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

function observedArtifact(value: GraduationStoredArtifact) {
  return {
    path: value.sourcePath,
    state: { kind: "file" as const, mode: value.mode, contentDigest: value.contentDigest },
  };
}

function input(options: {
  workflow?: "draft-design" | "create-spec" | "generate-tasks" | null;
  suppliedClass?: boolean;
  design?: "draft" | "none";
} = {}): PrepareGraduationTransactionInput {
  const hasDraft = options.design !== "none";
  const metaContent = renderMetaFile("widget", {
    state: "Planning",
    owner: "andrew",
    branch: null,
    workClass: options.suppliedClass ? "TBD" : "Heavy",
    design: hasDraft ? ["draft-widget.md"] : [],
    currentWorkflow: options.workflow === undefined ? (hasDraft ? "create-spec" : null) : options.workflow,
  });
  const artifacts = [
    artifact("meta-widget.md", metaContent),
    ...(hasDraft ? [artifact("draft-widget.md", "# Draft\n")] : []),
  ];
  return {
    slug: "widget",
    location: "planned",
    sourceDirectory: ROOT,
    targetDirectory: TARGET,
    artifacts,
    destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
    classResolution: options.suppliedClass
      ? { kind: "supplied", value: "Light" }
      : { kind: "preserved", value: "Heavy" },
    occupation: {
      mode: "spawned",
      baseHead: "a".repeat(40),
      branch: { kind: "absent", ref: "refs/heads/plan/widget" },
      worktree: { kind: "absent", path: "/repo-widget" },
      indexTree: "b".repeat(40),
      operation: {
        kind: "spawned",
        branch: "plan/widget",
        base: "a".repeat(40),
        worktreePath: "/repo-widget",
        locationTemplate: "../{repo}.{name}",
        repo: "repo",
        wuName: "widget",
        spawningIdentity: "andrew",
      },
    },
  };
}

describe("prepareValidatedGraduationTransaction", () => {
  it.each([
    ["without a companion", false],
    ["with a companion", true],
  ])("starts a meta-only planned stub %s in draft-design", (_label, withCompanion) => {
    const candidate = input({ design: "none" });
    if (withCompanion) {
      const notes = artifact("notes-widget.md", "# Notes\n");
      candidate.artifacts.push(notes);
      candidate.destinations.push({ path: notes.targetPath, state: { kind: "absent" } });
    }

    const result = prepareValidatedGraduationTransaction(candidate);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transaction.policy.profile).toEqual({ kind: "draft", sourceDesign: [] });
    expect(result.transaction.policy.workflow).toEqual({ kind: "derived", value: "draft-design" });
    const meta = parseMetaRecord(new TextDecoder().decode(result.transaction.target.metaBytes));
    expect(meta.design).toEqual([]);
    expect(meta.taskList).toBeNull();
    expect(meta.currentWorkflow).toBe("draft-design");
    expect(result.transaction.target.artifacts.map(({ basename }) => basename)).toEqual(
      withCompanion ? ["meta-widget.md", "notes-widget.md"] : ["meta-widget.md"],
    );
  });

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

  it("preserves exact-slug companion artifacts", () => {
    const withCompanion = input();
    const notes = artifact("notes-widget.md", "# Notes\n");
    withCompanion.artifacts.push(notes);
    withCompanion.destinations.push({ path: notes.targetPath, state: { kind: "absent" } });

    const result = prepareValidatedGraduationTransaction(withCompanion);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const preserved = result.transaction.target.artifacts.find(({ basename }) => basename === "notes-widget.md");
    expect(new TextDecoder().decode(preserved?.bytes)).toBe("# Notes\n");
  });

  it("refuses a companion from another artifact family", () => {
    const candidate = input();
    const metaContent = new TextDecoder().decode(candidate.artifacts[0]!.bytes);
    const foreignCompanion = artifact("notes-other.md", "# Notes\n");

    expect(validatePlanningArtifactTuple({
      expectedSlug: "widget",
      metaPath: `${ROOT}/meta-widget.md`,
      metaContent,
      meta: parseMetaRecord(metaContent),
      artifacts: [
        observedArtifact(candidate.artifacts[0]!),
        observedArtifact(candidate.artifacts[1]!),
        observedArtifact(foreignCompanion),
      ],
    })).toMatchObject({
      status: "refused",
      reason: "artifact-mismatch",
      locus: "notes-other.md",
    });
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

  it("refuses destination, planning-tuple, and class mismatches before producing authority", () => {
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

  it("returns the remaining source, meta, and occupation refusal arms at stable loci", () => {
    const sourceShape = input();
    sourceShape.artifacts[0]!.oid = "not-an-object-id";
    expect(prepareValidatedGraduationTransaction(sourceShape)).toMatchObject({
      status: "refused",
      reason: "source-shape",
      locus: `${ROOT}/meta-widget.md`,
    });

    const metaShape = input();
    const metaArtifact = metaShape.artifacts[0]!;
    const malformedMeta = new TextDecoder().decode(metaArtifact.bytes).replace(/\n---\n$/u, "\n");
    metaShape.artifacts[0] = artifact("meta-widget.md", malformedMeta);
    expect(prepareValidatedGraduationTransaction(metaShape)).toMatchObject({
      status: "refused",
      reason: "meta-shape",
      locus: `${ROOT}/meta-widget.md`,
    });

    const occupation = input();
    occupation.occupation.branch.ref = "refs/heads/plan/other";
    expect(prepareValidatedGraduationTransaction(occupation)).toMatchObject({
      status: "refused",
      reason: "occupation-preimage",
      locus: "plan/widget",
    });
  });
});

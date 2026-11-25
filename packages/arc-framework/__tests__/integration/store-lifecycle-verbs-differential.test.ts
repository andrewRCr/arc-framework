/** Lifecycle verbs receive the same query fields from identity records as from their original paths. */
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { lifecycleRepository, metaPath, metaReference } from "../helpers/store/lifecycle-differential.js";
import { success } from "../helpers/store/suite-tools.js";
import { deriveState, resolveSlugState, resolveSlugPosition } from "../../src/lib/work-unit/lifecycle-resolver.js";
import { planAbandon } from "../../src/lib/work-unit/verbs/abandon.js";
import { partitionTransformDependents, transformDependentMutationExclusions, findIntegratingDependentAdvisories } from "../../src/lib/work-unit/transform-coordination.js";
import { resolveRenameSubject, assertRenameSubjectPreconditions } from "../../src/lib/work-unit/rename-preflight.js";
import { validateMetaFieldBlockShape } from "../../src/lib/active/meta-reader.js";
import { TRANSITIONS } from "../../src/lib/work-unit/lifecycle-transitions.js";
import { resolveStartDispatch } from "../../src/commands/start.js";

const position = (entry: ReturnType<Awaited<ReturnType<typeof lifecycleRepository>>["get"]>) => entry ? { phase: entry.phase, location: entry.location } : null;

describe("lifecycle verb query differentials", () => {
  it("promote handler preserves provisional eligibility and unresolved Class", async () => {
    const h = await lifecycleRepository();
    for (const name of ["provisional", "planned", "completed", "missing"]) {
      const old = h.heldLegacy.get(name), entry = h.get(name);
      const fields = await h.oldFields(name);
      expect(position(entry)).toEqual(old ? { phase: old.phase, location: old.location } : null);
      expect(entry?.fields.workClass ?? "TBD").toBe(fields?.workClass ?? "TBD");
      expect(entry?.location === "provisional").toBe(old?.location === "provisional");
    }
    expect(h.get("provisional")?.fields.workClass).toBe("TBD");
  });
  it("promote and demote preserve recorded Class and both backlog placements", async () => {
    const h = await lifecycleRepository();
    for (const name of ["provisional", "planned", "origin", "missing"]) {
      const old = h.heldLegacy.get(name), entry = h.get(name);
      expect(entry?.location).toBe(old?.location);
      expect(entry?.fields.cohort).toBe(old?.cohort);
      expect(entry?.fields.workClass).toBe((await h.oldFields(name))?.workClass);
      if (entry && old) expect(metaPath(entry)).toBe(old.path);
    }
    expect(h.get("planned")?.fields.workClass).toBe("Heavy");
  });
  it("abandon preview receives the selected state and operational branch", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "parked", "private", "disagree", "completed", "missing"]) {
      const entry = h.get(name, "selected"), agreement = await h.agreement(name);
      const state = deriveState(position(entry));
      const branch = agreement ? h.get(name)?.fields.branch ?? null : null;
      expect(state).toBe(resolveSlugState(h.composedLegacy.index, name));
      expect(agreement).toBe(h.composedLegacy.recordsBySlug.get(name)?.writablePath !== undefined);
      expect(branch).toBe((await h.oldFields(name, "operational"))?.branch ?? null);
      expect(planAbandon(state, branch, name)).toEqual(planAbandon(resolveSlugState(h.composedLegacy.index, name), (await h.oldFields(name, "operational"))?.branch ?? null, name));
    }
  });
  it("abandon verb preserves composed retirement inputs and held fallback", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "parked", "private", "integrating", "missing"]) {
      const selected = h.get(name, "selected");
      expect(position(selected)).toEqual(resolveSlugPosition(h.composedLegacy.index, name));
      expect(await h.agreement(name)).toBe(h.composedLegacy.recordsBySlug.get(name)?.writablePath !== undefined);
      if (await h.agreement(name)) expect(h.get(name)?.fields).toEqual(await h.oldFields(name, "operational"));
      const held = h.get(name);
      expect(position(held)).toEqual(resolveSlugPosition(h.heldLegacy, name));
      expect(held?.fields.branch).toBe((await h.oldFields(name))?.branch);
    }
    const read = success(await h.store.read({ reference: metaReference("parked") }));
    expect(read.content).toBe(await h.fs.readFile(join(h.root, h.heldLegacy.get("parked")?.path ?? "")));
    expect(h.get("parked", "selected")?.fields.nextTask).toBe("Selected branch progress");
    expect(h.get("parked")?.fields.nextTask).toBe("Held pointer progress");
  });
  it("resume verb preserves planned eligibility, authority and preserved branch", async () => {
    const h = await lifecycleRepository();
    for (const name of ["parked", "disagree", "planned", "origin", "missing"]) {
      const entry = h.get(name, "selected");
      expect(entry?.location).toBe(h.composedLegacy.index.get(name)?.location);
      expect(await h.agreement(name)).toBe(h.composedLegacy.recordsBySlug.get(name)?.writablePath !== undefined);
      if (await h.agreement(name)) expect(h.get(name)?.fields.branch).toBe((await h.oldFields(name, "operational"))?.branch);
      expect(h.get(name)?.fields.branch).toBe((await h.oldFields(name))?.branch);
      if (h.get(name)) expect(metaPath(h.get(name)!)).toBe(h.heldLegacy.get(name)?.path);
    }
    expect(h.get("parked")?.fields.branch).toBe("feat/parked");
    expect(await h.agreement("disagree")).toBe(false);
  });
  it("rename command preserves source/collision queries, branch and PR refusal", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "parked", "private", "completed", "missing"]) {
      const old = h.composedLegacy.index.get(name), entry = h.get(name, "selected");
      expect(position(entry)).toEqual(old ? { phase: old.phase, location: old.location } : null);
      expect(entry?.fields.cohort).toBe(old?.cohort);
      expect(await h.agreement(name)).toBe(h.composedLegacy.recordsBySlug.get(name)?.writablePath !== undefined);
      const actual = await h.oldFields(name, "operational");
      if (await h.agreement(name)) expect({ branch: h.get(name)?.fields.branch, prUrl: h.get(name)?.fields.prUrl }).toEqual({ branch: actual?.branch, prUrl: actual?.prUrl });
    }
    expect(() => resolveRenameSubject(h.composedLegacy.index, "origin", "planned")).toThrow(/both/u);
    expect(h.get("origin", "selected")).toBeDefined(); expect(h.get("planned", "selected")).toBeDefined();
    const archived = h.heldLegacy.get("completed");
    if (!archived) throw new Error("Expected archived rename target");
    expect(() => assertRenameSubjectPreconditions({ subject: { kind: "work-unit", name: "completed" }, entry: archived, dirty: false, prUrl: h.get("completed")?.fields.prUrl ?? undefined })).toThrow(/archived/u);
  });
  it("transform coordination preserves dependency authority, exclusions and integrating advisories", async () => {
    const h = await lifecycleRepository();
    const old = partitionTransformDependents(h.composedLegacy, "origin");
    const actual = [];
    for (const entry of h.selected) {
      if (!entry.fields.dependsOn.includes("origin")) continue;
      const name = entry.reference.owner.name, local = h.get(name), agreeing = await h.agreement(name);
      actual.push({ dependent: name, authority: entry.phase === "Integrating" ? "coordination-only" : agreeing ? "shared-visible" : "branch-private",
        ...(agreeing && local ? { writablePath: metaPath(local) } : {}), ...(local ? { currentTreePath: join(h.root, metaPath(local)) } : {}) });
    }
    actual.sort((a, b) => a.dependent.localeCompare(b.dependent));
    expect(actual).toEqual(old);
    expect(actual.filter((row) => row.authority !== "shared-visible" && row.currentTreePath !== undefined).map((row) => relative(h.root, row.currentTreePath ?? "")))
      .toEqual(transformDependentMutationExclusions(h.composedLegacy, "origin", h.root));
    const advisories = findIntegratingDependentAdvisories(h.composedLegacy, "origin");
    expect(advisories.map((row) => row.dependent)).toEqual(actual.filter((row) => row.authority === "coordination-only").map((row) => row.dependent));
    expect(advisories[0]?.text).toContain("will not mutate");
    expect(actual.map((row) => row.authority)).toEqual(expect.arrayContaining(["shared-visible", "branch-private", "coordination-only"]));
  });
  it("executeTransition preserves source position and every encoding/finalization field", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "provisional", "planned", "parked", "completed", "missing"]) {
      expect(position(h.get(name))).toEqual(resolveSlugPosition(h.heldLegacy, name));
      expect(h.get(name)?.fields).toEqual(await h.oldFields(name));
      if (h.get(name)) expect(metaPath(h.get(name)!)).toBe(h.heldLegacy.get(name)?.path);
    }
    expect(h.get("origin")?.fields).toMatchObject({ currentWorkflow: "integrate-work-unit", lastCompleted: "Task 1.1", nextTask: "Held progress", blockers: "Needs input", nextAction: "Review" });
  });
  it("resumeTransitionFinalization preserves destination edge uniqueness and currentWorkflow", async () => {
    const h = await lifecycleRepository();
    for (const name of ["finalizing", "integrating", "origin", "completed", "missing"]) {
      const current = position(h.get(name)), oldPosition = resolveSlugPosition(h.heldLegacy, name);
      expect(current).toEqual(oldPosition);
      const matches = TRANSITIONS.filter((edge) => edge.verb === "publish" && edge.to?.phase === current?.phase && edge.to?.location === current?.location);
      const oldMatches = TRANSITIONS.filter((edge) => edge.verb === "publish" && edge.to?.phase === oldPosition?.phase && edge.to?.location === oldPosition?.location);
      expect(matches).toEqual(oldMatches);
      expect(h.get(name)?.fields.currentWorkflow).toBe((await h.oldFields(name))?.currentWorkflow);
    }
    const finalizing = h.get("finalizing");
    const matches = TRANSITIONS.filter((edge) => edge.verb === "publish" && edge.to?.phase === finalizing?.phase && edge.to?.location === finalizing?.location);
    expect(matches).toHaveLength(1);
    expect(finalizing?.fields.currentWorkflow).toBe("prepare-work-unit");
  });
  it("start graduation preflight retains backlog Planning and the complete field block", async () => {
    const h = await lifecycleRepository();
    for (const name of ["provisional", "planned", "malformed-block", "origin", "completed", "missing"]) {
      const entry = h.get(name), old = h.heldLegacy.get(name);
      expect(position(entry)).toEqual(resolveSlugPosition(h.heldLegacy, name));
      expect(entry?.fields).toEqual(await h.oldFields(name));
      if (entry && old) {
        const record = success(await h.store.read({ reference: entry.reference }));
        expect(record.content).toBe(await h.fs.readFile(join(h.root, old.path)));
        expect(validateMetaFieldBlockShape(record.content, metaPath(entry))).toEqual(validateMetaFieldBlockShape(await h.fs.readFile(join(h.root, old.path)), old.path));
      }
    }
    expect(resolveStartDispatch(h.heldLegacy, "planned").arm).toBe("graduate");
    expect(h.get("planned")?.phase).toBe("Planning");
    const broken = h.get("malformed-block");
    if (!broken) throw new Error("Expected field-block validation candidate");
    expect(validateMetaFieldBlockShape(success(await h.store.read({ reference: broken.reference })).content, metaPath(broken))).toEqual(expect.arrayContaining([expect.stringMatching(/closing/u)]));
  });
  it("archived attestation handler retains Shipped state and task-list binding", async () => {
    const h = await lifecycleRepository();
    for (const name of ["completed", "origin", "missing"]) {
      const entry = h.get(name), old = h.heldLegacy.get(name), fields = await h.oldFields(name);
      expect(entry?.location).toBe(old?.location);
      expect({ state: entry?.fields.state, taskList: entry?.fields.taskList }).toEqual({ state: fields?.state, taskList: fields?.taskList });
    }
    expect(h.get("completed")?.fields).toMatchObject({ state: "Shipped", taskList: "tasks-completed.md" });
  });
});

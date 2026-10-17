/** Imported Candidate histories resolve the same explicit supersession chains as code history. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { CandidateManagedRecordV1Schema, resolveCandidateSupersessionAncestors, type CandidateSupersessionAncestor } from "../../src/lib/work-unit/candidate-attestation.js";
import { readRepositoryCandidateSupersessionChain } from "../../src/lib/work-unit/candidate-record-store.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { importCandidatePath } from "../helpers/store/import-candidates.js";
import { success } from "../helpers/store/suite-tools.js";

const reference = (name: string) => RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name } });
const semantic = (values: readonly CandidateSupersessionAncestor[]) => values.map((value) => ({ ...value, recordRevision: undefined }));

describe.each(["default", "separate"] as const)("Candidate import in %s", (layout) => {
  it("replays the merge-introduced predecessors before the archived current files", async () => {
    const h = await importFixture(layout, { completed: true });
    const current = CandidateManagedRecordV1Schema.parse(JSON.parse(await readFile(join(h.root, importCandidatePath("archived")), "utf8")));
    const before = await readRepositoryCandidateSupersessionChain({ cwd: h.root, workUnit: "archived", record: current, exec: h.git });
    expect(before).toHaveLength(2);
    const parents = (await h.git("git", ["show", "-s", "--format=%P", before[0]!.recordRevision!])).stdout.trim().split(" ");
    expect(parents).toHaveLength(2);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const history = success(await createRefStore(h.ports).history({ reference: reference("archived") }));
    const records = history.filter(({ content }) => content !== null).map(({ content }) => CandidateManagedRecordV1Schema.parse(JSON.parse(content!)));
    expect(semantic(resolveCandidateSupersessionAncestors(current, records))).toEqual(semantic(before));
    expect(records.map(({ attestation }) => attestation.candidateId)).toEqual([current.attestation.candidateId, ...before.map(({ candidateId }) => candidateId)]);
  });

  it("reports broken and rejected chains while preserving their reader failures", async () => {
    const h = await importFixture(layout, { completed: true });
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    if (trial.status !== "ok") throw new Error("No trial report");
    expect(trial.result.brokenChains.map(({ reference }) => reference.owner.name)).toEqual(expect.arrayContaining(["also-archived", "last-archived"]));
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const broken = CandidateManagedRecordV1Schema.parse(JSON.parse(await readFile(join(h.root, importCandidatePath("also-archived")), "utf8")));
    await expect(readRepositoryCandidateSupersessionChain({ cwd: h.root, workUnit: "also-archived", record: broken, exec: h.git })).rejects.toThrow(/absent from reachable/u);
    const versions = success(await store.history({ reference: reference("also-archived") })).filter(({ content }) => content !== null)
      .map(({ content }) => CandidateManagedRecordV1Schema.parse(JSON.parse(content!)));
    expect(() => resolveCandidateSupersessionAncestors(broken, versions)).toThrow(/absent from reachable/u);
    const original = JSON.parse(await readFile(join(h.root, importCandidatePath("last-archived")), "utf8"));
    expect(CandidateManagedRecordV1Schema.safeParse(original).success).toBe(false);
    const retained = success(await store.history({ reference: reference("last-archived") }));
    expect(CandidateManagedRecordV1Schema.safeParse(JSON.parse(retained[0]!.content!)).success).toBe(false);
  });

  it("replays the live owner's chain from its unmerged meta revision", async () => {
    const h = await importFixture(layout, { completed: true });
    const current = CandidateManagedRecordV1Schema.parse(JSON.parse((await h.git("git", ["show", `feat/branch-only:${importCandidatePath("branch-only")}`])).stdout));
    const before = await readRepositoryCandidateSupersessionChain({ cwd: h.root, workUnit: "branch-only", record: current, exec: h.git, revision: "feat/branch-only" });
    expect(before).toHaveLength(1);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const history = success(await createRefStore(h.ports).history({ reference: reference("branch-only") }));
    const records = history.filter(({ content }) => content !== null).map(({ content }) => CandidateManagedRecordV1Schema.parse(JSON.parse(content!)));
    expect(semantic(resolveCandidateSupersessionAncestors(current, records))).toEqual(semantic(before));
  });
});

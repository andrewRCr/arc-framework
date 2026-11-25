/** Native queries retain whole receipts and validate only messages their normal traversal acquires. */
import { describe, expect, it } from "vitest";
import { CreatedOwnerSchema, compareCreatedOwners } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

async function git(f: RefConformanceFixture, args: string[]): Promise<string> {
  return (await f.ports.exec("git", ["-c", "user.name=Receipt Test", "-c", "user.email=receipt@example.com", ...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args], { cwd: f.root })).stdout;
}

async function replaceMessage(f: RefConformanceFixture, ref: string, transform: (message: string) => string): Promise<{ original: string; corrupt: string }> {
  const original = (await git(f, ["rev-parse", ref])).trim();
  const tree = (await git(f, ["show", "-s", "--format=%T", ref])).trim();
  const parents = (await git(f, ["show", "-s", "--format=%P", ref])).trim().split(" ").filter(Boolean);
  const message = transform(await git(f, ["show", "-s", "--format=%B", ref]));
  const corrupt = (await git(f, ["commit-tree", tree, ...parents.flatMap(parent => ["-p", parent]), "-m", message])).trim();
  await git(f, ["update-ref", ref, corrupt, original]);
  return { original, corrupt };
}

const broken = (message: string): string => message.replace(/^Arc-Creation-Receipt: .*$/mu, "Arc-Creation-Receipt: {");

describe.each(["default", "separate"] as const)("native receipt queries in %s layout", layout => {
  it("retains a whole multi-owner envelope in scoped history, changes and captured before-history", async () => {
    let observed: unknown;
    const f = await createRefFixture({ "personal/document": { check: async ({ before }) => {
      const history = await before.history({ reference: selected });
      if (history.status === "refused") throw new Error(JSON.stringify(history.refusal));
      observed = history.result[0]?.creationReceipt;
      return [];
    } } }, layout);
    const from = await f.settle();
    const batch = success(await f.store.batch({ writes: [f.reference("work-item/meta"), f.reference("cohort/document")]
      .map(reference => ({ action: "put" as const, reference, expected: null, content: f.content(reference), ...(reference.kind === "work-item/meta" ? { placement: { kind: "backlog" as const, commitment: "planned" as const } } : {}) })), provenance: testProvenance }));
    const selected = batch.writes[0]!.reference;
    const receipt = { schemaVersion: 1, batchId: batch.batchId,
      createdOwners: batch.writes.map(({ reference }) => CreatedOwnerSchema.parse(reference)).sort(compareCreatedOwners) };
    expect(success(await f.store.history({ reference: selected }))[0]?.creationReceipt).toEqual(receipt);
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [selected] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.creationReceipt).toEqual(receipt);
    await seed(f, f.reference("personal/document"));
    expect(observed).toEqual(receipt);
  });

  it("validates acquired unchanged-record commits before history and changes omit them, then resumes after authentic repair", async () => {
    const f = await createRefFixture({}, layout);
    const target = await seed(f, f.reference("personal/document"), "target\n");
    const from = await f.settle();
    await seed(f, f.reference("personal/document", "two"), "unrelated\n");
    const ref = "refs/arc/user/test-user/personal";
    const { original, corrupt } = await replaceMessage(f, ref, broken);
    for (const result of [await f.store.history({ reference: target.reference }),
      await f.store.changes({ from, to: await f.settle(), references: [target.reference] })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
        namespace: expect.stringContaining(corrupt), remedy: { text: expect.stringContaining("authentic") } } });
    }
    await git(f, ["update-ref", ref, original, corrupt]);
    expect(success(await f.store.history({ reference: target.reference }))).toHaveLength(1);
    expect(success(await f.store.changes({ from, to: await f.settle(), references: [target.reference] }))).toEqual([]);
  });

  it.each(["unavailable", "different"] as const)("refuses encountered same-batch %s disagreement without discovering sibling refs", async mode => {
    const f = await createRefFixture({}, layout);
    const from = await f.settle();
    const batch = success(await f.store.batch({ writes: ["one", "two"].map(suffix => {
      const reference = f.reference("work-item/meta", suffix);
      return { action: "put" as const, reference, expected: null, content: f.content(reference), placement: { kind: "backlog" as const, commitment: "planned" as const } };
    }), provenance: testProvenance }));
    const selected = batch.writes[0]!.reference, sibling = batch.writes[1]!.reference;
    if (sibling.owner.type !== "work-item") throw new Error("Expected a work owner");
    const ref = `refs/arc/work/${sibling.owner.uid}`;
    const { original, corrupt } = await replaceMessage(f, ref, message => message.replace(/^Arc-Creation-Receipt: .*(?:\n|$)/mu,
      mode === "unavailable" ? "" : `Arc-Creation-Receipt: ${JSON.stringify({ schemaVersion: 1, batchId: batch.batchId, createdOwners: [] })}\n`));
    expect(success(await f.store.history({ reference: selected }))).toHaveLength(1);
    expect(success(await f.store.changes({ from, to: await f.settle(), references: [selected] }))).toHaveLength(1);
    const all = await f.store.changes({ from, to: await f.settle() });
    expect(all, JSON.stringify(all)).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", condition: expect.stringContaining(batch.batchId),
      remedy: { text: expect.stringContaining("authentic") },
    } });
    await git(f, ["update-ref", ref, original, corrupt]);
    expect(success(await f.store.changes({ from, to: await f.settle() }))).toHaveLength(2);
  });

  it("validates archived discovery messages even when an empty commit changes no record", async () => {
    const f = await createRefFixture({}, layout);
    const work = await seed(f, f.reference("work-item/meta"));
    const from = await f.settle();
    success(await f.store.write({ ...update(f, work), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    if (work.reference.owner.type !== "work-item") throw new Error("Expected a work owner");
    const ref = `refs/arc/history/work/${work.reference.owner.uid}`;
    const original = (await git(f, ["rev-parse", ref])).trim();
    const tree = (await git(f, ["show", "-s", "--format=%T", ref])).trim();
    const corrupt = (await git(f, ["commit-tree", tree, "-p", original, "-m", "Empty discovery message\n\nArc-Creation-Receipt: {\n"])).trim();
    await git(f, ["update-ref", ref, corrupt, original]);
    expect(await f.store.history({ reference: work.reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", namespace: expect.stringContaining(corrupt),
    } });
    expect(await f.store.changes({ from, to: await f.settle(), references: [work.reference] })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", namespace: expect.stringContaining(corrupt),
    } });
    await git(f, ["update-ref", ref, original, corrupt]);
    expect(success(await f.store.history({ reference: work.reference }))).toHaveLength(2);
    expect(success(await f.store.changes({ from, to: await f.settle(), references: [work.reference] }))).toHaveLength(1);
  });

  it("retains receipts through archive and reopen history", async () => {
    const f = await createRefFixture({}, layout);
    const work = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, work), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const ended = success(await f.store.history({ reference: work.reference }));
    expect(ended.map(entry => entry.creationReceipt?.createdOwners)).toEqual([[], [CreatedOwnerSchema.parse(work.reference)]]);
    const archived = success(await f.store.read({ reference: work.reference }));
    success(await f.store.write({ ...update(f, archived), placement: { kind: "backlog", commitment: "planned" } }));
    const history = success(await f.store.history({ reference: work.reference }));
    expect(history.every(entry => entry.creationReceipt !== undefined)).toBe(true);
    expect(history[0]?.creationReceipt?.createdOwners).toEqual([]);
  });
});

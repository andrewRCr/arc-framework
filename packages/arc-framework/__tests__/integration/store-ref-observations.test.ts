import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type HistoryEntry, type WriteCheck } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("native record observations in %s layout", layout => {
  it("refuses changed read-only evidence without publishing and succeeds after fresh acquisition", async () => {
    const f = await createRefFixture({}, layout);
    const evidence = await seed(f, f.reference("work-item/meta"));
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const history = success(await f.store.history({ reference: target.reference }));
    const changed = success(await f.store.write(update(f, evidence)));
    const request = { writes: [mutationOf(update(f, target, "accepted\n"))], provenance: testProvenance,
      observations: [{ reference: evidence.reference, expected: { version: evidence.version, conflicts: [] } }] };
    expect(await f.store.batch(request)).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: [evidence.reference],
    } });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.history({ reference: target.reference }))).toEqual(history);
    success(await f.store.batch({ ...request, observations: [{ reference: changed.reference,
      expected: { version: changed.version!, conflicts: [] } }] }));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("accepted\n");
    expect(success(await f.store.read({ reference: evidence.reference }))).toMatchObject(changed);
  });

  it("admits a history-dependent rule using the validated action and read-only observations", async () => {
    let armed = false;
    let history: HistoryEntry[] = [];
    const check: WriteCheck = async input => {
      if (!armed) return [];
      const broken = [{ rule: "test.history-evidence", condition: "The operation needs its captured history evidence.",
        remedy: { text: "Restore the history and prepare this operation again." } }];
      if (input.writer.kind !== "verb" || input.writer.lifecycleAction !== "observe-history"
        || input.observations?.length !== 1 || typeof input.before.history !== "function" || "history" in input.after) return broken;
      const actual = success(await input.before.history({ reference: evidence.reference }));
      return JSON.stringify(actual) === JSON.stringify(history) ? [] : broken;
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const evidence = await seed(f, f.reference("work-item/meta"));
    const changed = success(await f.store.write(update(f, evidence)));
    history = success(await f.store.history({ reference: evidence.reference }));
    expect(history).toHaveLength(2);
    const target = await seed(f, f.reference("personal/document"), "original\n");
    armed = true;
    success(await f.store.batch({ writes: [mutationOf(update(f, target, "history admitted\n"))],
      provenance: { ...testProvenance, lifecycleAction: "observe-history" },
      observations: [{ reference: changed.reference, expected: { version: changed.version!, conflicts: [] } }] }));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("history admitted\n");
    expect(success(await f.store.history({ reference: evidence.reference }))).toEqual(history);
  });

  it("keeps before-history pinned when external Git temporarily moves the live ref", async () => {
    let armed = false;
    let history: HistoryEntry[] = [];
    const check: WriteCheck = async ({ before }) => {
      if (!armed) return [];
      await git(["update-ref", ref, older, current]);
      try {
        const captured = success(await before.history({ reference: evidence.reference }));
        return JSON.stringify(captured) === JSON.stringify(history) ? [] : [{ rule: "test.pinned-history",
          condition: "The rule recaptured a moved live ref.", remedy: { text: "Restore the captured history view." } }];
      } finally { await git(["update-ref", ref, current, older]); }
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const git = (args: string[]) => f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args], { cwd: f.root });
    const evidence = await seed(f, f.reference("work-item/meta"));
    if (!("uid" in evidence.reference.owner) || !evidence.reference.owner.uid) throw new Error("Expected a generated owner UID");
    const ref = `refs/arc/work/${evidence.reference.owner.uid}`;
    const older = (await git(["rev-parse", ref])).stdout.trim();
    success(await f.store.write(update(f, evidence)));
    const current = (await git(["rev-parse", ref])).stdout.trim();
    history = success(await f.store.history({ reference: evidence.reference }));
    const target = await seed(f, f.reference("personal/document"), "original\n");
    armed = true;
    success(await f.store.write(update(f, target, "pinned history admitted\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("pinned history admitted\n");
    expect(success(await f.store.history({ reference: evidence.reference }))).toEqual(history);
  });

  it("refuses a conflict-only observation change and accepts the acquired nonempty conflict set", async () => {
    const f = await createRefFixture({}, layout);
    const evidence = await seed(f, f.reference("personal/document"), "base\n");
    const current = success(await f.store.write(update(f, evidence, "current\n")));
    success(await f.store.write(update(f, evidence, "incoming\n")));
    const disputed = success(await f.store.read({ reference: evidence.reference }));
    expect(disputed.version).toBe(current.version);
    expect(disputed.conflicts).toHaveLength(1);
    const target = await seed(f, f.reference("project-registry/counter"));
    const request = { writes: [mutationOf(update(f, target))], provenance: testProvenance,
      observations: [{ reference: disputed.reference, expected: { version: current.version!, conflicts: [] } }] };
    expect(await f.store.batch(request)).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: [disputed.reference],
    } });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    success(await f.store.batch({ ...request, observations: [{ reference: disputed.reference,
      expected: { version: disputed.version, conflicts: disputed.conflicts } }] }));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe(f.content(target.reference, "changed"));
    expect(success(await f.store.read({ reference: evidence.reference }))).toEqual(disputed);
  });

  it.each(["archived", "retired"] as const)("admits a rule consuming %s before-history", async state => {
    let armed = false;
    let history: HistoryEntry[] = [];
    const check: WriteCheck = async ({ before }) => {
      if (!armed) return [];
      const captured = await before.history({ reference: evidence.reference });
      return captured.status === "ok" && JSON.stringify(captured.result) === JSON.stringify(history) ? [] : [{
        rule: "test.retained-history", condition: "The rule needs the captured owner history after its lifecycle move.",
        remedy: { text: "Acquire the owner's retained history before preparing the write." },
      }];
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const evidence = await seed(f, f.reference("work-item/meta"));
    if (state === "archived") {
      success(await f.store.write({ ...update(f, evidence),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    } else {
      const lineage = RecordReferenceSchema.parse({ owner: evidence.reference.owner, kind: "lineage/transition" });
      success(await f.store.batch({ writes: [
        { action: "put", reference: lineage, expected: null, content: f.content(lineage) },
        { action: "remove", reference: evidence.reference, expected: evidence.version },
      ], provenance: { verb: "decompose", lifecycleAction: "terminal" } }));
    }
    history = success(await f.store.history({ reference: evidence.reference }));
    expect(history.length).toBeGreaterThan(1);
    if (state === "retired") expect(history[0]?.version).toBeNull();
    const target = await seed(f, f.reference("personal/document"), "original\n");
    armed = true;
    success(await f.store.write(update(f, target, "retained history admitted\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("retained history admitted\n");
  });

  it("refuses absence under an archived owner while its quarter tree is unavailable, and admits it after repair", async () => {
    const f = await createRefFixture({}, layout);
    const quarter = ArchiveQuarterSchema.parse("2026-q1");
    const archived = await seed(f, f.reference("work-item/meta", "archived"), undefined, { kind: "completed", quarter });
    const absent = RecordReferenceSchema.parse({ owner: archived.reference.owner, kind: "work-item/companion", key: "absent.md" });
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tree = (await f.ports.exec("git", [...scope, "rev-parse", `refs/arc/archive/${quarter}^{tree}`], { cwd: f.root })).stdout.trim();
    const path = join(f.gitDir ?? join(f.root, ".git"), "objects", tree.slice(0, 2), tree.slice(2));
    const bytes = await readFile(path);
    await rm(path);
    const request = { writes: [mutationOf(update(f, target, "accepted\n"))], provenance: testProvenance,
      observations: [{ reference: absent, expected: null }] };
    const unavailable = { status: "refused", refusal: { code: "namespace-corrupt", namespace: `refs/arc/archive/${quarter}` } };
    expect(await f.store.batch(request)).toMatchObject(unavailable);
    expect(await f.store.read({ reference: absent })).toMatchObject(unavailable);
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    await writeFile(path, bytes);
    expect(await f.store.read({ reference: absent })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await f.store.batch(request));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("accepted\n");
  });
});

/** Cohort closeouts use final member assignments from live archives and completed transfers together. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { RecordReferenceSchema, type ReadPlacement, type RecordReference, type StoreRecord } from "../../src/lib/store/index.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import type { WriteCheck } from "../../src/lib/store/write-check.js";

const target = ArchiveQuarterSchema.parse("2026-q4"), prior = ArchiveQuarterSchema.parse("2026-q3");

describe.each(["default", "separate"] as const)("completed member closeouts in %s", layout => {
  it.each((["promotion", "meta refresh"] as const).flatMap(memberChange => [false, true].flatMap(transferred =>
    [false, true].map(cohortFirst => ({ memberChange, transferred, cohortFirst })))))(
    "uses same-quarter $memberChange with transferred cohort=$transferred, cohort first=$cohortFirst", async ({ memberChange, transferred, cohortFirst }) => {
    let armed = false, tracked: RecordReference[] = [];
    const checked = new Map<string, ReadPlacement | undefined>();
    const inspect: WriteCheck = async ({ after }) => {
      if (armed) for (const reference of tracked) checked.set(reference.owner.name, success(await after.read({ reference })).placement);
      return [];
    };
    const f = await createRefFixture({ "work-item/meta": { check: inspect },
      "cohort/document": { check: inspect, parser: parseCohortDocument } }, layout);
    const baseline = await seed(f, f.reference("work-item/meta", "unrelated"));
    success(await f.store.write({ ...update(f, baseline, baseline.content), placement: { kind: "completed", quarter: target } }));
    let cohort = await seed(f, f.reference("cohort/document", "closeout"));
    if (transferred) {
      success(await f.store.write({ ...update(f, cohort, cohort.content), placement: { kind: "completed", quarter: prior } }));
      cohort = success(await f.store.read({ reference: cohort.reference }));
    }
    const original = await seed(f, f.reference(memberChange === "promotion" ? "work-item/record" : "work-item/meta", "member"));
    success(await f.store.write({ ...update(f, original, original.content), placement: { kind: "completed", quarter: target } }));
    const member = success(await f.store.read({ reference: original.reference }));
    const reference = RecordReferenceSchema.parse({ ...member.reference, kind: "work-item/meta" });
    const content = JSON.stringify({ ...JSON.parse(f.content(reference)), value: 2, cohort: `ancestor/${cohort.reference.owner.name}` });
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const metadata = async (record: StoreRecord) => {
      const home = expandStoredPath(record.reference, { history: true });
      return JSON.parse((await f.ports.exec("git", [...scope, "show", `${home.ref}:${home.metadataPath}`], { cwd: f.root })).stdout) as { endBatch: string };
    };
    const ended = [member, ...transferred ? [cohort] : []];
    const endBatches = new Map(await Promise.all(ended.map(async record => [record.reference.owner.name, (await metadata(record)).endBatch] as const)));
    for (const stamp of endBatches.values()) expect(stamp).toMatch(/^[0-9a-f-]{36}$/u);
    const priorCohort = expandStoredPath(cohort.reference, { placement: cohort.placement });
    const memberWrite = mutationOf({ ...update(f, member, content), reference, placement: { kind: "completed", quarter: target } });
    const cohortWrite = mutationOf({ ...update(f, cohort, cohort.content), placement: { kind: "completed", quarter: target } });
    tracked = [reference, cohort.reference];
    armed = true;
    success(await f.store.batch({ writes: cohortFirst ? [cohortWrite, memberWrite] : [memberWrite, cohortWrite], provenance: testProvenance }));
    const finalMember = success(await f.store.read({ reference })), finalCohort = success(await f.store.read({ reference: cohort.reference }));
    expect(finalMember.placement).toEqual({ kind: "completed", quarter: target, sequence: "02" });
    expect(finalCohort.placement).toEqual({ kind: "completed", quarter: target, sequence: "02", closeout: "a" });
    expect(finalMember.content).toBe(content);
    for (const record of [finalMember, finalCohort]) {
      expect(checked.get(record.reference.owner.name)).toEqual(record.placement);
      const home = expandStoredPath(record.reference, { placement: record.placement });
      expect((await f.ports.exec("git", [...scope, "show", `${home.ref}:${home.path}`], { cwd: f.root, preserveOutput: true })).stdout).toBe(record.content);
    }
    for (const record of ended) expect((await metadata(record)).endBatch).toBe(endBatches.get(record.reference.owner.name));
    if (transferred) expect((await f.ports.exec("git", [...scope, "ls-tree", "-r", "--name-only", `refs/arc/archive/${prior}`], { cwd: f.root })).stdout)
      .not.toContain(priorCohort.metadataPath);
    expect(success(await f.store.read({ reference: baseline.reference })).placement).toEqual({ kind: "completed", quarter: target, sequence: "01" });
  }, 60_000);

  it.each((["transferred member", "both transferred", "mixed members"] as const).flatMap(scenario =>
    [false, true].map(cohortFirst => ({ scenario, cohortFirst }))))(
    "groups $scenario with its cohort, cohort first=$cohortFirst", async ({ scenario, cohortFirst }) => {
    let armed = false, tracked: RecordReference[] = [];
    const checked = new Map<string, ReadPlacement | undefined>();
    const inspect: WriteCheck = async ({ after }) => {
      if (armed) for (const reference of tracked) {
        const record = success(await after.read({ reference }));
        checked.set(reference.owner.name, record.placement);
      }
      return [];
    };
    const f = await createRefFixture({ "work-item/meta": { check: inspect },
      "cohort/document": { check: inspect, parser: parseCohortDocument } }, layout);
    const baseline = await seed(f, f.reference("work-item/meta", "unrelated"));
    success(await f.store.write({ ...update(f, baseline, baseline.content), placement: { kind: "completed", quarter: target } }));
    let cohort = await seed(f, f.reference("cohort/document", "closeout"));
    const reference = f.reference("work-item/meta", "transferred");
    const content = JSON.stringify({ ...JSON.parse(f.content(reference)), cohort: `ancestor/${cohort.reference.owner.name}` });
    let transferred = await seed(f, reference, content);
    success(await f.store.write({ ...update(f, transferred, transferred.content), placement: { kind: "completed", quarter: prior } }));
    transferred = success(await f.store.read({ reference: transferred.reference }));
    if (scenario === "both transferred") {
      success(await f.store.write({ ...update(f, cohort, cohort.content), placement: { kind: "completed", quarter: prior } }));
      cohort = success(await f.store.read({ reference: cohort.reference }));
    }
    const moved = [transferred, ...scenario === "both transferred" ? [cohort] : []];
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const metadata = async (record: StoreRecord) => {
      const home = expandStoredPath(record.reference, { history: true });
      return JSON.parse((await f.ports.exec("git", [...scope, "show", `${home.ref}:${home.metadataPath}`], { cwd: f.root })).stdout) as { endBatch: string };
    };
    const endBatches = new Map(await Promise.all(moved.map(async record => [record.reference.owner.name, (await metadata(record)).endBatch] as const)));
    for (const stamp of endBatches.values()) expect(stamp).toMatch(/^[0-9a-f-]{36}$/u);
    const sourceRoots = moved.map(record => {
      const home = expandStoredPath(record.reference, { placement: record.placement });
      return home.path.slice(0, home.path.indexOf("/") + 1);
    });
    const members = [transferred];
    if (scenario === "mixed members") {
      const live = f.reference("work-item/meta", "live");
      members.unshift(await seed(f, live, JSON.stringify({ ...JSON.parse(f.content(live)), cohort: cohort.reference.owner.name })));
    }
    const ordered = cohortFirst ? [cohort, ...members] : [...members, cohort];
    tracked = ordered.map(record => record.reference);
    armed = true;
    success(await f.store.batch({ writes: ordered.map(record => mutationOf({ ...update(f, record, record.content),
      placement: { kind: "completed", quarter: target } })), provenance: testProvenance }));
    const finalMembers = await Promise.all(members.map(async record => success(await f.store.read({ reference: record.reference }))));
    const finalCohort = success(await f.store.read({ reference: cohort.reference }));
    const sequence = scenario === "mixed members" ? "03" : "02";
    expect(finalMembers.at(-1)?.placement).toMatchObject({ kind: "completed", quarter: target, sequence });
    expect(finalCohort.placement).toEqual({ kind: "completed", quarter: target, sequence, closeout: "a" });
    for (const record of [...finalMembers, finalCohort]) {
      expect(checked.get(record.reference.owner.name)).toEqual(record.placement);
      const home = expandStoredPath(record.reference, { placement: record.placement });
      expect((await f.ports.exec("git", [...scope, "show", `${home.ref}:${home.path}`], { cwd: f.root, preserveOutput: true })).stdout).toBe(record.content);
    }
    const oldPaths = (await f.ports.exec("git", [...scope, "ls-tree", "-r", "--name-only", `refs/arc/archive/${prior}`], { cwd: f.root })).stdout;
    for (const root of sourceRoots) expect(oldPaths).not.toContain(root);
    for (const record of moved) expect((await metadata(record)).endBatch).toBe(endBatches.get(record.reference.owner.name));
    expect(success(await f.store.read({ reference: baseline.reference })).placement).toEqual({ kind: "completed", quarter: target, sequence: "01" });
  }, 60_000);
});

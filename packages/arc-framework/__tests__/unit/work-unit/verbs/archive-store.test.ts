/** Backend-assigned archive numbers and session/cohort closeout share one checked batch. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema, StateVersionSchema } from "../../../../src/lib/store/identity.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import { runArchive } from "../../../../src/lib/work-unit/verbs/archive.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { writeMetaCohort, writeMetaPause, writeMetaSessionContext } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../../../src/lib/store/index.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { PushResultSchema, type SyncState } from "../../../../src/lib/store/sync.js";
function context(store: Store): ExecuteTransitionContext {
  const forbidden = async (): Promise<never> => { throw new Error("tracked artifact access"); };
  return { cwd: "/repo", store, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
}
describe("store archive", () => {
  it("retains the pause's typed resume remedy and leaves the record unchanged", async () => {
    const h = createLifecycleHarness();
    const meta = await h.seedMeta("example");
    lifecycleSuccess(await h.store.write({ ...recordPut(meta, { content: writeMetaPause(meta.content, {
      pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null,
      resumeNotes: null, open: false,
    }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
    const paused = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
    const result = await runArchive({ executor: context(h.store), fs: { readdir: async () => [] }, clock: () => new Date() }, { name: "example" });
    expect(result).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(paused);
  });

  it("retries a persisted archive's failed report without writing another archive", async () => {
    const h = createLifecycleHarness();
    const meta = await h.seedMeta("example");
    let landed = false;
    const store: Store = new Proxy(h.store, { get(target, key) {
      if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
        const result = await target.batch(input); landed = result.status === "ok"; return result;
      };
      if (key === "read") return async (input: Parameters<Store["read"]>[0]) => landed
        ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.reference,
          rule: "test.report-unavailable", condition: "Archive report temporarily unavailable.", remedy: { text: "Repair reads, then retry." } } }
        : target.read(input);
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const first = await runArchive({ executor: context(store), fs: { readdir: async () => [] }, clock: () => new Date() }, { name: "example" });
    expect(first).toMatchObject({ status: "rejected", persisted: true, remedy: { argv: ["arc", "archive", "example"] } });
    const completed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
    const retried = await runArchive({ executor: context(h.store), fs: { readdir: async () => [] }, clock: () => new Date() }, { name: "example" });
    expect(retried.status).toBe("archived");
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(completed);
  });
  it("reports the assigned number and closes the last cohort with cleared session fields", async () => {
    const h = createLifecycleHarness();
    const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
      "# Cohort: group\n\n**Purpose:** Deliver a concrete result.\n");
    const initial = await h.seedMeta("example", { cohort: "group", stateAtHandoff: StateVersionSchema.parse("state:1"), commitAtHandoff: `sha256:${"a".repeat(64)}`, sessionType: "execution" });
    lifecycleSuccess(await h.store.write({ ...recordPut(initial, { content: writeMetaSessionContext(initial.content, "Retained context") }),
      provenance: { verb: "handoff", lifecycleAction: "handoff" } }));
    const meta = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
    const forbidden = async (): Promise<never> => { throw new Error("quarter filesystem scan"); };
    const result = await runArchive({ executor: context(h.store), fs: { readdir: forbidden }, clock: () => new Date("2026-10-14T12:00:00Z") }, { name: "example" });
    expect(result.status).toBe("archived");
    if (result.status !== "archived") return;
    expect(result.destination).toMatchObject({ quarter: "2026-q4", sequence: "01" });
    expect(result.cohortSwept).toContain("01a_cohort-group");
    const archived = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
    expect(ParsedMetaRecordSchema.parse(archived.fields)).toMatchObject({ state: "Shipped", sessionContext: null,
      stateAtHandoff: null, commitAtHandoff: null, sessionType: null, nextAction: null, prUrl: null, branch: null });
    const cohort = lifecycleSuccess(await h.store.read({ reference: group.reference }));
    expect(cohort.placement).toMatchObject({ kind: "completed", sequence: "01", closeout: "a" });
    const ownHistory = lifecycleSuccess(await h.store.history({ reference: meta.reference }));
    const groupHistory = lifecycleSuccess(await h.store.history({ reference: group.reference }));
    const own = ownHistory[0]?.provenance, groupProvenance = groupHistory[0]?.provenance;
    if (own === undefined || groupProvenance === undefined || !("batchId" in own) || !("batchId" in groupProvenance)) throw new Error("Atomic archive provenance is absent");
    expect(own.batchId).toBeTruthy();
    expect(own.batchId).toBe(groupProvenance.batchId);
  });
});

function archive(store: Store, name: string) {
  return runArchive({ executor: context(store), fs: { readdir: async () => [] }, clock: () => new Date("2026-10-14T12:00:00Z") }, { name });
}

const publicationRepair = { text: "Repair the remote designation and retry publication." };
const stoppingPublicationStates: SyncState[] = [
  { status: "designation-ambiguous", remotes: ["origin", "backup"], remedy: publicationRepair },
  { status: "move-incomplete", condition: "Store placement is incomplete.", remedy: publicationRepair },
  { status: "move-unfinished", condition: "Remote move needs an answer.", remedy: publicationRepair },
  { status: "moved", remote: "backup", remedy: publicationRepair },
  { status: "designation-needed", remote: "origin", choices: ["push", "read", "off"], remedy: publicationRepair },
];
it.each(stoppingPublicationStates)("retains archive completion until publication recovers from $status", async state => {
  const h = createLifecycleHarness(), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  const meta = await h.seedMeta("example");
  let blocked = true;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "push") return () => blocked ? Promise.resolve({ status: "ok", result: { states: [state], pulls: [], publishes: [] } }) : target.push();
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "example")).toMatchObject({ status: "rejected", persisted: true,
    remedy: { text: expect.stringContaining(publicationRepair.text), argv: ["arc", "archive", "example"] } });
  const completed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(completed.placement).toMatchObject({ kind: "completed" });
  blocked = false;
  expect(await archive(store, "example")).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).version).toBe(completed.version);
  expect([...remote.state.records.values()].find(record => record.reference.kind === "work-item/meta")?.placement)
    .toMatchObject({ kind: "completed" });
});

it.each(["candidate", "state"] as const)("retains failed %s guidance until its persisted archive actually publishes", async role => {
  const h = createLifecycleHarness(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const meta = await h.seedMeta("example"); let blocked = true;
  const failure = { code: "unreachable", class: "recoverable", cause: "timeout", condition: "Candidate check timed out.", remedy: publicationRepair };
  const stopped = PushResultSchema.parse({ states: [], pulls: [{ remote: "origin", role, status: "failed", families: ["work-item", "cohort"], failure, notices: [] }], publishes: [] });
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "push") return () => blocked ? Promise.resolve({ status: "ok", result: stopped }) : target.push();
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "example")).toMatchObject({ status: "rejected", persisted: true,
    reason: expect.stringContaining(failure.condition), remedy: { text: expect.stringContaining(publicationRepair.text), argv: ["arc", "archive", "example"] } });
  const completed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(completed.placement?.kind).toBe("completed"); expect(remote.state.records.size).toBe(0);
  blocked = false;
  expect(await archive(store, "example")).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).version).toBe(completed.version);
  expect([...remote.state.records.values()].find(record => record.reference.kind === "work-item/meta")?.placement?.kind).toBe("completed");
});

it("completes an archive published beside an independent failed read source", async () => {
  const h = createLifecycleHarness(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  await h.seedMeta("example");
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "push") return async () => {
      const result = await target.push(); if (result.status === "refused") return result;
      return { status: "ok", result: PushResultSchema.parse({ ...result.result, pulls: [{ remote: "upstream", role: "read", status: "failed", families: ["work-item", "cohort"], notices: [],
        failure: { code: "unreachable", class: "recoverable", cause: "network", condition: "Read source unavailable.", remedy: publicationRepair } }] }) };
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "example")).toMatchObject({ status: "archived",
    warnings: [`Read source upstream was not pulled: Read source unavailable. ${publicationRepair.text}`] });
  expect([...remote.state.records.values()].find(record => record.reference.kind === "work-item/meta")?.placement?.kind).toBe("completed");
});

it("carries an ended item's retained conflicts from the archive's push into its warnings", async () => {
  const h = createLifecycleHarness(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  await h.seedMeta("example");
  const item = OwnerIdentitySchema.parse({ type: "work-item", name: "alpha", uid: "11111111-1111-4111-8111-111111111111" });
  const conflict = RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner: item, key: "held" });
  let raised = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "push") return async () => {
      const result = await target.push(); if (result.status === "refused" || raised) return result;
      raised = true;
      return { status: "ok", result: PushResultSchema.parse({ ...result.result, pulls: [{ remote: "origin", role: "state", status: "pulled",
        families: ["work-item"], notices: [{ kind: "ended-with-conflicts", item, conflicts: [conflict], condition: "Alpha ended with conflicts.",
          remedy: { text: "Resolve alpha's retained conflicts." } }] }] }) };
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await archive(store, "example");
  expect(result).toMatchObject({ status: "archived", warnings: [expect.stringContaining("Alpha ended with conflicts.")] });
  expect(result.status === "archived" ? result.warnings[0] : "").toContain(JSON.stringify(conflict));
});

it("keeps the archive push's notices in a later closeout rejection", async () => {
  const h = createLifecycleHarness(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  await h.seedMeta("example");
  const item = OwnerIdentitySchema.parse({ type: "work-item", name: "alpha", uid: "11111111-1111-4111-8111-111111111111" });
  let landed = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      const result = await target.batch(input); landed = result.status === "ok"; return result;
    };
    if (key === "push") return async () => {
      const result = await target.push(); if (result.status === "refused") return result;
      return { status: "ok", result: PushResultSchema.parse({ ...result.result, pulls: [{ remote: "origin", role: "state", status: "pulled",
        families: ["work-item"], notices: [{ kind: "end-pending", item, ref: "refs/arc/work/11111111-1111-4111-8111-111111111111",
          condition: "Alpha's end remains pending.", remedy: { text: "Pull again to settle it." } }] }] }) };
    };
    if (key === "read") return async (input: Parameters<Store["read"]>[0]) => landed
      ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.reference,
        rule: "test.report-unavailable", condition: "Archive report temporarily unavailable.", remedy: { text: "Repair reads, then retry." } } }
      : target.read(input);
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "example")).toMatchObject({ status: "rejected", persisted: true,
    reason: expect.stringMatching(/Archive report temporarily unavailable\..*Also reported: Alpha's end remains pending\. Pull again to settle it\./su) });
});

it("completes an archive published successfully beside an unfinished-move advisory", async () => {
  const h = createLifecycleHarness(), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  await h.seedMeta("example");
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "push") return async () => {
      const pushed = await target.push();
      if (pushed.status === "refused") return pushed;
      return { status: "ok", result: { ...pushed.result, states: [...pushed.result.states,
        { status: "move-unfinished", condition: "The old source awaits cleanup.", remedy: publicationRepair }] } };
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "example")).toMatchObject({ status: "archived",
    warnings: [`The old source awaits cleanup. ${publicationRepair.text}`] });
  expect([...remote.state.records.values()].find(record => record.reference.kind === "work-item/meta")?.placement)
    .toMatchObject({ kind: "completed" });
});
async function groupFixture(nested = false) {
  const h = createLifecycleHarness();
  const parent = nested ? await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "parent" })),
    "# Cohort: parent\n\n**Purpose:** Deliver the group.\n") : undefined;
  const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    `# Cohort: group\n\n**Purpose:** Deliver both members.\n${nested ? "\n**Parent:** `parent`\n" : ""}`);
  const cohort = nested ? "parent/group" : "group";
  const alpha = await h.seedMeta("alpha", { cohort }), beta = await h.seedMeta("beta", { cohort });
  return { ...h, group, alpha, beta, parent };
}
it.each([false, true])("refuses a stale final-member batch and retries atomic closeout, nested=%s", async (nested) => {
  const h = await groupFixture(nested);
  let arrived = 0; let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      if (input.writes.some((write) => write.reference.kind === "work-item/meta" && write.action === "put" && write.placement?.kind === "completed")) {
        if (++arrived === 2) release(); await barrier;
      }
      return target.batch(input);
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const results = await Promise.all([archive(store, "alpha"), archive(store, "beta")]);
  expect(results.filter((result) => result.status === "archived")).toHaveLength(1);
  const refused = results.findIndex((result) => result.status === "rejected");
  expect(refused).toBeGreaterThanOrEqual(0);
  expect(results[refused]).toMatchObject({ status: "rejected", refusal: { rule: "cohort.archive-closeout" } });
  const last = refused === 0 ? h.alpha : h.beta;
  expect(lifecycleSuccess(await h.store.read({ reference: last.reference }))).toEqual(last);
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement?.kind).not.toBe("completed");
  expect(await archive(h.store, last.reference.owner.name)).toMatchObject({ status: "archived", destination: { sequence: "02" } });
  const primaryHistory = lifecycleSuccess(await h.store.history({ reference: last.reference }));
  const primaryProvenance = primaryHistory[0]?.provenance;
  if (primaryProvenance === undefined || !("batchId" in primaryProvenance)) throw new Error("Missing member archive batch");
  for (const cohort of [h.group, ...(h.parent === undefined ? [] : [h.parent])]) {
    const completed = lifecycleSuccess(await h.store.read({ reference: cohort.reference }));
    expect(completed.placement).toMatchObject({ kind: "completed", sequence: "02", closeout: cohort === h.parent ? "b" : "a" });
    expect(lifecycleSuccess(await h.store.history({ reference: cohort.reference }))[0]?.provenance)
      .toMatchObject({ batchId: primaryProvenance.batchId });
  }
  const completed = lifecycleSuccess(await h.store.read({ reference: last.reference }));
  expect(await archive(h.store, last.reference.owner.name)).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: last.reference }))).toEqual(completed);
});
it("refuses a cohort preparation whose version changed and succeeds after re-preparation", async () => {
  const h = await groupFixture(); let inject = true;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "read") return async (input: Parameters<Store["read"]>[0]) => {
      const result = await target.read(input);
      if (inject && input.reference.kind === "cohort/document" && result.status === "ok") {
        inject = false;
        lifecycleSuccess(await target.write({ ...recordPut(result.result), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      }
      return result;
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "alpha")).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.alpha.reference }))).toEqual(h.alpha);
  expect(await archive(store, "alpha")).toMatchObject({ status: "archived" });
  expect(await archive(store, "beta")).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement).toMatchObject({ kind: "completed" });
});
it("publishes before reporting and closes a shared cohort after another client's sibling archive arrives", async () => {
  const left = await groupFixture(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  lifecycleSuccess(await left.store.push()); lifecycleSuccess(await right.store.push());
  expect(await archive(left.store, "alpha")).toMatchObject({ status: "archived", destination: { sequence: "01" } });
  expect(await archive(right.store, "beta")).toMatchObject({ status: "archived", destination: { sequence: "02" } });
  const completed = lifecycleSuccess(await right.store.read({ reference: left.group.reference }));
  expect(completed.placement).toMatchObject({ kind: "completed", sequence: "03", closeout: "a" });
  lifecycleSuccess(await left.store.push());
  expect(lifecycleSuccess(await left.store.read({ reference: left.group.reference }))).toEqual(completed);
  expect(await archive(left.store, "alpha")).toMatchObject({ status: "archived", cohortSwept: expect.stringContaining("03a_cohort-group") });
});
it("retains a persisted archive through a failed publish and its completed-subject retry publishes the final report", async () => {
  const h = createLifecycleHarness(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const meta = await h.seedMeta("example"); remote.condition = "down";
  expect(await archive(h.store, "example")).toMatchObject({ status: "rejected", persisted: true, remedy: { argv: ["arc", "archive", "example"] } });
  const completed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(completed.placement).toMatchObject({ kind: "completed" });
  remote.condition = "available";
  expect(await archive(h.store, "example")).toMatchObject({ status: "archived", destination: { sequence: "01" } });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).version).toBe(completed.version);
  expect([...remote.state.records.values()].find((record) => record.reference.kind === "work-item/meta")?.placement).toMatchObject({ kind: "completed" });
});

it.each(["write", "publication"])("retries standalone closeout after interrupted %s without another primary archive", async (stage) => {
  const left = await groupFixture(), right = createLifecycleHarness(), remote = createMemoryRemote();
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  lifecycleSuccess(await left.store.push()); lifecycleSuccess(await right.store.push());
  expect(await archive(left.store, "alpha")).toMatchObject({ status: "archived" });
  let interrupted = false;
  const store: Store = new Proxy(right.store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      const standalone = input.writes.length > 0 && input.writes.every((write) => write.reference.kind === "cohort/document");
      if (standalone && !interrupted) {
        interrupted = true;
        if (stage === "write") throw new Error("Closeout write unavailable");
        const result = await target.batch(input); remote.condition = "down"; return result;
      }
      return target.batch(input);
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "beta")).toMatchObject({ status: "rejected", persisted: true,
    remedy: { argv: ["arc", "archive", "beta"] } });
  expect(interrupted).toBe(true);
  const member = lifecycleSuccess(await right.store.read({ reference: left.beta.reference }));
  expect(member.placement).toMatchObject({ kind: "completed", sequence: "02" });
  const history = lifecycleSuccess(await right.store.history({ reference: member.reference }));
  remote.condition = "available";
  expect(await archive(store, "beta")).toMatchObject({ status: "archived", destination: { sequence: "02" },
    cohortSwept: expect.stringContaining("03a_cohort-group") });
  expect(lifecycleSuccess(await right.store.read({ reference: member.reference })).version).toBe(member.version);
  expect(lifecycleSuccess(await right.store.history({ reference: member.reference }))).toEqual(history);
  expect([...remote.state.records.values()].find((record) => record.reference.kind === "cohort/document")?.placement)
    .toMatchObject({ kind: "completed", sequence: "03", closeout: "a" });
});

async function nestedCloseoutFixture() {
  const left = createLifecycleHarness(), right = createLifecycleHarness(), remote = createMemoryRemote();
  const cohort = (name: string, parent?: string) => left.seed(
    recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** Deliver the group.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`,
  );
  const parent = await cohort("parent");
  await cohort("leaf", "parent"); await cohort("sibling", "parent");
  await left.seedMeta("alpha", { cohort: "parent/leaf" });
  const beta = await left.seedMeta("beta", { cohort: "parent/leaf" });
  await left.seedMeta("gamma", { cohort: "parent/sibling" });
  left.store.context.publication.remote = remote; right.store.context.publication.remote = remote;
  lifecycleSuccess(await left.store.push()); lifecycleSuccess(await right.store.push());
  expect(await archive(left.store, "alpha")).toMatchObject({ status: "archived" });
  return { left, right, remote, parent, beta };
}

it.each(["none", "write", "publication"])("settles parent eligibility learned during closeout sync, interruption=%s", async (stage) => {
  const h = await nestedCloseoutFixture(); let syncs = 0, interrupted = false;
  const store: Store = new Proxy(h.right.store, { get(target, key) {
    if (key === "push") return async () => {
      if (++syncs === 2) expect(await archive(h.left.store, "gamma")).toMatchObject({ status: "archived" });
      return target.push();
    };
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      const parentCloseout = input.writes.some((write) => write.reference.kind === "cohort/document"
        && write.reference.owner.name === "parent" && write.action === "put" && write.placement?.kind === "completed");
      if (parentCloseout && stage !== "none" && !interrupted) {
        interrupted = true;
        if (stage === "write") throw new Error("Parent closeout unavailable");
        const result = await target.batch(input); h.remote.condition = "down"; return result;
      }
      return target.batch(input);
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const first = await archive(store, "beta");
  if (stage === "none") expect(first).toMatchObject({ status: "archived", nestedParentSwept: expect.stringContaining("05b_cohort-parent") });
  else expect(first).toMatchObject({ status: "rejected", persisted: true, remedy: { argv: ["arc", "archive", "beta"] } });
  const member = lifecycleSuccess(await h.right.store.read({ reference: h.beta.reference }));
  const history = lifecycleSuccess(await h.right.store.history({ reference: member.reference }));
  h.remote.condition = "available";
  expect(await archive(store, "beta")).toMatchObject({ status: "archived", destination: { sequence: "02" },
    nestedParentSwept: expect.stringContaining("05b_cohort-parent") });
  expect(lifecycleSuccess(await h.right.store.read({ reference: member.reference }))).toEqual(member);
  expect(lifecycleSuccess(await h.right.store.history({ reference: member.reference }))).toEqual(history);
  lifecycleSuccess(await h.left.store.push());
  expect(lifecycleSuccess(await h.left.store.read({ reference: h.parent.reference })).placement)
    .toMatchObject({ kind: "completed", sequence: "05", closeout: "b" });
});


it.each([false, true])("archives the final member while an empty open child retains its parent, nested=%s", async (nested) => {
  const h = await groupFixture(nested);
  const empty = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "empty" })),
    `# Cohort: empty\n\n**Purpose:** Await future work.\n\n**Parent:** \`${nested ? "parent" : "group"}\`\n`);
  expect(await archive(h.store, "alpha")).toMatchObject({ status: "archived" });
  const result = await archive(h.store, "beta");
  expect(result).toMatchObject({ status: "archived", nestedParentSwept: null });
  expect(lifecycleSuccess(await h.store.read({ reference: h.beta.reference })).placement).toMatchObject({ kind: "completed" });
  expect(lifecycleSuccess(await h.store.read({ reference: empty.reference })).placement?.kind).not.toBe("completed");
  const parent = nested ? h.parent! : h.group;
  expect(lifecycleSuccess(await h.store.read({ reference: parent.reference })).placement?.kind).not.toBe("completed");
  if (nested) {
    expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement).toMatchObject({ kind: "completed", closeout: "a" });
  } else expect(result).toMatchObject({ cohortSwept: null });
});


it("refuses a changed empty-child observation before archiving and succeeds after re-preparation", async () => {
  const h = await groupFixture();
  const child = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "empty" })),
    "# Cohort: empty\n\n**Purpose:** Await future work.\n\n**Parent:** `group`\n");
  let inject = true;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "list") return async (input: Parameters<Store["list"]>[0]) => {
      const result = await target.list(input);
      if (inject && input.family === "cohort") {
        inject = false;
        lifecycleSuccess(await target.write({ ...recordPut(child), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      }
      return result;
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await archive(store, "alpha")).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.alpha.reference }))).toEqual(h.alpha);
  expect(await archive(store, "alpha")).toMatchObject({ status: "archived" });
});

it("refuses closing a cohort when a disputed outsider arrives at batch admission, then closes it after resolution", async () => {
  const h = await groupFixture();
  expect(await archive(h.store, "alpha")).toMatchObject({ status: "archived" });
  const outsider = await h.seedMeta("outsider");
  const racing = withCompetingBatch(h.store, async () => {
    const label = { actor: "remote", time: new Date(0).toISOString() };
    lifecycleSuccess(await h.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: outsider.reference.owner, kind: "work-item/conflict-record", key: "membership-gap" }),
      content: JSON.stringify(ConflictRecordSchema.parse({ record: outsider.reference, location: { kind: "hunk", start: 1, end: 2 },
        baseVersion: outsider.version, currentLines: 1, incomingLines: 1,
        base: outsider.content, current: { content: outsider.content, label },
        incoming: { content: writeMetaCohort(outsider.content, "group"), label } })),
      provenance: { verb: "sync", lifecycleAction: "reconcile" } }));
  });
  expect(await archive(racing, "beta")).toMatchObject({ status: "rejected", refusal: { rule: "cohort.open-members",
    condition: expect.stringContaining("outsider") } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.beta.reference }))).toEqual(h.beta);
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement?.kind).not.toBe("completed");
  const disputed = lifecycleSuccess(await h.store.read({ reference: outsider.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed), resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await archive(h.store, "beta")).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference })).placement).toMatchObject({ kind: "completed" });
});

it("rejects a malformed selected meta without writes and archives after its bytes are repaired", async () => {
  const h = createLifecycleHarness(), meta = await h.seedMeta("example");
  const raw = [...h.store.state.records.values()].find((record) => record.reference.owner.name === "example");
  if (raw === undefined) throw new Error("Missing stored metadata");
  const original = raw.content;
  raw.content = original.replace(/^# Metadata:.*$/mu, "No metadata heading");
  const malformed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(malformed.fields).toBeUndefined();
  expect(await archive(h.store, "example")).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("example"), refusal: { code: "record-malformed", reference: meta.reference,
      remedy: { text: expect.stringMatching(/repair.*retry/isu), argv: ["arc", "archive", "example"] } } });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(malformed);
  raw.content = original;
  expect(await archive(h.store, "example")).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).placement).toMatchObject({ kind: "completed" });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { createManualStepBarrier } from "../helpers/multi-clone.js";
import { makeGitExec } from "../helpers/integration.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { join } from "node:path";
import { createRefSyncCheckout, refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ConflictRecordSchema, createRefStore, HistoryRefSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

describe.each(["default", "separate"] as const)("lifecycle publication in the %s layout", (layout) => {
  it.each(["work", "cohort"] as const)("publishes the %s end and pays its live-ref delete atomically", async (family) => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: family === "work" ? "work-item/meta" : "cohort/document",
      owner: { type: family === "work" ? "work-item" : "cohort", name: "ending" } });
    const content = family === "work" ? makeMetaFixture("ending") : "# Ending\n\n**Purpose:** Complete the cohort.\n";
    const made = success(await h.a.store.write({ action: "put", reference, expected: null, content,
      ...family === "work" ? { placement: { kind: "active" as const } } : {}, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: current.content, placement: { kind: "completed", quarter }, provenance }));
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    if (!("uid" in made.reference.owner)) throw new Error("The lifecycle subject needs a UID");
    const live = `refs/arc/${family}/${made.reference.owner.uid}`, history = `refs/arc/history/${family}/${made.reference.owner.uid}`;
    const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", live, history, `refs/arc/archive/${quarter}`])).stdout.split("\n");
    expect(refs).not.toContain(live);
    expect(refs).toContain(history);
    expect(refs).toContain(`refs/arc/archive/${quarter}`);
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", live.replace("refs/arc/", `refs/arc-remotes/${h.remoteName}/`)])).stdout).toBe("");
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status === "noop")).toBe(true);
  });
  it("publishes a reopen without restoring the history ref its live commit replaced", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("reopening"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reopening" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push());
    const closed = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    if (!("uid" in made.reference.owner)) throw new Error("The reopened subject needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", live, history])).stdout.split("\n");
    expect(refs).toContain(live);
    expect(refs).not.toContain(history);
    expect((await h.remote("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toBe("");
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: made.reference })).placement).toEqual({ kind: "active" });
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status === "noop")).toBe(true);
  });

  it("fetches a history-ref create by name after another machine restores it before the leased push", async () => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("restored"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "restored" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    if (!("uid" in made.reference.owner)) throw new Error("The restored subject needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const restoredTip = (await h.a.git(["rev-parse", history])).stdout;
    success(await h.a.store.push());
    const firstEnd = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: firstEnd.reference, expected: firstEnd.version,
      content: firstEnd.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    success(await h.a.store.push());
    const reopened = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: reopened.reference, expected: reopened.version,
      content: reopened.content, placement: { kind: "completed", quarter }, provenance }));
    const endedTip = (await h.a.git(["rev-parse", history])).stdout;
    let attempts = 0;
    const publisher = createRefStore({ ...h.a.ports, ...clock, random: () => 0, exec: async (command, args, options) => {
      if (!args.includes("push")) return h.a.ports.exec(command, args, options);
      attempts++;
      if (attempts === 1) await h.a.git(["push", h.remoteName, `${restoredTip}:${history}`]);
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) { if (attempts >= 2) clock.advance(120_000); throw error; }
    } });
    const result = PushResultSchema.parse(success(await publisher.push()));
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.publishes.every((outcome) => "retryCount" in outcome && outcome.retryCount === 1)).toBe(true);
    expect((await h.remote("git", ["rev-parse", history])).stdout).toBe(endedTip);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  });

  it.each(["work", "cohort"] as const)("retains the write that defeated a %s end's delete for a fresh third clone", async (family) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: family === "work" ? makeMetaFixture("late-write") : "# Late Write\n\n**Purpose:** Retain the cohort.\n",
      reference: RecordReferenceSchema.parse({ kind: family === "work" ? "work-item/meta" : "cohort/document", owner: { type: family === "work" ? "work-item" : "cohort", name: "late-write" } }),
      ...family === "work" ? { placement: { kind: "active" as const } } : {}, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const base = success(await h.a.store.read({ reference: made.reference }));
    const endedContent = `${base.content}\nEnd's accepted content.\n`;
    success(await h.a.store.write({ action: "put", reference: base.reference, expected: base.version,
      content: endedContent, placement: { kind: "completed", quarter }, provenance }));
    if (!("uid" in made.reference.owner)) throw new Error("The ended subject needs a UID");
    const live = `refs/arc/${family}/${made.reference.owner.uid}`, history = `refs/arc/history/${family}/${made.reference.owner.uid}`;
    let armed = true, failedAtomically = false, lateTip = "";
    const lateContent = `${base.content}\nOther machine's accepted content.\n`;
    const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
      armed = false;
      const before = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
        content: lateContent, ...family === "work" ? { placement: { kind: "active" as const } } : {}, provenance: { verb: "edit", lifecycleAction: "save" } }));
      success(await h.b.store.push());
      lateTip = (await h.remote("git", ["rev-parse", live])).stdout;
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        failedAtomically = (await h.remote("git", ["for-each-ref", "--format=%(refname)", history, `refs/arc/archive/${quarter}`])).stdout === "";
        throw error;
      }
    } });
    const result = PushResultSchema.parse(success(await publisher.push()));
    expect(failedAtomically).toBe(true);
    expect(result.publishes.every((outcome) => outcome.status !== "failed" && "retryCount" in outcome && outcome.retryCount === 1)).toBe(true);
    const expectedConflict = family === "work"
      ? { location: { kind: "record" }, current: { value: { content: endedContent } }, incoming: { value: { content: lateContent } } }
      : { location: { kind: "hunk" }, current: { content: expect.stringContaining("End's accepted content.") }, incoming: { content: expect.stringContaining("Other machine's accepted content.") } };
    const thirdRoot = join(h.a.root, "third-clone");
    await h.a.exec("git", ["clone", "--no-hardlinks", h.origin, thirdRoot]);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Third clone"], ["user.email", "third@example.com"],
      ...layout === "default" ? [["remote.origin.arc-state", "push"]] : []]) {
      await h.a.exec("git", ["-C", thirdRoot, "config", key!, value!]);
    }
    const third = await createRefSyncCheckout(thirdRoot, layout, h.origin);
    success(await third.store.pull());
    const observed = success(await third.store.read({ reference: made.reference }));
    expect(observed.conflicts).toHaveLength(1);
    expect(observed.content).toBe(endedContent);
    expect(ConflictRecordSchema.parse(JSON.parse(success(await third.store.read({ reference: observed.conflicts[0]! })).content)))
      .toMatchObject(expectedConflict);
    const ended = success(await h.a.store.read({ reference: made.reference }));
    expect(ended.content).toBe(endedContent);
    expect(ended.placement?.kind).toBe("completed");
    expect(ended.conflicts).toHaveLength(1);
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: ended.conflicts[0]! })).content));
    expect(conflict).toMatchObject(expectedConflict);
    const finalTip = (await h.remote("git", ["rev-parse", history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", lateTip, finalTip]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  });

  it.each(["before pull", "at delete"] as const)("keeps a completed-item write that arrives %s while reopening", async (arrival) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("reopen-race"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reopen-race" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push());
    const base = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: base.reference, expected: base.version,
      content: base.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The reopened subject needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`);
    success(await h.b.store.pull({ history: [history] }));
    const closed = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    const completedContent = `${closed.content}\nSaved while completed.\n`;
    let completedTip = "", failedAtomically = false;
    const completedWrite = async () => {
      const before = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
        content: completedContent, placement: { kind: "completed", quarter }, provenance: { verb: "edit", lifecycleAction: "save" } }));
      success(await h.b.store.push());
      completedTip = (await h.remote("git", ["rev-parse", history])).stdout;
    };
    if (arrival === "before pull") await completedWrite();
    let armed = arrival === "at delete";
    const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
      armed = false; await completedWrite();
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        failedAtomically = (await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout === "";
        throw error;
      }
    } });
    const result = PushResultSchema.parse(success(await publisher.push()));
    expect(result.publishes.every((outcome) => outcome.status !== "failed" && "retryCount" in outcome && outcome.retryCount === (arrival === "at delete" ? 1 : 0))).toBe(true);
    if (arrival === "at delete") expect(failedAtomically).toBe(true);
    const reopened = success(await h.a.store.read({ reference: made.reference }));
    expect(reopened.content).toBe(completedContent);
    expect(reopened.placement).toEqual({ kind: "active" });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    expect((await h.remote("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toBe("");
    const finalTip = (await h.remote("git", ["rev-parse", live])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", completedTip, finalTip]);
    const metadata = JSON.parse((await h.remote("git", ["show", `${live}:metadata-${made.reference.owner.uid}.json`])).stdout);
    expect(metadata).not.toHaveProperty("endBatch");
    expect(metadata).not.toHaveProperty("batch");
  });

  it("repeats a delete after a sibling fetch advances the shared lease to an unmerged write", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("sibling-end"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "sibling-end" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const base = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: base.reference, expected: base.version,
      content: `${base.content}\nEnding on this clone.\n`, placement: { kind: "completed", quarter }, provenance }));
    if (!("uid" in made.reference.owner)) throw new Error("The sibling subject needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const siblingRoot = join(h.a.root, "sibling");
    await h.a.exec("git", ["worktree", "add", "--detach", siblingRoot, "HEAD"]);
    const siblingExec = makeGitExec(siblingRoot), defaults = createDefaultStorePorts({ checkoutRoot: siblingRoot, exec: siblingExec });
    const listed = createManualStepBarrier(), fetched = createManualStepBarrier();
    let armed = true, held = false;
    const publisher = createRefStore({ ...h.a.ports, lock: async (name) => {
      const release = await h.a.ports.lock(name);
      if (name === live) held = true;
      return async () => { if (name === live) held = false; await release(); };
    }, exec: async (command, args, options) => {
      if (armed && held && args.includes("for-each-ref") && args.at(-1) === `refs/arc-remotes/${h.remoteName}/`) {
        armed = false; await listed.arrive();
      }
      return h.a.ports.exec(command, args, options);
    } });
    const sibling = createRefStore({ ...h.a.ports, ...defaults, lock: createRefLockFactory(defaults),
      rawExec: createExecaRawGitExec(siblingRoot), exec: async (command, args, options) => {
        const result = await siblingExec(command, args, options);
        if (args.includes("fetch")) await fetched.arrive();
        return result;
      } });
    const pushing = publisher.push();
    let pulling: ReturnType<typeof sibling.pull> | undefined;
    try {
      await Promise.race([listed.reached, pushing.then(() => { throw new Error("Push ended before its locked delete listing"); })]);
      const before = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
        content: `${before.content}\nConcurrent remote write.\n`, placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "save" } }));
      success(await h.b.store.push());
      const remoteTip = (await h.remote("git", ["rev-parse", live])).stdout;
      pulling = sibling.pull();
      await Promise.race([fetched.reached, pulling.then(() => { throw new Error("Sibling pull ended before its completed fetch"); })]);
      listed.release();
      const result = PushResultSchema.parse(success(await pushing));
      expect(success(await h.a.store.read({ reference: made.reference })).conflicts).toHaveLength(1);
      const finalTip = (await h.remote("git", ["rev-parse", history])).stdout;
      await h.a.git(["merge-base", "--is-ancestor", remoteTip, finalTip]);
      expect(result.publishes.every((outcome) => "retryCount" in outcome && outcome.retryCount === 1)).toBe(true);
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
      fetched.release(); success(await pulling);
    } finally { listed.release(); fetched.release(); await Promise.allSettled([pushing, ...pulling ? [pulling] : []]); }
  });

});

import { join } from "node:path";
import { makeGitExec } from "../helpers/integration.js";
import { createManualStepBarrier } from "../helpers/multi-clone.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const provenance = { verb: "start", lifecycleAction: "save" };
const meta = (name: string) => RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } });

describe.each(["default", "separate"] as const)("push leases in the %s layout", (layout) => {
  it("loses an atomic lease without publishing the other ref, then merges and retries both", async () => {
    const h = await refSyncFixture(layout);
    const first = success(await h.a.store.write({ action: "put", reference: meta("alpha"), expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const second = success(await h.a.store.write({ action: "put", reference: meta("beta"), expected: null,
      content: makeMetaFixture("beta"), placement: { kind: "active" }, provenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const one = success(await h.a.store.read({ reference: first.reference }));
    const two = success(await h.a.store.read({ reference: second.reference }));
    const firstRef = `refs/arc/work/${"uid" in first.reference.owner ? first.reference.owner.uid : ""}`;
    const secondRef = `refs/arc/work/${"uid" in second.reference.owner ? second.reference.owner.uid : ""}`;
    const publishedSecond = (await h.remote("git", ["rev-parse", secondRef])).stdout;
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: one.reference, expected: one.version, placement: one.placement, content: `${one.content}\nLocal alpha.\n` },
      { action: "put", reference: two.reference, expected: two.version, placement: two.placement, content: `${two.content}\nLocal beta.\n` },
    ], provenance }));
    let armed = true, failedAtomically = false, otherTip = "";
    const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
      armed = false;
      const before = success(await h.b.store.read({ reference: one.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version, placement: before.placement,
        content: `${before.content}\nOther machine.\n`, provenance }));
      otherTip = (await h.b.git(["rev-parse", firstRef])).stdout;
      await h.b.git(["push", h.remoteName, `${firstRef}:${firstRef}`]);
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        failedAtomically = (await h.remote("git", ["rev-parse", secondRef])).stdout === publishedSecond;
        throw error;
      }
    } });
    const result = success(await publisher.push());
    expect(failedAtomically).toBe(true);
    expect(result.pulls.length).toBeGreaterThan(1);
    const final = (await h.remote("git", ["rev-parse", firstRef])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", otherTip, final]);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: two.reference })).content).toContain("Local beta.");
    const reconciled = success(await h.b.store.read({ reference: one.reference }));
    expect(reconciled.content).toContain("Other machine.");
    expect(reconciled.conflicts).toHaveLength(1);
    expect(success(await h.b.store.read({ reference: reconciled.conflicts[0]! })).content).toContain("Local alpha.");
  });
  it("repeats its pull when a sibling fetch changes the shared lease beyond the captured local tip", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", reference: meta("alpha"), expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const first = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: first.reference, expected: first.version,
      placement: first.placement, content: `${first.content}\nLocal edit.\n`, provenance }));
    const ref = `refs/arc/work/${"uid" in first.reference.owner ? first.reference.owner.uid : ""}`;
    const siblingRoot = join(h.a.root, "sibling");
    await h.a.exec("git", ["worktree", "add", "--detach", siblingRoot, "HEAD"]);
    const siblingExec = makeGitExec(siblingRoot);
    const defaults = createDefaultStorePorts({ checkoutRoot: siblingRoot, exec: siblingExec });
    const listed = createManualStepBarrier(), fetched = createManualStepBarrier();
    let armed = true, held = false;
    const publisher = createRefStore({ ...h.a.ports, lock: async (name) => {
      const release = await h.a.ports.lock(name);
      if (name === ref) held = true;
      return async () => { if (name === ref) held = false; await release(); };
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
      await Promise.race([listed.reached, pushing.then(() => { throw new Error("Push ended before the locked tracking read"); })]);
      const before = success(await h.b.store.read({ reference: first.reference }));
      success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
        placement: before.placement, content: `${before.content}\nRemote edit.\n`, provenance }));
      await h.b.git(["push", h.remoteName, `${ref}:${ref}`]);
      const remoteTip = (await h.b.git(["rev-parse", ref])).stdout;
      pulling = sibling.pull();
      await Promise.race([fetched.reached, pulling.then(() => { throw new Error("Sibling pull ended before its fetch barrier"); })]);
      listed.release();
      const result = success(await pushing);
      expect(result.pulls.length).toBeGreaterThan(1);
      const final = (await h.remote("git", ["rev-parse", ref])).stdout;
      await h.a.git(["merge-base", "--is-ancestor", remoteTip, final]);
      fetched.release(); success(await pulling);
    } finally { listed.release(); fetched.release(); await Promise.allSettled([pushing, ...pulling ? [pulling] : []]); }
  });
  it("publishes nothing after the state designation switches while its listing is composed", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", reference: meta("alpha"), expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const ref = `refs/arc/work/${"uid" in made.reference.owner ? made.reference.owner.uid : ""}`;
    const listed = createManualStepBarrier();
    let held = false, armed = true;
    const publisher = createRefStore({ ...h.a.ports, lock: async (name) => {
      const release = await h.a.ports.lock(name);
      if (name === ref) held = true;
      return async () => { if (name === ref) held = false; await release(); };
    }, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (armed && held && args.includes("for-each-ref") && args.at(-1) === "refs/arc/") {
        armed = false; await listed.arrive();
      }
      return result;
    } });
    const pushing = publisher.push();
    try {
      await Promise.race([listed.reached, pushing.then(() => { throw new Error("Push ended before the captured listing"); })]);
      await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "off"]);
      listed.release();
      expect(success(await pushing).states).toContainEqual({ status: "no-remote" });
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    } finally { listed.release(); await Promise.allSettled([pushing]); }
  });
  it("does not recreate a remotely deleted work ref until another pull reconciles the prune", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", reference: meta("alpha"), expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    success(await h.a.store.push());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      placement: before.placement, content: `${before.content}\nPending.\n`, provenance }));
    const ref = `refs/arc/work/${"uid" in made.reference.owner ? made.reference.owner.uid : ""}`;
    let armed = true, refusedBeforeRecreation = false;
    const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
      armed = false;
      await h.remote("git", ["update-ref", "-d", ref]);
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        refusedBeforeRecreation = (await h.remote("git", ["for-each-ref", "--format=%(refname)", ref])).stdout === "";
        throw error;
      }
    } });
    const result = success(await publisher.push());
    expect(refusedBeforeRecreation).toBe(true);
    expect(result.pulls.length).toBeGreaterThan(1);
    expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe((await h.a.git(["rev-parse", ref])).stdout);
  });
});

it("publishes an upstream through its rewritten push URL from the separate store", async () => {
  const h = await refSyncFixture("separate");
  await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await h.a.exec("git", ["remote", "add", "upstream", "arc-ref-test:state"]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  await h.a.exec("git", ["config", `url.${h.origin}.insteadOf`, "arc-ref-test:state"]);
  await h.a.exec("git", ["config", `url.${h.b.root}.pushInsteadOf`, "arc-ref-test:state"]);
  const made = success(await h.a.store.write({ action: "put", reference: meta("alpha"), expected: null,
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const ref = `refs/arc/work/${"uid" in made.reference.owner ? made.reference.owner.uid : ""}`;
  success(await h.a.store.push());
  expect((await h.b.exec("git", ["rev-parse", ref])).stdout).toBe((await h.a.git(["rev-parse", ref])).stdout);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});

/** Accepted publication belongs to its actual receiver across later source and layout changes. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, type RefStorePorts } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };
const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "source-binding.md", owner: { type: "person", name: "andrew" } });
type Layout = "default" | "separate";
type Side = { git: (args: string[]) => Promise<{ stdout: string }> };
const tip = async (side: Side, ref: string) => (await side.git(["for-each-ref", "--format=%(objectname)", ref])).stdout.trim();

async function pendingPersonal(layout: Layout) {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "common\n", provenance }));
  success(await h.a.store.push());
  const ref = "refs/arc/user/andrew/personal", tracking = `refs/arc-remotes/${h.remoteName}/user/andrew/personal`;
  const before = await tip(h.a, ref), current = success(await h.a.store.read({ reference: personal }));
  success(await h.a.store.write({ action: "put", reference: personal, expected: current.version, content: "accepted at old receiver\n", provenance }));
  return { ...h, ref, tracking, before, accepted: await tip(h.a, ref) };
}

/** The remote Git command really completes before this sibling runs; its result is merely delayed. */
function afterAccepted(ports: RefStorePorts, sibling: () => Promise<void>) {
  let armed = true;
  return createRefStore({ ...ports, exec: async (command, args, options) => {
    const result = await ports.exec(command, args, options);
    if (armed && args.includes("push")) { armed = false; await sibling(); }
    return result;
  } });
}

it("publishes to a relative URL matching a code remote's name from the separate store", async () => {
  const h = await refSyncFixture("separate"), receiver = join(h.a.root, "upstream");
  await h.a.exec("git", ["init", "--bare", receiver]);
  await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await h.a.exec("git", ["remote", "add", "upstream", "upstream"]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  expect((await h.a.exec("git", ["remote", "get-url", "upstream"])).stdout.trim()).toBe("upstream");
  expect((await h.a.git(["remote"])).stdout.trim().split(/\r?\n/u)).not.toContain("upstream");
  success(await h.a.store.write({ action: "put", reference: personal, expected: null,
    content: "Relative upstream publication.\n", provenance }));
  const ref = "refs/arc/user/andrew/personal", accepted = await tip(h.a, ref);
  // Git itself admits this literal relative operand in the actual physical repository before the public push.
  expect((await h.a.git(["push", "--dry-run", "--porcelain", "--", "upstream", `${ref}:${ref}`])).stdout).toContain(`${ref}:${ref}`);
  const result = success(await h.a.store.push());
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
  expect((await h.a.exec("git", [`--git-dir=${receiver}`, "rev-parse", ref])).stdout.trim()).toBe(accepted);
  expect(await tip(h.a, "refs/arc-remotes/upstream/user/andrew/personal")).toBe(accepted);
  expect(success(await h.a.store.push()).publishes.every(row => row.status === "noop")).toBe(true);
}, 60_000);

it.each(["update", "delete"] as const)("preserves a normal backing replacement's common head after an old accepted %s", async operation => {
  const h = await refSyncFixture("separate"), replacement = await refSyncFixture();
  const made = success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name: "accepted-source" },
  }), expected: null, content: makeMetaFixture("accepted-source"), placement: { kind: "active" }, provenance }));
  if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Missing live work UID");
  const ref = `refs/arc/work/${made.reference.owner.uid}`, tracking = ref.replace("refs/arc/", "refs/arc-remotes/backing/");
  const seen = ref.replace("refs/arc/", "refs/arc/tmp/seen/backing/");
  success(await h.a.store.push()); success(await h.b.store.pull());
  const common = await tip(h.a, ref);
  await h.a.git(["push", "--", replacement.origin, `${ref}:${ref}`]);
  const peer = success(await h.b.store.read({ reference: made.reference }));
  success(await h.b.store.write({ action: "put", reference: peer.reference, expected: peer.version,
    content: `${peer.content}\nValid sibling on N.\n`, placement: peer.placement, provenance }));
  const returned = await tip(h.b, ref), local = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: local.reference, expected: local.version,
    content: `${local.content}\nAccepted only at O.\n`, placement: operation === "delete"
      ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : local.placement, provenance }));
  const accepted = await tip(h.a, ref);
  const readerPorts = { ...h.a.ports, backingRepository: async () => replacement.origin };
  const reader = createRefStore(readerPorts);
  let changed = false;
  const publisher = afterAccepted(h.a.ports, async () => {
    changed = true;
    expect((await h.remote("git", ["for-each-ref", "--format=%(objectname)", ref])).stdout.trim()).toBe(accepted);
    const setting = (await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root, ports: readerPorts })).result;
    expect(setting.status, JSON.stringify(setting)).toBe("ok");
    expect((await h.a.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(replacement.origin);
    success(await reader.pull());
    expect(await tip(h.a, tracking)).toBe(common);
  });
  const result = success(await publisher.push());
  expect(changed).toBe(true);
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(objectname)", ref])).stdout.trim()).toBe(accepted);
  expect((await replacement.remote("git", ["rev-parse", ref])).stdout.trim()).toBe(common);
  expect.soft(await tip(h.a, tracking)).toBe(common);
  if (operation === "update") expect.soft(await tip(h.a, seen)).not.toBe(accepted);
  await replacement.remote("git", ["update-ref", "-d", ref, common]);
  success(await reader.pull());
  expect.soft(await tip(h.a, seen)).toBe(common);
  await h.b.git(["push", "--", replacement.origin, `${ref}:${ref}`]);
  const resumed = success(await reader.pull());
  expect.soft(resumed.pulls.flatMap(row => row.notices)).not.toContainEqual(expect.objectContaining({ kind: "history-diverged", ref }));
  expect.soft(await tip(h.a, tracking)).toBe(returned);
  expect.soft(await tip(h.a, seen)).toBe("");
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout => (["read", "off"] as const).map(role => ({ layout, role }))))(
  "acknowledges accepted refs after a stable external role-only change to $role ($layout)", async ({ layout, role }) => {
    const h = await pendingPersonal(layout);
    const result = success(await afterAccepted(h.a.ports, async () => {
      // Direct configuration deliberately keeps the same physical repository and transport identity.
      await h.a.git(["config", `remote.${h.remoteName}.arc-state`, role]);
    }).push());
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    expect(await tip(h.a, h.tracking)).toBe(h.accepted);
    expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
  }, 60_000);

it.each(["fetch", "push"] as const)("leaves comparison evidence unchanged after stable effective %s endpoint replacement", async direction => {
  const h = await pendingPersonal("separate"), replacement = await refSyncFixture();
  const alias = "arc-binding-source:";
  await h.a.git(["remote", "set-url", "backing", alias]);
  await h.a.git(["config", `url.${h.origin}.insteadOf`, alias]);
  await h.a.git(["config", "remote.backing.pushurl", h.origin]);
  const result = success(await afterAccepted(h.a.ports, async () => {
    expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
    if (direction === "fetch") {
      await h.a.git(["config", "--unset-all", `url.${h.origin}.insteadOf`]);
      await h.a.git(["config", `url.${replacement.origin}.insteadOf`, alias]);
      expect((await h.a.git(["remote", "get-url", "--push", "backing"])).stdout.trim()).toBe(h.origin);
    } else await h.a.git(["config", "remote.backing.pushurl", replacement.origin]);
    expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(alias);
  }).push());
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect(await tip(h.a, h.tracking)).toBe(h.before);
  expect((await replacement.remote("git", ["for-each-ref", "--format=%(refname)", h.ref])).stdout).toBe("");
}, 60_000);

it("does not recreate comparison refs in the old physical store after an admitted layout move", async () => {
  const h = await pendingPersonal("default");
  const result = success(await afterAccepted(h.a.ports, async () => {
    const setting = (await invokeStoreRemote(["origin", "read", "--json"], { cwd: h.a.root, ports: h.a.ports })).result;
    expect(setting.status, JSON.stringify(setting)).toBe("ok");
    if (setting.status === "ok") expect(setting.result.layout).toBe("separate");
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", h.tracking])).stdout).toBe("");
  }).push());
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", h.tracking])).stdout).toBe("");
  expect(await tip(h.a, h.tracking)).toBe(h.before);
}, 60_000);

it.each(["layout", "refs/arc/tmp/seen/backing"] as const)("names genuinely accepted refs when the new acknowledgment %s lease times out", async lock => {
  const h = await pendingPersonal("separate");
  let accepted = false, release: (() => Promise<void>) | undefined;
  const acknowledgmentLocks: string[] = [];
  const ports: RefStorePorts = { ...h.a.ports,
    lock: (name, wait) => {
      if (accepted) acknowledgmentLocks.push(name);
      return h.a.ports.lock(name, accepted && name === lock ? 1 : wait);
    },
  };
  try {
    const result = await afterAccepted(ports, async () => {
      accepted = true; release = await h.a.ports.lock(lock);
      expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
    }).push();
    expect(accepted).toBe(true);
    expect(result, `Post-acceptance locks: ${JSON.stringify(acknowledgmentLocks)}`).toMatchObject({
      status: "refused", refusal: { code: lock === "layout" ? "lock-held" : "unreachable",
        ...lock === "layout" ? {} : { cause: "timeout" }, condition: expect.stringContaining(h.ref) },
    });
    if (result.status === "refused") {
      expect(result.refusal.condition).toMatch(/accepted/iu);
      expect(result.refusal.condition).not.toMatch(/unpublished|remain local/iu);
      expect(result.refusal.remedy.text).toMatch(/retry/iu);
    }
    expect(await tip(h.a, h.tracking)).toBe(h.before);
    expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
  } finally { await release?.(); }
  const retry = success(await h.a.store.push());
  expect(retry.publishes.every(row => row.status !== "failed")).toBe(true);
  expect(await tip(h.a, h.tracking)).toBe(h.accepted);
  expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
}, 60_000);

it.each(["read", "off"] as const)("honors an admitted backing %s setting while publication capture waits for layout", async role => {
  const h = await pendingPersonal("separate");
  const siblingPorts = { ...h.a.ports, backingRepository: async () => h.origin };
  const physical = (await h.a.git(["rev-parse", "--absolute-git-dir"])).stdout.trim();
  let paused = false;
  const publisher = createRefStore({ ...h.a.ports, lock: async (name, wait) => {
    // The incoming S is already an ancestor of pending T, so reconciliation needs no layout write.
    // Pause the next layout acquisition before taking it, allowing the ordinary sibling setting to win.
    if (name === "layout" && !paused) {
      paused = true;
      const setting = (await invokeStoreRemote(["backing", role, "--json"], { cwd: h.a.root, ports: siblingPorts })).result;
      expect(setting.status, JSON.stringify(setting)).toBe("ok");
      expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe(role);
      expect((await h.a.git(["rev-parse", "--absolute-git-dir"])).stdout.trim()).toBe(physical);
      expect((await h.a.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
    }
    return h.a.ports.lock(name, wait);
  } });
  const stopped = success(await publisher.push());
  expect(paused).toBe(true);
  expect(stopped.publishes).toEqual([]);
  expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.before);
  expect(await tip(h.a, h.ref)).toBe(h.accepted);
  expect(success(await h.a.store.read({ reference: personal })).content).toBe("accepted at old receiver\n");
  const restored = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.a.root, ports: siblingPorts })).result;
  expect(restored.status, JSON.stringify(restored)).toBe("ok");
  success(await h.a.store.push());
  expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(h.accepted);
}, 60_000);

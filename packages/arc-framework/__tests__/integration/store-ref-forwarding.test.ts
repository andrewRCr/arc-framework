/** Forwarding control records stop state restoration while preserving local writes. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, PullResultSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

const forwardingRef = "refs/arc/project/moved";
const projectId = "34567890-1234-4234-8234-123456789abc";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "pending.md", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "edit", lifecycleAction: "save" };

it.each(["default", "separate"] as const)("reports a moved remote and preserves unpublished state in the %s layout", async layout => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Pending local state.\n", provenance }));
  const forwarding = await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  const pulled = PullResultSchema.parse(success(await h.a.store.pull()));
  expect(pulled.states).toContainEqual({ status: "moved", remote: h.remoteName, remedy: expect.objectContaining({ text: expect.stringContaining("arc store migrate") }) });
  expect(JSON.stringify(pulled.states)).toMatch(/pointer|code/u);
  expect((await h.a.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/project/moved`])).stdout.trim()).toBe(forwarding.tip);
  const pushed = PushResultSchema.parse(success(await h.a.store.push()));
  expect(pushed.states).toContainEqual(expect.objectContaining({ status: "moved", remote: h.remoteName }));
  expect(pushed.publishes).toEqual([]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n")).toEqual([forwardingRef]);
  expect(success(await h.a.store.read({ reference })).content).toBe("Pending local state.\n");
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", forwardingRef])).stdout).toBe("");
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  const repaired = PushResultSchema.parse(success(await h.a.store.push()));
  expect(repaired.states.some(state => state.status === "moved")).toBe(false);
  expect(repaired.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Pending local state.\n");
}, 30_000);

it.each(["default", "separate"] as const)("adopts a replaced forwarding tip and prunes it without a seen keeper in the %s layout", async layout => {
  const h = await refSyncFixture(layout), reports: string[] = [];
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    try {
      const result = await h.a.ports.exec(command, args, options);
      if (args.includes("fetch")) reports.push(result.stdout);
      return result;
    } catch (error) {
      if (args.includes("fetch") && isGitProcessError(error)) reports.push(error.stdout);
      throw error;
    }
  } });
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  success(await store.pull());
  const next = await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "b".repeat(40) }) }], { gitDir: h.origin });
  const replaced = PullResultSchema.parse(success(await store.pull()));
  expect(reports.join("\n")).toMatch(new RegExp(`^! [0-9a-f]+ [0-9a-f]+ refs/arc-remotes/${h.remoteName}/project/moved$`, "mu"));
  expect((await h.a.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/project/moved`])).stdout.trim()).toBe(next.tip);
  expect(replaced.states).toContainEqual(expect.objectContaining({ status: "moved" }));
  expect(replaced.pulls.flatMap(pull => pull.notices)).toEqual([]);
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  const pruned = PullResultSchema.parse(success(await store.pull()));
  expect(pruned.states.some(state => state.status === "moved")).toBe(false);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.remoteName}/project/moved`, `refs/arc/tmp/seen/${h.remoteName}/project/moved`])).stdout).toBe("");
}, 30_000);

it.each(["default", "separate"] as const)("keeps the follow remedy when the moved remote becomes unreachable in the %s layout", async layout => {
  const h = await refSyncFixture(layout);
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  expect(success(await h.a.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  await h.a.git(["remote", "set-url", h.remoteName, `${h.origin}/unavailable.git`]);
  const failed = PullResultSchema.parse(success(await h.a.store.pull()));
  expect(failed.pulls).toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable",
    remedy: expect.objectContaining({ text: expect.stringContaining("arc store migrate") }) }) }));
  await h.a.git(["remote", "set-url", h.remoteName, h.origin]);
  expect(success(await h.a.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
}, 30_000);

it("refuses a read source that carries a forwarding record without adopting its identity", async () => {
  const h = await refSyncFixture();
  await h.a.git(["config", "remote.origin.arc-state", "off"]);
  await h.a.git(["remote", "add", "upstream", h.origin]);
  await h.a.git(["config", "remote.upstream.arc-state", "read"]);
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  const before = success(await h.a.store.version());
  const result = PullResultSchema.parse(success(await h.a.store.pull()));
  expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "upstream", role: "read", status: "failed", failure: expect.objectContaining({
    code: "refused", class: "terminal", remedy: expect.objectContaining({ text: expect.stringContaining("arc store migrate") }),
  }) }));
  const failed = result.pulls.find(pull => pull.remote === "upstream");
  if (failed?.status !== "failed") throw new Error("Expected the read source's pull to fail");
  for (const route of ["arc store remote upstream off", "git remote add upstream-state", "arc store remote upstream-state read"]) {
    expect(failed.failure.remedy.text).toContain(route);
  }
  expect(success(await h.a.store.version())).toBe(before);
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  expect(success(await h.a.store.pull()).pulls.some(pull => pull.status === "failed")).toBe(false);
}, 30_000);

it.each(["default", "separate"] as const)("keeps state local while forwarding content is malformed and publishes after repair in the %s layout", async layout => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Pending local state.\n", provenance }));
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: "invalid JSON" }], { gitDir: h.origin });
  const result = PushResultSchema.parse(success(await h.a.store.push()));
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "refused", class: "terminal",
    condition: expect.stringContaining(forwardingRef), remedy: expect.objectContaining({ text: expect.stringMatching(/repair or delete/iu) }) }) }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe(forwardingRef);
  expect(success(await h.a.store.read({ reference })).content).toBe("Pending local state.\n");
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Pending local state.\n");
}, 30_000);

it("retains independent tracking notices when a forwarding record stops state application", async () => {
  const h = await refSyncFixture(), state = "refs/arc/user/andrew/personal";
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Shared state.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const rows = (await h.b.git(["ls-tree", "-r", "--format=%(objectname) %(path)", state])).stdout.split("\n").filter(Boolean);
  await plantRef(h.b.root, state, rows.map(row => {
    const at = row.indexOf(" "); return { oid: row.slice(0, at), path: row.slice(at + 1), mode: "100644" as const };
  }));
  await h.b.git(["push", "--force", "origin", `${state}:${state}`]);
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  const result = PullResultSchema.parse(success(await h.a.store.pull()));
  expect(result.states).toContainEqual(expect.objectContaining({ status: "moved" }));
  expect(result.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref: state }));
  expect(success(await h.a.store.read({ reference })).content).toBe("Shared state.\n");
}, 30_000);

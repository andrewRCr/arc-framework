/** Native post-fetch configuration faults preserve observed work and permit configuration repair. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, PullResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isCompletedGitFailure } from "../../src/lib/git/process-error.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { identity, personal, projectId, provenance, switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

import { completenessFault, type Fault } from "../helpers/store/completeness-configuration.js";

type Layout = "default" | "separate";

const layouts = ["default", "separate"] as const;
const controls = layouts.flatMap(layout => (["canceled", "signaled", "untyped"] as const).map(kind => ({ layout, kind })));


async function rewritten(layout: Layout) {
  const h = await refSyncFixture(layout), ref = "refs/arc/user/andrew/personal";
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "First.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const first = (await h.remote("git", ["rev-parse", ref])).stdout.trim(), current = success(await h.a.store.read({ reference: personal }));
  success(await h.a.store.write({ action: "put", reference: personal, expected: current.version, content: "Second.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const second = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  await h.remote("git", ["update-ref", ref, first, second]);
  const pending = RecordReferenceSchema.parse({ ...personal, key: "retained-local.md" });
  success(await h.b.store.write({ action: "put", reference: pending, expected: null, content: "Retained local state.\n", provenance }));
  await h.b.exec("git", ["remote", "add", "aaa", join(h.b.root, "unavailable.git")]);
  await h.b.exec("git", ["config", "remote.aaa.arc-state", "read"]);
  return { ...h, ref, second, pending };
}

it.each(layouts)("retains earlier outcomes and a native rewrite notice after %s completeness configuration failure", async layout => {
  const h = await rewritten(layout), broken = completenessFault(h.b.ports, `refs/arc-remotes/${h.remoteName}/`);
  const store = createRefStore(broken.ports), observed: unknown = await store.pull().catch(error => error);
  expect(broken.evidence()).toMatchObject({ fetched: true, injected: true, restored: true });
  expect(isCompletedGitFailure(broken.evidence().failure)).toBe(true);
  expect(observed).toMatchObject({ status: "ok" });
  if (typeof observed !== "object" || observed === null || !("result" in observed)) throw new Error("Pull returned no result");
  const result = PullResultSchema.parse(observed.result);
  expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "aaa", status: "failed" }));
  expect(result.pulls).toContainEqual(expect.objectContaining({ remote: h.remoteName, status: "failed",
    failure: expect.objectContaining({ code: "refused", remedy: expect.objectContaining({ text: expect.stringContaining("Repair") }) }),
    notices: expect.arrayContaining([expect.objectContaining({ kind: "history-diverged", ref: h.ref })]) }));
  expect(success(await store.read({ reference: personal })).content).toBe("Second.\n");
  expect(success(await store.read({ reference: h.pending })).content).toBe("Retained local state.\n");
  const retried = success(await store.pull());
  expect(retried.pulls.find(row => row.remote === h.remoteName)?.status).not.toBe("failed");
  expect(retried.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref: h.ref }));
  await h.remote("git", ["update-ref", h.ref, h.second]);
  const repaired = success(await store.pull());
  expect(repaired.pulls.find(row => row.remote === h.remoteName)?.notices).toEqual([]);
  expect(success(await store.read({ reference: h.pending })).content).toBe("Retained local state.\n");
}, 60_000);

it.each(controls)("propagates $layout $kind completeness failure without losing local state and retries", async ({ layout, kind }) => {
  const h = await rewritten(layout), broken = completenessFault(h.b.ports, `refs/arc-remotes/${h.remoteName}/`, kind);
  const store = createRefStore(broken.ports), observed: unknown = await store.pull().catch(error => error);
  expect(broken.evidence().injected).toBe(true);
  expect(observed).toBe(broken.evidence().failure);
  expect(success(await store.read({ reference: h.pending })).content).toBe("Retained local state.\n");
  expect(success(await store.pull()).pulls.find(row => row.remote === h.remoteName)?.status).not.toBe("failed");
}, 60_000);

async function candidate(layout: Layout, kind: Fault = "native") {
  const h = await refSyncFixture(layout), content = JSON.stringify({ projectId });
  for (const side of [h.a, h.b]) success(await side.store.write({ action: "put", reference: identity, expected: null, content, provenance }));
  success(await h.a.store.push());
  const candidateName = h.remoteName, role = "push";
  await h.b.git(["config", "--unset", `remote.${candidateName}.arc-state`]);
  if (layout === "separate") await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const before = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
  const ports = { ...h.b.ports, backingRepository: async () => layout === "separate" ? h.origin : null };
  const broken = completenessFault(ports, `:refs/arc/tmp/designate/${candidateName}/`, kind);
  return { ...h, before, broken, candidateName, role };
}

it.each([
  { layout: "default", entry: "automatic" }, { layout: "default", entry: "setting" },
  { layout: "separate", entry: "setting" },
] as const)(
  "retains $layout $entry designation after native completeness configuration failure and retries", async ({ layout, entry }) => {
    const h = await candidate(layout);
    const invoke = async () => entry === "automatic" ? createRefStore(h.broken.ports).pull()
      : (await invokeStoreRemote([h.candidateName, h.role, "--json"], { cwd: h.b.root, ports: h.broken.ports })).result;
    const observed: unknown = await invoke().catch(error => error);
    expect(h.broken.evidence()).toMatchObject({ fetched: true, injected: true, restored: true });
    expect(isCompletedGitFailure(h.broken.evidence().failure)).toBe(true);
    const failure = { code: "refused", remedy: { text: expect.stringContaining("Repair") } };
    expect(observed).toMatchObject(entry === "automatic" ? { status: "ok", result: { pulls: [
      { remote: h.candidateName, role: "candidate", status: "failed", failure },
    ] } } : { status: "refused", refusal: { code: "store", refusal: failure } });
    expect((await h.b.git(["config", "--list"])).stdout).not.toContain(`remote.${h.candidateName}.arc-state`);
    expect((await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout).toBe(h.before);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
    expect((await invoke()).status).toBe("ok");
    expect((await h.b.git(["config", `remote.${h.candidateName}.arc-state`])).stdout.trim()).toBe(h.role);
    expect(success(await h.b.store.read({ reference: identity })).content).toContain(projectId);
  }, 60_000);

it.each(controls)("propagates $layout $kind designation completeness failure and retries", async ({ layout, kind }) => {
  const h = await candidate(layout, kind);
  const invoke = async () => (await invokeStoreRemote([h.candidateName, h.role, "--json"], { cwd: h.b.root, ports: h.broken.ports })).result;
  const observed: unknown = await invoke().catch(error => error);
  expect(h.broken.evidence().injected).toBe(true);
  expect(observed).toBe(h.broken.evidence().failure);
  expect((await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout).toBe(h.before);
  expect((await invoke()).status).toBe("ok");
}, 60_000);

it.each(layouts)("retains %s migration state after native completeness configuration failure and retries", async layout => {
  const h = await switchFixture(layout === "default" ? "code" : "backing", layout === "default" ? "backing" : "code");
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const broken = completenessFault(h.ports, ":refs/arc/tmp/migrate/remote/");
  const observed: unknown = await invokeStoreMigrate(["--to", h.to], broken.ports).catch(error => error);
  expect(broken.evidence()).toMatchObject({ fetched: true, injected: true, restored: true });
  expect(isCompletedGitFailure(broken.evidence().failure)).toBe(true);
  expect(observed).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect((await invokeStoreMigrate(["--to", h.to], broken.ports)).status).toBe("ok");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect(success(await h.store.read({ reference: personal })).content).toBe("Shared state.\n");
}, 60_000);

it.each(controls)("propagates $layout $kind migration completeness failure and retries", async ({ layout, kind }) => {
  const h = await switchFixture(layout === "default" ? "code" : "backing", layout === "default" ? "backing" : "code");
  const broken = completenessFault(h.ports, ":refs/arc/tmp/migrate/remote/", kind);
  const observed: unknown = await invokeStoreMigrate(["--to", h.to], broken.ports).catch(error => error);
  expect(broken.evidence().injected).toBe(true);
  expect(observed).toBe(broken.evidence().failure);
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect((await invokeStoreMigrate(["--to", h.to], broken.ports)).status).toBe("ok");
}, 60_000);

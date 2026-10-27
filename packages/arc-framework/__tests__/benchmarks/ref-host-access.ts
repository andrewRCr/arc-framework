/** Real-host access, protected-branch, and provider-fork checks for the manual kit. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { createRefStore, RecordReference } from "../../src/lib/store/index.js";
import { hostRemote, hostTransport, type HostCredentials, type HostGit } from "./ref-host-transport.js";
import { randomUUID } from "node:crypto";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { bootstrapHostRegistry, hostAtomicUnsupported } from "./ref-host-bootstrap.js";

const exec = promisify(execFile);
type Store = ReturnType<typeof createRefStore>;
export interface HostSettings {
  owner?: HostCredentials;
  member?: HostCredentials;
  roleControl?: string[];
  forkControl?: string[];
  policy?: { remote: string; owner?: HostCredentials };
  forkState?: "none" | "copied";
}
export type HostProbe = { status: "passed" | "unverified"; detail: unknown };

/** Run operator-supplied provider setup without a shell; its JSON receipt is retained with native observations. */
async function control(command: readonly string[], action: string): Promise<Record<string, unknown>> {
  const executable = command[0];
  assert(executable, "A provider control needs an executable");
  const result = await exec(executable, [...command.slice(1), action], { timeout: 180_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function success<T>(value: { status: "ok"; result: T } | { status: "refused"; refusal: unknown }): T {
  assert.equal(value.status, "ok", JSON.stringify(value));
  if (value.status !== "ok") throw new Error("Operation refused");
  return value.result;
}

/** Verify distinct ordinary credentials, restoring writer access even when the read-only check fails. */
export async function probeHostRoles(input: {
  root: string; remote: string; evidence: string; settings: HostSettings; ownerGit: HostGit;
  reference: RecordReference; personalRef: string; ownerStore: Store; owned: Map<string, string>;
}): Promise<Record<string, HostProbe>> {
  const { root, remote, evidence, settings, ownerGit, reference, personalRef, ownerStore, owned } = input;
  if (!settings.member || !settings.roleControl) return {
    ordinaryWriter: { status: "unverified", detail: "Supply distinct member credentials and a provider role control" },
    readOnly: { status: "unverified", detail: "Supply distinct member credentials and a provider role control" },
  };
  const member = hostTransport(remote, evidence, settings.member);
  const path = join(root, "ordinary-member");
  const receipts: Record<string, unknown>[] = [];
  try {
    receipts.push(await control(settings.roleControl, "writer"));
    await member.git("member-clone", root, ["clone", "--no-checkout", "--", remote, path]);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Host probe"], ["user.email", "host-probe@example.invalid"], ["remote.origin.arc-state", "push"]]) {
      await member.git(`member-config-${key}`, path, ["config", "--local", key!, value!]);
    }
    const store = member.store(path);
    success(await store.pull());
    const first = success(await store.read({ reference }));
    const writerContent = `Ordinary writer ${Date.now()}.\r\n`;
    success(await store.write({ action: "put", reference, expected: first.version, content: writerContent,
      provenance: { verb: "edit", lifecycleAction: "save" } }));
    const published = success(await store.push());
    assert(published.publishes.some(row => row.status === "pushed"), JSON.stringify(published));
    const writerTip = (await member.git("member-published-tip", path, ["rev-parse", personalRef])).trim();
    owned.set(personalRef, writerTip);
    success(await ownerStore.pull());
    assert.equal(success(await ownerStore.read({ reference })).content, writerContent);

    receipts.push(await control(settings.roleControl, "reader"));
    const pulled = success(await store.pull());
    assert(pulled.pulls.every(row => row.status !== "failed"), JSON.stringify(pulled));
    const read = success(await store.read({ reference }));
    assert.equal(read.content, writerContent);
    const content = "Read-only identity's unpublished local edit.\r\n";
    success(await store.write({ action: "put", reference, expected: read.version, content,
      provenance: { verb: "edit", lifecycleAction: "save" } }));
    const refused = success(await store.push());
    assert(refused.publishes.some(row => row.status === "failed"), JSON.stringify(refused));
    const remoteTip = (await ownerGit("reader-remote-tip", root, ["ls-remote", "--refs", "--", remote, personalRef])).trim().split(/\s+/u)[0];
    assert.equal(remoteTip, writerTip);
    assert.equal(success(await store.read({ reference })).content, content);

    receipts.push(await control(settings.roleControl, "writer"));
    const repaired = success(await store.push());
    assert(repaired.publishes.some(row => row.status === "pushed"), JSON.stringify(repaired));
    owned.set(personalRef, (await member.git("member-repaired-tip", path, ["rev-parse", personalRef])).trim());
    success(await ownerStore.pull());
    assert.equal(success(await ownerStore.read({ reference })).content, content);
    return { ordinaryWriter: { status: "passed", detail: { receipts, published } },
      readOnly: { status: "passed", detail: { pulled, refused, repaired, remoteTip } } };
  } finally { await control(settings.roleControl, "writer"); }
}

/** Observe the provider's copy, rather than mistaking ordinary clone isolation for fork behavior. */
export async function probeHostFork(input: { root: string; remote: string; settings: HostSettings; git: HostGit; personalRef: string }): Promise<HostProbe> {
  if (!input.settings.forkControl) return { status: "unverified", detail: "Supply a provider fork control" };
  const source = (await input.git("fork-source-state", input.root, ["ls-remote", "--refs", "--", input.remote, input.personalRef])).trim();
  assert(source, "The source must contain published native state before the provider creates its fork");
  const receipt = await control(input.settings.forkControl, "fork");
  assert.equal(receipt.parent, input.remote, "Provider receipt must identify the exact source");
  assert(typeof receipt.remote === "string" && receipt.id, "Provider receipt must identify its fork");
  const fork = hostRemote(receipt.remote, new URL(input.remote).hostname);
  assert.notEqual(fork.href, input.remote);
  const main = (await input.git("fork-source-code", input.root, ["ls-remote", "--refs", "--", input.remote, "refs/heads/main"])).trim().split(/\s+/u)[0];
  const copied = (await input.git("fork-code", input.root, ["ls-remote", "--refs", "--", fork.href, "refs/heads/main"])).trim().split(/\s+/u)[0];
  assert(main && copied === main, "The provider fork must have completed and copied the source code branch");
  const state = (await input.git("fork-state", input.root, ["ls-remote", "--refs", "--", fork.href, "refs/arc/*"])).trim();
  if (input.settings.forkState === "copied") {
    const sourceState = (await input.git("fork-source-all-state", input.root, ["ls-remote", "--refs", "--", input.remote, "refs/arc/*"]))
      .trim().split("\n").sort();
    assert.deepEqual(state.split("\n").sort(), sourceState, "The documented full-fork behavior must copy the exact source state tips");
  } else assert.equal(state, "", "A provider-created fork must not copy ARC state refs");
  return { status: "passed", detail: { receipt, copiedCode: main, sourceStatePresent: true, forkStateRefs: state ? state.split("\n") : [] } };
}

/** Hold protected code back atomically, then prove the public backend can still publish state. */
export async function probeHostPolicy(input: { root: string; remote: string; evidence: string; settings: HostSettings;
  owned: Map<string, string>; atomic: boolean }, createTransport: typeof hostTransport = hostTransport): Promise<HostProbe> {
  const remote = input.settings.policy?.remote ?? input.remote;
  const transport = createTransport(remote, input.evidence, input.settings.policy?.owner ?? input.settings.owner);
  const { git } = transport, path = join(input.root, "policy");
  const separate = remote !== input.remote;
  const personal = "refs/arc/user/andrew/personal", registry = "refs/arc/project/registry";
  const owned = separate ? new Map<string, string>() : input.owned;
  const candidates = new Map([...owned].map(([ref, tip]) => [ref, new Set([tip])]));
  const remember = (ref: string, tip: string) => {
    const known = candidates.get(ref) ?? new Set<string>();
    known.add(tip);
    candidates.set(ref, known);
  };
  const tips = async () => new Map((await git("policy-remote-tips", path, ["ls-remote", "--refs", "--", remote])).trim()
    .split("\n").filter(Boolean).map(line => { const [oid = "", ref = ""] = line.split(/\s+/u); return [ref, oid]; }));
  await git("policy-clone", input.root, ["clone", "--no-checkout", "--", remote, path]);
  for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Host probe"], ["user.email", "host-probe@example.invalid"], ["remote.origin.arc-state", "push"]]) {
    await git(`policy-config-${key}`, path, ["config", "--local", key!, value!]);
  }
  const before = await tips();
  if (separate) assert(!before.has(personal) && !before.has(registry), "Separate policy fixture must have no existing native state");
  const store = transport.store(path);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/host-policy.md" });
  const provenance = { verb: "edit", lifecycleAction: "save" };
  const capture = async () => { for (const ref of [personal, registry]) {
    const tip = (await tips()).get(ref);
    if (tip && candidates.get(ref)?.has(tip)) owned.set(ref, tip);
  } };
  try {
    success(await store.pull());
    if (separate) success(await store.write({ action: "put", expected: null, provenance,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
      content: JSON.stringify({ projectId: randomUUID() }) }));
    success(await store.write({ action: "put", reference, expected: null, content: "Policy baseline.\n", provenance }));
    for (const ref of separate ? [personal, registry] : [personal]) {
      remember(ref, (await git("policy-prepared-candidate", path, ["rev-parse", ref])).trim());
    }
    const trial = await store.push();
    await capture();
    const atomic = separate ? !hostAtomicUnsupported(trial) : input.atomic;
    const multiRefBootstrap = separate && !atomic
      ? await bootstrapHostRegistry({ git, store, path, remote, owned, trial }) : undefined;
    const baseline = success(multiRefBootstrap ? await store.push() : trial);
    await capture();
    assert(baseline.publishes.some(row => row.status === "pushed"), JSON.stringify(baseline));
    const original = await tips(), parent = original.get("refs/heads/main");
    assert(parent, "Policy fixture needs a seeded main branch");
    const read = success(await store.read({ reference }));
    success(await store.write({ action: "put", reference, expected: read.version, content: "Pending under branch protection.\n", provenance }));
    const next = (await git("policy-local-state", path, ["rev-parse", personal])).trim();
    remember(personal, next);
    const tree = (await git("policy-code-tree", path, ["rev-parse", `${parent}^{tree}`])).trim();
    const code = (await git("policy-code-commit", path, ["commit-tree", tree, "-p", parent, "-m", "Synthetic protected-branch probe"])).trim();
    await git("policy-local-main", path, ["update-ref", "refs/heads/main", code, parent]);
    let rejection: unknown;
    try { await git("policy-atomic-rejection", path, ["push", "--porcelain", "--atomic", `--force-with-lease=${personal}:${original.get(personal)}`,
      `--force-with-lease=refs/heads/main:${parent}`, "--", remote, `${next}:${personal}`, `${code}:refs/heads/main`]); }
    catch (error) { rejection = error; }
    assert(rejection && typeof rejection === "object" && "stdout" in rejection && "stderr" in rejection, "Expected protected-branch rejection");
    if (atomic) assert.match(String(rejection.stdout), /^!\t/mu);
    else {
      assert.match(String(rejection.stderr), /does not support.*atomic/iu);
      let single: unknown;
      try { await git("policy-single-rejection", path, ["push", "--porcelain", `--force-with-lease=refs/heads/main:${parent}`,
        "--", remote, `${code}:refs/heads/main`]); } catch (error) { single = error; }
      assert(single && typeof single === "object" && "stdout" in single);
      assert.match(String(single.stdout), /^!\t/mu);
    }
    const unchanged = await tips();
    assert.equal(unchanged.get(personal), original.get(personal));
    assert.equal(unchanged.get("refs/heads/main"), parent);
    const carried = success(await store.push({ carry: { ref: "refs/heads/main", expect: parent as `${string}` } }));
    await capture();
    assert.equal(carried.carry?.status, "refused", JSON.stringify(carried));
    // Production may retry the state leg after attributing the carried branch's rejection.
    const stateOnly = success(await store.push());
    await capture();
    assert(stateOnly.publishes.every(row => row.status !== "failed"), JSON.stringify(stateOnly));
    const after = await tips();
    assert.equal(after.get("refs/heads/main"), parent);
    assert.equal(after.get(personal), next);
    await capture();
    return { status: "passed", detail: { remote, baseline, ...multiRefBootstrap ? { multiRefBootstrap } : {},
      atomicRejection: { stdout: String(rejection.stdout), stderr: String(rejection.stderr) },
      carried, stateOnly, protectedCodeUnchanged: true, statePublished: true } };
  } finally {
    if (separate) for (const [ref, tip] of owned) await git(`policy-cleanup-${ref.split("/").at(-1)}`, path,
      ["push", "--porcelain", `--force-with-lease=${ref}:${tip}`, "--", remote, `:${ref}`]);
  }
}

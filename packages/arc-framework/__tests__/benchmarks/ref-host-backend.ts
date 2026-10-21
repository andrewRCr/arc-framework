/** Manual backend and receiver probes for a designated disposable HTTPS repository. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

type Git = (label: string, cwd: string, args: string[], trace?: boolean) => Promise<string>;
type Probe = { status: "passed" | "unverified"; detail: unknown };
const personal = "refs/arc/user/andrew/personal", registry = "refs/arc/project/registry";
const moved = "refs/arc/project/moved", code = "refs/heads/arc-host-code";
const ownedRefs = [personal, registry, moved, code];
const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/host-probe.md" });
const provenance = { verb: "edit", lifecycleAction: "save" };

function success<T>(value: { status: "ok"; result: T } | { status: "refused"; refusal: unknown }): T {
  assert.equal(value.status, "ok", JSON.stringify(value));
  if (value.status !== "ok") throw new Error("Operation refused");
  return value.result;
}

/** Probe native public operations and exact receiver outcomes, cleaning only owned, leased refs. */
export async function probeBackend(input: { root: string; remote: string; evidence: string; host: string; git: Git }): Promise<Record<string, Probe>> {
  const { root, remote, evidence, host, git } = input;
  const results: Record<string, Probe> = {};
  const owned = new Map<string, string>();
  const a = join(root, "backend-a"), b = join(root, "backend-b");
  const tips = async () => new Map((await git("backend-remote-tips", root, ["ls-remote", "--refs", "--", remote]))
    .trim().split("\n").filter(Boolean).map(line => { const [tip = "", ref = ""] = line.split(/\s+/u); return [ref, tip]; }));
  const before = await tips();
  assert(ownedRefs.every(ref => !before.has(ref)), "Native probe refs must be absent before starting");
  const cli = host === "github.com" ? "gh" : host === "gitlab.com" ? "glab" : null;
  for (const [label, path] of [["a", a], ["b", b]] as const) {
    await git(`backend-clone-${label}`, root, ["clone", "--no-checkout", "--", remote, path]);
    assert.equal((await git(`default-clone-${label}`, path, ["for-each-ref", "--format=%(refname)", "refs/arc/"])).trim(), "");
    const config: readonly (readonly [string, string])[] = [["arc.identity", "andrew"], ["user.name", "Host probe"], ["user.email", "host-probe@example.invalid"],
      ["remote.origin.arc-state", "push"], ...cli ? [["credential.helper", ""], [`credential.https://${host}.helper`, `!${cli} auth git-credential`]] as const : []];
    for (const [key, value] of config) {
      await git(`config-${label}-${key.replaceAll(/[^a-z]/gu, "-")}`, path, ["config", "--local", key, value]);
    }
  }
  results.defaultClone = { status: "passed", detail: "Neither ordinary clone acquired refs/arc/*" };
  const stores = [a, b].map(checkoutRoot => createRefStore(createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null })));
  const first = stores[0]!, second = stores[1]!;
  const write = async (content: string) => {
    const read = await first.read({ reference });
    if (read.status === "refused") assert.equal(read.refusal.code, "not-found", JSON.stringify(read));
    success(await first.write({ action: "put", reference, expected: read.status === "ok" ? read.result.version : null, content, provenance }));
  };
  const publish = async () => {
    const pushed = success(await first.push());
    for (const ref of [personal, registry]) {
      const oid = (await git(`published-${ref.split("/").at(-1)}`, a, ["rev-parse", ref])).trim();
      owned.set(ref, oid);
    }
    assert(pushed.publishes.length > 0 && pushed.publishes.every(row => row.status !== "failed"), JSON.stringify(pushed));
    return pushed;
  };
  const expectFailure = async (label: string, path: string, args: string[]) => {
    try { await git(label, path, args); } catch (error) {
      assert(error && typeof error === "object" && "code" in error && typeof error.code === "number", "Expected receiver rejection, not a setup failure");
      const output = "stdout" in error ? String(error.stdout) : "";
      const diagnostic = "stderr" in error ? String(error.stderr) : "";
      return { output, diagnostic };
    }
    throw new Error(`${label} unexpectedly succeeded`);
  };
  try {
    const identityRef = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    success(await first.write({ action: "put", reference: identityRef, expected: null,
      content: JSON.stringify({ projectId: randomUUID() }), provenance }));
    await write("First host value.\r\n"); const pushed = await publish();
    success(await second.pull());
    assert.equal(success(await second.read({ reference })).content, "First host value.\r\n");
    const old = owned.get(personal)!;
    await write("Second host value.\r\n"); await publish();
    const current = owned.get(personal)!;
    results.backendRoundtrip = { status: "passed", detail: pushed };
    const candidate = (await git("code-candidate", a, ["rev-parse", "refs/remotes/origin/main"])).trim();
    const failed = await expectFailure("stale-atomic", a, ["push", "--porcelain", "--atomic",
      `--force-with-lease=${personal}:${old}`, `--force-with-lease=${code}:`, "--", remote, `${old}:${personal}`, `${candidate}:${code}`]);
    assert.match(failed.output, /^!\t/mu);
    assert.equal((await tips()).get(personal), current);
    assert.equal((await tips()).has(code), false);
    results.atomicCarryRefusal = { status: "passed", detail: failed };
    const single = await expectFailure("stale-single", a, ["push", "--porcelain", `--force-with-lease=${personal}:${old}`, "--", remote, `${old}:${personal}`]);
    assert.match(single.output, /^!\t/mu);
    assert.equal((await tips()).get(personal), current);
    results.singleLeaseRefusal = { status: "passed", detail: single };
    const deletion = await expectFailure("stale-delete", a, ["push", "--porcelain", `--force-with-lease=${personal}:${old}`, "--", remote, `:${personal}`]);
    assert.match(deletion.output, /^!\t/mu);
    assert.equal((await tips()).get(personal), current);
    results.staleDeleteRefusal = { status: "passed", detail: deletion };
    const replay = await expectFailure("history-replay", b, ["push", "--porcelain", "--", remote, `${personal}:${personal}`]);
    assert.match(replay.output, /^!\t/mu);
    results.historyReplayRefusal = { status: "passed", detail: replay };
    success(await second.pull());
    assert.equal(success(await second.read({ reference })).content, "Second host value.\r\n");

    const identity = JSON.parse((await git("registry-identity", a, ["show", `${registry}:identity.json`])).trim()) as { projectId: string };
    const control = JSON.stringify({ projectId: identity.projectId, registryCommit: owned.get(registry) });
    const controlFile = join(root, "moved.json"); await writeFile(controlFile, control);
    const blob = (await git("forwarding-blob", a, ["hash-object", "-w", "--no-filters", "--", controlFile])).trim();
    await git("forwarding-index", a, ["read-tree", "--empty"]);
    await git("forwarding-index-entry", a, ["update-index", "--add", "--cacheinfo", "100644", blob, "moved.json"]);
    const tree = (await git("forwarding-tree", a, ["write-tree"])).trim();
    const tip = (await git("forwarding-commit", a, ["commit-tree", tree, "-m", "Host forwarding probe"])).trim();
    await git("forwarding-push", a, ["push", "--porcelain", `--force-with-lease=${moved}:`, "--", remote, `${tip}:${moved}`]);
    owned.set(moved, tip);
    await write("Unpublished host value.\r\n");
    const held = success(await first.push());
    assert(held.states.some(state => state.status === "moved"), JSON.stringify(held));
    assert.equal((await tips()).get(personal), current);
    assert.equal(success(await first.read({ reference })).content, "Unpublished host value.\r\n");
    const pulled = success(await second.pull());
    assert(pulled.states.some(state => state.status === "moved"), JSON.stringify(pulled));
    await git("forwarding-delete", a, ["push", "--porcelain", `--force-with-lease=${moved}:${tip}`, "--", remote, `:${moved}`]);
    owned.delete(moved);
    await publish(); success(await second.pull());
    assert.equal(success(await second.read({ reference })).content, "Unpublished host value.\r\n");
    results.forwardingRecovery = { status: "passed", detail: { pushed: held, pulled } };

    for (const [name, detail] of Object.entries({ ordinaryWriter: "Requires a distinct ordinary writer login", readOnly: "Requires a distinct read-only login",
      rulesets: "Requires a provider-specific protected-branch setup", fork: "Requires a provider-created fork in another namespace" })) {
      results[name] = { status: "unverified", detail };
    }
    const receiver = join(root, "no-atomic.git");
    await git("no-atomic-init", root, ["init", "--bare", receiver]);
    await git("no-atomic-config", receiver, ["config", "receive.advertiseAtomic", "false"]);
    const unsupported = await expectFailure("no-atomic-refusal", a, ["push", "--porcelain", "--atomic", "--", receiver, `${personal}:${personal}`]);
    assert.match(unsupported.diagnostic, /does not support.*atomic/iu);
    assert.equal((await git("no-atomic-unchanged", receiver, ["for-each-ref", "--format=%(refname)"])).trim(), "");
    await git("no-atomic-single", a, ["push", "--porcelain", `--force-with-lease=${personal}:`, "--", receiver, `${personal}:${personal}`]);
    assert.equal((await git("no-atomic-single-tip", receiver, ["rev-parse", personal])).trim(), owned.get(personal));
    results.unsupportedAtomic = { status: "passed", detail: { scope: "Local Git receiver; the HTTPS host advertises atomic", ...unsupported } };
    return results;
  } finally {
    try {
      for (const [ref, tip] of owned) {
        await git(`cleanup-${ref.split("/").at(-1)}`, a, ["push", "--porcelain", `--force-with-lease=${ref}:${tip}`, "--", remote, `:${ref}`]);
      }
      const after = await tips();
      assert([...owned.keys()].every(ref => !after.has(ref)));
      results.leasedDeletes = { status: "passed", detail: [...owned.keys()] };
    } finally {
      await writeFile(join(evidence, "backend-results.json"), `${JSON.stringify(results, null, 2)}\n`);
    }
  }
}

/** Manual backend and receiver probes for a designated disposable HTTPS repository. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { hostPushFailure } from "./ref-host-evidence.js";
import { probeReceiverLeaseRaces } from "./ref-host-lease-races.js";
import { probeHostFork, probeHostPolicy, probeHostRoles, type HostSettings } from "./ref-host-access.js";
import { bootstrapHostRegistry } from "./ref-host-bootstrap.js";

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
export async function probeBackend(input: { root: string; remote: string; evidence: string; git: Git;
  store: (path: string) => ReturnType<typeof createRefStore>; settings: HostSettings; atomic: boolean }): Promise<Record<string, Probe>> {
  const { root, remote, evidence, git, settings } = input;
  const results: Record<string, Probe> = Object.fromEntries([
    "defaultClone", "backendRoundtrip", "atomicCarryRefusal", "singleLeaseRefusal", "staleDeleteRefusal", "historyReplayRefusal",
    "forwardingRecovery", "ordinaryWriter", "readOnly", "fork", "rulesets", "unsupportedAtomic", "leasedDeletes",
  ].map(name => [name, { status: "unverified", detail: "Not reached; inspect the first failing probe and its diagnostics" }]));
  const owned = new Map<string, string>();
  const a = join(root, "backend-a"), b = join(root, "backend-b");
  const tips = async () => new Map((await git("backend-remote-tips", root, ["ls-remote", "--refs", "--", remote]))
    .trim().split("\n").filter(Boolean).map(line => { const [tip = "", ref = ""] = line.split(/\s+/u); return [ref, tip]; }));
  const before = await tips();
  assert(ownedRefs.every(ref => !before.has(ref)), "Native probe refs must be absent before starting");
  for (const [label, path] of [["a", a], ["b", b]] as const) {
    await git(`backend-clone-${label}`, root, ["clone", "--no-checkout", "--", remote, path]);
    assert.equal((await git(`default-clone-${label}`, path, ["for-each-ref", "--format=%(refname)", "refs/arc/"])).trim(), "");
    const config: readonly (readonly [string, string])[] = [["arc.identity", "andrew"], ["user.name", "Host probe"], ["user.email", "host-probe@example.invalid"],
      ["remote.origin.arc-state", "push"]];
    for (const [key, value] of config) {
      await git(`config-${label}-${key.replaceAll(/[^a-z]/gu, "-")}`, path, ["config", "--local", key, value]);
    }
  }
  results.defaultClone = { status: "passed", detail: "Neither ordinary clone acquired refs/arc/*" };
  const stores = [a, b].map(input.store);
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
  const expectFailure = async (label: string, path: string, args: string[],
    expected: { ref: string; reason: RegExp } | "atomic-unsupported", allowUnsupported = false) => {
    try { await git(label, path, args); } catch (error) {
      const evidence = hostPushFailure(error), outcome = evidence.outcome;
      if (expected === "atomic-unsupported" || allowUnsupported && outcome.status === "atomic-unsupported") {
        assert.equal(outcome.status, "atomic-unsupported", "Expected completed atomic capability refusal");
      } else {
        const subject = outcome.status === "refs" ? outcome.refs.find(row => row.ref === expected.ref && row.status === "rejected") : undefined;
        assert(subject && "reason" in subject && expected.reason.test(subject.reason),
          `Expected client rejection for ${expected.ref} with the requested stale/history reason`);
      }
      return { ...evidence, output: evidence.stdout, diagnostic: evidence.stderr };
    }
    throw new Error(`${label} unexpectedly succeeded`);
  };
  try {
    const identityRef = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    success(await first.write({ action: "put", reference: identityRef, expected: null,
      content: JSON.stringify({ projectId: randomUUID() }), provenance }));
    await write("First host value.\r\n");
    if (!input.atomic) {
      assert(![personal, registry].some(ref => before.has(ref)));
      results.multiRefBootstrap = { status: "passed", detail: await bootstrapHostRegistry({ git, store: first, path: a, remote, owned }) };
    }
    const pushed = await publish();
    success(await second.pull());
    assert.equal(success(await second.read({ reference })).content, "First host value.\r\n");
    const old = owned.get(personal)!;
    await write("Second host value.\r\n"); await publish();
    const current = owned.get(personal)!;
    results.backendRoundtrip = { status: "passed", detail: pushed };
    const candidate = (await git("code-candidate", a, ["rev-parse", "refs/remotes/origin/main"])).trim();
    const failed = await expectFailure("stale-atomic", a, ["push", "--porcelain", "--atomic",
      `--force-with-lease=${personal}:${old}`, `--force-with-lease=${code}:`, "--", remote, `${old}:${personal}`, `${candidate}:${code}`], { ref: personal, reason: /^stale info$/u }, !input.atomic);
    if (input.atomic || failed.output.includes("!\t")) assert.match(failed.output, /^!\t/mu);
    else assert.match(failed.diagnostic, /does not support.*atomic/iu);
    assert.equal((await tips()).get(personal), current);
    assert.equal((await tips()).has(code), false);
    results.atomicCarryRefusal = { status: "passed", detail: { scope: "Client stale-advertisement check; receiver races are recorded separately", ...failed } };
    const single = await expectFailure("stale-single", a, ["push", "--porcelain", `--force-with-lease=${personal}:${old}`, "--", remote, `${old}:${personal}`], { ref: personal, reason: /^stale info$/u });
    assert.equal((await tips()).get(personal), current);
    results.singleLeaseRefusal = { status: "passed", detail: { scope: "Client stale-advertisement check", ...single } };
    const deletion = await expectFailure("stale-delete", a, ["push", "--porcelain", `--force-with-lease=${personal}:${old}`, "--", remote, `:${personal}`], { ref: personal, reason: /^stale info$/u });
    assert.equal((await tips()).get(personal), current);
    results.staleDeleteRefusal = { status: "passed", detail: { scope: "Client stale-advertisement check", ...deletion } };
    const races = await probeReceiverLeaseRaces({ root, remote, evidence, git, atomic: input.atomic });
    for (const [kind, result] of Object.entries(races)) results[`receiver-${kind}-race`] = {
      status: result.status === "passed" ? "passed" : "unverified", detail: result.detail,
    };
    const replay = await expectFailure("history-replay", b, ["push", "--porcelain", "--", remote, `${personal}:${personal}`], { ref: personal, reason: /^(?:fetch first|non-fast-forward|needs force)$/u });
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

    Object.assign(results, await probeHostRoles({ root, remote, evidence, settings, ownerGit: git,
      reference, personalRef: personal, ownerStore: first, owned }));
    results.fork = await probeHostFork({ root, remote, settings, git, personalRef: personal });
    results.rulesets = await probeHostPolicy({ root, remote, evidence, settings, owned, atomic: input.atomic });
    const receiver = join(root, "no-atomic.git");
    await git("no-atomic-init", root, ["init", "--bare", receiver]);
    await git("no-atomic-config", receiver, ["config", "receive.advertiseAtomic", "false"]);
    const unsupported = await expectFailure("no-atomic-refusal", a, ["push", "--porcelain", "--atomic", "--", receiver, `${personal}:${personal}`], "atomic-unsupported");
    assert.match(unsupported.diagnostic, /does not support.*atomic/iu);
    assert.equal((await git("no-atomic-unchanged", receiver, ["for-each-ref", "--format=%(refname)"])).trim(), "");
    await git("no-atomic-single", a, ["push", "--porcelain", `--force-with-lease=${personal}:`, "--", receiver, `${personal}:${personal}`]);
    assert.equal((await git("no-atomic-single-tip", receiver, ["rev-parse", personal])).trim(),
      (await git("no-atomic-source-tip", a, ["rev-parse", personal])).trim());
    results.unsupportedAtomic = { status: "passed", detail: { scope: "Local Git receiver; real-host capability is recorded separately", ...unsupported } };
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

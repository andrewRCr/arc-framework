/** Coordinate native pushes after advertisement to test receiver-side lease rejection on disposable refs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import type { HostGit } from "./ref-host-transport.js";
import { quoteShellArgument } from "../../src/lib/release/commit-message-retry.js";

interface RaceReceipt { advertised: string; expected: string; competitorTip: string; competitorExit: number; contenderTransmittedOld: boolean; finalTip?: string | null; carryAbsent?: boolean }
export interface ReceiverRaceResult { status: "passed" | "unsupported" | "failed"; detail: RaceReceipt | string }
interface RaceInput { root: string; remote: string; evidence: string; git: HostGit; atomic: boolean; nodeExecutable?: string }

/** Verify update, delete, and atomic carry races, keeping their refs invocation-owned and deleting with exact leases. */
export async function probeReceiverLeaseRaces(input: RaceInput): Promise<Record<string, ReceiverRaceResult>> {
  const { root, git, evidence } = input;
  const source = join(root, "lease-race-source"), competitor = join(root, "lease-race-competitor.git");
  await git("race-init", root, ["init", source]);
  await git("race-init-competitor", root, ["init", "--bare", competitor]);
  const tree = (await git("race-tree", source, ["hash-object", "-w", "-t", "tree", "--stdin"])).trim();
  const commit = async (label: string, parent?: string) => (await git(`race-commit-${label}`, source,
    ["-c", "user.name=Lease probe", "-c", "user.email=lease@example.invalid", "commit-tree", tree,
      ...parent ? ["-p", parent] : [], "-m", label])).trim();
  const old = await commit("old"), contender = await commit("contender", old), winner = await commit("winner", old);
  await git("race-winner-ref", source, ["update-ref", "refs/testing/winner", winner]);
  await git("race-competitor-objects", root, [`--git-dir=${competitor}`, "fetch", "--no-tags", "--", source, "refs/testing/winner"]);
  const results: Record<string, ReceiverRaceResult> = {};
  for (const kind of ["single", "delete", "atomic"] as const) {
    if (kind === "atomic" && !input.atomic) { results[kind] = { status: "unsupported", detail: "Receiver does not advertise atomic push support." }; continue; }
    try { results[kind] = { status: "passed", detail: await receiverRace(input, { kind, source, competitor, old, contender, winner }) }; }
    catch (error) { results[kind] = { status: "failed", detail: error instanceof Error ? error.message : String(error) }; }
    await writeFile(join(evidence, "receiver-races.json"), JSON.stringify(results, null, 2) + "\n");
  }
  await writeFile(join(evidence, "receiver-races.json"), JSON.stringify(results, null, 2) + "\n");
  return results;
}

interface RaceState { kind: "single" | "delete" | "atomic"; source: string; competitor: string; old: string; contender: string; winner: string }
async function receiverRace(input: RaceInput, state: RaceState): Promise<RaceReceipt> {
  const { git, remote, evidence } = input, { kind, source, competitor, old, contender, winner } = state;
  const prefix = `refs/arc/host-races/${randomUUID()}`, ref = `${prefix}/subject`, carry = `${prefix}/carry`;
  const hooks = join(source, `hooks-${kind}`), receiptPath = join(evidence, `race-${kind}-hook.json`);
  await mkdir(hooks);
  const hook = join(hooks, "pre-push"), script = join(hooks, "pre-push.mjs");
  const shellPath = (path: string) => quoteShellArgument(process.platform === "win32" ? path.replaceAll("\\", "/") : path);
  await writeFile(script, hookSource({ receiptPath, ref, old, winner, remote, competitor, evidence, kind }));
  await writeFile(hook, `#!/bin/sh\nexec ${shellPath(input.nodeExecutable ?? process.execPath)} ${shellPath(script)} "$@"\n`);
  await chmod(hook, 0o700);
  const tips = async () => new Map((await git(`race-${kind}-tips`, source, ["ls-remote", "--refs", "--", remote, `${prefix}/*`]))
    .trim().split("\n").filter(Boolean).map(row => { const [tip = "", name = ""] = row.split(/\s+/u); return [name, tip]; }));
  assert.equal((await tips()).size, 0, "Race refs must be absent before admission");
  const owned = new Map<string, string>();
  try {
    await git(`race-${kind}-seed`, source, ["push", "--porcelain", `--force-with-lease=${ref}:`, "--", remote, `${old}:${ref}`]);
    owned.set(ref, old);
    const next = kind === "delete" ? "0".repeat(old.length) : contender;
    let rejected: unknown;
    try {
      await git(`race-${kind}-contender`, source, ["-c", `core.hooksPath=${hooks}`, "push", "--porcelain", ...kind === "atomic" ? ["--atomic"] : [],
        `--force-with-lease=${ref}:${old}`, ...kind === "atomic" ? [`--force-with-lease=${carry}:`] : [], "--", remote,
        `${kind === "delete" ? "" : contender}:${ref}`, ...kind === "atomic" ? [`${contender}:${carry}`] : []], true);
    } catch (error) { rejected = error; }
    const raw = await readFile(receiptPath, "utf8").catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return undefined; });
    assert(raw, "The contender must admit the advertised old tip before the competitor pushes");
    const receipt = JSON.parse(raw) as RaceReceipt;
    assert.equal(receipt.advertised, old); assert.equal(receipt.expected, old);
    assert.equal(receipt.competitorExit, 0, "The independent competitor must land before the contender resumes");
    owned.set(ref, winner);
    const diagnostic = isGitProcessError(rejected) ? rejected.stderr
      : await readFile(join(evidence, `race-${kind}-contender.stderr.log`), "utf8").catch(() => "");
    receipt.contenderTransmittedOld = diagnostic.includes(`${old} ${next} ${ref}`);
    const after = await tips();
    receipt.finalTip = after.get(ref) ?? null; receipt.carryAbsent = !after.has(carry);
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    assert(receipt.contenderTransmittedOld, "Packet evidence must show the advertised old tip sent to the receiver");
    assert(isGitProcessError(rejected) && rejected.kind === "nonzero-exit", "The completed contender must be rejected");
    assert.equal(after.get(ref), winner); assert.equal(after.has(carry), false, "The atomic companion must remain absent");
    return receipt;
  } finally {
    const held = await tips();
    // A rejected probe never licenses deleting an unknown writer's generation.
    for (const [name, tip] of held) {
      assert([old, contender, winner].includes(tip), "Unexpected generation retained; refuse cleanup");
      if (name === ref || name === carry) owned.set(name, tip);
    }
    for (const [name, tip] of owned) if (held.has(name)) await git(`race-${kind}-cleanup`, source,
      ["push", "--porcelain", `--force-with-lease=${name}:${tip}`, "--", remote, `:${name}`]);
    assert.equal((await tips()).size, 0);
  }
}

function hookSource(input: { receiptPath: string; ref: string; old: string; winner: string; remote: string; competitor: string; evidence: string; kind: string }): string {
  return `import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const input = ${JSON.stringify(input)};
const rows = readFileSync(0, "utf8").trim().split("\\n").map(row => row.split(" "));
const row = rows.find(row => row[2] === input.ref);
assert(row && row[3] === input.old, "Contender's advertisement must match the expected old tip");
const result = spawnSync("git", ["--git-dir=" + input.competitor, "-c", "core.hooksPath=/dev/null", "push", "--porcelain",
  "--force-with-lease=" + input.ref + ":" + input.old, "--", input.remote, input.winner + ":" + input.ref], { encoding: "utf8" });
writeFileSync(input.evidence + "/race-" + input.kind + "-competitor.stdout.log", result.stdout ?? "");
writeFileSync(input.evidence + "/race-" + input.kind + "-competitor.stderr.log", result.stderr ?? "");
writeFileSync(input.receiptPath, JSON.stringify({ advertised: row[3], expected: input.old, competitorTip: input.winner, competitorExit: result.status }));
assert.equal(result.status, 0, "Independent competitor failed");
`;
}

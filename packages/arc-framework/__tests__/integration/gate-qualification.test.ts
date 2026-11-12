/** Real gate children retain local/index checks while only routed shard expansion differs. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { expect, it } from "vitest";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { LOCAL_RUNNER_EXAMPLE } from "../fixtures/checks/runner.js";
import { runGateChild } from "../helpers/gate-qualification/run.js";
import { qualifyGatePair, summarizeGateSamples } from "../helpers/gate-qualification/summary.js";
import type { GateArm, GateSample, GateTrial } from "../helpers/gate-qualification/model.js";

const localIt = it.runIf(process.platform === "linux");

async function fixture() {
  const checks = {
    local: { command: [process.execPath, "local.cjs", "local"], gate: "push", inputs: ["src/**"] },
    indexed: { command: [process.execPath, "local.cjs", "indexed"], gate: "commit", reads_index: true, inputs: ["src/**"] },
    routed: { command: [process.execPath, "routed.cjs"], runner: true, gate: "merge", inputs: ["src/**"],
      environment_inputs: { FAIL_NATIVE: "value" }, shards: { count: 2, argument: "--shard={index}/{count}", routed: true } },
    ci: { command: [process.execPath, "-e", "throw new Error('CI-only check must stay excluded')"], gate: "merge", ci_only: true },
  };
  const original = await createDeclaredCheckRepository(checks), scratch = await mkdtemp(join(tmpdir(), "arc-gate-qualification-"));
  await writeFile(join(original, "src/a.ts"), "fixed source\n");
  await writeFile(join(original, "local.cjs"), `
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const git=cp.execFileSync('git',['rev-parse','--git-dir'],{encoding:'utf8'}).trim();
const value={kind:process.argv[2],source:fs.readFileSync('src/a.ts','utf8'),index:process.env.GIT_INDEX_FILE||null,
 tree:process.env.GIT_INDEX_FILE?cp.execFileSync('git',['write-tree'],{encoding:'utf8'}).trim():null};
fs.appendFileSync(path.join(git,'gate-events.jsonl'),JSON.stringify(value)+'\\n');console.log(JSON.stringify(value));
`);
  await writeFile(join(original, "routed.cjs"), `
const fs=require('node:fs');console.log(JSON.stringify({source:fs.readFileSync('src/a.ts','utf8'),args:process.argv.slice(2)}));
if(process.env.FAIL_NATIVE==='1')process.exit(7);
`);
  await execa("git", ["add", "-A"], { cwd: original });
  await execa("git", ["commit", "-m", "gate sources"], { cwd: original });
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: original })).stdout;
  const tree = (await execa("git", ["rev-parse", "HEAD^{tree}"], { cwd: original })).stdout;
  const checkout = join(scratch, "checkout");
  await execa("git", ["clone", "--quiet", "--local", original, checkout]);
  await execa("git", ["config", "user.name", "ARC Test"], { cwd: checkout });
  await execa("git", ["config", "user.email", "arc-test@example.com"], { cwd: checkout });
  const declaration = await readFile(join(checkout, ".arc/system/arc-checks.yml"), "utf8");
  // Edits to the original fixture cannot affect this explicitly isolated source checkout.
  await writeFile(join(original, "src/a.ts"), "poison original\n");
  const trial = (arm: GateArm, id: string): GateTrial => ({ id, pairId: "pair", batchId: "batch", arm, checkout,
    expected: { head, tree, base: head }, gate: "merge", scope: { kind: "all" }, environment: { FAIL_NATIVE: null },
    nativeChecks: [], requiredPassedChecks: ["local", "indexed", "routed"], observerConfig: "unused-no-native-tests",
    runnerConfiguration: { file: join(scratch, "machine.yml"), argv: [process.execPath, LOCAL_RUNNER_EXAMPLE, "--state-root", join(scratch, "runner-state")] },
    outputDirectory: join(scratch, id), timeoutMs: 60_000 });
  return { original, scratch, checkout, declaration, tree, trial };
}

localIt("runs complete forced gate children from the actual unchanged declaration and fixed source", async () => {
  const f = await fixture();
  try {
    const seed = await runGateChild(f.trial("routed-unsharded", "seed"));
    expect(seed.report, seed.stderr).toMatchObject({ completed: true });
    const baseline = await runGateChild(f.trial("routed-unsharded", "baseline"));
    const distributed = await runGateChild(f.trial("distributed", "distributed"));
    for (const sample of [baseline, distributed]) {
      expect(sample.report, sample.stderr).toMatchObject({ completed: true, retained: [], expectedChecks: ["local", "indexed", "routed", "ci"] });
      const result = sample.report!.outcome!;
      expect(result.kind).toBe("result");
      if (result.kind !== "result") throw new Error("Expected complete gate report");
      expect(result.result.checks.map(check => [check.id, check.outcome])).toEqual([
        ["local", "passed"], ["indexed", "passed"], ["routed", "passed"], ["ci", "not selected"],
      ]);
      const local = JSON.parse(result.result.checks.find(check => check.id === "local")!.output!);
      const indexed = JSON.parse(result.result.checks.find(check => check.id === "indexed")!.output!);
      expect(local).toMatchObject({ source: "fixed source\n", index: null });
      expect(indexed.source).toBe("fixed source\n");
      expect(indexed.index).toBeTypeOf("string");
      expect(indexed.tree).toBe(f.tree);
      expect(sample.report!.captures[0]!.closure).toMatchObject({ status: "closed", exit: { exitCode: 0 } });
      expect(sample.report!.captures[0]!.runtime).toBeNull();
      expect(sample.collectionMs).toBeGreaterThanOrEqual(sample.report!.controllerMs);
    }
    // The baseline must actually execute its one unsplit native command.
    expect(baseline.report!.captures[0]!.plan.invocations).toHaveLength(1);
    expect(distributed.report!.captures[0]!.plan.invocations).toHaveLength(2);
    const routed = distributed.report!.outcome!;
    if (routed.kind !== "result") throw new Error("Expected gate result");
    const details = routed.result.checks.find(check => check.id === "routed")!.invocations!;
    expect(details.map(detail => JSON.parse(detail.output!).args)).toEqual([["--shard=1/2"], ["--shard=2/2"]]);
    expect(baseline.report!.controllerPid).not.toBe(distributed.report!.controllerPid);
    expect(baseline.report!.comparisonIdentity).toBe(distributed.report!.comparisonIdentity);
    expect(await readFile(join(f.checkout, ".arc/system/arc-checks.yml"), "utf8")).toBe(f.declaration);
    const events = (await readFile(join(f.checkout, ".git/gate-events.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(events.filter(event => event.kind === "local")).toHaveLength(3);
    expect(events.filter(event => event.kind === "indexed")).toHaveLength(3);
  } finally { await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]); }
}, 120_000);

localIt("retains a real failed gate and excludes unsuccessful or coverage-unqualified samples from timing statistics", async () => {
  const f = await fixture();
  try {
    const success = await runGateChild(f.trial("routed-unsharded", "success"));
    const request = f.trial("distributed", "failure");
    request.environment.FAIL_NATIVE = "1";
    const failure = await runGateChild(request);
    expect(success.report?.completed, success.stderr).toBe(true);
    expect(failure.report?.completed).toBe(false);
    expect(failure.report?.outcome).toMatchObject({ kind: "result", exitCode: 1 });
    expect(failure.report!.captures[0]!.outcomes).toHaveLength(2);
    expect(failure.report!.captures[0]!.closure?.status).toBe("closed");
    const samples: GateSample[] = [success, failure];
    const summary = summarizeGateSamples(samples);
    expect(summary.samples).toEqual(samples);
    expect(summary.requested).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.pairs[0]?.qualified).toBe(false);
    expect(summary.gates[0]).toMatchObject({ baseline: { count: 0, median: null }, distributed: { count: 0, median: null } });
    expect(summary.batches.every(batch => batch.qualifiedMakespanMs === null)).toBe(true);
    expect(summary.batches.reduce((sum, batch) => sum + batch.completed, 0)).toBe(1);
  } finally { await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]); }
}, 120_000);


localIt("refuses stale evidence directories and accepts an explicit fresh retry", async () => {
  const f = await fixture();
  try {
    const request = f.trial("routed-unsharded", "occupied");
    await mkdir(request.outputDirectory);
    const old = JSON.stringify({ id: "previous interrupted sample", completed: true });
    await writeFile(join(request.outputDirectory, "gate.json"), old);
    await expect(runGateChild(request)).rejects.toThrow();
    expect(await readFile(join(request.outputDirectory, "gate.json"), "utf8")).toBe(old);
    const retry = await runGateChild(f.trial("routed-unsharded", "fresh"));
    expect(retry.report?.completed, retry.stderr).toBe(true);
    expect(retry.report?.id).toBe("fresh");
    const liar = join(f.scratch, "stale-controller.cjs");
    await writeFile(liar, "require('node:fs').writeFileSync(process.argv.at(-1),JSON.stringify({id:'wrong trial',completed:true}));");
    const mismatched = await runGateChild(f.trial("routed-unsharded", "identity"), [process.execPath, liar]);
    expect(mismatched.failure).toContain("report identity");
    expect(mismatched.report).toBeUndefined();
    expect(mismatched.rejectedReport).toMatchObject({ id: "wrong trial" });
  } finally { await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]); }
}, 120_000);

async function nativeFixture() {
  const f = await fixture();
  await mkdir(join(f.checkout, "__tests__/helpers"), { recursive: true });
  await mkdir(join(f.checkout, "native"));
  for (const name of ["native-shard-observer.ts", "native-shard-evidence.ts", "heavy-first-sequencer.ts", "heavy-first-durations.ts"]) {
    let content = await readFile(new URL(`../helpers/${name}`, import.meta.url), "utf8");
    content = content.replaceAll('from "zod"', `from ${JSON.stringify(fileURLToPath(import.meta.resolve("zod")))}`)
      .replaceAll('from "vitest/node"', `from ${JSON.stringify(fileURLToPath(import.meta.resolve("vitest/node")))}`);
    await writeFile(join(f.checkout, "__tests__/helpers", name), content);
  }
  for (const name of ["a", "b"]) await writeFile(join(f.checkout, "native", `${name}.test.mjs`),
    String.raw`import { readFileSync } from "node:fs";it("native ${name}",()=>expect(readFileSync("src/a.ts","utf8")).toBe("fixed source\n"));`);
  await writeFile(join(f.checkout, "package.json"), '{"type":"module"}');
  await writeFile(join(f.checkout, "observe.config.mjs"), `
import { observeNativeShards } from "./__tests__/helpers/native-shard-observer.ts";
export default observeNativeShards({cacheDir:${JSON.stringify(join(f.scratch,"native-cache"))},test:{watch:false,cache:false,maxWorkers:1,globals:true,
projects:[{test:{name:"unit",root:import.meta.dirname,globals:true,include:["native/*.test.mjs"]}}]}});
`);
  const definition = JSON.parse(f.declaration);
  definition.checks.routed.command = [process.execPath, "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../vitest.mjs", import.meta.resolve("vitest/node"))), "run", "--configLoader", "native", "--no-cache"];
  await writeFile(join(f.checkout, ".arc/system/arc-checks.yml"), JSON.stringify(definition));
  await execa("git", ["add", "-A"], { cwd: f.checkout });
  await execa("git", ["commit", "-m", "real native qualification"], { cwd: f.checkout });
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.checkout })).stdout;
  const tree = (await execa("git", ["rev-parse", "HEAD^{tree}"], { cwd: f.checkout })).stdout;
  const proxy = join(f.scratch, "provider.cjs"), records = join(f.scratch, "provider-records.jsonl"), policy = join(f.scratch, "policy.json");
  await writeFile(policy, '{"mode":"on"}');
  await writeFile(proxy, String.raw`
const fs=require('node:fs'),cp=require('node:child_process');
if(process.argv[2]==='status'){console.log(fs.readFileSync(${JSON.stringify(policy)},'utf8'));process.exit(0)}
if(process.argv[2]==='history'){console.log(JSON.stringify(fs.existsSync(${JSON.stringify(records)})?fs.readFileSync(${JSON.stringify(records)},'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]));process.exit(0)}
const child=cp.spawn(${JSON.stringify(process.execPath)},[${JSON.stringify(LOCAL_RUNNER_EXAMPLE)},'--state-root',${JSON.stringify(join(f.scratch,"real-provider-state"))}],{stdio:['pipe','pipe','pipe']});
let pending='',reply='',planId,released=false,observedStart; const methods=new Map();
process.stdin.on('data',bytes=>{pending+=bytes;let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n);pending=pending.slice(n+1);const frame=JSON.parse(line);methods.set(frame.id,frame.method);if(frame.method==='check/prepare'){planId=frame.params.planId;observedStart=Date.now();}}child.stdin.write(bytes)});
process.stdin.on('end',()=>child.stdin.end());
child.stdout.on('data',bytes=>{process.stdout.write(bytes);reply+=bytes;let n;while((n=reply.indexOf('\n'))>=0){const line=reply.slice(0,n);reply=reply.slice(n+1);const frame=JSON.parse(line);if(methods.get(frame.id)==='check/release'&&frame.result?.released===true)released=true;}});
child.stderr.pipe(process.stderr);child.on('close',code=>{if(planId)fs.appendFileSync(${JSON.stringify(records)},JSON.stringify({version:1,context:{plan_id:planId},observed:{startedAt:observedStart,finishedAt:Date.now(),released,processExit:code},state:released&&code===0?'finished':'open',outcome:{status:code},resources:{available:false,reason:'fixture has no resource sampler'}})+'\n');process.exitCode=code||0;});
`);
  const trial = (arm: GateArm, id: string): GateTrial => ({ ...f.trial(arm, id), expected: { head, tree, base: f.trial(arm, id).expected.base },
    nativeChecks: ["routed"], observerConfig: "observe.config.mjs", provider: {
      status: [process.execPath, proxy, "status"], history: [process.execPath, proxy, "history"],
    }, runnerConfiguration: { file: join(f.scratch, "fixture-machine.yml"), argv: [process.execPath, proxy, "serve"] } });
  return { ...f, trial, policy };
}

localIt("accepts a real matched-profile native baseline/matrix while reusable adapter runtime stays unknown", async () => {
  const f = await nativeFixture();
  try {
    const baseline = await runGateChild(f.trial("routed-unsharded", "native-baseline"));
    const distributed = await runGateChild(f.trial("distributed", "native-distributed"));
    expect(baseline.report, JSON.stringify({ stderr: baseline.stderr, outcome: baseline.report?.outcome, errors: baseline.report?.errors })).toMatchObject({ completed: true });
    expect(distributed.report, JSON.stringify({ stderr: distributed.stderr, outcome: distributed.report?.outcome, errors: distributed.report?.errors })).toMatchObject({ completed: true });
    expect(qualifyGatePair(baseline, distributed)).toEqual({ qualified: true, reasons: [] });
    expect(baseline.report!.native.routed).toHaveLength(1);
    expect(distributed.report!.native.routed).toHaveLength(2);
    expect(baseline.report!.native.routed![0]!.observations[0]!.assigned).toHaveLength(2);
    expect(distributed.report!.captures[0]!.runtime).toBeNull();
    expect(distributed.report!.telemetry.missingPlanIds).toEqual([]);
  } finally { await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]); }
}, 120_000);

it("records native context refused by the fixture provider's required mode without executing checks", async () => {
  const f = await nativeFixture();
  try {
    await writeFile(f.policy, '{"mode":"required"}');
    const sample = await runGateChild(f.trial("native-local", "required-context"));
    expect(sample.report).toMatchObject({ completed: false, ownerMode: "required", captures: [], nativeProcesses: [] });
    expect(sample.report!.errors.join("\n")).toContain("permitting local execution");
    expect(sample.report!.telemetry.status).toEqual({ mode: "required" });
    expect(summarizeGateSamples([sample]).nativeContext).toHaveLength(1);
    expect(sample.processExit.exitCode).not.toBe(0);
  } finally { await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]); }
}, 120_000);

interface StalledPreparation { planId: string; source: { root: string; manifest: string }; pid: number; birth: string }

async function stopStalledProvider(preparation: StalledPreparation | undefined, io = {
  readStat: (pid: number) => readFile(`/proc/${pid}/stat`, "utf8"),
  killGroup: (pid: number) => process.kill(-pid, "SIGKILL"),
}): Promise<void> {
    if (preparation !== undefined) {
      try {
        const fields = (await io.readStat(preparation.pid)).split(")").at(-1)!.trim().split(/\s+/u);
        if (fields[19] === preparation.birth && Number(fields[2]) === preparation.pid) io.killGroup(preparation.pid);
      } catch (cause) { if (!["ENOENT", "ESRCH"].includes((cause as NodeJS.ErrnoException).code ?? "")) throw cause; }
      const stoppedBy = performance.now() + 5_000;
      for (;;) {
        try {
          const fields = (await io.readStat(preparation.pid)).split(")").at(-1)!.trim().split(/\s+/u);
          if (fields[19] !== preparation.birth || ["Z", "X"].includes(fields[0]!)) break;
        } catch (cause) { if (["ENOENT", "ESRCH"].includes((cause as NodeJS.ErrnoException).code ?? "")) break; throw cause; }
        if (performance.now() >= stoppedBy) throw new Error("Owned fixture adapter did not stop; retain capture for inspection");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      // No worker or native command was launched; cleanup follows stopping the owned stalled adapter.
      await rm(join(preparation.source.root, ".."), { recursive: true, force: true });
    }
}

it("removes captured inputs when a provider vanishes between cleanup polls", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "arc-stalled-cleanup-"));
  const source = { root: join(scratch, "source"), manifest: join(scratch, "source", "manifest.json") };
  await mkdir(source.root);
  await writeFile(source.manifest, "retained input");
  const preparation: StalledPreparation = { planId: "stalled", source, pid: 12345, birth: "777" };
  const fields = Array<string>(20).fill("0");
  fields[0] = "S";
  fields[2] = String(preparation.pid);
  fields[19] = preparation.birth;
  const runningStat = `${preparation.pid} (provider) ${fields.join(" ")}`;
  let reads = 0;
  try {
    await stopStalledProvider(preparation, {
      readStat: async () => {
        // The ownership read and first poll see the same process; the next poll loses it.
        if (reads++ >= 2) throw Object.assign(new Error("no such process, read"), { code: "ESRCH" });
        return runningStat;
      },
      killGroup: () => true,
    });
    await expect(readFile(source.manifest, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

it.runIf(process.platform === "linux")("retains genuine preparing handles before a controller deadline without inventing closure", async () => {
  const f = await fixture();
  const adapter = join(f.scratch, "stalled-provider.cjs"), observed = join(f.scratch, "preparing.json"), cancelled = join(f.scratch, "cancelled.json");
  await writeFile(adapter, String.raw`
const fs=require('node:fs'),lines=require('node:readline').createInterface({input:process.stdin});
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
setInterval(()=>{},1000);process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});
lines.on('line',line=>{const request=JSON.parse(line);if(request.method==='check/prepare'){
 const fields=fs.readFileSync('/proc/'+process.pid+'/stat','utf8').split(')').at(-1).trim().split(/\s+/);
 fs.writeFileSync(${JSON.stringify(observed)},JSON.stringify({planId:request.params.planId,source:request.params.source,pid:process.pid,birth:fields[19]}));
 send({jsonrpc:'2.0',method:'check/recovery',params:{planId:request.params.planId,instructions:'Inspect the fixture stalled preparation; do not remove its captured inputs.'}});
}else if(request.method==='check/cancel'){
 fs.writeFileSync(${JSON.stringify(cancelled)},JSON.stringify(request.params));
 send({jsonrpc:'2.0',id:request.id,result:{planId:request.params.planId,accepted:true}});
}});
`);
  const trial = f.trial("routed-unsharded", "stalled");
  trial.runnerConfiguration = { file: join(f.scratch, "stalled-machine.yml"), argv: [process.execPath, adapter] };
  trial.timeoutMs = 10_000;
  let preparation: StalledPreparation | undefined;
  let sample: GateSample | undefined;
  const running = runGateChild(trial);
  const readCheckpoint = async () => {
    try { return JSON.parse(await readFile(join(trial.outputDirectory, "retained.json"), "utf8")); }
    catch { return undefined; }
  };
  try {
    const deadline = performance.now() + 8_000;
    while (preparation === undefined && performance.now() < deadline) {
      try { preparation = JSON.parse(await readFile(observed, "utf8")); }
      catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    expect(preparation, "the real adapter must enter preparation before the expected controller deadline").toBeDefined();
    const early = await readCheckpoint();
    sample = await running;
    expect(sample.processExit.timedOut).toBe(true);
    expect(sample.processExit.exitCode).not.toBe(0);
    expect(sample.report).toBeUndefined();
    expect(sample.failure).toContain("report unavailable");
    const checkpoint = await readCheckpoint();
    expect(checkpoint).toMatchObject({ cause: "SIGTERM", attempts: [{ planId: preparation!.planId,
      configuration: trial.runnerConfiguration, retained: { planId: preparation!.planId,
        adapter: trial.runnerConfiguration.argv, sourceRoot: preparation!.source.root, manifest: preparation!.source.manifest,
        recovery: "Inspect the fixture stalled preparation; do not remove its captured inputs." } }], captures: [] });
    expect(early).toMatchObject({ attempts: [{ planId: preparation!.planId, configuration: trial.runnerConfiguration }] });
    expect(checkpoint.attempts[0]).not.toHaveProperty("closure");
    expect(JSON.parse(await readFile(cancelled, "utf8"))).toMatchObject({ planId: preparation!.planId });
    expect(await readFile(preparation!.source.manifest, "utf8")).toContain('"entries"');
    expect(summarizeGateSamples([sample]).completed).toBe(0);
  } finally {
    await running.catch(() => undefined);
    await stopStalledProvider(preparation);
    await Promise.all([rm(f.original, { recursive: true, force: true }), rm(f.scratch, { recursive: true, force: true })]);
  }
}, 60_000);

/** Direct stale/history probes need the decision for the expected subject and operation. */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";
import { probeBackend } from "../benchmarks/ref-host-backend.js";
import { alterHostFailure, hostProofFaults } from "../helpers/host-proof-faults.js";

const probes = [
  ["stale-atomic", "atomicCarryRefusal"], ["stale-single", "singleLeaseRefusal"],
  ["stale-delete", "staleDeleteRefusal"], ["history-replay", "historyReplayRefusal"],
] as const;
it.each(probes.flatMap(([label, result]) => hostProofFaults.map(fault => ({ label, result, fault }))))(
  "does not credit $label with $fault", async ({ label, result, fault }) => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  await fixture.exec("git", ["push", "origin", "HEAD:refs/heads/main"]);
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const git = async (step: string, cwd: string, args: string[], trace = false) => {
    try { return (await createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined,
      GIT_TRACE_PACKET: trace ? "1" : "0" })("git", args, { cwd, signal: AbortSignal.timeout(5_000), preserveOutput: true,
      interaction: { ambientStdin: "closed", terminalPrompts: "forbidden", presenters: "forbidden" } })).stdout; }
    catch (error) { if (step === label && isGitProcessError(error)) throw alterHostFailure(error, fault); throw error; }
  };
  // A subsequent setup failure stops baseline code after the erroneous credit; no assertion depends on wiring.
  let failure: unknown;
  try { await probeBackend({ root: fixture.root, remote: fixture.remote, evidence, git, atomic: true, settings: {},
    store: checkoutRoot => createRefStore(createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null })) }); }
  catch (error) { failure = error; }
  const report = JSON.parse(await readFile(join(evidence, "backend-results.json"), "utf8")) as Record<string, {status: string}>;
  expect(report.backendRoundtrip?.status, String(failure)).toBe("passed");
  expect(report[result]?.status).toBe("unverified");
  expect(failure).toBeDefined();
  expect((await fixture.exec("git", ["ls-remote", fixture.remote, "refs/arc/*"])).stdout).toBe("");
}, 60_000);

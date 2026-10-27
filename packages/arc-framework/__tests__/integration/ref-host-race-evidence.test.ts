/** Packet transmission and a winning competitor cannot substitute for receiver status. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { probeReceiverLeaseRaces } from "../benchmarks/ref-host-lease-races.js";
import { alterHostFailure, hostProofFaults } from "../helpers/host-proof-faults.js";

it.each(hostProofFaults)("leaves each receiver race failed after %s", async fault => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const results = await probeReceiverLeaseRaces({ root: fixture.root, remote: fixture.remote, evidence, atomic: true,
    git: async (label, cwd, args, trace) => {
      try { return (await createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined,
        GIT_TRACE_PACKET: trace ? "1" : "0" })("git", args, { cwd, signal: AbortSignal.timeout(5_000), preserveOutput: true,
        interaction: { ambientStdin: "closed", terminalPrompts: "forbidden", presenters: "forbidden" } })).stdout; }
      catch (error) { if (/^race-(?:single|delete|atomic)-contender$/u.test(label) && isGitProcessError(error)) throw alterHostFailure(error, fault); throw error; }
    } });
  expect(Object.keys(results)).toEqual(["single", "delete", "atomic"]);
  for (const result of Object.values(results)) expect.soft(result.status).toBe("failed");
  expect((await fixture.exec("git", ["ls-remote", fixture.remote, "refs/arc/host-races/*"])).stdout).toBe("");
}, 30_000);

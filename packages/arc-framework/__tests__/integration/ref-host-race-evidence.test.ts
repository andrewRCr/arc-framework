/** Packet transmission and a winning competitor cannot substitute for receiver status. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { GitProcessError, isGitProcessError } from "../../src/lib/git/process-error.js";
import { probeReceiverLeaseRaces } from "../benchmarks/ref-host-lease-races.js";
import { alterHostFailure, hostProofFaults } from "../helpers/host-proof-faults.js";
import type { HostGit } from "../benchmarks/ref-host-transport.js";

function azureFailure(error: GitProcessError): GitProcessError {
  return new GitProcessError({ kind: error.kind, command: error.command, args: error.args,
    exitCode: error.exitCode, signal: error.signal,
    stdout: error.stdout.replace(/(\[remote rejected\] \()[^\n)]*(\))/gu,
      "$1TF401028: The reference has already been updated by another client.$2"), stderr: error.stderr });
}

function nativeRaceGit(alter: (error: GitProcessError) => GitProcessError): HostGit {
  return async (label, cwd, args, trace) => {
    try { return (await createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined,
      GIT_TRACE_PACKET: trace ? "1" : "0" })("git", args, { cwd, signal: AbortSignal.timeout(5_000), preserveOutput: true,
      interaction: { ambientStdin: "closed", terminalPrompts: "forbidden", presenters: "forbidden" } })).stdout; }
    catch (error) {
      if (/^race-(?:single|delete|atomic)-contender$/u.test(label) && isGitProcessError(error)) throw alter(error);
      throw error;
    }
  };
}

it("accepts Azure's exact-subject TF401028 reason with real receiver-race evidence", async () => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const results = await probeReceiverLeaseRaces({ root: fixture.root, remote: fixture.remote, evidence, atomic: true,
    git: nativeRaceGit(azureFailure) });
  expect(Object.keys(results)).toEqual(["single", "delete", "atomic"]);
  for (const result of Object.values(results)) {
    expect(result.status, JSON.stringify(result)).toBe("passed");
    if (typeof result.detail === "string") throw new Error(result.detail);
    expect(result.detail.advertised).toBe(result.detail.expected);
    expect(result.detail.competitorExit).toBe(0);
    expect(result.detail.contenderTransmittedOld).toBe(true);
    expect(result.detail.finalTip).toBe(result.detail.competitorTip);
    expect(result.detail.carryAbsent).toBe(true);
    expect(result.detail.rejection?.outcome).toMatchObject({ status: "refs", refs: expect.arrayContaining([
      expect.objectContaining({ status: "remote-rejected", ref: expect.stringMatching(/\/subject$/u),
        reason: expect.stringContaining("TF401028") }),
    ]) });
  }
  expect((await fixture.exec("git", ["ls-remote", fixture.remote, "refs/arc/host-races/*"])).stdout).toBe("");
}, 30_000);

it.each([...hostProofFaults, "stderr-only", "token-substring"] as const)("refuses Azure-shaped proof after %s", async fault => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const results = await probeReceiverLeaseRaces({ root: fixture.root, remote: fixture.remote, evidence, atomic: true,
    git: nativeRaceGit(error => {
      if (fault === "token-substring" || fault === "stderr-only") {
        const azure = azureFailure(error);
        return new GitProcessError({ kind: azure.kind, command: azure.command, args: azure.args, exitCode: azure.exitCode,
          stdout: azure.stdout.replaceAll("TF401028", fault === "token-substring" ? "TF4010280" : "unrelated failure"),
          stderr: azure.stderr + (fault === "stderr-only" ? "\nTF401028: The reference has already been updated by another client." : "") });
      }
      return alterHostFailure(azureFailure(error), fault);
    }) });
  expect(Object.keys(results)).toEqual(["single", "delete", "atomic"]);
  for (const result of Object.values(results)) expect.soft(result.status).toBe("failed");
  expect((await fixture.exec("git", ["ls-remote", fixture.remote, "refs/arc/host-races/*"])).stdout).toBe("");
}, 30_000);

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

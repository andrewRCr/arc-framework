/** The manual host coordinator proves receiver races against a native disposable bare receiver. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { probeReceiverLeaseRaces } from "../benchmarks/ref-host-lease-races.js";

it("admits old advertisements, waits for competitor winners and observes receiver rejection with atomic carry absence", async () => {
  const root = await createTempRepoCore();
  onTestFinished(() => removeGitBackedDir(root));
  const remote = join(root, "receiver.git"), evidence = join(root, "evidence");
  await mkdir(evidence);
  const exec = createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined });
  await exec("git", ["init", "--bare", remote], { cwd: root });
  const results = await probeReceiverLeaseRaces({ root, remote, evidence, atomic: true,
    git: async (_label, cwd, args, trace) => (await createExecaGitExec(undefined,
      { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined, GIT_TRACE_PACKET: trace ? "1" : "0" })("git", args,
      { cwd, preserveOutput: true, interaction: { ambientStdin: "closed", terminalPrompts: "forbidden", presenters: "forbidden" } })).stdout });
  expect(Object.keys(results)).toEqual(["single", "delete", "atomic"]);
  for (const result of Object.values(results)) expect(result).toMatchObject({ status: "passed", detail: {
    advertised: expect.any(String), expected: expect.any(String), competitorExit: 0, contenderTransmittedOld: true,
  } });
  expect((await exec("git", [`--git-dir=${remote}`, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
}, 20_000);

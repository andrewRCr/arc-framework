/** Policy evidence must establish the completed rejection of the protected subject. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeHostPolicy } from "../benchmarks/ref-host-access.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { GitProcessError, isGitProcessError } from "../../src/lib/git/process-error.js";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { alterHostFailure, hostProofFaults } from "../helpers/host-proof-faults.js";

it.each([...hostProofFaults, "unrelated-hook", "unrelated-policy-diagnostic", "receiver-policy"] as const)("requires completed subject policy evidence (%s)", async fault => {
  const fixture = await createRefTestRepository();
  onTestFinished(fixture.cleanup);
  await fixture.exec("git", ["push", "origin", "HEAD:refs/heads/main"]);
  await writeFile(join(fixture.remote, "hooks", "pre-receive"), '#!/bin/sh\nwhile read old new ref; do\n  if test "$ref" = refs/heads/main; then echo "Protected main" >&2; exit 1; fi\ndone\n', { mode: 0o755 });
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const exec = createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined });
  const createTransport = () => ({
    git: async (label: string, cwd: string, args: string[]) => {
      try { return (await exec("git", args, { cwd, preserveOutput: true })).stdout; }
      catch (error) {
        if (label === "policy-atomic-rejection" && isGitProcessError(error)) {
          if (fault === "receiver-policy") throw new GitProcessError({ kind: error.kind, command: error.command, args: error.args,
            exitCode: error.exitCode, stdout: error.stdout.replaceAll("(pre-receive hook declined)",
              "(TF402455: Pushes to this branch are not permitted; you must use a pull request to update this branch.)"),
            stderr: "remote: TF402455: Pushes to this branch are not permitted; you must use a pull request to update this branch." });
          if (fault === "unrelated-policy-diagnostic") throw new GitProcessError({ kind: error.kind, command: error.command, args: error.args,
            exitCode: error.exitCode, stdout: error.stdout, stderr: "remote: policy service unavailable" });
          if (fault === "unrelated-hook") throw new GitProcessError({ kind: error.kind, command: error.command, args: error.args,
            exitCode: error.exitCode, stdout: error.stdout, stderr: "remote: unrelated hook failure" });
          throw alterHostFailure(error, fault);
        }
        throw error;
      }
    },
    store: (checkoutRoot: string) => createRefStore(createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null })),
  });
  const owned = new Map<string, string>();
  const trial = probeHostPolicy({ root: fixture.root, remote: fixture.remote, evidence, settings: {}, owned, atomic: true }, createTransport);
  if (fault === "receiver-policy") expect((await trial).status).toBe("passed");
  else await expect(trial).rejects.toThrow();
  // Failed evidence leaves the baseline state owned by the caller and code unchanged.
  expect((await fixture.exec("git", ["ls-remote", fixture.remote, "refs/heads/main"])).stdout).toContain(
    (await fixture.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  for (const [ref, tip] of owned) await fixture.exec("git", ["push", `--force-with-lease=${ref}:${tip}`, fixture.remote, `:${ref}`]);
}, 30_000);

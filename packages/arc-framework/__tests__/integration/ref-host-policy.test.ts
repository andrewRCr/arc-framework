import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeHostPolicy } from "../benchmarks/ref-host-access.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";

it.each([false, true].flatMap(primaryAtomic => [false, true].map(policyAtomic => ({ primaryAtomic, policyAtomic }))))(
  "probes and cleans its policy receiver (primary atomic=$primaryAtomic, policy atomic=$policyAtomic)", async ({ primaryAtomic, policyAtomic }) => {
  const fixture = await createRefTestRepository();
  onTestFinished(fixture.cleanup);
  await fixture.exec("git", ["push", "origin", "HEAD:refs/heads/main"]);
  await fixture.exec("git", [`--git-dir=${fixture.remote}`, "config", "receive.advertiseAtomic", String(primaryAtomic)]);
  const policy = join(fixture.root, "policy.git"), evidence = join(fixture.root, "evidence");
  await mkdir(evidence);
  await fixture.exec("git", ["init", "--bare", "--initial-branch=main", policy]);
  await fixture.exec("git", ["push", policy, "HEAD:refs/heads/main"]);
  await fixture.exec("git", [`--git-dir=${policy}`, "config", "receive.advertiseAtomic", String(policyAtomic)]);
  await writeFile(join(policy, "hooks", "pre-receive"), '#!/bin/sh\nwhile read old new ref; do\n  if test "$ref" = refs/heads/main; then echo "Protected main" >&2; exit 1; fi\ndone\n', { mode: 0o755 });
  const exec = createExecaGitExec();
  const createTransport = () => ({
    git: async (_label: string, cwd: string, args: string[]) => (await exec("git", args, { cwd, preserveOutput: true,
      interaction: { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" } })).stdout,
    store: (checkoutRoot: string) => createRefStore(createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null })),
  });
  let failure: unknown, result: Awaited<ReturnType<typeof probeHostPolicy>> | undefined;
  try { result = await probeHostPolicy({ root: fixture.root, remote: fixture.remote, evidence,
    settings: { policy: { remote: policy } }, owned: new Map(), atomic: primaryAtomic }, createTransport); }
  catch (error) { failure = error; }
  expect.soft(failure).toBeUndefined();
  expect.soft(result?.status).toBe("passed");
  expect((await fixture.exec("git", [`--git-dir=${policy}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}, 90_000);

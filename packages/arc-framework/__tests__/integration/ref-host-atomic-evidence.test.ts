/** Atomic capability fallback requires completion before interpreting familiar text. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { probeHostAtomicPush } from "../benchmarks/ref-host-properties.js";
import { alterHostFailure } from "../helpers/host-proof-faults.js";

it.each(["completed", "signal", "missing-status"] as const)("admits only completed atomic capability refusal (%s)", async fault => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  await fixture.exec("git", [`--git-dir=${fixture.remote}`, "config", "receive.advertiseAtomic", "false"]);
  const oid = (await fixture.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const protocolOwned = new Map<string, string>(), seeded = ["refs/arc/host-probe/a", "refs/arc/host-probe/b"];
  const exec = createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined });
  let failure: unknown, unsupported: string | undefined;
  try { unsupported = await probeHostAtomicPush({ source: fixture.root, remote: fixture.remote, evidence, oid, seeded,
    old: new Map(), protocolOwned, git: async (label, cwd, args) => {
      try { return (await exec("git", args, {cwd, preserveOutput: true})).stdout; }
      catch (error) { if (label === "push" && isGitProcessError(error) && fault !== "completed") throw alterHostFailure(error, fault); throw error; }
    } }); } catch (error) { failure = error; }
  const refs = (await fixture.exec("git", ["ls-remote", fixture.remote, "refs/arc/host-probe/*"])).stdout;
  if (fault === "completed") {
    expect(failure).toBeUndefined(); expect(unsupported).toContain("does not support --atomic push");
    for (const ref of seeded) expect(refs).toContain(`${oid}\t${ref}`);
    expect(protocolOwned.size).toBe(2);
  } else { expect(failure).toBeDefined(); expect(refs).toBe(""); expect(protocolOwned.size).toBe(0); }
}, 20_000);

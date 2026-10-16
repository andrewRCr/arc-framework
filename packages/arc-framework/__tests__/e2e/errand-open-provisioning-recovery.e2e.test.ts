/** Real interruption, preservation refusals, and retry of transient provisioning. */

import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc, runArcAnchored } from "./helpers.js";

const execFileAsync = promisify(execFile);
const RECOVERY_TIMEOUT_MS = 90_000;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

it.runIf(process.platform !== "win32")("recovers the same clean claim after its provisioning process is killed", async () => {
  const primary = await createTempRepo("arc-open-recovery-");
  const remote = `${primary}-remote.git`;
  let spawned: string | null = null;
  const git = async (args: string[], cwd = primary) =>
    (await execFileAsync("git", args, { cwd })).stdout.trim();
  try {
    const init = await runArc(["init", "--yes", "--name", "test-project"], primary);
    expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    const control = join(primary, ".arc", "user", "test-user", ".internal");
    await mkdir(control, { recursive: true });
    const interruptedPath = join(control, "provision-interrupted");
    const completedPath = join(control, "provision-completed");
    const script = `if [ ! -e ${shellQuote(interruptedPath)} ]; then `
      + `printf interrupted > ${shellQuote(interruptedPath)}; kill -KILL "$PPID"; exit 0; fi; `
      + `printf completed >> ${shellQuote(completedPath)}`;
    await mkdir(join(primary, "scripts"), { recursive: true });
    await writeFile(join(primary, "scripts", "interrupt-provisioning.sh"), `${script}\n`, "utf8");
    const configPath = join(primary, ".arc", "system", "arc-config.yml");
    const original = await readFile(configPath, "utf8");
    let config = original.replace("branch.protection: partial", "branch.protection: full");
    const setup = "worktree.post_create: . scripts/interrupt-provisioning.sh";
    config = /^worktree.post_create:/mu.test(config)
      ? config.replace(/^worktree.post_create:.*$/mu, setup)
      : `${config}\n${setup}\n`;
    await writeFile(configPath, config, "utf8");
    await git(["add", "-A"]);
    const base = await git(["commit-tree", await git(["write-tree"]), "-m", "initialized fixture"]);
    await git(["update-ref", "HEAD", base]);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(["remote", "add", "origin", remote]);
    await git(["push", "-u", "origin", "main"]);

    const args = ["errand", "open", "recover-setup", "--isolate", "--json"];
    const interrupted = await runArcAnchored(args, primary);
    expect(interrupted.exitCode, interrupted.stdout + interrupted.stderr).not.toBe(0);
    await access(interruptedPath);
    const claim = JSON.parse(await git(["cat-file", "-p", "refs/arc/user/test-user/errands:recover-setup"])) as {
      claimId: string;
    };
    const status = await runArc(["status", "--session-init", "--json"], primary);
    const before = JSON.parse(status.stdout) as {
      locusGuidance: unknown;
      derivedLocusState: { value: { roster: Array<{
        kind: string; checkout: { path: string; branch: string }; diagnostics: Array<{ message: string }>;
      }> } };
    };
    const stranded = before.derivedLocusState.value.roster.find((row) => row.checkout.branch === "chore/recover-setup");
    expect(stranded).toMatchObject({ kind: "unresolved-checkout" });
    if (stranded === undefined) throw new Error("Missing interrupted checkout");
    spawned = stranded.checkout.path;
    const markerPath = join(spawned, ".arc", "system", ".internal", "worktree-marker.json");
    const pendingBytes = await readFile(markerPath, "utf8");
    expect(JSON.parse(pendingBytes)).toMatchObject({ provisioning: "pending", createdFor: { claimId: claim.claimId } });

    const childConfigPath = join(spawned, ".arc", "system", "arc-config.yml");
    const childConfig = await readFile(childConfigPath, "utf8");
    await writeFile(childConfigPath, `${childConfig}\n# authored change\n`, "utf8");
    const dirty = await runArcAnchored(args, primary);
    expect(dirty.exitCode).not.toBe(0);
    expect(await readFile(childConfigPath, "utf8")).toBe(`${childConfig}\n# authored change\n`);
    expect(await readFile(markerPath, "utf8")).toBe(pendingBytes);
    await writeFile(childConfigPath, childConfig, "utf8");

    const ownHead = await git(["commit-tree", await git(["rev-parse", "HEAD^{tree}"], spawned),
      "-p", base, "-m", "unpublished result"], spawned);
    await git(["update-ref", "HEAD", ownHead, base], spawned);
    const unpreserved = await runArcAnchored(args, primary);
    expect(unpreserved.exitCode).not.toBe(0);
    expect(await git(["rev-parse", "HEAD"], spawned)).toBe(ownHead);
    expect(await readFile(markerPath, "utf8")).toBe(pendingBytes);
    await git(["update-ref", "refs/heads/main", ownHead, base]);
    await git(["push", "origin", "main"]);

    const retry = await runArcAnchored(args, primary);
    expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
    expect(JSON.parse(retry.stdout)).toMatchObject({
      outcome: "applied", operation: "errand-open",
      subject: { key: "recover-setup", claimId: claim.claimId },
      allocation: { checkoutPath: spawned },
    });
    expect(JSON.parse(await readFile(markerPath, "utf8"))).toMatchObject({ provisioning: "ready" });
    expect(await readFile(completedPath, "utf8")).toBe("completed");
    expect(JSON.stringify(before.locusGuidance)).toContain("arc errand open recover-setup --isolate --json");
  } finally {
    if (spawned !== null) {
      await git(["worktree", "remove", "--force", spawned]).catch(() => undefined);
      await cleanupTempDir(spawned);
    }
    await cleanupTempDir(primary);
    await cleanupTempDir(remote);
  }
}, RECOVERY_TIMEOUT_MS);

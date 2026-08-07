/** Built-command coverage for stateful locus companions. */

import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";
import { deriveLocusRecordId } from "../../src/lib/locus/path-identity.js";
import { cleanupTempDir, createTempRepo, git, removeGitBackedDir, runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("arc locus mutation commands", () => {
  let repository: string;
  let linkedCheckout: string | null;
  let remote: string | null;

  beforeEach(async () => {
    repository = await createTempRepo();
    linkedCheckout = null;
    remote = null;
    const initialized = await runArc(["init", "--yes", "--name", "locus-mutation-fixture"], repository);
    expect(initialized.exitCode).toBe(0);
    await git(repository, ["config", "arc.identity", "test-user"]);
    const configPath = join(repository, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"), "utf8");
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    if (linkedCheckout !== null) {
      await git(repository, ["worktree", "remove", "--force", linkedCheckout]).catch(() => undefined);
    }
    await cleanupTempDir(repository);
    if (remote !== null) await removeGitBackedDir(remote);
  });

  it("adopts a trusted directed transient checkout and releases only its exact lease", async () => {
    const slug = "adopted-residue";
    const claimId = "d".repeat(32);
    linkedCheckout = join(repository, ".fixture-worktrees", slug);
    await git(repository, ["worktree", "add", "-b", `chore/${slug}`, linkedCheckout, "main"]);
    await seedOpenErrandIdentity(repository, slug, claimId);
    const markerPath = join(linkedCheckout, ".arc", "system", ".internal", "worktree-marker.json");
    await mkdir(join(linkedCheckout, ".arc", "system", ".internal"), { recursive: true });
    await writeFile(markerPath, `${JSON.stringify({
      spawnedByArc: true,
      spawningIdentity: "test-user",
      createdAt: "2026-07-21T00:00:00.000Z",
      createdFor: { kind: "errand", slug, claimId },
      provisioning: "ready",
    })}\n`, "utf8");
    const nested = join(repository, "nested", "command-cwd");
    await mkdir(nested, { recursive: true });

    const attached = await runAnchored(["locus", "attach", "--checkout", linkedCheckout, "--json"], nested);
    expect(attached.exitCode, attached.stdout + attached.stderr).toBe(0);
    const attachment = JSON.parse(attached.stdout.trim()) as { recordId: string; leaseId: string };
    expect(attachment).toMatchObject({ outcome: "applied", operation: "locus-attach" });
    expect(attachment.recordId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(attachment.leaseId).toMatch(/^[0-9a-f]{32,}$/u);

    const mismatch = await runAnchored([
      "locus", "release", attachment.recordId, "--lease", "e".repeat(32), "--json",
    ], nested);
    expect(mismatch.exitCode).toBe(1);
    expect(JSON.parse(mismatch.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "locus-release",
      reason: "lease-generation-mismatch",
    });

    const released = await runAnchored([
      "locus", "release", attachment.recordId, "--lease", attachment.leaseId, "--json",
    ], nested);
    expect(released.exitCode, released.stdout + released.stderr).toBe(0);
    expect(JSON.parse(released.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "locus-release",
      recordId: attachment.recordId,
      leaseId: null,
    });

    const replayed = await runAnchored([
      "locus", "release", attachment.recordId, "--lease", attachment.leaseId, "--json",
    ], nested);
    expect(replayed.exitCode, replayed.stdout + replayed.stderr).toBe(0);
    expect(JSON.parse(replayed.stdout.trim())).toMatchObject({
      outcome: "idempotent",
      operation: "locus-release",
      recordId: attachment.recordId,
      leaseId: null,
    });
  });

  it("adopts an exact marker-and-meta work-unit role", async () => {
    const slug = "adopted-work-unit";
    linkedCheckout = join(repository, ".fixture-worktrees", slug);
    await git(repository, ["worktree", "add", "-b", `feat/${slug}`, linkedCheckout, "main"]);
    await mkdir(join(linkedCheckout, ".arc", "active"), { recursive: true });
    await writeFile(join(linkedCheckout, ".arc", "active", `meta-${slug}.md`), [
      `# Metadata: ${slug}`,
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      `- **Branch:** feat/${slug}`,
      "- **Class:** Light",
      "- **Cohort:** [none]",
      "- **Task List:** [none]",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Blockers:** [none]",
      "- **Next Action:** Continue execution",
      "",
    ].join("\n"), "utf8");
    await mkdir(join(linkedCheckout, ".arc", "system", ".internal"), { recursive: true });
    await writeFile(
      join(linkedCheckout, ".arc", "system", ".internal", "worktree-marker.json"),
      `${JSON.stringify({
        spawnedByArc: true,
        spawningIdentity: "test-user",
        createdAt: "2026-07-21T00:00:00.000Z",
        createdFor: { kind: "work-unit", name: slug },
      })}\n`,
      "utf8",
    );

    const attached = await runAnchoredSequence([
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
    ], repository);
    expect(attached.exitCode, attached.stdout + attached.stderr).toBe(0);
    expect(attached.results).toHaveLength(2);
    expect(attached.results[0]).toMatchObject({
      outcome: "applied",
      operation: "locus-attach",
      identity: null,
      activeLocusPath: linkedCheckout,
    });
    expect(attached.results[1]).toMatchObject({
      outcome: "idempotent",
      operation: "locus-attach",
      activeLocusPath: linkedCheckout,
    });

    const first = attached.results[0] as { recordId: string; leaseId: string };
    const recovered = await runAnchoredSequence([
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
      ["status", "--session-handoff", "--json"],
    ], repository);
    expect(recovered.exitCode, recovered.stdout + recovered.stderr).toBe(0);
    expect(recovered.results).toHaveLength(2);
    const replacement = recovered.results[0] as { recordId: string; leaseId: string };
    expect(replacement).toMatchObject({
      outcome: "applied",
      operation: "locus-attach",
      recordId: first.recordId,
    });
    expect(replacement.leaseId).not.toBe(first.leaseId);
    const handoff = recovered.results[1];
    expect(handoff).toMatchObject({
      mode: "session-handoff",
      handoffLocus: {
        ok: true,
        value: {
          checkoutPath: repository,
        },
      },
    });
    expect(JSON.stringify(handoff)).not.toContain("recordId");
    expect(JSON.stringify(handoff)).not.toContain("leaseId");

    const released = await runAnchored([
      "locus", "release", replacement.recordId, "--lease", replacement.leaseId, "--json",
    ], repository);
    expect(released.exitCode, released.stdout + released.stderr).toBe(0);
    expect(JSON.parse(released.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "locus-release",
      recordId: replacement.recordId,
      leaseId: null,
    });
  });

  it("refuses markerless primary adoption before minting an unverifiable lease", async () => {
    const slug = "primary-work-unit";
    await git(repository, ["switch", "-c", `feat/${slug}`]);
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, ".arc", "active", `meta-${slug}.md`), [
      `# Metadata: ${slug}`,
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      `- **Branch:** feat/${slug}`,
      "- **Class:** Light",
      "- **Cohort:** [none]",
      "- **Task List:** [none]",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Blockers:** [none]",
      "- **Next Action:** Continue execution",
      "",
    ].join("\n"), "utf8");

    const refused = await runCli(["locus", "attach", "--json"], { cwd: repository });
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "locus-attach",
      reason: "lease-unknown",
    });
    const lociRoot = join(repository, ".arc", "user", "test-user", ".internal", "loci");
    expect((await readdir(lociRoot).catch(() => [])).filter((name) => name.endsWith(".json")))
      .toHaveLength(0);
  });

  it("materializes a remote-only paused Errand with exact provenance", async () => {
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    const errand = "remote-errand";
    const errandBranch = `chore/${errand}`;
    const claimId = "e".repeat(32);
    await git(repository, ["switch", "-c", errandBranch, "main"]);
    const expectedHead = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await git(repository, ["push", "origin", errandBranch]);
    await seedPausedErrandIdentity(repository, errand, claimId, expectedHead);
    await git(repository, ["push", "origin", "refs/arc/user/test-user/errands:refs/arc/user/test-user/errands"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", errandBranch]);
    await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);

    const discovered = await runAnchored(["status", "--session-init", "--json"], repository);
    expect(discovered.exitCode, discovered.stdout + discovered.stderr).toBe(0);
    expect(JSON.parse(discovered.stdout.trim())).toMatchObject({
      errandState: {
        ok: true,
        value: {
          materializable: {
            candidates: [{ slug: errand, claimId, branch: errandBranch, expectedHead }],
          },
        },
      },
    });
    await expect(git(repository, ["rev-parse", "--verify", "refs/arc/user/test-user/errands"]))
      .rejects.toThrow();
    expect(await git(repository, ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/transient-discovery/"]))
      .toBe("");
    await git(repository, ["update-ref", `refs/heads/${errandBranch}`, expectedHead]);

    const materialized = await runAnchored([
      "errand", "materialize", errand,
      "--claim-id", claimId,
      "--expected-head", expectedHead,
      "--json",
    ], repository);
    expect(materialized.exitCode, materialized.stdout + materialized.stderr).toBe(0);
    const result = JSON.parse(materialized.stdout.trim()) as {
      allocation: { checkoutPath: string };
      identity: { claimId: string; state: string };
    };
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-materialize",
      allocation: { kind: "spawned" },
      identity: { claimId, state: "open" },
    });
    linkedCheckout = result.allocation.checkoutPath;
    expect(await readMarker(linkedCheckout)).toMatchObject({
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: errand, claimId },
      provisioning: "ready",
    });
  });

  it("preserves the prepared branch when failed provisioning leaves a linked checkout", async () => {
    remote = await createBareRemote(repository);
    const configPath = join(repository, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace('worktree.post_create: ""', "worktree.post_create: sh fail-materialize-setup.sh"),
      "utf8",
    );
    await writeFile(
      join(repository, "fail-materialize-setup.sh"),
      "#!/bin/sh\ntouch provisioning-residue\nexit 1\n",
      "utf8",
    );
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "configure failing materialization setup"]);
    await git(repository, ["push", "-u", "origin", "main"]);

    const errand = "retained-materialization";
    const errandBranch = `chore/${errand}`;
    const claimId = "9".repeat(32);
    await git(repository, ["switch", "-c", errandBranch, "main"]);
    const expectedHead = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await git(repository, ["push", "origin", errandBranch]);
    await seedPausedErrandIdentity(repository, errand, claimId, expectedHead);
    await git(repository, ["push", "origin", "refs/arc/user/test-user/errands:refs/arc/user/test-user/errands"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", errandBranch]);
    await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);
    linkedCheckout = join(
      dirname(repository),
      `${basename(repository)}.locus-errand-${errand}-${claimId}`,
    );

    const materialized = await runAnchored([
      "errand", "materialize", errand,
      "--claim-id", claimId,
      "--expected-head", expectedHead,
      "--json",
    ], repository);

    expect(materialized.exitCode).toBe(1);
    expect(JSON.parse(materialized.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-materialize",
      error: { code: "locus.errand-open.provision" },
    });
    expect((await git(repository, ["rev-parse", `refs/heads/${errandBranch}`])).trim()).toBe(expectedHead);
    expect(await checkoutForBranch(repository, errandBranch)).toBe(linkedCheckout);
    expect(JSON.parse(await git(repository, [
      "cat-file", "-p", `refs/arc/user/test-user/errands:${errand}`,
    ]))).toMatchObject({ claimId, state: "open" });
  });

  it("refuses a materialize request pinned to a stale Errand generation", async () => {
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    const errand = "stale-selected-errand";
    const errandBranch = `chore/${errand}`;
    const claimId = "d".repeat(32);
    await git(repository, ["switch", "-c", errandBranch, "main"]);
    const expectedHead = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await git(repository, ["push", "origin", errandBranch]);
    await seedPausedErrandIdentity(repository, errand, claimId, expectedHead);
    await git(repository, ["push", "origin", "refs/arc/user/test-user/errands:refs/arc/user/test-user/errands"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", errandBranch]);
    await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);

    const materialized = await runAnchored([
      "errand", "materialize", errand,
      "--claim-id", "f".repeat(32),
      "--expected-head", expectedHead,
      "--json",
    ], repository);

    expect(materialized.exitCode).toBe(1);
    expect(JSON.parse(materialized.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-materialize",
      reason: "identity-conflict",
    });
    expect(await git(repository, ["branch", "--list", errandBranch])).toBe("");
    expect(await checkoutForBranch(repository, errandBranch)).toBeNull();
  });

  it.each([
    { label: "exact awaiting-merge", observedHead: "exact", expectedExit: 0 },
    { label: "moved awaiting-merge head", observedHead: "moved", expectedExit: 1 },
  ] as const)("materializes or rolls back an $label identity", async ({ observedHead, expectedExit }) => {
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    const slug = `review-${observedHead}`;
    const branch = `chore/${slug}`;
    const claimId = observedHead === "exact" ? "a".repeat(32) : "b".repeat(32);
    await git(repository, ["switch", "-c", branch, "main"]);
    const expectedHead = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await git(repository, ["push", "origin", branch]);
    await seedAwaitingErrandIdentity(repository, slug, claimId, expectedHead);
    await git(repository, ["push", "origin", "refs/arc/user/test-user/errands:refs/arc/user/test-user/errands"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", branch]);
    await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);

    const hostHarness = await mkdtemp(join(tmpdir(), "arc-materialize-gh-"));
    const fakeGh = join(hostHarness, "gh");
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$ARC_TEST_BRANCH\" \"$ARC_TEST_HEAD\"",
      "printf '\"reviewDecision\":\"\"}]\\n'",
    ].join("\n"));
    await execFileAsync("chmod", ["+x", fakeGh]);
    const hostUrl = "https://github.com/owner/repo.git";
    await git(repository, ["remote", "set-url", "origin", hostUrl]);
    await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);
    try {
      const result = await runAnchored(["errand", "materialize", slug, "--json"], repository, {
        PATH: `${hostHarness}:${process.env.PATH ?? ""}`,
        ARC_TEST_BRANCH: branch,
        ARC_TEST_HEAD: observedHead === "exact" ? expectedHead : "f".repeat(40),
      });
      expect(result.exitCode, result.stdout + result.stderr).toBe(expectedExit);
      const payload = JSON.parse(result.stdout.trim());
      if (expectedExit === 0) {
        expect(payload).toMatchObject({
          outcome: "applied",
          operation: "errand-materialize",
          identity: { claimId, state: "open" },
        });
        linkedCheckout = payload.allocation.checkoutPath as string;
      } else {
        expect(payload).toMatchObject({
          outcome: "refused",
          operation: "errand-materialize",
          reason: "change-request-unverifiable",
        });
        expect(await git(repository, ["branch", "--list", branch])).toBe("");
        expect(await checkoutForBranch(repository, branch)).toBeNull();
      }
    } finally {
      await removeGitBackedDir(hostHarness);
    }
  });

  it("refuses a confirmed identity-backed primary Errand after topology stops corroborating it", async () => {
    const slug = "confirmed-primary";
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);

    const cli = [process.execPath, CLI_PATH].map(shellQuote).join(" ");
    const recordId = deriveLocusRecordId(
      repository,
      process.platform === "win32" ? "windows" : "posix",
    ).recordId;
    const resolved = await runAnchoredCommands([
      `open_result=$(${cli} errand open ${slug} --json); printf '%s\\n' "$open_result"`,
      "git switch main >/dev/null",
      `${cli} locus resolve "${recordId}" --action abandon --confirm-no-live-session --json`,
    ], repository);

    expect(resolved.exitCode, JSON.stringify(resolved)).toBe(1);
    expect(resolved.results).toHaveLength(2);
    expect(resolved.results[1]).toMatchObject({
      outcome: "refused",
      operation: "locus-resolve",
      reason: "identity-conflict",
    });
    expect(await git(repository, ["branch", "--show-current"])).toBe("main");
    expect(await git(repository, ["branch", "--list", `chore/${slug}`])).toContain(`chore/${slug}`);
    expect(await git(repository, ["cat-file", "-p", `refs/arc/user/test-user/errands:${slug}`]))
      .toContain(`"slug": "${slug}"`);
  });

  it("releases an identity-retired primary Errand from its self-held session", async () => {
    const slug = "retired-primary";
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    const otherSlug = "unrelated-work-unit";
    linkedCheckout = join(tmpdir(), `arc-locus-unrelated-${basename(repository)}`);
    await git(repository, ["worktree", "add", "-b", `feat/${otherSlug}`, linkedCheckout, "main"]);
    await writeWorkUnitMeta(linkedCheckout, otherSlug, `feat/${otherSlug}`);
    await mkdir(join(linkedCheckout, ".arc", "system", ".internal"), { recursive: true });
    await writeFile(
      join(linkedCheckout, ".arc", "system", ".internal", "worktree-marker.json"),
      `${JSON.stringify({
        spawnedByArc: true,
        spawningIdentity: "test-user",
        createdAt: "2026-07-21T00:00:00.000Z",
        createdFor: { kind: "work-unit", name: otherSlug },
      })}\n`,
      "utf8",
    );
    const unrelated = await runAnchored(
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
      repository,
    );
    expect(unrelated.exitCode, unrelated.stdout + unrelated.stderr).toBe(0);
    const unrelatedResult = JSON.parse(unrelated.stdout.trim()) as { recordId: string };
    const unrelatedRecordPath = await findLocusRecordPath(repository, unrelatedResult.recordId);
    const unrelatedRecordBefore = await readFile(unrelatedRecordPath, "utf8");
    expect(await git(repository, ["status", "--porcelain"])).toBe("");

    const cli = [process.execPath, CLI_PATH].map(shellQuote).join(" ");
    const recordId = deriveLocusRecordId(
      repository,
      process.platform === "win32" ? "windows" : "posix",
    ).recordId;
    const resolved = await runAnchoredCommands([
      `open_result=$(${cli} errand open ${slug} --json); printf '%s\\n' "$open_result"`,
      "git push origin :refs/arc/user/test-user/errands >/dev/null",
      "git update-ref -d refs/arc/user/test-user/errands",
      "git switch main >/dev/null",
      `git branch -D chore/${slug} >/dev/null`,
      `${cli} locus resolve "${recordId}" --action abandon --confirm-no-live-session --json`,
    ], repository);

    expect(resolved.exitCode, JSON.stringify(resolved)).toBe(0);
    expect(resolved.results).toHaveLength(2);
    expect(resolved.results[0]).toMatchObject({
      outcome: "applied",
      operation: "errand-open",
      allocation: { kind: "primary", checkoutPath: repository },
    });
    expect(resolved.results[1]).toMatchObject({
      outcome: "applied",
      operation: "locus-resolve",
      recordId: null,
      leaseId: null,
    });
    const remainingRecords = (await readdir(
      join(repository, ".arc", "user", "test-user", ".internal", "loci"),
    )).filter((name) => name.endsWith(".json"));
    expect(remainingRecords).toHaveLength(1);
    expect(await readFile(unrelatedRecordPath, "utf8")).toBe(unrelatedRecordBefore);
  });

  it("resumes an exact unknown Errand lease only after operator confirmation", async () => {
    const slug = "unverifiable-primary";
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);

    const opened = await runAnchored(["errand", "open", slug, "--json"], repository);
    expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
    const openResult = JSON.parse(opened.stdout.trim());
    expect(openResult).not.toHaveProperty("recordId");
    expect(openResult).not.toHaveProperty("leaseId");
    const recordId = deriveLocusRecordId(
      repository,
      process.platform === "win32" ? "windows" : "posix",
    ).recordId;
    const recordPath = await findLocusRecordPath(repository, recordId);
    const record = JSON.parse(await readFile(recordPath, "utf8")) as {
      lease: { anchor: unknown; leaseId: string };
    };
    const openingLeaseId = record.lease.leaseId;
    record.lease.anchor = { kind: "unverifiable", reason: "fixture cannot inspect the opening session" };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    const unknownBytes = await readFile(recordPath, "utf8");
    expect(JSON.parse(unknownBytes)).toMatchObject({
      lease: { anchor: { kind: "unverifiable" } },
    });

    const unconfirmed = await runAnchored([
      "locus", "resolve", recordId, "--action", "resume", "--json",
    ], repository);
    expect(unconfirmed.exitCode).toBe(1);
    expect(JSON.parse(unconfirmed.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "locus-resolve",
      reason: "lease-unknown",
    });
    expect(await readFile(recordPath, "utf8")).toBe(unknownBytes);

    const resolved = await runAnchored([
      "locus", "resolve", recordId, "--action", "resume",
      "--confirm-no-live-session", "--json",
    ], repository);

    expect(resolved.exitCode, resolved.stdout + resolved.stderr).toBe(0);
    const resolution = JSON.parse(resolved.stdout.trim()) as { leaseId: string };
    expect(resolution).toMatchObject({
      outcome: "applied",
      operation: "locus-resolve",
      recordId,
      activeLocusPath: repository,
    });
    expect(resolution.leaseId).not.toBe(openingLeaseId);
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toMatchObject({
      lease: { leaseId: resolution.leaseId, anchor: { kind: "process" } },
    });
  });

  it("preserves the ordinary dead-lease exit without requiring confirmation", async () => {
    const slug = "dead-primary";
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);

    const opened = await runAnchored(["errand", "open", slug, "--json"], repository);
    expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
    expect(JSON.parse(opened.stdout.trim())).not.toHaveProperty("recordId");
    const recordId = deriveLocusRecordId(
      repository,
      process.platform === "win32" ? "windows" : "posix",
    ).recordId;
    const recordPath = await findLocusRecordPath(repository, recordId);

    await git(repository, ["push", "origin", ":refs/arc/user/test-user/errands"]);
    await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", `chore/${slug}`]);
    const resolved = await runAnchored([
      "locus", "resolve", recordId, "--action", "abandon", "--json",
    ], repository);

    expect(resolved.exitCode, resolved.stdout + resolved.stderr).toBe(0);
    expect(JSON.parse(resolved.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "locus-resolve",
      recordId: null,
      leaseId: null,
    });
    await expect(readFile(recordPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses confirmation while another live session holds the exact lease", async () => {
    const slug = "foreign-live-primary";
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    const cli = [process.execPath, CLI_PATH].map(shellQuote).join(" ");
    const holder = runAnchoredCommands([
      `${cli} errand open ${slug} --json`,
      "sleep 8",
    ], repository);

    const recordPath = await waitForLeasedLocusRecordPath(repository);
    const recordBefore = await readFile(recordPath, "utf8");
    const record = JSON.parse(recordBefore) as { recordId: string };
    try {
      await git(repository, ["push", "origin", ":refs/arc/user/test-user/errands"]);
      await git(repository, ["update-ref", "-d", "refs/arc/user/test-user/errands"]);
      await git(repository, ["switch", "main"]);
      await git(repository, ["branch", "-D", `chore/${slug}`]);
      const resolved = await runAnchored([
        "locus", "resolve", record.recordId, "--action", "abandon",
        "--confirm-no-live-session", "--json",
      ], repository);

      expect(resolved.exitCode).toBe(1);
      expect(JSON.parse(resolved.stdout.trim())).toMatchObject({
        outcome: "refused",
        operation: "locus-resolve",
        reason: "lease-live",
      });
      expect(await readFile(recordPath, "utf8")).toBe(recordBefore);
    } finally {
      await holder;
    }
  });

  it("materializes a remote-only work-unit with exact provenance", async () => {
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);

    const workUnit = "remote-work-unit";
    const workUnitBranch = `feat/${workUnit}`;
    await git(repository, ["switch", "-c", workUnitBranch]);
    await writeWorkUnitMeta(repository, workUnit, workUnitBranch);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "add remote work unit"]);
    await git(repository, ["push", "origin", workUnitBranch]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["branch", "-D", workUnitBranch]);

    const materializedWorkUnit = await runArc(["materialize", workUnit], repository);
    expect(materializedWorkUnit.exitCode, materializedWorkUnit.stdout + materializedWorkUnit.stderr).toBe(0);
    expect(materializedWorkUnit.stdout).toContain(`Work unit: ${workUnit}`);
    linkedCheckout = await checkoutForBranch(repository, workUnitBranch);
    expect(linkedCheckout).not.toBeNull();
    expect(await readMarker(linkedCheckout as string)).toMatchObject({
      spawnedByArc: true,
      createdFor: { kind: "work-unit", name: workUnit },
    });
  });

  it("keeps operational JSON on stdout and exposes the exact public operands", async () => {
    const help = await runCli(["locus", "release", "--help"], { cwd: repository });
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("release [options] <record-id>");
    expect(help.stdout).toContain("--lease <id>");

    const invalid = await runCli([
      "locus", "resolve", `sha256:${"1".repeat(64)}`, "--action", "erase", "--json",
    ], { cwd: repository });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toBe("");
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      outcome: "error",
      operation: "locus-resolve",
      error: { code: "locus.locus-resolve.input" },
    });
  });
});

async function seedOpenErrandIdentity(cwd: string, slug: string, claimId: string): Promise<void> {
  const record = {
    version: 3,
    slug,
    claimId,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch: `chore/${slug}`,
    origin: "description",
    originEntry: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = await git(cwd, ["commit-tree", tree, "-m", `seed ${slug}`]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

async function seedPausedErrandIdentity(
  cwd: string,
  slug: string,
  claimId: string,
  savedHead: string,
): Promise<void> {
  const record = {
    version: 3,
    slug,
    claimId,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch: `chore/${slug}`,
    origin: "description",
    originEntry: null,
    state: "paused",
    savedHead,
    changeRequest: null,
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = await git(cwd, ["commit-tree", tree, "-m", `seed ${slug}`]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

async function seedAwaitingErrandIdentity(
  cwd: string,
  slug: string,
  claimId: string,
  headSha: string,
): Promise<void> {
  const branch = `chore/${slug}`;
  const record = {
    version: 3,
    slug,
    claimId,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch,
    origin: "description",
    originEntry: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: branch,
      headSha,
    },
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = await git(cwd, ["commit-tree", tree, "-m", `seed ${slug}`]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

async function createBareRemote(cwd: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "arc-locus-materialize-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", path]);
  await git(cwd, ["remote", "add", "origin", path]);
  return path;
}

async function writeWorkUnitMeta(cwd: string, slug: string, branch: string): Promise<void> {
  await mkdir(join(cwd, ".arc", "active"), { recursive: true });
  await writeFile(join(cwd, ".arc", "active", `meta-${slug}.md`), [
    `# Metadata: ${slug}`,
    "",
    "- **State:** Active",
    "- **Owner:** test-user",
    `- **Branch:** ${branch}`,
    "- **Class:** Light",
    "- **Cohort:** [none]",
    "- **Task List:** [none]",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** [none]",
    "- **Next Task:** [none]",
    "- **Blockers:** [none]",
    "- **Next Action:** Continue execution",
    "",
  ].join("\n"), "utf8");
}

async function checkoutForBranch(cwd: string, branch: string): Promise<string | null> {
  const output = await git(cwd, ["worktree", "list", "--porcelain"]);
  const blocks = output.trim().split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n");
    if (!lines.includes(`branch refs/heads/${branch}`)) continue;
    return lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length) ?? null;
  }
  return null;
}

async function readMarker(cwd: string): Promise<unknown> {
  return JSON.parse(await readFile(join(cwd, ".arc", "system", ".internal", "worktree-marker.json"), "utf8"));
}

async function findLocusRecordPath(cwd: string, recordId: string): Promise<string> {
  const root = join(cwd, ".arc", "user", "test-user", ".internal", "loci");
  for (const name of await readdir(root)) {
    if (!name.endsWith(".json")) continue;
    const path = join(root, name);
    const record = JSON.parse(await readFile(path, "utf8")) as { recordId?: string };
    if (record.recordId === recordId) return path;
  }
  throw new Error(`Could not find locus record ${recordId}`);
}

async function waitForLeasedLocusRecordPath(cwd: string): Promise<string> {
  const root = join(cwd, ".arc", "user", "test-user", ".internal", "loci");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const names = await readdir(root).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith(".json"))) {
      const path = join(root, name);
      const record = JSON.parse(await readFile(path, "utf8")) as { lease?: unknown };
      if (record.lease !== null && record.lease !== undefined) return path;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the leased session locus record.");
}

function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", rejectResult);
    child.on("close", (code) => code === 0
      ? resolveResult(stdout)
      : rejectResult(new Error(`git ${args.join(" ")} failed: ${stderr}`)));
    child.stdin.end(input);
  });
}

async function runAnchored(args: string[], cwd: string, extraEnv: Readonly<Record<string, string>> = {}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const command = [process.execPath, CLI_PATH, ...args].map(shellQuote).join(" ");
  const interactiveCommand = `${command}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellQuote(interactiveCommand)}`, "/dev/null"],
      { cwd, env: { ...process.env, ...extraEnv, NO_COLOR: "1", PS1: "" } },
    );
    return { stdout: normalizeAnchoredOutput(stdout), stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: normalizeAnchoredOutput(failure.stdout ?? ""),
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

async function runAnchoredSequence(argsList: readonly string[][], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  results: unknown[];
}> {
  const commands = argsList.map((args) => [process.execPath, CLI_PATH, ...args].map(shellQuote).join(" "));
  return runAnchoredCommands(commands, cwd);
}

async function runAnchoredCommands(commands: readonly string[], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  results: unknown[];
}> {
  const interactiveCommand = `${commands.join("; ")}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellQuote(interactiveCommand)}`, "/dev/null"],
      { cwd, env: { ...process.env, NO_COLOR: "1", PS1: "" } },
    );
    const normalized = normalizeAnchoredOutput(stdout);
    return { stdout: normalized, stderr, exitCode: 0, results: parseJsonLines(normalized) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    const normalized = normalizeAnchoredOutput(failure.stdout ?? "");
    return {
      stdout: normalized,
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      results: parseJsonLines(normalized),
    };
  }
}

function parseJsonLines(output: string): unknown[] {
  return output.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

function normalizeAnchoredOutput(value: string): string {
  return value.replaceAll("\r", "").split("\n").filter((line) => line !== "exit").join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

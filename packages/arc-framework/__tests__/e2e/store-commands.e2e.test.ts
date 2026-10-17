/** Explicit hidden store commands through the packaged CLI. */

import { expect, it, onTestFinished } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

it("shows the physical store and remote roles as JSON through the real command", async () => {
  const cwd = await createTempRepo("arc-store-commands-");
  onTestFinished(() => cleanupTempDir(cwd));
  const result = await runArcNoTty(["store", "remote", "--json"], cwd);
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ status: "ok", result: { layout: "default", remotes: [] } });
});

it("preserves roles when the backing pointer is unreadable and continues after repair", async () => {
  const cwd = await createTempRepo("arc-store-config-read-");
  onTestFinished(() => cleanupTempDir(cwd));
  const config = join(cwd, ".arc", "system", "arc-config.yml");
  await mkdir(config, { recursive: true });
  await git(cwd, ["remote", "add", "origin", `${cwd}/code.git`]);
  await git(cwd, ["config", "remote.origin.arc-state", "off"]);
  const result = await runArcNoTty(["store", "remote", "origin", "push", "--json"], cwd);
  expect(result.exitCode, JSON.stringify(result)).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toContain("Restore a readable arc-config.yml");
  expect(await git(cwd, ["config", "remote.origin.arc-state"])).toBe("off");
  await rm(config, { recursive: true });
  await writeFile(config, 'storage.backing_repository: "https://example.invalid/repaired-state.git"\n');
  const repaired = await runArcNoTty(["store", "remote", "origin", "push", "--json"], cwd);
  expect(repaired.exitCode).toBe(1);
  expect(JSON.parse(repaired.stdout)).toMatchObject({ status: "confirmation-needed", repository: "https://example.invalid/repaired-state.git" });
  expect(await git(cwd, ["config", "remote.origin.arc-state"])).toBe("off");
  const accepted = await runArcNoTty(["store", "remote", "origin", "push", "--own-state", "--json"], cwd);
  expect(accepted.exitCode, JSON.stringify(accepted)).toBe(0);
  expect(await git(cwd, ["config", "remote.origin.arc-state"])).toBe("push");
});

it("reads the invoking checkout's backing pointer when launched from a subdirectory", async () => {
  const cwd = await createTempRepo("arc-store-nested-");
  onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc", "system"), { recursive: true });
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"), 'storage.backing_repository: "https://example.invalid/root-state.git"\n');
  await git(cwd, ["remote", "add", "origin", `${cwd}/code.git`]);
  await git(cwd, ["config", "remote.origin.arc-state", "off"]);
  const nested = join(cwd, "nested"); await mkdir(nested);
  const result = await runArcNoTty(["store", "remote", "origin", "push", "--json"], nested);
  expect(result.exitCode).toBe(1);
  expect(result.stdout, JSON.stringify(result)).toContain('"confirmation-needed"');
  expect(JSON.parse(result.stdout)).toMatchObject({ repository: "https://example.invalid/root-state.git" });
  expect(await git(cwd, ["config", "remote.origin.arc-state"])).toBe("off");
});

it.each([{ args: ["remote", "origin", "other"] }, { args: ["migrate", "--to", ""] }])("returns invalid $args inputs as a typed JSON refusal", async ({ args }) => {
  const cwd = await createTempRepo("arc-store-invalid-");
  onTestFinished(() => cleanupTempDir(cwd));
  const result = await runArcNoTty(["store", ...args, "--json"], cwd);
  expect(result.exitCode).toBe(1);
  expect(result.stdout, JSON.stringify(result)).toContain('"request-invalid"');
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "request-invalid", class: "terminal",
    condition: expect.any(String), remedy: { text: expect.stringContaining("--help") } } });
});

it("requires own-state without a terminal and applies its explicit answer in JSON mode", async () => {
  const cwd = await createTempRepo("arc-store-confirmation-");
  onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc", "system"), { recursive: true });
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"), 'storage.backing_repository: "https://example.invalid/project-state.git"\n');
  await git(cwd, ["remote", "add", "origin", `${cwd}/code.git`]);
  await git(cwd, ["config", "remote.origin.arc-state", "off"]);
  const before = await git(cwd, ["config", "--local", "--null", "--list"]);
  const result = await runArcNoTty(["store", "remote", "origin", "push", "--json"], cwd);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "confirmation-needed", repository: "https://example.invalid/project-state.git",
    condition: expect.stringContaining("everything"), remedy: { argv: ["arc", "store", "remote", "origin", "push", "--own-state"] } });
  expect(await git(cwd, ["config", "--local", "--null", "--list"])).toBe(before);
  const accepted = await runArcNoTty(["store", "remote", "origin", "push", "--own-state", "--json"], cwd);
  expect(accepted.exitCode, JSON.stringify(accepted)).toBe(0);
  expect(JSON.parse(accepted.stdout)).toMatchObject({ status: "ok", result: { layout: "default", report: {
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("project-state.git") })]),
  } } });
  expect(await git(cwd, ["config", "remote.origin.arc-state"])).toBe("push");
});

it("keeps explicit store commands out of ordinary help while retaining their own help", async () => {
  const cwd = await createTempRepo("arc-store-help-");
  onTestFinished(() => cleanupTempDir(cwd));
  const help = await runArcNoTty(["--help"], cwd);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).not.toMatch(/^\s+store(?:\s|$)/mu);
  const local = await runArcNoTty(["store", "--help"], cwd);
  expect(local.exitCode).toBe(0);
  expect(local.stdout).toContain("migrate");
  expect(local.stdout).toContain("remote");
});

it("reports a layout move as JSON and refuses --to without a state remote with the designation routes", async () => {
  const cwd = await createTempRepo("arc-store-migrate-");
  onTestFinished(() => cleanupTempDir(cwd));
  await git(cwd, ["remote", "add", "origin", `${cwd}/unpublished.git`]);
  await git(cwd, ["config", "remote.origin.arc-state", "off"]);
  const refused = await runArcNoTty(["store", "migrate", "--to", "origin", "--json"], cwd);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout, JSON.stringify(refused)).toContain('"no-state-remote"');
  expect(JSON.parse(refused.stdout)).toMatchObject({ status: "refused", refusal: { code: "no-state-remote",
    remedy: { text: expect.stringContaining("arc store remote <remote> push") } } });
  expect(JSON.parse(refused.stdout).refusal.remedy.text).toContain("arc store remote backing push");
  const migrated = await runArcNoTty(["store", "migrate", "--json"], cwd);
  expect(migrated.exitCode, JSON.stringify(migrated)).toBe(0);
  expect(JSON.parse(migrated.stdout)).toEqual({ status: "ok", result: { move: "layout",
    refs: [{ ref: "refs/arc/tmp/version", scope: "project", action: "copy" }], refused: [],
    brokenChains: [], reviewMapping: [], differingNotes: [], notices: [] } });
  const viewed = await runArcNoTty(["store", "remote", "--json"], cwd);
  expect(JSON.parse(viewed.stdout)).toMatchObject({ status: "ok", result: { layout: "separate" } });
});

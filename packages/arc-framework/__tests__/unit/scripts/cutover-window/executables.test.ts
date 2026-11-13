/** PATH admission examines later executables even when an earlier one belongs to a checkout. */
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { readWindowExecutableFindings } from "../../../../src/scripts/cutover-window/executables.js";

afterEach(() => { vi.unstubAllEnvs(); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-window-path-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function executable(directory: string) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, process.platform === "win32" ? "arc.cmd" : "arc");
  await writeFile(path, process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
  await chmod(path, 0o755);
  return path;
}

it("refuses a foreign executable behind an earlier allowed executable and passes after it leaves PATH", async () => {
  const root = await fixture(), checkout = join(root, "checkout"), allowed = join(checkout, "bin"), foreign = join(root, "global-bin");
  await executable(allowed);
  const target = await executable(foreign);
  expect(await readWindowExecutableFindings([{ path: checkout }], `${allowed}${delimiter}${foreign}`))
    .toEqual([expect.objectContaining({ subject: target, condition: expect.stringContaining("outside"),
      remedy: expect.stringMatching(/uninstall.*PATH/iu) })]);
  expect(await readWindowExecutableFindings([{ path: checkout }], allowed)).toEqual([]);
});

it("accepts the running checkout's node_modules/.bin link", async () => {
  const root = await fixture(), running = join(root, "running");
  const source = join(running, "packages/arc-framework/src/scripts/cutover-window/check.ts");
  await mkdir(dirname(source), { recursive: true });
  await writeFile(source, "/** Running window check. */\n");
  const target = await executable(join(running, "packages/arc-framework/bin"));
  const bin = join(running, "node_modules/.bin");
  await mkdir(bin, { recursive: true });
  if (process.platform === "win32") await link(target, join(bin, basename(target)));
  else await symlink(target, join(bin, basename(target)), "file");
  expect(await readWindowExecutableFindings([], bin, running)).toEqual([]);
});

it("refuses an arc reached through a bin directory linked outside the checkout", async () => {
  const root = await fixture(), checkout = join(root, "checkout"), bin = join(checkout, "bin"), foreign = join(root, "foreign");
  const target = await executable(foreign);
  await mkdir(checkout);
  await symlink(foreign, bin, "junction");
  expect(await readWindowExecutableFindings([{ path: checkout }], bin)).toEqual([expect.objectContaining({
    subject: join(bin, basename(target)), condition: expect.stringContaining("outside"),
  })]);
  await rm(bin, { recursive: true, force: true });
  await executable(bin);
  expect(await readWindowExecutableFindings([{ path: checkout }], bin)).toEqual([]);
});

it("inspects the process PATH when no search path is supplied", async () => {
  const root = await fixture(), foreign = join(root, "global-bin"), target = await executable(foreign);
  vi.stubEnv("PATH", foreign);
  expect(await readWindowExecutableFindings([])).toEqual([expect.objectContaining({ subject: target,
    condition: expect.stringContaining("outside") })]);
});

it("does not treat a directory link as an executable", async () => {
  const root = await fixture(), bin = join(root, "bin"), directory = join(root, "outside-directory");
  await mkdir(bin);
  await mkdir(directory);
  await symlink(directory, join(bin, process.platform === "win32" ? "arc.cmd" : "arc"), "junction");
  expect(await readWindowExecutableFindings([], bin)).toEqual([]);
});

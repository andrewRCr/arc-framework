/** Native command input inspects the supplied shell PATH without changing Git's execution PATH. */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";

async function executable(directory: string) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, process.platform === "win32" ? "arc.cmd" : "arc");
  await writeFile(path, process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
  await chmod(path, 0o755);
  return path;
}

it("refuses a later foreign arc on the supplied PATH and passes after that PATH is repaired", async () => {
  const h = await windowFixture();
  const allowed = join(h.root, ".arc-fixture/bin"), foreign = await mkdtemp(join(tmpdir(), "arc-window-foreign-"));
  onTestFinished(() => rm(foreign, { recursive: true, force: true }));
  await executable(allowed);
  const target = await executable(foreign);
  const refused = await checkFixture(h, {}, ["--path", `${allowed}${delimiter}${foreign}`]);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: target, condition: expect.stringContaining("outside"), remedy: expect.stringContaining("PATH") }),
  ]) } });
  const repaired = await checkFixture(h, {}, ["--path", allowed]);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

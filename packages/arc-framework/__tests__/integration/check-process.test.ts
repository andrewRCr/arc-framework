/** Declared check commands report a one-line notice through a file the process boundary names and removes. */
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCheckProcess } from "../../src/lib/checks/process.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function checkout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-check-process-"));
  roots.push(root);
  return root;
}

function writesNotice(text: string): string[] {
  return [process.execPath, "-e",
    `require("node:fs").writeFileSync(process.env.ARC_CHECK_NOTICE, ${JSON.stringify(text)}); console.log(process.env.ARC_CHECK_NOTICE)`];
}

it("returns the first line a command writes to its notice file, then removes the file", async () => {
  const result = await runCheckProcess(writesNotice("\n  ran on build-vm  \nsecond line\n"), await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0, notice: "ran on build-vm" });
  await expect(access(result.stdout)).rejects.toMatchObject({ code: "ENOENT" });
});

it("bounds a notice to one short line", async () => {
  const result = await runCheckProcess(writesNotice("x".repeat(500)), await checkout());
  expect(result.notice).toBe("x".repeat(200));
});

it("reads only the start of a notice file", async () => {
  const result = await runCheckProcess([process.execPath, "-e",
    "require(\"node:fs\").writeFileSync(process.env.ARC_CHECK_NOTICE, \"\\n\".repeat(64 * 1024) + \"late line\")"], await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0 });
  expect(result).not.toHaveProperty("notice");
});

it("runs the command without a notice file when none can be created", async () => {
  const root = await checkout();
  const unusable = join(root, "not-a-directory");
  await writeFile(unusable, "");
  for (const name of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(name, unusable);
  vi.stubEnv("ARC_CHECK_NOTICE", "/inherited/notice");
  const result = await runCheckProcess([process.execPath, "-e", "console.log(process.env.ARC_CHECK_NOTICE ?? \"unset\")"], root);
  expect(result).toMatchObject({ started: true, exitCode: 0, stdout: "unset" });
  expect(result).not.toHaveProperty("notice");
});

it("reports no notice when the command writes none, and replaces an inherited notice path", async () => {
  vi.stubEnv("ARC_CHECK_NOTICE", "/inherited/notice");
  const result = await runCheckProcess([process.execPath, "-e", "console.log(process.env.ARC_CHECK_NOTICE)"], await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0 });
  expect(result.stdout).not.toBe("/inherited/notice");
  expect(result).not.toHaveProperty("notice");
});

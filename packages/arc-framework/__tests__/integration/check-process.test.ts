/** Declared check commands report a short notice through a file the process boundary names and removes. */
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

it("joins every line a command and its runner write to the notice file, then removes the file", async () => {
  const result = await runCheckProcess(writesNotice("\n  ran locally: build-vm unreachable  \n\nwaited 8m 13s for the heavy-test slot\n"), await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0, notice: "ran locally: build-vm unreachable; waited 8m 13s for the heavy-test slot" });
  await expect(access(result.stdout)).rejects.toMatchObject({ code: "ENOENT" });
});

it("bounds a notice to one short line", async () => {
  const result = await runCheckProcess(writesNotice("x".repeat(500)), await checkout());
  expect(result.notice).toBe("x".repeat(200));
});

it("keeps a notice to plain text on one line", async () => {
  const result = await runCheckProcess(writesNotice("connecting\rran\u001b[2K on\tbuild-vm\nsecond line"), await checkout());
  expect(result.notice).toBe("connecting; ran [2K on build-vm; second line");
  const later = await runCheckProcess(writesNotice("\r\nran\u001b[2K on\tbuild-vm"), await checkout());
  expect(later.notice).toBe("ran [2K on build-vm");
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

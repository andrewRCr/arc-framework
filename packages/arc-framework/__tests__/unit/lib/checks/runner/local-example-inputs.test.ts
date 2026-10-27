/** The independent example keeps native notice interpretation bounded to the initial file bytes. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("ignores a late not-run marker beyond the native notice-read boundary", async () => {
  const module: unknown = await import(fileURLToPath(new URL("../../../../../examples/check-runner/local-inputs.mjs", import.meta.url)));
  if (typeof module !== "object" || module === null || !("readChildNotice" in module) || typeof module.readChildNotice !== "function") {
    throw new Error("Expected the independent example's notice reader");
  }
  const readNotice = module.readChildNotice as (path: string, exitCode: number) => Promise<{ notice?: string; notRunReason?: string }>;
  const directory = await mkdtemp(join(tmpdir(), "arc-example-notice-"));
  directories.push(directory);
  const path = join(directory, "notice");
  await writeFile(path, "x".repeat(5000) + "\nnot run: late classification must be ignored\n");
  expect(await readNotice(path, 7)).toEqual({ notice: "x".repeat(200) });
});

it("refuses to associate work when Linux process identity cannot be observed", async () => {
  const module: unknown = await import(fileURLToPath(new URL("../../../../../examples/check-runner/local-process.mjs", import.meta.url)));
  if (typeof module !== "object" || module === null || !("ownerRecord" in module) || typeof module.ownerRecord !== "function") {
    throw new Error("Expected the independent example's ownership reader");
  }
  const owner = module.ownerRecord as (read: (pid: number) => Promise<undefined>) => Promise<unknown>;
  await expect(owner(async () => undefined)).rejects.toThrow(/process identity.*proc.*retry/iu);
});

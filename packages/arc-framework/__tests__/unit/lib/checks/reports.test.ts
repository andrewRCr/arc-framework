/** Disposable report filenames preserve declared identities across filesystems. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createCheckReportStore } from "../../../../src/lib/checks/reports.js";
import { atomicWriteFile } from "../../../../src/lib/fs.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("retains full logs and latest costs for check identifiers containing colons", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arc-check-report-"));
  roots.push(directory);
  const store = createCheckReportStore({ directory: async () => directory,
    readFile: path => readFile(path, "utf8"),
    writeFile: async (path, content) => {
      if (basename(path).includes(":")) throw new Error("Filename contains a Windows-reserved colon");
      await atomicWriteFile(path, content);
    },
  });
  const measurement = await store.save("lint:style", "complete output", 12);
  expect(measurement).toBeDefined();
  if (!measurement) throw new Error("Missing report");
  expect(await readFile(measurement.logPath, "utf8")).toBe("complete output");
  expect(await store.latest("lint:style")).toEqual(measurement);
});

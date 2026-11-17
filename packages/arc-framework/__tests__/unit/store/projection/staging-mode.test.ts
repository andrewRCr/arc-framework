/** Archive laying and record protection independently decide a staged file's mode. */
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { WorkUnitReadPlacementSchema } from "../../../../src/lib/store/placement.js";
import { workItemLayoutPlacement } from "../../../../src/lib/store/lifecycle-storage.js";
import { resolveArcPath } from "../../../../src/lib/layout/index.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { projectionLayMode } from "../../../../src/lib/store/projection/lay-mode.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function staged(input: { archive: boolean; opened?: true; save?: boolean; owner?: string }) {
  const checkout = await mkdtemp(join(tmpdir(), "arc-lay-mode-"));
  directories.push(checkout);
  const f = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser } });
  f.identity("andrew");
  const record = input.archive ? await seed(f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" })),
    makeMetaFixture("alpha", { state: "Shipped", owner: input.owner ?? "andrew", workClass: "Light", priority: "P1", currentWorkflow: null }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") })
    : await seed(f, recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: input.owner ?? "andrew" }),
      "scratch/example.md"), "Personal prose\n");
  const path = input.archive ? resolveArcPath({ kind: "work-unit-artifact", slug: SlugSchema.parse("alpha"), artifact: "meta",
    placement: await workItemLayoutPlacement(checkout, "alpha", WorkUnitReadPlacementSchema.parse(record.placement), null) })
    : `.arc/user/${input.owner ?? "andrew"}/scratch/example.md`;
  const protection = createProjectionProtection({ store: f.store, checkout, identity: SlugSchema.parse("andrew"),
    exec: async () => { throw new Error("Archived or personal rights need no Git process"); } });
  const result = await stageRecordFile({ checkout, path, record, replacing: gitBlobId(record.content, "sha1"), format: "sha1",
    layMode: projectionLayMode(path, input.opened ? { opened: true } : undefined, input.save),
    renderer: createRecordRenderer({ store: f.store, protection }),
    writer: { pid: process.pid, processInstance: "lay-mode", processScope: "unit" } });
  if (result.status !== "ok") throw new Error(result.refusal.condition);
  return { ...result.result, absolute: join(checkout, result.result.location) };
}

it.each([false, true])("lays an owner's archive by its opened state=%s without changing its protection", async opened => {
  const file = await staged({ archive: true, ...(opened ? { opened: true } : {}) });
  expect((await stat(file.absolute)).mode & 0o200).toBe(opened ? 0o200 : 0);
  expect(file.rendering?.protected).toBe(false);
  expect(await readFile(file.absolute, "utf8")).toContain("alpha");
});

it("lays an opened archive read-only for its save landing", async () => {
  const file = await staged({ archive: true, opened: true, save: true });
  expect((await stat(file.absolute)).mode & 0o200).toBe(0);
  expect(file.rendering?.protected).toBe(false);
});

it.each([false, true])("keeps another person's archive protected when opened=%s", async opened => {
  const file = await staged({ archive: true, owner: "beth", ...(opened ? { opened: true } : {}) });
  expect((await stat(file.absolute)).mode & 0o200).toBe(0);
  expect(file.rendering?.protected).toBe(true);
});

it.each(["andrew", "beth"])("lays a file outside the archive by its %s edit rights", async owner => {
  const file = await staged({ archive: false, owner });
  expect((await stat(file.absolute)).mode & 0o200).toBe(owner === "andrew" ? 0o200 : 0);
  expect(file.rendering?.protected).toBe(owner !== "andrew");
});

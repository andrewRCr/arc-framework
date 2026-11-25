/** The integration guard holds every index header and partition the writer's file seam publishes against the schemas. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { atomicWriteFile } from "../../../../src/lib/fs.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { PROJECTION_STATE_FOLDER, type ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { takeProjectionIndexViolations } from "../../../helpers/store/projection/index-schema-guard.js";

let checkout: string;
let location: ProjectionLocation;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-index-guard-"));
  const gitDir = join(checkout, ".git");
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, PROJECTION_STATE_FOLDER) };
  await mkdir(location.stateDir, { recursive: true });
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const header = (groups: Record<string, unknown>) => JSON.stringify({ format: 2, state: null,
  projectedUnder: { view: { mode: "mine", pins: [] }, identity: "andrew", claim: null, layoutActive: "nested" },
  withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null, groups });
const partition = "index-" + "a".repeat(40);

it("records a header whose group the reader would refuse, written through the writer's file seam", async () => {
  await atomicWriteFile(join(location.stateDir, "index"), header({ ".arc/system": { name: partition, unsettled: false } }));
  expect(takeProjectionIndexViolations()).toEqual([
    { path: join(location.stateDir, "index"), issues: expect.stringContaining("projection index group") }]);
});

it("records a partition holding the paths of two groups", async () => {
  const entry = { kind: "ownerless", stat: null, refused: { reason: "unadoptable", remedy: { text: "Repair it." } } };
  await atomicWriteFile(join(location.stateDir, partition), JSON.stringify({
    ".arc/active/meta-alpha.md": entry, ".arc/backlog/planned/beta/meta-beta.md": entry }));
  expect(takeProjectionIndexViolations()).toEqual([
    { path: join(location.stateDir, partition), issues: expect.stringContaining("one group") }]);
});

it("ignores files that are no index header or partition, and passes the writer's own index", async () => {
  await atomicWriteFile(join(location.stateDir, "lock"), "not an index");
  await atomicWriteFile(join(checkout, "index"), header({ ".arc/system": {} }));
  await commitProjectionIndex({ location, checkout, index: { format: 2, state: null, entries: {}, withheldCopies: [],
    tripwires: {}, ignoreFiles: null, ignoreGuard: null,
    projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested" } } });
  expect(takeProjectionIndexViolations()).toEqual([]);
});

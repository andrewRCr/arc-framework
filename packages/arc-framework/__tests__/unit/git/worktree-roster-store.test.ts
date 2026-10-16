/** Store-backed roster includes every registration, including detached work. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { runWorktreeRoster, filterRosterByIdentity } from "../../../src/lib/git/worktree-roster.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { success, testProvenance } from "../../helpers/store/suite-tools.js";

it("lists detached marked Planning work with its store owner while no checkout has active metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-roster-store-"));
  const holder = join(cwd, "planning");
  await mkdir(holder);
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const fixture = createReferenceFixture();
  const reference = fixture.reference("work-item/meta");
  const fields = parseMetaRecord(makeMetaFixture(reference.owner.name, { state: "Planning", owner: "andrew" }));
  success(await fixture.store.write({ action: "put", reference, content: JSON.stringify(fields), expected: null,
    placement: { kind: "active" }, provenance: testProvenance }));
  await writeWorktreeOwnershipMarker(holder, { createdByArc: true, createdFor: { kind: "work-unit", name: reference.owner.name }, spawningIdentity: "andrew", now: 0 });
  const roster = await runWorktreeRoster({ cwd, store: fixture.store,
    exec: async () => ({ stdout: [`worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "", "",
      `worktree ${holder}`, `HEAD ${"b".repeat(40)}`, "detached", "", ""].join("\0") }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No checkout metadata"); } } });
  expect(roster.entries).toEqual([{ worktreePath: cwd, branch: "main" }, { worktreePath: holder,
    workUnit: reference.owner.name, identity: "andrew", state: "Planning", class: fields.workClass, priority: fields.priority }]);
  expect(filterRosterByIdentity(roster, { identity: "someone-else", teamMode: true }).entries).toEqual([{ worktreePath: cwd, branch: "main" }]);
});

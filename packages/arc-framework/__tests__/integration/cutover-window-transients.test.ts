/** Held identity snapshots are read at immutable tips without moving any repository ref. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { seedTransients, transientCommon, transientSourceRef } from "../helpers/store/import-transients.js";
import { readWindowTransientRecords } from "../../src/scripts/cutover-window/transients.js";

it("reads the held identity even after the canonical ref moves and leaves every ref unchanged", async () => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tip = await seedTransients(h, [
    { ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"], openedBaseHead: head,
      protection: "partial", branch: null, state: "open", changeRequest: null },
    { ...transientCommon, kind: "errand", purpose: "housekeep-routing", slug: "housekeep", branch: "chore/housekeep",
      state: "open", savedHead: null, changeRequest: null },
  ]);
  await h.git("git", ["update-ref", "refs/arc-window/local/" + transientSourceRef, tip]);
  await h.git("git", ["update-ref", transientSourceRef, head]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const projected = await readWindowTransientRecords({ repo: h.root, exec: h.git }, {
    [transientSourceRef]: tip, "refs/arc/user/andrew/errands-remote": head, "refs/arc/user/a/b/errands": head,
  });
  expect(projected.findings).toEqual([]);
  expect(projected.records.map(record => record.reference)).toEqual([
    { kind: "claims/groom", owner: { type: "person", name: "andrew" }, key: "groom-alpha" },
    { kind: "claims/housekeep", owner: { type: "person", name: "andrew" }, key: "housekeep" },
  ]);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 30_000);

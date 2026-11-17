/** Ordinary live changes do not require unrelated unchanged archive objects. */
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it("compares live edits while an unchanged archive tree is unavailable, then returns the same changes after repair", async () => {
  const f = await createRefFixture();
  const archived = await seed(f, f.reference("work-item/meta", "archived"));
  const quarter = ArchiveQuarterSchema.parse("2026-q4");
  success(await f.store.write({ ...update(f, archived, archived.content), placement: { kind: "completed", quarter } }));
  const live = await seed(f, f.reference("work-item/meta", "live"));
  const note = await seed(f, recordReferences["work-item/notes"](live.reference.owner), "Before.\n");
  const from = await f.settle();
  success(await f.store.write(update(f, note, "After.\n")));
  const to = await f.settle();
  const tree = (await f.ports.exec("git", ["rev-parse", `refs/arc/archive/${quarter}^{tree}`], { cwd: f.root })).stdout.trim();
  const object = join(f.root, ".git/objects", tree.slice(0, 2), tree.slice(2));
  const held = join(f.root, "temporarily-unavailable-archive-tree");
  await rename(object, held);
  let changes;
  try {
    changes = success(await f.store.changes({ from, to }));
    expect(changes).toMatchObject([expect.objectContaining({ reference: note.reference, content: "After.\n" })]);
  } finally { await rename(held, object); }
  expect(success(await f.store.changes({ from, to }))).toEqual(changes);
}, 30_000);

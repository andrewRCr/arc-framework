import { expect, it } from "vitest";

import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { ListingOutcomeSchema } from "../../src/lib/store/read.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it("restores a missing archive metadata blob after lookup refuses and keeps capture tags out of listings", async () => {
  const f = await createRefFixture(), created = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, created, created.content), placement: {
    kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4"),
  } }));
  const record = success(await f.store.read({ reference: created.reference }));
  const home = expandStoredPath(record.reference, { placement: record.placement });
  const blob = (await f.ports.exec("git", ["rev-parse", `${home.ref}:${home.metadataPath}`], { cwd: f.root })).stdout.trim();
  const bytes = (await f.ports.rawExec(["cat-file", "blob", blob], { cwd: f.root })).stdout;
  const asOf = await f.settle();
  await removeLooseObject(f.root, blob);
  expect(await f.store.lookup({ kind: "slug", slug: record.reference.owner.name })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", remedy: { text: expect.stringMatching(/restore/iu) },
  } });
  for (const input of [{ family: "work-item" as const }, { family: "work-item" as const, asOf }]) {
    const listing = success(await f.store.list(input));
    expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: [{ kind: "unreadable" }] });
    expect(ListingOutcomeSchema.safeParse(listing).success).toBe(true);
    if (listing.status === "complete") expect(listing.diagnostics[0]).not.toHaveProperty("fault");
  }
  const restored = await f.ports.rawExec(["hash-object", "-w", "--stdin"], { cwd: f.root, input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(blob);
  expect(success(await f.store.lookup({ kind: "slug", slug: record.reference.owner.name })).reference).toEqual(record.reference);
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
});

/** Tracked work-unit claims retain slug authority when an operational UUID is supplied. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

it("resolves a UUID-bearing checkout claim by slug in the in-repo store", async () => {
  const fixture = await createInRepoFixture();
  const record = await seed(fixture, fixture.reference("work-item/meta"));
  expect(success(await fixture.store.lookup({ kind: "claim", claim: {
    kind: "work-unit", slug: record.reference.owner.name, uid: randomUUID(),
  } })).reference).toEqual(record.reference);
}, 30_000);

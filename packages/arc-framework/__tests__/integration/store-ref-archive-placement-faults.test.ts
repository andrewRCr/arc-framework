import { expect, it } from "vitest";

import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { ListingOutcomeSchema } from "../../src/lib/store/read.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const ref = "refs/arc/archive/2026-q4";
const root = "01_alpha/";
const key = `${ref}:${root}`;
const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid },
  kind: "work-item/companion", key: "extra" });

it("reports an archive placement fault and resumes after a forward placement repair", async () => {
  const f = await createRefReadFixture();
  const metadata = { formatVersion: 1, slug: "alpha", formats: {},
    primary: { role: "work-item/meta", placement: { kind: "active" } } };
  const entries = (content: unknown) => [{ path: `${root}metadata-${uid}.json`, content: canonicalize(content) },
    { path: `${root}extra-alpha.md`, content: "kept" }];
  const broken = await plantRef(f.root, ref, entries(metadata));
  const asOf = success(await f.store.version());
  for (const saved of [false, true]) {
    const input = saved ? { asOf } : {};
    const remedy = saved ? expect.stringContaining("cannot change an ancestor") : expect.stringContaining("completed placement");
    const listing = success(await f.store.list({ family: "work-item", ...input }));
    expect(listing).toMatchObject({ status: "complete", records: [], missed: true, diagnostics: [{
      kind: "malformed", rule: "placement", key,
      condition: `The archive folder ${key} holds metadata whose placement is active, not completed.`,
      remedy: { text: remedy },
    }] });
    expect(ListingOutcomeSchema.safeParse(listing).success).toBe(true);
    expect(await f.store.read({ reference, ...input })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: ref, remedy: { text: remedy },
    } });
  }
  await plantRef(f.root, ref, entries({ ...metadata, primary: { ...metadata.primary,
    placement: { kind: "completed", quarter: "2026-q4" } } }), { parents: [broken.tip] });
  expect(success(await f.store.read({ reference })).content).toBe("kept");
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", diagnostics: [], missed: false });
  expect(success(await f.store.list({ family: "work-item", asOf }))).toMatchObject({ status: "complete", missed: true,
    diagnostics: [{ kind: "malformed", rule: "placement", remedy: { text: expect.stringContaining("cannot change an ancestor") } }],
  });
});

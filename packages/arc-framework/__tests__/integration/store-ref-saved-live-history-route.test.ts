import { expect, it } from "vitest";

import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

it("restores a live item's missing saved nested tree without requesting its history ref", async () => {
  const f = await createRefReadFixture();
  const uid = "12345678-1234-4234-8234-123456789abc", ref = `refs/arc/work/${uid}`;
  const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid },
    kind: "work-item/companion", key: "nested/extra.md" });
  const metadata = { formatVersion: 1, slug: "alpha", formats: {}, primary: { role: "work-item/meta", placement: { kind: "active" } } };
  const planted = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
    { path: "nested/extra.md", content: "Nested saved content.\n" }]);
  const asOf = success(await f.store.version());
  const nested = (await f.exec("git", ["rev-parse", `${planted.tip}:nested`])).stdout.trim();
  const bytes = (await f.ports.rawExec(["cat-file", "tree", nested], { cwd: f.root })).stdout;
  await removeLooseObject(f.root, nested);
  expect(await f.store.list({ family: "work-item", asOf })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", stateVersion: asOf, historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  const restored = await f.ports.rawExec(["hash-object", "-t", "tree", "-w", "--stdin"], { cwd: f.root, input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(nested);
  expect(success(await f.store.list({ family: "work-item", asOf }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
  expect(success(await f.store.read({ reference, asOf })).content).toBe("Nested saved content.\n");
});

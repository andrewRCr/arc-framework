/** A projection round retains its source answers while later rounds observe landed changes. */
import { expect, it } from "vitest";
import type { ReadOnlyStore } from "../../../../src/lib/store/contract.js";
import { createProjectionReadMemo } from "../../../../src/lib/store/projection/record-source.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";

it("keeps an observed record for one round and accepts writable and read-only stores directly", async () => {
  const h = createReferenceFixture();
  const original = await seed(h, h.reference("personal/document"));
  const round = createProjectionReadMemo(h.store);
  expect(success(await round.read({ reference: original.reference }))).toEqual(original);
  success(await h.store.write(update(h, original, "next round\n")));
  expect(success(await round.read({ reference: original.reference }))).toEqual(original);
  const readOnly: ReadOnlyStore = h.store;
  expect(success(await createProjectionReadMemo(readOnly).read({ reference: original.reference })).content).toBe("next round\n");
});

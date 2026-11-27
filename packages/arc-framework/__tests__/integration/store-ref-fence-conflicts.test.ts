/** A stale merge must leave the same open conflicts as a freshly prepared write. */
import { expect, it } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { runFenceCase, type FenceWriter } from "../helpers/store/fence-harness.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";

it("rejects a stale merge that preserves the fresh text but opens a conflict", async () => {
  const control = createReferenceFixture();
  const raced = createReferenceFixture();
  const reference = raced.reference("personal/document");
  for (const fixture of [control, raced]) await seed(fixture, reference, "Draft\n");

  const writer = { name: "review draft", async run(store: Store) {
    const current = success(await store.read({ reference }));
    const content = current.content.replace("Draft", "Reviewed");
    return store.batch({ writes: [recordPut(current, { content })], provenance: testProvenance });
  } };
  async function publish(store: Store) {
    const current = success(await store.read({ reference }));
    success(await store.write({ ...recordPut(current, { content: "Published\n" }), provenance: testProvenance }));
  }

  await publish(control.store);
  success(await writer.run(control.store));
  const fresh = success(await control.store.read({ reference }));
  expect(fresh).toMatchObject({ content: "Published\n", conflicts: [] });

  const outcome = await runFenceCase(raced.store, writer, publish).catch((error: unknown) => error);
  const landed = success(await raced.store.read({ reference }));
  expect(landed.content).toBe(fresh.content);
  expect(landed.conflicts).toHaveLength(1);
  expect(outcome, "the fence must reject the extra open conflict").toBeInstanceOf(Error);
});

it.each([
  { stale: "resolve", fresh: "keep", target: "subject", admitted: false, open: false },
  { stale: "resolve", fresh: "keep", target: "receipt", admitted: false, open: false },
  { stale: "keep", fresh: "resolve", target: "subject", admitted: false, open: true },
  { stale: "resolve", fresh: "resolve", target: "subject", admitted: true, open: false },
])("checks resolution from $target when stale says $stale and fresh says $fresh", async ({ stale, fresh, target, admitted, open }) => {
  const f = createReferenceFixture();
  const subject = await seed(f, f.reference("personal/document"), "Draft\n");
  const decision = await seed(f, f.reference("personal/document", "decision"), stale);
  const receipt = await seed(f, f.reference("personal/document", "receipt"), "Recorded\n");
  success(await f.store.write({ ...recordPut(subject, { content: "Published\n" }), provenance: testProvenance }));
  success(await f.store.write({ ...recordPut(subject, { content: "Reviewed\n" }), provenance: testProvenance }));
  const current = success(await f.store.read({ reference: subject.reference }));
  expect(current.conflicts).toHaveLength(1);
  const written = target === "subject" ? current : receipt;
  const content = `${written.content}Final.\n`;

  const writer: FenceWriter = { name: "resolve draft conflict", async run(store) {
    const request = success(await store.read({ reference: decision.reference }));
    const record = success(await store.read({ reference: subject.reference }));
    const resolves = request.content === "resolve" ? record.conflicts : [];
    return store.batch({ writes: [{ ...recordPut(target === "subject" ? record : receipt, { content }), resolves }],
      provenance: testProvenance });
  } };
  const outcome = runFenceCase(f.store, writer, async store => {
    success(await store.write({ ...recordPut(decision, { content: fresh }), provenance: testProvenance }));
  });
  if (admitted) await expect(outcome).resolves.toEqual({ kind: "admitted" });
  else await expect(outcome).rejects.toThrow();
  expect(success(await f.store.read({ reference: written.reference })).content).toBe(content);
  expect(success(await f.store.read({ reference: subject.reference })).conflicts).toEqual(open ? current.conflicts : []);
});

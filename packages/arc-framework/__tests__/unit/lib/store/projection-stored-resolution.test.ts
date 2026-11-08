/** Explicit stored choices validate their payload and subject while preserving native failures. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { checkStoredResolution } from "../../../../src/lib/store/projection/stored-resolution.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

it("refuses malformed and foreign conflict choices and retains native repair details", async () => {
  const f = createReferenceFixture(), reference = f.reference("personal/document");
  const base = await seed(f, reference, "base\n");
  success(await f.store.write(update(f, base, "stored\n")));
  success(await f.store.write(update(f, base, "incoming\n")));
  const subject = success(await f.store.read({ reference: base.reference }));
  const selected = subject.conflicts[0];
  if (!selected) throw new Error("No filed conflict");
  const conflict = success(await f.store.read({ reference: selected }));
  for (const content of ["not JSON", JSON.stringify({ ...JSON.parse(conflict.content), record: f.reference("personal/working-memory") })]) {
    const store = { read: async () => ({ status: "ok" as const, result: { ...conflict, content } }) };
    expect(await checkStoredResolution(store, subject.reference, selected)).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "projection.resolution-conflict", reference: selected } });
  }
  const refusal = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", reference: selected,
    historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"],
    condition: "Selected conflict evidence is unavailable.", remedy: { text: "Fetch the named history.", argv: ["arc", "fetch"] } });
  expect(await checkStoredResolution({ read: async () => ({ status: "refused", refusal }) }, subject.reference, selected))
    .toEqual({ status: "refused", refusal });
  expect(await checkStoredResolution(f.store, subject.reference, selected)).toEqual({ status: "ok", result: undefined });
});

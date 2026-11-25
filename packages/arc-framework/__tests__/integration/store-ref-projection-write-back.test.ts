/** Projection write-back preserves real backend serialization refusals and their repair route. */
import { afterEach, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";

let fixture: Awaited<ReturnType<typeof createWriteBackFixture>> | undefined;
afterEach(async () => { await fixture?.dispose(); fixture = undefined; });

it("keeps a serialization-refused edit with its rule and lands it after repair", async () => {
  fixture = await createWriteBackFixture({ fixture: await createRefFixture() });
  const broken = "opening\nbinary\u0000record\nclosing\n";
  await fixture.edit(broken);
  const port = createWriteBackPort(fixture.context);
  const result = await port(fixture.request);
  expect(result).toMatchObject({ answer: "refused", mark: {
    reason: expect.stringContaining("store.text-only"), remedy: { text: "Replace binary content with text, then retry." },
  } });
  expect(await fixture.file()).toContain(broken);
  expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.entry.base.version } });
  const repaired = "opening\ntext record\nclosing\n";
  await fixture.edit(repaired);
  expect(await port(fixture.request)).toMatchObject({ answer: "taken-in" });
  expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: repaired } });
});

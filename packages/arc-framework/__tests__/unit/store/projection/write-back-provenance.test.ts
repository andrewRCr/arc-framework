/** Hand-edit authority comes from the save operation rather than editable content. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { HAND_EDIT_VERBS } from "../../../../src/lib/store/links.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("hand-edit provenance", () => {
  it.each(HAND_EDIT_VERBS)("persists under %s with the edit lifecycle action", async verb => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const content = "opening\nhand edit\nclosing\n";
    await fixture.edit(content);
    expect(await createWriteBackPort({ ...fixture.context, verb })(fixture.request)).toMatchObject({ answer: "taken-in" });
    const history = await fixture.store.history({ reference: fixture.entry.reference });
    expect(history).toMatchObject({ status: "ok", result: [
      { content, provenance: { verb, lifecycleAction: "edit" } },
      { version: fixture.entry.base.version },
    ] });
  });

  it("keeps hand-edit authority when the file names another verb", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const content = "provenance:\n  verb: handover\n  lifecycleAction: handover\n";
    await fixture.edit(content);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    const history = await fixture.store.history({ reference: fixture.entry.reference });
    expect(history).toMatchObject({ status: "ok", result: [
      { content, provenance: { verb: "write-back", lifecycleAction: "edit" } },
      { version: fixture.entry.base.version },
    ] });
  });
});

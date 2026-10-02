/** Registry dispatch through the public factory, including unclassified failure identity. */
import { describe, expect, it } from "vitest";
import { ArcError } from "../../../../src/lib/kernel/errors.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { KIND_REGISTRY } from "../../../../src/lib/store/registry.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";

const unavailable = async (): Promise<never> => { throw new Error("No Git repository exists"); };
const provenance = { verb: "test", lifecycleAction: "update" };
describe("repository store registry dispatch", () => {
  it("lists every unhomed kind as absent and rejects persistence before consulting I/O", async () => {
    const store = createStore(testStorePorts("/unavailable", unavailable, unavailable));
    const fixture = createReferenceFixture();
    for (const descriptor of Object.values(KIND_REGISTRY)) {
      if (descriptor.inRepo.substrate !== "none") continue;
      const reference = fixture.reference(descriptor.id as KindId);
      expect(await store.list({ family: descriptor.family, kind: descriptor.id })).toEqual({ status: "ok", result: { status: "absent" } });
      expect(await store.write({ action: "put", reference, expected: null, content: "unhomed", provenance }))
        .toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind",
          condition: expect.stringMatching(/no .*home/u), remedy: { text: expect.any(String) } } });
    }
  });
  it("serves personal listings without identity and preserves explicit transient dispatch", async () => {
    const store = createStore(testStorePorts("/unavailable", unavailable, unavailable));
    expect(await store.list({ family: "personal" })).toEqual({ status: "ok", result: { status: "absent" } });
    await expect(store.list({ family: "claims" })).rejects.toMatchObject({ name: "ArcError", code: "store.not-implemented" });
  });
  it("preserves an unknown I/O failure as a thrown ArcError with its original cause", async () => {
    const ports = testStorePorts("/unavailable", unavailable, unavailable);
    const original = new Error("Filesystem observer is broken");
    ports.fs.lstat = async () => { throw original; };
    const store = createStore(ports);
    const reference = createReferenceFixture().reference("work-item/meta");
    await expect(store.read({ reference })).rejects.toBeInstanceOf(ArcError);
    await expect(store.read({ reference })).rejects.toMatchObject({ cause: original });
  });
});

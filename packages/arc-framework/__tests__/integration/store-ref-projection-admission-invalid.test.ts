/** Malformed portable capsules refuse before any mutation and retain a corrected retry route. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { newPersonalAdmission } from "../helpers/store/projection/admission-request.js";
import type { BatchInput } from "../../src/lib/store/write.js";

const variants: Readonly<Record<string, (input: BatchInput) => unknown>> = {
  version: input => ({ ...input, projectionAdmission: { ...input.projectionAdmission, version: 2 } }),
  extra: input => ({ ...input, projectionAdmission: { ...input.projectionAdmission,
    local: { ...input.projectionAdmission?.local, inventedAuthority: true } } }),
  path: input => ({ ...input, projectionAdmission: { ...input.projectionAdmission,
    local: { ...input.projectionAdmission?.local, path: "../outside.md" } } }),
  cardinality: input => ({ ...input, writes: [...input.writes, ...input.writes] }),
  verb: input => ({ ...input, provenance: { verb: "archive", lifecycleAction: "edit" } }),
  binding: input => ({ ...input, projectionAdmission: { ...input.projectionAdmission,
    selection: { kind: "indexed", reference: input.writes[0]?.reference } } }),
  retained: input => ({ ...input, projectionAdmission: { ...input.projectionAdmission,
    input: { ...input.projectionAdmission?.input, retainedBases: [{ name: "copy", content: "one" }, { name: "copy", content: "two" }] } } }),
};
for (const backend of ["reference", "default", "separate"] as const) for (const [name, malformed] of Object.entries(variants)) {
  it(`refuses the malformed capsule without publication and accepts its repair: ${backend}/${name}`, async () => {
    const f = backend === "reference" ? createReferenceFixture() : await createRefFixture({}, backend);
    const reference = f.reference("personal/working-memory"), content = f.content(reference);
    const input: BatchInput = { writes: [{ action: "put", reference, content, expected: null }],
      provenance: { verb: "write-back", lifecycleAction: "edit" }, observations: [{ reference, expected: null }],
      projectionAdmission: newPersonalAdmission(reference, content) };
    const before = success(await f.store.version());
    // The public backend validates runtime input, including callers outside TypeScript.
    expect(await f.store.batch(malformed(input) as BatchInput)).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "projection.admission", remedy: { text: expect.any(String) },
    } });
    expect(success(await f.store.version())).toBe(before);
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await f.store.batch(input));
    expect(success(await f.store.read({ reference })).content).toBe(content);
  });
}

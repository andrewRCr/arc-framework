/** Malformed inputs refuse through the public schema without applying a partial batch. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, StoreRefusalSchema, type RecordReference, type WriteInput, type BatchInput } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

const cases = ["write-reference", "batch-first-reference", "batch-later-reference", "empty-batch",
  "write-content", "batch-later-content", "write-placement", "batch-provenance", "batch-unknown-key",
  "batch-duplicate-write", "batch-duplicate-observation", "batch-later-observation"] as const;

function invalidReference(write: WriteInput): WriteInput {
  return { ...write, reference: { ...write.reference, owner: { ...write.reference.owner, name: "INVALID OWNER" } } } as WriteInput;
}

function batchCase(mode: string, first: WriteInput, second: WriteInput): {
  input: unknown; reference?: RecordReference; operand: string;
} {
  const input = { writes: [mutationOf(first), mutationOf(second)], provenance: testProvenance };
  const observed = (name: string) => RecordReferenceSchema.parse({ kind: "work-item/meta",
    owner: { type: "work-item", name, uid: "00000000-0000-4000-8000-000000000001" } });
  switch (mode) {
    case "empty-batch": return { input: { ...input, writes: [] }, operand: "batch.writes" };
    case "batch-first-reference": return { input: { ...input, writes: [mutationOf(invalidReference(first)), mutationOf(second)] }, operand: "writes[0]" };
    case "batch-later-reference": return { input: { ...input, writes: [mutationOf(first), mutationOf(invalidReference(second))] }, operand: "writes[1]" };
    case "batch-later-content": return { input: { ...input, writes: [mutationOf(first), { ...mutationOf(second), content: 42 }] }, reference: second.reference, operand: "writes[1]" };
    case "batch-provenance": return { input: { ...input, provenance: { ...testProvenance, verb: 42 } }, operand: "batch.provenance.verb" };
    case "batch-unknown-key": return { input: { ...input, unknown: true }, operand: "batch:" };
    case "batch-duplicate-write": return { input: { ...input, writes: [...input.writes, mutationOf(second)] }, operand: "batch:" };
    case "batch-duplicate-observation": {
      const observation = { reference: observed("observed"), expected: null };
      return { input: { ...input, observations: [observation, observation] }, operand: "batch:" };
    }
    case "batch-later-observation": {
      const reference = observed("later-observed");
      return { input: { ...input, observations: [{ reference: observed("first-observed"), expected: null },
        { reference, expected: { version: 42, conflicts: [] } }] }, reference, operand: "observations[1].expected.version" };
    }
    default: throw new Error(`Unknown invalid batch mode: ${mode}`);
  }
}

describe.each(["default", "separate", "tracked", "reference"] as const)("malformed write input in %s", backend => {
  it.each(cases)("refuses %s with the correct operand, then accepts repair", async mode => {
    const f = backend === "reference" ? { ...createReferenceFixture(), root: undefined, ports: undefined }
      : backend === "tracked" ? await trackedWriteFixture() : await createRefFixture({}, backend);
    if (backend === "tracked" && f.root && f.ports) {
      await mkdir(join(f.root, ".arc/active"), { recursive: true });
      await f.ports.exec("git", ["commit", "--allow-empty", "-m", "Seed input validation fixture"], { cwd: f.root });
    }
    const reference = (name: string) => RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } });
    const content = (name: string) => "content" in f ? f.content(reference(name)) : makeMetaFixture(name);
    const first: WriteInput = { action: "put", reference: reference("first"), expected: null,
      content: content("first"), placement: { kind: "active" }, provenance: testProvenance };
    const second: WriteInput = { ...first, reference: reference("second"), content: content("second") };
    const before = success(await f.store.version());
    const files = async () => f.ports && f.root
      ? (await f.ports.exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: f.root })).stdout : undefined;
    const beforeFiles = await files();
    let result, expectedReference: RecordReference | undefined, operand: string;
    if (mode.startsWith("write-")) {
      const input = mode === "write-reference" ? invalidReference(first) : mode === "write-content" ? { ...first, content: 42 } : { ...first, placement: undefined };
      result = await f.store.write(input as WriteInput);
      expectedReference = mode === "write-reference" ? undefined : first.reference;
      operand = "write";
    } else {
      const broken = batchCase(mode, first, second);
      result = await f.store.batch(broken.input as BatchInput);
      expectedReference = broken.reference; operand = broken.operand;
    }
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    if (result.status !== "refused") throw new Error("Expected typed input refusal");
    expect(StoreRefusalSchema.safeParse(result.refusal).success).toBe(true);
    if (result.refusal.code !== "record-malformed") throw new Error("Expected malformed input");
    expect(result.refusal.reference).toEqual(expectedReference);
    expect(result.refusal.condition).toContain(operand);
    expect(success(await f.store.version())).toBe(before);
    if (beforeFiles !== undefined) expect(await files()).toBe(beforeFiles);
    if (mode.startsWith("write-")) success(await f.store.write(first));
    else success(await f.store.batch({ writes: mode === "empty-batch" ? [mutationOf(first)] : [mutationOf(first), mutationOf(second)], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: first.reference })).content).toBe(first.content);
  });
});

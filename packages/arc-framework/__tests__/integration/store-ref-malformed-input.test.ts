/** Malformed inputs refuse through the public schema without applying a partial batch. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, StoreRefusalSchema, type WriteInput, type BatchInput } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

const cases = ["write-reference", "batch-first-reference", "batch-later-reference", "empty-batch",
  "write-content", "batch-later-content", "write-placement"] as const;

describe.each(["default", "separate", "tracked"] as const)("malformed write input in %s", backend => {
  it.each(cases)("refuses %s with the correct operand, then accepts repair", async mode => {
    const f = backend === "tracked" ? await trackedWriteFixture() : await createRefFixture({}, backend);
    if (backend === "tracked") {
      await mkdir(join(f.root, ".arc/active"), { recursive: true });
      await f.ports.exec("git", ["commit", "--allow-empty", "-m", "Seed input validation fixture"], { cwd: f.root });
    }
    const reference = (name: string) => RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } });
    const content = (name: string) => "content" in f ? f.content(reference(name)) : makeMetaFixture(name);
    const first: WriteInput = { action: "put", reference: reference("first"), expected: null,
      content: content("first"), placement: { kind: "active" }, provenance: testProvenance };
    const second: WriteInput = { ...first, reference: reference("second"), content: content("second") };
    const invalid = { ...first, reference: { ...first.reference, owner: { ...first.reference.owner, name: "INVALID OWNER" } } } as WriteInput;
    const before = success(await f.store.version());
    const status = () => f.ports.exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: f.root });
    const files = (await status()).stdout;
    let result, expectedReference: WriteInput["reference"] | undefined;
    if (mode.startsWith("write-")) {
      const input = mode === "write-reference" ? invalid : mode === "write-content" ? { ...first, content: 42 } : { ...first, placement: undefined };
      result = await f.store.write(input as WriteInput);
      expectedReference = mode === "write-reference" ? undefined : first.reference;
    } else {
      const writes = mode === "empty-batch" ? [] : mode === "batch-first-reference" ? [mutationOf(invalid), mutationOf(second)]
        : [mutationOf(first), mutationOf(mode === "batch-later-reference" ? invalid : { ...second, content: 42 } as unknown as WriteInput)];
      result = await f.store.batch({ writes, provenance: testProvenance } as BatchInput);
      expectedReference = mode === "batch-later-content" ? second.reference : undefined;
    }
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    if (result.status !== "refused") throw new Error("Expected typed input refusal");
    expect(StoreRefusalSchema.safeParse(result.refusal).success).toBe(true);
    if (result.refusal.code !== "record-malformed") throw new Error("Expected malformed input");
    expect(result.refusal.reference).toEqual(expectedReference);
    const operand = mode.startsWith("write-") ? "write" : mode === "empty-batch" ? "batch.writes"
      : mode === "batch-first-reference" ? "writes[0]" : "writes[1]";
    expect(result.refusal.condition).toContain(operand);
    expect(success(await f.store.version())).toBe(before);
    expect((await status()).stdout).toBe(files);
    if (mode.startsWith("write-")) success(await f.store.write(first));
    else {
      success(await f.store.batch({ writes: mode === "empty-batch" ? [mutationOf(first)] : [mutationOf(first), mutationOf(second)], provenance: testProvenance }));
    }
    expect(success(await f.store.read({ reference: first.reference })).content).toBe(first.content);
  });
});

/** Saved-state acquisition bounds impossible shared-subtree expansion and retains the healthy read path. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { createRefStore, StateVersionSchema } from "../../src/lib/store/index.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { testProvenance } from "../helpers/store/suite-tools.js";

it("refuses an impossible manifest within a small object-read budget and reads an intact saved token", async () => {
  const f = await createRefFixture(), record = await seed(f, f.reference("personal/document"), "Intact saved state.\n");
  const valid = await f.settle();
  const writeTree = async (input: Buffer): Promise<string> => Buffer.from((await f.ports.rawExec(["hash-object", "-t", "tree", "-w", "--stdin"],
    { cwd: f.root, input, objectAccess: "local-only" })).stdout).toString("utf8").trim();
  let invalid = await writeTree(Buffer.alloc(0));
  const dag = new Set([invalid]);
  for (let depth = 0; depth < 12; depth++) {
    const child = invalid;
    invalid = await writeTree(Buffer.concat(["a", "b"].flatMap(name => [Buffer.from(`40000 ${name}\0`), Buffer.from(child, "hex")])));
    dag.add(invalid);
  }
  let remaining = 8;
  const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
    if (args.includes("cat-file") && args.includes("--batch")) {
      const queried = Buffer.from(options?.input ?? []).toString("utf8").trim().split("\n");
      for (const oid of queried) if (dag.has(oid) && remaining-- === 0) throw new Error("Saved-state acquisition exhausted the graph object-read budget");
    }
    return f.ports.rawExec(args, options);
  } });
  expect(await store.read({ reference: record.reference, asOf: StateVersionSchema.parse(invalid) }))
    .toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
  expect(success(await store.read({ reference: record.reference, asOf: valid })).content).toBe("Intact saved state.\n");
});

it.each((["duplicates", "undecodable-mode"] as const).flatMap(malformed =>
  (["read", "list", "changes", "anchor"] as const).map(operation => ({ malformed, operation }))))(
  "refuses $malformed manifest entries through $operation and retains valid state", async ({ malformed, operation }) => {
  const f = await createRefFixture({ "work-item/meta": { parser: META_REGISTRATION.parser, anchorFields: META_REGISTRATION.anchorFields } });
  const record = await seed(f, f.reference("personal/document"), "Intact saved state.\n");
  const valid = await f.settle();
  const writeTree = async (input: Buffer): Promise<string> => Buffer.from((await f.ports.rawExec(["hash-object", "-t", "tree", "--literally", "-w", "--stdin"],
    { cwd: f.root, input, objectAccess: "local-only" })).stdout).toString("utf8").trim();
  const empty = await writeTree(Buffer.alloc(0));
  const entry = (name: string, oid: string): Buffer => Buffer.concat([Buffer.from(`40000 ${name}\0`), Buffer.from(oid, "hex")]);
  const user = await writeTree(Buffer.concat(Array.from({ length: 8 }, () => entry("a", empty))));
  const invalid = StateVersionSchema.parse(await writeTree(malformed === "duplicates"
    ? Buffer.concat(Array.from({ length: 8 }, () => entry("user", user)))
    : Buffer.concat([Buffer.from([255, 32]), Buffer.from("user\0"), Buffer.from(empty, "hex")])));
  let remaining = 2;
  const malformedObjects = new Set([invalid, user, empty]);
  const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
    if (args.includes("cat-file") && args.includes("--batch")) {
      const queried = Buffer.from(options?.input ?? []).toString("utf8").trim().split("\n");
      for (const oid of queried) if (malformedObjects.has(oid) && remaining-- === 0) throw new Error("Malformed manifest exceeded its acquisition budget");
    }
    return f.ports.rawExec(args, options);
  } });
  const reference = f.reference("work-item/meta");
  const result = operation === "read" ? await store.read({ reference: record.reference, asOf: invalid })
    : operation === "list" ? await store.list({ family: "personal", asOf: invalid })
    : operation === "changes" ? await store.changes({ from: invalid, to: valid })
    : await store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: invalid }), provenance: testProvenance });
  expect(result)
    .toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
  expect(success(await store.read({ reference: record.reference, asOf: valid })).content).toBe("Intact saved state.\n");
});

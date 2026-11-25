/** Literal root filenames retain distinct logical identities from named companions. */
import { expect, it } from "vitest";
import { ArcLayoutAddressSchema, identifyArcFileAddress, resolveArcPath } from "../../../src/lib/layout/index.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import { createPreflightRefStore } from "../../helpers/store/ref-preflight.js";
import { validateManagedPath } from "../../../src/lib/kernel/index.js";

const owner = { type: "work-item", name: "alpha", uid: "12345678-1234-4234-8234-123456789abc" };
const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key });

it.each([
  { kind: "backlog", commitment: "planned", cohort: [] },
  { kind: "completed", quarter: "2026-q4", sequence: "01" },
  { kind: "active", scope: { kind: "project", location: { kind: "own", claim: "alpha", layoutActive: "nested" } } },
  { kind: "active", scope: { kind: "project", location: { kind: "own", claim: "alpha", layoutActive: "flat" } } },
])("round-trips distinct companion identities at %j", placement => {
  const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: "alpha", placement });
  if (container.kind !== "work-unit-container") throw new Error("Container missing");
  for (const [key, file] of [["readme", "readme-alpha.md"], ["./readme", "readme"], ["readme.txt", "readme.txt"], ["sub/readme", "sub/readme"]] as const) {
    const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-companion", slug: "alpha", placement, key });
    const path = resolveArcPath(address);
    expect(path).toBe(`${resolveArcPath(container)}/${file}`);
    expect(identifyArcFileAddress(path, { workItem: container })).toEqual(address);
  }
});

it("expands distinct literal and conventional stored basenames without relaxing personal paths", () => {
  for (const [key, file] of [["readme", "readme-alpha.md"], ["./readme", "readme"], ["spec-prd", "spec-alpha-prd.md"]] as const) {
    const reference = companion(key);
    expect(expandStoredPath(reference).path).toBe(file);
  }
  expect(() => validateManagedPath("./readme")).toThrow();
  expect(RecordReferenceSchema.safeParse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "./readme" }).success)
    .toBe(false);
});

it.each(["./readme.txt", "././readme", "./sub/readme", "./../readme", "../readme", "./", "./Readme"])("refuses noncanonical literal key %s", key => {
  expect(RecordReferenceSchema.safeParse({ kind: "work-item/companion", owner, key }).success).toBe(false);
  expect(ArcLayoutAddressSchema.safeParse({ kind: "work-unit-companion", slug: "alpha", placement: {
    kind: "backlog", commitment: "planned", cohort: [],
  }, key }).success).toBe(false);
});

it.each(["review", "conflicts", "receipts"])("retains the physical storage reservation for ./%s", async name => {
  expect(await createPreflightRefStore().write({ action: "put", reference: companion(`./${name}`), expected: null,
    content: "Preserved text\n", provenance: { verb: "save", lifecycleAction: "edit" } }))
    .toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
});

/** Destination conservation resolves saved locators against authored current content. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeConservation } from "../../../../src/lib/decompose/conservation.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";

async function check(ctx: DecomposeContext) {
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return checkDecomposeConservation(ctx, acquired.result);
}

it("refuses a renamed allocated heading and passes after the saved locator is restored", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
  const edited = await h.handEdit(draft, draft.content.replace("## Scope", "## Renamed"));
  const index = h.map.authoring.sourceAllocations.findIndex(allocation => allocation.disposition.kind === "target"
    && allocation.disposition.targetLocator.kind === "section");
  const before = lifecycleSuccess(await h.store.version());
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "locator-unresolved",
    locus: `authoring.sourceAllocations.${index}.disposition.targetLocator`,
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(edited, draft.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each([
  ["relevel", "# Member A\n\n### Scope\n\nAuthored work.\n"],
  ["merge", "# Member A\n\n## Combined\n\nOwned work and other work.\n"],
  ["ancestry", "# Member A\n\n## Parent\n\n### Scope\n\nAuthored work.\n"],
] as const)("refuses an unresolved locator after %s and continues after repair", async (_name, content) => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
  const edited = await h.handEdit(draft, content);
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "locator-unresolved",
    locus: expect.stringMatching(/^authoring\.sourceAllocations\.\d+\.disposition\.targetLocator$/u),
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  await h.handEdit(edited, draft.content);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each([
  ["earlier matching heading", "## Scope\n\nInserted content.\n\n## Scope\n\nOwned work.\n", "Inserted content."],
  ["merged sections retaining the locator", "## Scope\n\nMerged content.\n", "Merged content."],
  ["authored body", "## Scope\n\nRewritten content.\n", "Rewritten content."],
] as const)("resolves the current section after %s", async (_name, body, expected) => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
  // Establish both matching sections before insertion or merge, without changing the saved occurrence zero.
  const authored = await h.handEdit(draft, "# Member A\n\n## Scope\n\nOwned work.\n\n## Scope\n\nOther work.\n");
  const current = await h.handEdit(authored, `# Member A\n\n${body}`);
  const result = await check(h.ctx);
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const section = result.result.allocations.find(allocation => allocation.unit.locator.kind === "section");
  expect(section?.unit.content).toContain(expected);
  expect(section?.unit.content).not.toContain("Owned work.");
  expect(section?.record.version).toBe(current.version);
  expect(result.result.records).toEqual([current]);
});

it("refuses a source conflict filed after the additive batch and continues after resolution", async () => {
  const h = await createDecomposeTerminalFixture();
  const subject = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  const reference = recordReferences["work-item/conflict-record"](subject.reference.owner, "11111111");
  const label = { actor: "other-writer", time: "2026-10-19T00:00:00.000Z" };
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null,
    content: JSON.stringify({ record: subject.reference, location: { kind: "hunk", start: 0, end: 1 },
      base: subject.content, current: { content: subject.content, label }, incoming: { content: "# Competing content\n", label } }),
    provenance: { verb: "sync", lifecycleAction: "merge" } }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await acquireDecomposeTerminal(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "source-conflict",
    message: expect.stringContaining("11111111"), remedy: { text: expect.stringContaining("markers") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const conflicted = lifecycleSuccess(await h.store.read({ reference: subject.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(conflicted), resolves: [reference],
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
  expect((await check(h.ctx)).status).toBe("ok");
});

it("matches the saved ancestor identity as well as the allocated heading", async () => {
  const h = await createDecomposeTerminalFixture({ authorMap: map => {
    for (const allocation of map.authoring.sourceAllocations) {
      const target = allocation.disposition;
      if (target.kind === "target" && target.targetLocator.kind === "section") {
        target.targetLocator.level = 3;
        target.targetLocator.ancestry = [{ level: 2, headingSource: "Parent", occurrence: 0 }];
      }
    }
  } });
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
  const edited = await h.handEdit(draft, "# Member A\n\n## Other parent\n\n### Scope\n\nOwned work.\n");
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "locator-unresolved" });
  await h.handEdit(edited, edited.content.replace("## Other parent", "## Parent"));
  const result = await check(h.ctx);
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.allocations.find(allocation => allocation.unit.locator.kind === "section")?.unit.locator)
    .toMatchObject({ level: 3, ancestry: [{ level: 2, headingSource: "Parent", occurrence: 0 }] });
});

it.each(["home", "cohort"] as const)("resolves an authored %s record and retains its acquired version", async kind => {
  const h = await createDecomposeTerminalFixture({ withHome: kind === "home", authorMap: map => {
    if (kind === "home") return;
    map.authoring.destinations.push({ kind: "cohort-coordination", destinationId: "z-coordination", cohort: "group" });
    for (const allocation of map.authoring.sourceAllocations) {
      if (allocation.disposition.kind === "target" && allocation.disposition.targetLocator.kind === "section") {
        allocation.disposition.destinationId = "z-coordination";
        allocation.disposition.targetLocator.artifact = "cohort-group.md";
        allocation.ownership = "cohort-shared";
      }
    }
  } });
  const reference = kind === "home"
    ? recordReferences["work-item/draft"](lifecycleSuccess(await readWorkUnit(h.store, "home")).reference.owner)
    : recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));
  const record = lifecycleSuccess(await h.store.read({ reference }));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "locator-unresolved" });
  const current = await h.handEdit(record, `${record.content}\n## Scope\n\nIntegrated home content.\n`);
  const result = await check(h.ctx);
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.allocations).toContainEqual(expect.objectContaining({ record: current,
    unit: expect.objectContaining({ content: expect.stringContaining("Integrated home content.") }) }));
});

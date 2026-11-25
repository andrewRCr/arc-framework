/** Withdrawal conflict values retain captured placements while the live quarter moves. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createKindRegistry, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ConflictRecordSchema } from "../../src/lib/store/conflict.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const entryQuarter = ArchiveQuarterSchema.parse("2026-q3");
const provenance = { verb: "archive", lifecycleAction: "archive" };
const after = "# Inbound\n\n## Inbound\n\n### **Concern**\n\n- _Id:_ `11111111`\n\nEnd contribution.\n";

async function start(h: RefSyncFixture, name: string) {
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  return success(await h.a.store.read({ reference: made.reference }));
}

describe.each(["default", "separate"] as const)("captured withdrawal placement in %s", layout => {
  it.each([false, true])("removes an undone inbound from its completed copy (moved later: %s)", async moved => {
    const h = await refSyncFixture(layout), made = await start(h, "entry-removal");
    const entryOwner = await start(h, "completed-entry-owner");
    success(await h.a.store.write({ action: "put", reference: entryOwner.reference, expected: entryOwner.version,
      content: entryOwner.content, placement: { kind: "completed", quarter: entryQuarter }, provenance }));
    const reference = RecordReferenceSchema.parse({ owner: entryOwner.reference.owner, kind: "work-item/inbound" });
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ownQuarter } },
      { action: "put", reference, expected: null, content: after },
    ], provenance }));
    const currentQuarter = moved ? ArchiveQuarterSchema.parse("2027-q2") : entryQuarter;
    if (moved) {
      const completed = success(await h.a.store.read({ reference: entryOwner.reference }));
      success(await h.a.store.write({ action: "put", reference: completed.reference, expected: completed.version,
        content: completed.content, placement: { kind: "completed", quarter: currentQuarter }, provenance }));
    }
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
    success(await h.b.store.push());
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices))
      .toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.read({ reference: entryOwner.reference }))).toMatchObject({
      content: entryOwner.content, placement: { kind: "completed", quarter: currentQuarter, sequence: "01" }, conflicts: [],
    });
    expect(success(await h.a.store.read({ reference: made.reference })).placement)
      .toMatchObject({ kind: "completed", quarter: remoteQuarter });
  }, 60_000);

  it("uses the captured quarter for whole-record inbound alternatives after the live quarter moves", async () => {
    const h = await refSyncFixture(layout), made = await start(h, "entry-placement");
    const entryOwner = await start(h, "completed-entry-owner");
    success(await h.a.store.write({ action: "put", reference: entryOwner.reference, expected: entryOwner.version,
      content: entryOwner.content, placement: { kind: "completed", quarter: entryQuarter }, provenance }));
    const reference = RecordReferenceSchema.parse({ owner: entryOwner.reference.owner, kind: "work-item/inbound" });
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ownQuarter } },
      { action: "put", reference, expected: null, content: after },
    ], provenance }));
    const inbound = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: inbound.version, content: "",
      provenance: { verb: "save", lifecycleAction: "capture" } }));
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
    success(await h.b.store.push());

    // A separately produced quarter has neither this owner nor an ancestor holding its folder.
    const other = await refSyncFixture(layout), otherPrimary = await start(other, "unrelated-placement");
    success(await other.a.store.write({ action: "put", reference: otherPrimary.reference, expected: otherPrimary.version,
      content: otherPrimary.content, placement: { kind: "completed", quarter: entryQuarter }, provenance }));
    const quarterRef = `refs/arc/archive/${entryQuarter}`;
    await h.a.git(["fetch", "--no-tags", other.a.gitDir ?? other.a.root, quarterRef]);
    const alternate = (await h.a.git(["rev-parse", "FETCH_HEAD"])).stdout.trim();
    expect((await h.a.git(["rev-list", "--parents", "-n", "1", alternate])).stdout.trim().split(" ")).toHaveLength(1);
    const original = (await h.a.git(["rev-parse", quarterRef])).stdout.trim();
    const home = expandStoredPath(reference, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
    let switched = false, restored = false, observedAlternate = "";
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (!switched && args.includes("log") && args.includes("-1") && args.includes("--format=%H")
        && args.includes(`:(literal)${home.path}`)) {
        await h.a.git(["update-ref", quarterRef, alternate, original]);
        switched = true;
      }
      return result;
    }, execInput: async (args, input, options) => {
      if (switched && !restored && args.includes("update-ref") && input.split("\n")
        .some(line => line.split(" ")[1]?.endsWith(`/archive/${entryQuarter}`))) {
        observedAlternate = (await h.a.git(["rev-parse", quarterRef])).stdout.trim();
        // End the outside writer's transient move before the ordinary expected-value publication check.
        await h.a.git(["update-ref", quarterRef, original, alternate]);
        restored = true;
      }
      return h.a.ports.execInput(args, input, options);
    } });
    const result = success(await store.pull());
    if (switched && !restored) await h.a.git(["update-ref", quarterRef, original, alternate]);
    expect(switched).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(restored).toBe(true);
    expect(observedAlternate).toBe(alternate);
    const record = success(await h.a.store.read({ reference }));
    expect(record.content).toBe("");
    const conflicts = await Promise.all(record.conflicts.map(async conflict =>
      ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: conflict })).content))));
    expect(conflicts).toContainEqual(expect.objectContaining({ location: { kind: "record" },
      base: expect.objectContaining({ content: after, placement: { kind: "completed", quarter: entryQuarter, sequence: "01" } }),
      current: expect.objectContaining({ value: expect.objectContaining({ content: "",
        placement: { kind: "completed", quarter: entryQuarter, sequence: "01" } }) }),
      incoming: expect.objectContaining({ value: null }),
    }));
  }, 60_000);
});

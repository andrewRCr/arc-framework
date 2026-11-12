import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/create.js";
import type { BrokenRule, StoreRecord, StoreResult, WriteCheck, WriteResult } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const blocked = (): BrokenRule[] => [{ rule: "test.evidence", condition: "The evidence blocks this write.",
  remedy: { text: "Repair the evidence, then retry." } }];

describe.each(["default", "separate"] as const)("atomic native admission in %s layout", (layout) => {
  it.each(["changed", "identical"])("rechecks a read-only record changed after capture (%s) and permits retry after repair", async (content) => {
    const check: WriteCheck = async ({ before }) => {
      const evidence = success(await before.read({ reference: f.reference("work-item/meta") }));
      return evidence.content === f.content(evidence.reference) ? [] : blocked();
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const evidence = await seed(f, f.reference("work-item/meta"));
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const history = success(await f.store.history({ reference: target.reference }));
    const next = content === "identical" ? target.content : "changed\n";
    let armed = true;
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (ref === "layout" && armed) {
        armed = false;
        success(await f.store.write(update(f, evidence)));
      }
      return f.ports.lock(ref, wait);
    } });
    expect(await store.write(update(f, target, next))).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "test.evidence", remedy: { text: "Repair the evidence, then retry." },
    } });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.history({ reference: target.reference }))).toEqual(history);
    const denied = success(await f.store.read({ reference: evidence.reference }));
    success(await f.store.write(update(f, denied, f.content(denied.reference))));
    success(await store.write(update(f, target, next)));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe(next);
  });

  it("rechecks a newly created relevant owner before publication", async () => {
    const check: WriteCheck = async ({ before }) => {
      const listing = success(await before.list({ family: "work-item", kind: "work-item/meta" }));
      if (listing.status === "absent") return [];
      expect(listing.status).toBe("complete");
      return listing.status === "complete" && listing.records.some(({ content }) => JSON.parse(content).value === 2)
        ? blocked() : [];
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const history = success(await f.store.history({ reference: target.reference }));
    let created: StoreRecord | undefined;
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (ref === "layout" && !created) {
        const reference = f.reference("work-item/meta", "new-dependent");
        created = await seed(f, reference, f.content(reference, "changed"));
      }
      return f.ports.lock(ref, wait);
    } });
    expect(await store.write(update(f, target, "changed\n"))).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "test.evidence",
    } });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.history({ reference: target.reference }))).toEqual(history);
    if (!created) throw new Error("The competing owner was not created");
    success(await f.store.write(update(f, created, f.content(created.reference))));
    success(await store.write(update(f, target, "changed\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("changed\n");
  });

  it("admits after an unrelated publication without reacquiring the caller's target", async () => {
    const f = await createRefFixture({ "personal/document": { check: async () => [] } }, layout);
    const target = await seed(f, f.reference("personal/document"), "original\n");
    let created: StoreRecord | undefined;
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (ref === "layout" && !created) created = await seed(f, f.reference("work-item/meta", "unrelated"));
      return f.ports.lock(ref, wait);
    } });
    success(await store.write(update(f, target, "changed\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("changed\n");
    if (!created) throw new Error("The unrelated owner was not created");
    expect(success(await f.store.read({ reference: created.reference }))).toEqual(created);
  });

  it("admits an overlapping writer against the first writer's published state", async () => {
    let captured!: () => void;
    const capture = new Promise<void>((resolve) => { captured = resolve; });
    let competing: Promise<StoreResult<WriteResult>> | undefined;
    const mainCheck: WriteCheck = async ({ next }) => {
      if (next?.content !== "published\n") return [];
      const reference = f.reference("project-registry/counter");
      competing = contender.write({ action: "put", reference, content: f.content(reference), expected: null,
        provenance: testProvenance });
      void competing.then(captured, captured);
      await capture;
      return [];
    };
    const competingCheck: WriteCheck = async ({ before }) => {
      const current = success(await before.read({ reference: f.reference("personal/document") }));
      return current.content === "published\n" ? [] : blocked();
    };
    const f = await createRefFixture({ "personal/document": { check: mainCheck },
      "project-registry/counter": { check: competingCheck } }, layout);
    const target = await seed(f, f.reference("personal/document"), "original\n");
    let captureNext = false;
    const contender = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      const release = await f.ports.lock(ref, wait);
      if (ref === "refs/arc/project/registry") captureNext = true;
      return release;
    }, rawExec: async (args, options) => {
      const result = await f.ports.rawExec(args, options);
      if (captureNext && args.includes("for-each-ref")) { captureNext = false; captured(); }
      return result;
    } });
    success(await f.store.write(update(f, target, "published\n")));
    if (!competing) throw new Error("The overlapping writer did not start");
    success(await competing);
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("published\n");
    const counter = f.reference("project-registry/counter");
    expect(success(await f.store.read({ reference: counter })).content).toBe(f.content(counter));
  }, 15_000);

  it("rechecks read-only evidence published by a pull after capture", async () => {
    const check: WriteCheck = async ({ before }) => {
      const record = success(await before.read({ reference: f.reference("work-item/meta") }));
      return record.content === f.content(record.reference) ? [] : blocked();
    };
    const f = await createRefFixture({ "personal/document": { check } }, layout);
    const evidence = await seed(f, f.reference("work-item/meta"));
    const peer = f.remote(true);
    if (!peer) throw new Error("No peer store");
    success(await f.store.push());
    success(await peer.pull());
    const remote = success(await peer.read({ reference: evidence.reference }));
    success(await peer.write(update(f, remote)));
    success(await peer.push());
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const history = success(await f.store.history({ reference: target.reference }));
    let armed = true;
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (ref === "layout" && armed) { armed = false; success(await f.store.pull()); }
      return f.ports.lock(ref, wait);
    } });
    expect(await store.write(update(f, target, "changed\n"))).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "test.evidence",
    } });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.history({ reference: target.reference }))).toEqual(history);
    const current = success(await f.store.read({ reference: evidence.reference }));
    expect(current.content).toBe(f.content(current.reference, "changed"));
    success(await f.store.write(update(f, current, f.content(current.reference))));
    success(await store.write(update(f, target, "changed\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("changed\n");
  }, 15_000);
});

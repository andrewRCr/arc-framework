/** Registered cohort renames preserve identity and compose version-bound content changes. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import type { Store } from "../../src/lib/store/contract.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const document = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Coordinate.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const native = backend === "ref" ? await createRefFixture(production) : undefined;
  const f = native ?? createReferenceFixture({}, production);
  const invoke = (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, { storeFactory: async () => {
    let store = f.store;
    if (native !== undefined) {
      const { createRefStore } = await import("../../src/lib/store/create.js");
      const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
      const fresh = createDefaultRefStorePorts({ checkoutRoot: native.root, backingRepository: async () => null });
      store = createRefStore({ ...fresh, registry: native.ports.registry, identity: native.ports.identity,
        actor: native.ports.actor, clock: native.ports.clock, random: native.ports.random });
    }
    return decorate?.(store) ?? store;
  } });
  return { ...f, native, cli, invoke };
}

describe.each(["reference", "ref"] as const)("cohort rename over %s", backend => {
  it.each([false, true])("canonicalizes its former Parent and binds that unchanged evidence, concurrent=%s", async concurrent => {
    const f = await fixture(backend), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, document(parentRef.owner.name));
    const child = await seed(f, childRef, document(childRef.owner.name, parentRef.owner.name));
    const currentRef = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "current-parent" } });
    success(await f.store.write({ ...recordPut(parent, { content: document("current-parent") }), reference: currentRef,
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    const current = success(await f.store.read({ reference: parent.reference }));
    const history = success(await f.store.history({ reference: parent.reference }));
    let advanced = current;
    const result = await f.invoke(["rename", childRef.owner.name, "after", "--json"], concurrent ? store => {
      const batch = store.batch.bind(store); let once = true;
      store.batch = async input => {
        if (once) {
          once = false;
          success(await f.store.write({ ...recordPut(current, { content: current.content.replace("Coordinate", "Keep the concurrent purpose") }),
            provenance: { verb: "write-back", lifecycleAction: "edit" } }));
          advanced = success(await f.store.read({ reference: parent.reference }));
        }
        return batch(input);
      };
      return store;
    } : undefined);
    if (concurrent) {
      expect(result.exitCode).toBe(1);
      expect(result.result).toMatchObject({ refusal: { code: "version-conflict" } });
      expect(success(await f.store.read({ reference: child.reference }))).toEqual(child);
      expect(success(await f.store.read({ reference: parent.reference }))).toEqual(advanced);
      const retry = await f.invoke(["rename", childRef.owner.name, "after", "--json"]);
      expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    } else {
      expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
      expect(success(await f.store.read({ reference: parent.reference }))).toEqual(current);
      expect(success(await f.store.history({ reference: parent.reference }))).toEqual(history);
    }
    expect(success(await f.store.read({ reference: child.reference })).content).toBe(document("after", "current-parent"));
  }, 60_000);

  it("renames the selected cohort and reports a no-write rerun through its former name", async () => {
    const f = await fixture(backend), reference = f.reference("cohort/document", "before");
    const primary = await seed(f, reference, document(reference.owner.name));
    const owner = primary.reference.owner;
    if (owner.type !== "cohort" || owner.uid === undefined) throw new Error("Expected cohort UID");
    const result = await f.invoke(["rename", owner.uid.toUpperCase(), "after", "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const renamed = success(await f.store.read({ reference: primary.reference }));
    expect(renamed.reference).toEqual(RecordReferenceSchema.parse({ ...primary.reference, owner: { ...owner, name: "after" } }));
    expect(renamed.content).toBe(document("after"));
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(owner.name) })).reference).toEqual(renamed.reference);
    expect(result.result).toMatchObject({ status: "renamed", shape: "cohort", reference: renamed.reference,
      sourceSlug: owner.name, targetSlug: "after", recordBatch: "applied",
      report: { references: [], memberHeadings: [], formerSlugTies: [], keptBranches: [] } });
    const history = success(await f.store.history({ reference: renamed.reference })), version = success(await f.store.version());
    const repeated = await f.invoke(["rename", owner.name, "after"]);
    expect(repeated.exitCode ?? 0, repeated.stdout + repeated.stderr).toBe(0);
    expect(repeated.stdout).toContain(`Cohort: ${owner.name} → after`);
    expect(repeated.stdout).toMatch(/already renamed/iu);
    expect(success(await f.store.version())).toBe(version);
    expect(success(await f.store.read({ reference: primary.reference }))).toEqual(renamed);
    expect(success(await f.store.history({ reference: primary.reference }))).toEqual(history);
  }, 60_000);
});

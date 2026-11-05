/** Registered rename selects one exact work-unit owner beneath a same-name clash. */
import { expect, it } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/identity.js";
import { writeMetaTitle } from "../../src/lib/store/kinds/meta/writers.js";
import { rewriteCohortHeading } from "../../src/lib/store/kinds/cohort/index.js";
import type { Store } from "../../src/lib/store/contract.js";

async function fixture() {
  const cli = await repairCliFixture(), production = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const f = await createRefFixture(production);
  const storeFactory = async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: f.ports.registry, identity: f.ports.identity,
      actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
  };
  return { ...f, cli, invoke: (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, {
    storeFactory: async () => { const store = await storeFactory(); return decorate?.(store) ?? store; },
  }) };
}

it.each([false, true])("reports the former-name tie left by the second rename and its continuation, json=%s", async json => {
  const f = await fixture(), firstUid = "12345678-abcd-4abc-8abc-123456789abc", secondUid = "12345678-abcd-4abc-8abc-123456789def";
  const first = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: firstUid, content: makeMetaFixture("shared") });
  const second = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: secondUid, content: makeMetaFixture("shared") });
  const flags = json ? ["--json"] : [];
  const initial = await f.invoke(["rename", firstUid, "first", ...flags]);
  expect(initial.exitCode ?? 0, initial.stdout + initial.stderr).toBe(0);
  if (json) expect(initial.result).toMatchObject({ report: { formerSlugTies: [] } });
  else expect(initial.stdout + initial.stderr).not.toContain("Former slug:");
  const kept = success(await f.store.read({ reference: first }));
  const result = await f.invoke(["rename", secondUid, "second", ...flags]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const tie = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  expect(tie).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", tie: { name: "former", liveness: "live" } } });
  if (tie.status !== "refused" || tie.refusal.code !== "ambiguous-match") throw new Error("Expected a former-name tie");
  const expected = [{ slug: "shared", condition: tie.refusal.condition, remedy: tie.refusal.remedy }];
  if (json) expect(result.result).toMatchObject({ status: "renamed", report: { formerSlugTies: expected } });
  else for (const text of ["Former slug: shared", "Name the intended holder by its current name", "`first`", "`second`"]) {
    expect(result.stdout + result.stderr).toContain(text);
  }
  expect(success(await f.store.read({ reference: first }))).toEqual(kept);
  const renamed = success(await f.store.read({ reference: second }));
  expect(renamed.reference.owner.name).toBe("second");
  const history = success(await f.store.history({ reference: second }));
  const resumed = await f.invoke(["rename", "second", "second", ...flags]);
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  if (json) expect(resumed.result).toMatchObject({ status: "renamed", recordBatch: "existing", report: { formerSlugTies: expected } });
  else expect(resumed.stdout + resumed.stderr).toContain("Former slug: shared");
  expect(success(await f.store.read({ reference: second }))).toEqual(renamed);
  expect(success(await f.store.history({ reference: second }))).toEqual(history);
}, 60_000);

it("holds a heading decision on unreadable cohort evidence and retries after repair", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789def", cohortRef = f.reference("cohort/document", "group");
  const cohort = await seed(f, cohortRef, `# Cohort: \`${cohortRef.owner.name}\`\n\n**Purpose:** Coordinate.\n\n## Members\n\n### \`shared\`\n`);
  const broken = await plantRefPrimary(f, { kind: "cohort/document", name: "broken", uid: "12345678-abcd-4abc-8abc-123456789aaa",
    content: "# Cohort: `broken`\n\n**Parent:** [none]\n\n**Purpose:** Other work.\n" });
  const other = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789abc",
    content: makeMetaFixture("shared", { cohort: "broken" }) });
  const source = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid,
    content: makeMetaFixture("shared", { cohort: cohort.reference.owner.name }) });
  const original = success(await f.store.read({ reference: source })), kept = success(await f.store.read({ reference: other }));
  const operand = uid.toUpperCase(); let faultVersion: string | undefined;
  const result = await f.invoke(["rename", operand, "renamed", "--json"], store => {
    const list = store.list.bind(store); let once = true;
    store.list = async input => {
      const result = await list(input);
      if (once && input.owner?.type === "work-item" && input.owner.uid === uid) {
        once = false;
        await f.plant(broken, "unknown-format-version");
        expect(await f.store.read({ reference: broken })).toMatchObject({ status: "refused" });
        faultVersion = success(await f.store.version());
      }
      return result;
    };
    return store;
  });
  expect(result.exitCode).toBe(1);
  expect(result.result, JSON.stringify(result.result)).toMatchObject({ status: "rejected", refusal: { rule: "lifecycle.rename",
    condition: expect.stringContaining("Member heading ownership is unavailable."), remedy: { argv: ["arc", "rename", operand, "renamed"] } } });
  expect(faultVersion).toBeDefined();
  expect(success(await f.store.version())).toBe(faultVersion);
  expect(success(await f.store.read({ reference: source }))).toEqual(original);
  expect(success(await f.store.read({ reference: cohort.reference }))).toEqual(cohort);
  await plantRefPrimary(f, { kind: "cohort/document", name: "broken", uid: "12345678-abcd-4abc-8abc-123456789aaa",
    content: "# Cohort: `broken`\n\n**Parent:** [none]\n\n**Purpose:** Restored.\n" });
  const retry = await f.invoke(["rename", operand, "renamed", "--json"]);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(success(await f.store.read({ reference: cohort.reference })).content).toContain("### `renamed`");
  expect(success(await f.store.read({ reference: other }))).toEqual(kept);
}, 60_000);

it.each(["current", "former", "ended", "former-cohort", "unrelated-cohort"] as const)("decides member heading ownership from a %s holder", async mode => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789def", cohortRef = f.reference("cohort/document", "group");
  let cohort = await seed(f, cohortRef, `# Cohort: \`${cohortRef.owner.name}\`\n\n**Purpose:** Coordinate.\n\n## Members\n\n### \`shared\`\n`);
  const otherCohort = mode === "unrelated-cohort" ? await seed(f, f.reference("cohort/document", "other"),
    `# Cohort: \`${f.reference("cohort/document", "other").owner.name}\`\n\n**Purpose:** Other work.\n`) : cohort;
  let other: RecordReference;
  if (mode === "ended") {
    other = (await seed(f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "shared" })),
      makeMetaFixture("shared", { state: "Shipped", currentWorkflow: null, cohort: otherCohort.reference.owner.name,
        completed: "2026-10-16", prUrl: "https://example.test/pull/1" }),
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") })).reference;
  } else other = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789abc",
    content: makeMetaFixture("shared", { cohort: otherCohort.reference.owner.name }) });
  if (mode === "former") {
    const prior = success(await f.store.read({ reference: other }));
    other = RecordReferenceSchema.parse({ ...other, owner: { ...other.owner, name: "earlier" } });
    success(await f.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("earlier")) }),
      reference: other, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  }
  if (mode === "former-cohort") {
    const reference = RecordReferenceSchema.parse({ ...cohort.reference, owner: { ...cohort.reference.owner, name: "current-group" } });
    success(await f.store.write({ ...recordPut(cohort, { content: rewriteCohortHeading(cohort.content, "current-group") }),
      reference, provenance: { verb: "rename", lifecycleAction: "rename" } }));
    cohort = success(await f.store.read({ reference }));
  }
  const selected = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid,
    content: makeMetaFixture("shared", { cohort: cohort.reference.owner.name }) });
  const kept = success(await f.store.read({ reference: other }));
  const result = await f.invoke(["rename", uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(success(await f.store.read({ reference: selected })).reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: other }))).toEqual(kept);
  const document = success(await f.store.read({ reference: cohort.reference }));
  if (mode === "unrelated-cohort") {
    expect(document.content).toContain("### `renamed`");
    expect(result.result).toMatchObject({ report: { memberHeadings: [] } });
  } else {
    expect(document.content).toBe(cohort.content);
    expect(result.result).toMatchObject({ report: { memberHeadings: [
      { document: cohort.reference, line: 7, replacement: "### `renamed`" },
    ] } });
  }
}, 60_000);

it("rewrites work-item references independently of a cohort holding the same slug", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const source = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid, content: makeMetaFixture("shared") });
  const waitingRef = f.reference("work-item/meta", "waiting");
  const waiting = await seed(f, waitingRef, `${makeMetaFixture(waitingRef.owner.name,
    { state: "Planning", currentWorkflow: null, dependsOn: ["shared"] })}\nSee \`spec-shared.md\`.\n`,
  { kind: "backlog", commitment: "planned" });
  const cohort = await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789def",
    content: "# Cohort: `shared`\n\n**Purpose:** Coordinate.\n" });
  const kept = success(await f.store.read({ reference: cohort }));
  const result = await f.invoke(["rename", uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const updated = success(await f.store.read({ reference: waiting.reference }));
  expect(updated.fields).toMatchObject({ dependsOn: ["renamed"] });
  expect(updated.content).toContain("`spec-renamed.md`");
  expect(result.result).toMatchObject({ report: { references: [] } });
  expect(success(await f.store.read({ reference: source })).reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: cohort }))).toEqual(kept);
}, 60_000);

it.each([false, true])("leaves a reused ended subject's references unreported, tied live holders=%s", async tied => {
  const f = await fixture();
  const sourceRef = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "shared" }));
  const source = await seed(f, sourceRef, makeMetaFixture("shared", { state: "Shipped", currentWorkflow: null,
    completed: "2026-10-16", prUrl: "https://example.test/pull/1" }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
  const uid = source.reference.owner.uid;
  const live = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789def",
    content: makeMetaFixture("shared") });
  const waitingRef = f.reference("work-item/meta", "waiting");
  const waiting = await seed(f, waitingRef, `${makeMetaFixture(waitingRef.owner.name,
    { state: "Planning", currentWorkflow: null, dependsOn: ["shared"] })}\nSee \`spec-shared.md\`.\n`,
  { kind: "backlog", commitment: "planned" });
  if (tied) await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789aaa",
    content: makeMetaFixture("shared") });
  const kept = success(await f.store.read({ reference: live }));
  const result = await f.invoke(["rename", uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "renamed", report: { references: [] } });
  expect(success(await f.store.read({ reference: source.reference })).reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: waiting.reference }))).toEqual(waiting);
  expect(success(await f.store.read({ reference: live }))).toEqual(kept);
}, 60_000);

it("keeps target settlement when ambiguous source references are left for authored repair", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid, content: makeMetaFixture("shared") });
  const targetRef = f.reference("work-item/meta", "target");
  const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null,
    completed: "2026-10-16", prUrl: "https://example.test/pull/1" }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const waitingRef = f.reference("work-item/meta", "waiting");
  const waiting = await seed(f, waitingRef, `${makeMetaFixture(waitingRef.owner.name,
    { state: "Planning", currentWorkflow: null, dependsOn: ["shared", target.reference.owner.name] })}\nSee \`spec-shared.md\`.\n`,
  { kind: "backlog", commitment: "planned" });
  await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: "12345678-abcd-4abc-8abc-123456789def", content: makeMetaFixture("shared") });
  const result = await f.invoke(["rename", uid, target.reference.owner.name, "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const retained = success(await f.store.read({ reference: waiting.reference }));
  expect(retained.fields).toMatchObject({ dependsOn: ["shared"] });
  expect(retained.content).toContain("See `spec-shared.md`.");
  expect(result.result).toMatchObject({ report: { references: [
    { record: { type: "work-unit", name: waiting.reference.owner.name, uid: expect.any(String) }, edits: [
      { kind: "field", field: "dependsOn", from: "shared", to: target.reference.owner.name },
      { kind: "text", document: waiting.reference, line: retained.content.trimEnd().split("\n").length,
        replacement: `See \`spec-${target.reference.owner.name}.md\`.` },
    ] },
  ] } });
  expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
}, 60_000);

it.each(["work-unit", "errand"] as const)("leaves ambiguous work-item references with repairs under a %s tie", async kind => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc", otherUid = "12345678-abcd-4abc-8abc-123456789def";
  const cohortRef = f.reference("cohort/document", "group");
  const cohort = await seed(f, cohortRef, `# Cohort: \`${cohortRef.owner.name}\`\n\n**Purpose:** Coordinate.\n\n## Members\n\n### \`shared\`\n\nSee \`spec-shared.md\`.\n`);
  const source = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid,
    content: makeMetaFixture("shared", { cohort: cohort.reference.owner.name }) });
  const waitingRef = f.reference("work-item/meta", "waiting");
  const waiting = await seed(f, waitingRef, `${makeMetaFixture(waitingRef.owner.name,
    { state: "Planning", currentWorkflow: null, dependsOn: ["shared"] })}\nSee \`spec-shared.md\` and \`tasks-shared.md\`.\n`,
  { kind: "backlog", commitment: "planned" });
  const errand = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "shared", claimId: "b".repeat(32),
    intent: "Retain the other holder", owner: "test-user", branch: "chore/shared", createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
  const other = await plantRefPrimary(f, { kind: kind === "work-unit" ? "work-item/meta" : "work-item/record", name: "shared", uid: otherUid,
    content: kind === "work-unit" ? makeMetaFixture("shared") : serializeTransientIdentityRecord(errand) });
  const kept = success(await f.store.read({ reference: other }));
  const result = await f.invoke(["rename", uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(success(await f.store.read({ reference: source })).reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: other }))).toEqual(kept);
  expect(success(await f.store.read({ reference: waiting.reference }))).toEqual(waiting);
  const document = success(await f.store.read({ reference: cohort.reference }));
  expect(document.content).toContain("See `spec-shared.md`.");
  const waitingLine = waiting.content.trimEnd().split("\n").length;
  expect(result.result).toMatchObject({ status: "renamed", report: { references: expect.arrayContaining([
    { record: { type: "work-unit", name: waiting.reference.owner.name, uid: expect.any(String) }, edits: [
      { kind: "field", field: "dependsOn", from: "shared", to: "renamed" },
      { kind: "text", document: waiting.reference, line: waitingLine, replacement: "See `spec-renamed.md` and `tasks-renamed.md`." },
    ] },
    { record: { type: "cohort", name: cohort.reference.owner.name, uid: expect.any(String) }, edits: [
      { kind: "text", document: cohort.reference, line: 9, replacement: "See `spec-renamed.md`." },
    ] },
  ]) } });
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(other);
}, 60_000);

it("emits one JSON rename result with the selected reference and report", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "source", uid, content: makeMetaFixture("source") });
  const result = await f.invoke(["rename", uid, "target", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "renamed", reference: { ...reference, owner: { ...reference.owner, name: "target" } },
    report: { references: [], memberHeadings: [], formerSlugTies: [], keptBranches: [] } });
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).toBe("");
  expect(success(await f.store.read({ reference })).reference.owner.name).toBe("target");
}, 60_000);

it("emits a store refusal as one lifecycle JSON envelope without changing state", async () => {
  const f = await fixture(), before = success(await f.store.version());
  const result = await f.invoke(["rename", "missing", "target", "--json"]);
  expect(result.exitCode).toBe(1);
  expect(result.result).toMatchObject({ status: "rejected", reason: expect.any(String),
    refusal: { code: "not-found" }, remedy: { invariant: expect.any(String), text: expect.any(String) } });
  expect(result.stdout.trim().split("\n")).toHaveLength(1); expect(result.stderr).toBe("");
  expect(success(await f.store.version())).toBe(before);
}, 60_000);

it.each([false, true])("renames the selected UID under a work-unit clash, uppercase=%s", async uppercase => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc", otherUid = "12345678-abcd-4abc-8abc-123456789def";
  const selected = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid, content: makeMetaFixture("shared") });
  const other = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: otherUid, content: makeMetaFixture("shared") });
  const kept = success(await f.store.read({ reference: other })), before = success(await f.store.version());
  const refused = await f.invoke(["rename", "shared", "renamed"]), text = refused.stdout + refused.stderr;
  expect(refused.exitCode).toBe(1);
  expect(text).toContain(`arc rename ${uid}`); expect(text).toContain(`arc rename ${otherUid}`);
  expect(success(await f.store.version())).toBe(before);
  const result = await f.invoke(["rename", uppercase ? uid.toUpperCase() : uid, "renamed"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const renamed = success(await f.store.read({ reference: selected }));
  expect(renamed.reference).toEqual({ ...selected, owner: { ...selected.owner, name: "renamed" } });
  expect(success(await f.store.read({ reference: other }))).toEqual(kept);
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(other);
}, 60_000);

it("refuses an Errand UID with its own exit command before changing records", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "errand", claimId: "a".repeat(32),
    intent: "Retain the selected role", owner: "test-user", branch: "chore/errand", createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
  const reference = await plantRefPrimary(f, { kind: "work-item/record", name: "errand", uid, content: serializeTransientIdentityRecord(record) });
  const primary = success(await f.store.read({ reference })), before = success(await f.store.version());
  const result = await f.invoke(["rename", uid, "renamed"]);
  expect(result.exitCode).toBe(1); expect(result.stdout + result.stderr).toContain(`arc errand close ${uid}`);
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference }))).toEqual(primary);
}, 60_000);

it("dispatches a cohort UID to the unavailable cohort rename arm without writing", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const reference = await plantRefPrimary(f, { kind: "cohort/document", name: "group", uid,
    content: "# Cohort: `group`\n\n**Purpose:** Coordinate.\n" });
  const primary = success(await f.store.read({ reference })), before = success(await f.store.version());
  const result = await f.invoke(["rename", uid, "renamed"]);
  expect(result.exitCode).toBe(1); expect(result.stdout + result.stderr).toContain("unsupported");
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference }))).toEqual(primary);
}, 60_000);

it.each([false, true])("retains the uppercase UID after a failed push and resumes by the current slug without another record batch, json=%s", async json => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc", operand = uid.toUpperCase();
  const projectRef = f.reference("project-registry/identity");
  const project = success(await f.store.write({ action: "put", reference: projectRef, expected: null, content: f.content(projectRef),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  if (project.reference.owner.type !== "project" || project.reference.owner.uid === undefined) throw new Error("Expected project UID");
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "source", uid, content: makeMetaFixture("source") });
  const primary = success(await f.store.read({ reference }));
  success(await f.store.write({ ...recordPut(primary, { links: { branches: [{ repository: project.reference.owner.uid, ref: "chore/earlier", linkedAs: "created", excluded: [] },
    { repository: project.reference.owner.uid, ref: "feat/source", linkedAs: "created", excluded: [] }] } }), provenance: { verb: "link", lifecycleAction: "link" } }));
  const dependentRef = f.reference("work-item/meta", "dependent");
  const dependent = await seed(f, dependentRef, makeMetaFixture(dependentRef.owner.name, { dependsOn: ["source"] }), { kind: "active" });
  const remote = join(f.cli.cwd, ".git", "code-remote.git");
  await f.cli.exec("git", ["init", "--bare", remote]);
  await f.cli.exec("git", ["remote", "add", "origin", remote]);
  await f.cli.exec("git", ["push", "origin", "main"]);
  await f.cli.exec("git", ["switch", "-c", "feat/source"]);
  await f.cli.exec("git", ["push", "-u", "origin", "feat/source"]);
  await writeWorktreeMarker(f.cli.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "source", uid },
    spawningIdentity: "test-user", createdAt: "2026-10-16T00:00:00Z" });
  const hook = join(remote, "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const flags = json ? ["--json"] : [];
  const partial = await f.invoke(["rename", operand, "target", ...flags]);
  expect(partial.exitCode).toBe(1);
  if (json) {
    expect(partial.result).toMatchObject({ status: "partial", reference: { owner: { name: "target", uid } },
      remedy: { argv: ["arc", "rename", operand, "target"] },
      report: { references: [{ record: { type: "work-unit", name: dependent.reference.owner.name, uid: expect.any(String) },
        edits: [{ kind: "field", field: "dependsOn", from: "source", to: "target" }] }],
      keptBranches: [{ branch: "chore/earlier", reason: "other-link" }] } });
    expect(partial.stdout.trim().split("\n")).toHaveLength(1);
  } else {
    expect(partial.stdout + partial.stderr).toContain(`arc rename ${operand} target`);
    expect(partial.stdout + partial.stderr).toContain("kept chore/earlier");
    expect(partial.stdout + partial.stderr).toContain(dependent.reference.owner.name);
    expect(partial.stdout + partial.stderr).toContain('Depends On: "source" → "target"');
  }
  const renamed = success(await f.store.read({ reference }));
  expect(success(await f.store.read({ reference: dependent.reference }))).toEqual(dependent);
  expect(renamed.reference.owner.name).toBe("target");
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/target");
  const markerPath = resolveWorktreeMarkerPath(f.cli.cwd), marker = await readFile(markerPath, "utf8");
  const head = (await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const pending = await f.invoke(["rename", "target", "target", ...flags]);
  expect(pending.exitCode).toBe(1);
  if (json) expect(pending.result).toMatchObject({ status: "partial", remedy: { argv: ["arc", "rename", "target", "target"] } });
  else expect(pending.stdout + pending.stderr).toContain("arc rename target target");
  expect(success(await f.store.read({ reference }))).toEqual(renamed);
  expect(await readFile(markerPath, "utf8")).toBe(marker);
  await rm(hook);
  const resumed = await f.invoke(["rename", "target", "target", ...flags]);
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  if (json) expect(resumed.result).toMatchObject({ status: "renamed", recordBatch: "existing",
    report: { keptBranches: [{ branch: "chore/earlier", reason: "other-link" }] } });
  expect(success(await f.store.read({ reference }))).toEqual(renamed);
  expect(await readFile(markerPath, "utf8")).toBe(marker);
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/target");
  expect((await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/target"])).stdout).toContain(head);
}, 60_000);

it.each([false, true])("refuses a fresh same-name request before physical effects, uid=%s", async byUid => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "source", uid, content: makeMetaFixture("source") });
  const primary = success(await f.store.read({ reference })), before = success(await f.store.version());
  const head = (await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout;
  const result = await f.invoke(["rename", byUid ? uid : "source", "source"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("distinct source and target");
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference }))).toEqual(primary);
  expect((await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
}, 60_000);

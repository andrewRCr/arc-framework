/** Registered rename selects one exact work-unit owner beneath a same-name clash. */
import { expect, it } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

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
  return { ...f, cli, invoke: (args: readonly string[]) => repairCli(cli, args, { storeFactory }) };
}

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

it("retains the uppercase UID after a failed push and resumes by the current slug without another record batch", async () => {
  const f = await fixture(), uid = "12345678-abcd-4abc-8abc-123456789abc", operand = uid.toUpperCase();
  const projectRef = f.reference("project-registry/identity");
  const project = success(await f.store.write({ action: "put", reference: projectRef, expected: null, content: f.content(projectRef),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  if (project.reference.owner.type !== "project" || project.reference.owner.uid === undefined) throw new Error("Expected project UID");
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "source", uid, content: makeMetaFixture("source") });
  const primary = success(await f.store.read({ reference }));
  success(await f.store.write({ ...recordPut(primary, { links: { branches: [{ repository: project.reference.owner.uid,
    ref: "feat/source", linkedAs: "created", excluded: [] }] } }), provenance: { verb: "link", lifecycleAction: "link" } }));
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
  const partial = await f.invoke(["rename", operand, "target"]);
  expect(partial.exitCode).toBe(1);
  expect(partial.stdout + partial.stderr).toContain(`arc rename ${operand} target`);
  const renamed = success(await f.store.read({ reference }));
  expect(renamed.reference.owner.name).toBe("target");
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/target");
  const markerPath = resolveWorktreeMarkerPath(f.cli.cwd), marker = await readFile(markerPath, "utf8");
  const head = (await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const pending = await f.invoke(["rename", "target", "target"]);
  expect(pending.exitCode).toBe(1);
  expect(pending.stdout + pending.stderr).toContain("arc rename target target");
  expect(success(await f.store.read({ reference }))).toEqual(renamed);
  expect(await readFile(markerPath, "utf8")).toBe(marker);
  await rm(hook);
  const resumed = await f.invoke(["rename", "target", "target"]);
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
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

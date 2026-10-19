/** Transient identity authority moves into ordinary work and claim refs. */
import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { inboxEntrySourceDigest } from "../../src/lib/user-sync/inbox-writer.js";
import { z } from "zod";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { rejoinEntryList, splitEntryList } from "../../src/lib/store/concurrency/entries.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";

const timestamp = "2026-01-01T00:00:00.000Z";
type TransientIdentityRecord = z.input<typeof TransientIdentityRecordSchema>;
const common = { version: 3 as const, claimId: "1".repeat(32), createdAt: timestamp, updatedAt: timestamp };
const ordinary: TransientIdentityRecord = { ...common, kind: "errand", purpose: "errand", slug: "example", branch: "chore/example",
  intent: "Keep this intent", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null };
const sourceRef = "refs/arc/user/andrew/errands";
const keptPrefix = "refs/arc/tmp/migrate/import/kept/";

async function seed(h: Awaited<ReturnType<typeof importFixture>>, records: TransientIdentityRecord[]): Promise<string> {
  const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "andrew" };
  const entries = new Map<string, string>();
  for (const record of records) entries.set(record.slug, await hashBlob(io.execInput, serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse(record))));
  return writeTreeCommit(io, entries, "Seed transient identities", [], null);
}

it("retains origin and the cleanup lease if publication is disabled after landing", async () => {
  const h = await importFixture();
  const tip = await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  h.ports.migrateStep = async (step) => { if (step === "import.publish") await h.git("git", ["config", "remote.origin.arc-state", "off"]); };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  expect((await h.remote("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  h.ports.migrateStep = async () => {};
  await h.git("git", ["config", "remote.origin.arc-state", "push"]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", sourceRef])).stdout).toBe("");
});

describe.each(["default", "separate"] as const)("Errand import in %s", (layout) => {
  it("compares re-homed identity records against an independent source", async () => {
    const h = await importComparisonFixture(layout, async (fixture) => {
      const head = (await fixture.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      const inbox = "# Inbox\n\n## Errand\n\n### **Captured**\n\n- _Description:_ Keep this source prose.\n\n### **Remain**\n\n- _Description:_ Keep this capture.\n";
      await mkdir(join(fixture.root, ".arc/user/andrew"), { recursive: true });
      await writeFile(join(fixture.root, ".arc/user/andrew/USER-INBOX.md"), inbox);
      await seed(fixture, [ordinary,
        { ...common, kind: "errand", purpose: "errand", slug: "captured", branch: "chore/captured", intent: "Fallback",
          origin: "inbox", originEntry: "Captured", originEntrySourceDigest: inboxEntrySourceDigest(inbox, "Captured"), state: "open", savedHead: null, changeRequest: null },
        { ...common, kind: "errand", purpose: "housekeep-routing", slug: "housekeep", branch: "chore/housekeep", state: "open", savedHead: null, changeRequest: null },
        { ...common, kind: "groom", slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"], openedBaseHead: head,
          protection: "partial", branch: null, state: "open", changeRequest: null },
      ]);
    });
    h.comparators.set("work-item/record", { normalize: (expected, actual) => {
      const fields = JSON.parse(actual.content) as Record<string, unknown>;
      expect(fields.owner).toBe("andrew");
      delete fields.owner;
      return { expected, actual: { ...actual, content: canonicalize(fields) } };
    } });
    h.comparators.set("personal/inbox", { normalize: async (expected, actual) => {
      const split = splitEntryList(expected.content, ENTRY_CONFIGS["personal/inbox"]);
      const origin = split.parts.find((part) => part.kind === "entry" && part.bytes.startsWith("### **Captured**"));
      if (!origin) throw new Error("Source origin missing");
      const description = success(await h.store.read({ reference: RecordReferenceSchema.parse({
        kind: "work-item/description", owner: { type: "work-item", name: "captured" },
      }) }));
      expect(description.content.replace(/^- _Id:_ `[0-9a-f]{8}`\n/gmu, "")).toBe(`# captured\n\n## Description\n\n${origin.bytes}\n`);
      const content = rejoinEntryList({ parts: split.parts.filter((part) => part !== origin) });
      const parsed = parseEntryList(content, "personal/inbox");
      if (!parsed.success) throw new Error(parsed.error);
      return { expected: { ...expected, content, fields: parsed.data }, actual };
    } });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await h.compare()).toEqual([]);
    const ref = RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name: "example" } });
    const record = success(await h.store.read({ reference: ref }));
    success(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content.replace("Keep this intent", "Changed intent"), placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await h.compare()).toEqual(expect.arrayContaining([expect.objectContaining({ field: "content" })]));
  });
  it("keeps advanced origin authority and completes cleanup after repair", async () => {
    const h = await importFixture(layout);
    if (layout === "separate") {
      await h.migrate(true);
      const scope = [`--git-dir=${join(h.root, ".git/arc/store")}`];
      await h.git("git", [...scope, "config", "remote.backing.url", h.origin]);
      await h.git("git", [...scope, "config", "remote.backing.arc-state", "push"]);
    }
    const tip = await seed(h, [ordinary]);
    await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["push", "origin", `${head}:refs/heads/temporary`]);
    h.ports.migrateStep = async (step) => {
      if (step === "import.transient.remote-delete") await h.remote("git", ["update-ref", sourceRef, head, tip]);
    };
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("advanced") } });
    expect((await h.remote("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(head);
    expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
    await h.remote("git", ["update-ref", sourceRef, tip, head]);
    h.ports.migrateStep = async (step) => { if (step === "import.transient.drop-kept") throw new Error("interrupt-after-remote-delete"); };
    await expect(h.migrate()).rejects.toThrow("interrupt-after-remote-delete");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", sourceRef])).stdout).toBe("");
    h.ports.migrateStep = async () => {};
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
  });

  it("refuses a changed local source lease and resumes after reconciliation", async () => {
    const h = await importFixture(layout);
    const tip = await seed(h, [ordinary]);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const boundary = layout === "default" ? "import.land" : "import.transient.local-delete";
    h.ports.migrateStep = async (step) => { if (step === boundary) await h.git("git", ["update-ref", sourceRef, head, tip]); };
    expect(await h.migrate()).toMatchObject({ status: "refused" });
    expect((await h.git("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(head);
    if (layout === "default") expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
    await h.git("git", ["update-ref", sourceRef, tip, head]);
    h.ports.migrateStep = async () => {};
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", sourceRef, keptPrefix])).stdout).toBe("");
  });

  it("retains cleanup leases across landing and resumes without reminting owners", async () => {
    const h = await importFixture(layout);
    const tip = await seed(h, [ordinary]);
    await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
    const step = layout === "default" ? "import.publish" : "import.transient.local-delete";
    h.ports.migrateStep = async (observed) => { if (observed === step) throw new Error("interrupt-cleanup"); };
    await expect(h.migrate()).rejects.toThrow("interrupt-cleanup");
    const refs = async (prefix: string) => (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout;
    expect(await refs(sourceRef)).toBe(layout === "default" ? "" : `${sourceRef} ${tip}`);
    expect(await refs(keptPrefix)).toContain(tip);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const before = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"])).stdout;
    h.ports.migrateStep = async () => {};
    const result = await h.migrate();
    expect(result).toMatchObject({ status: "ok" });
    expect(await refs(sourceRef)).toBe("");
    expect(await refs(keptPrefix)).toBe("");
    expect((await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"])).stdout).toBe(before);
    const remote = (await h.remote("git", ["for-each-ref", "--format=%(refname)", sourceRef])).stdout;
    expect(remote).toBe(layout === "default" ? "" : sourceRef);
    if (layout === "separate") expect(result).toMatchObject({ result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining(sourceRef), remedy: expect.objectContaining({ text: expect.stringContaining("origin") }) }),
    ]) } });
  });

  it("leaves transient refs and no kept tips after a trial", async () => {
    const h = await importFixture(layout);
    const tip = await seed(h, [ordinary]);
    expect(await h.migrate(true)).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
  });
  it("leaves other people's transient authority in place and reports it", async () => {
    const h = await importFixture(layout);
    const tip = await seed(h, [ordinary]);
    const other = "refs/arc/user/alex/errands";
    await h.git("git", ["update-ref", other, tip]);
    const result = await h.migrate();
    expect(result).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining(other) }),
    ]) } });
    expect((await h.git("git", ["rev-parse", other])).stdout.trim()).toBe(tip);
  });
  it.each([false, true])("moves the origin before stamping, reports source changes (%s), and falls back to intent", async (changed) => {
    const h = await importFixture(layout);
    const inbox = "# Inbox\n\n## Errand\n\n### **Captured**\n\n- _Description:_ Original source prose.\n\n### **Keep**\n\n- _Description:_ Unrelated capture.\n";
    await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
    await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), changed ? inbox.replace("Original source prose.", "Original source prose. Updated.") : inbox);
    await seed(h, ["captured", "missing"].map((slug) => ({ ...common, kind: "errand", purpose: "errand", slug,
      branch: `chore/${slug}`, intent: `Fallback ${slug}`, origin: "inbox", originEntry: slug === "captured" ? "Captured" : "Gone",
      originEntrySourceDigest: slug === "captured" ? inboxEntrySourceDigest(inbox, "Captured") : null,
      state: "open", savedHead: null, changeRequest: null })));
    const migrated = await h.migrate();
    expect(migrated).toMatchObject({ status: "ok" });
    if (changed) expect(migrated).toMatchObject({ result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("changed since adoption") }),
    ]) } });
    const store = createRefStore(h.ports);
    const read = async (kind: "work-item/description" | "personal/inbox", name: string) => success(await store.read({
      reference: RecordReferenceSchema.parse({ kind, owner: { type: kind === "personal/inbox" ? "person" : "work-item", name } }),
    })).content;
    expect(await read("work-item/description", "captured")).toContain("Original source prose.");
    expect(await read("work-item/description", "captured")).toContain("## Description");
    expect(await read("work-item/description", "captured")).toMatch(/_Id:_ `[0-9a-f]{8}`/u);
    expect(await read("work-item/description", "missing")).toContain("Fallback missing");
    const importedInbox = await read("personal/inbox", "andrew");
    expect(importedInbox).not.toContain("Captured");
    expect(importedInbox).toContain("Unrelated capture.");
  });
  it("re-homes every Errand state with its owner and both claim roles", async () => {
    const h = await importFixture(layout);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const records: TransientIdentityRecord[] = [
      ...(["open", "paused", "awaiting-merge"] as const).map((state): TransientIdentityRecord => ({
        ...common, kind: "errand", purpose: "errand", slug: `example-${state}`, branch: `chore/example-${state}`,
        intent: `Intent for ${state}`, origin: "description", originEntry: null,
        ...(state === "open" ? { state, savedHead: null, changeRequest: null }
          : state === "paused" ? { state, savedHead: head, changeRequest: null }
          : { state, savedHead: null, changeRequest: { repositoryRef: "example/repo", hostRef: "github", baseRef: "main", headSha: head, headRef: `chore/example-${state}` } }),
      })),
      { ...common, kind: "errand", purpose: "housekeep-routing", slug: "housekeep", branch: "chore/housekeep", state: "open", savedHead: null, changeRequest: null },
      { ...common, kind: "groom", slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"], openedBaseHead: head,
        protection: "partial", branch: null, state: "open", changeRequest: null },
    ];
    await seed(h, records);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const work = success(await store.list({ family: "work-item", kind: "work-item/record" }));
    expect(work.status).toBe("complete");
    if (work.status !== "complete") throw new Error("Missing imported Errands");
    expect(work.records).toHaveLength(3);
    for (const record of work.records) {
      expect(record.reference.owner).toMatchObject({ type: "work-item", uid: expect.any(String) });
      expect(record.placement).toEqual({ kind: "active" });
      expect(JSON.parse(record.content)).toMatchObject({ owner: "andrew", state: record.reference.owner.name.slice("example-".length) });
    }
    const claims = success(await store.list({ family: "claims" }));
    expect(claims.status).toBe("complete");
    if (claims.status !== "complete") throw new Error("Missing imported claims");
    expect(claims.records.map(({ reference }) => reference.kind).sort()).toEqual(["claims/groom", "claims/housekeep"]);
  });
});

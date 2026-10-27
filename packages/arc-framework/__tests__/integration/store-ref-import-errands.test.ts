/** Transient identity authority moves into ordinary work and claim refs. */
import { describe, expect, it } from "vitest";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema, runStoreRemote } from "../../src/lib/store/index.js";
import { inboxEntrySourceDigest } from "../../src/lib/user-sync/inbox-writer.js";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { keptPrefix, ordinaryErrand as ordinary, seedTransients as seed, transientCommon as common, transientSourceRef as sourceRef,
  type TransientIdentityRecord } from "../helpers/store/import-transients.js";
import { success } from "../helpers/store/suite-tools.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { rejoinEntryList, splitEntryList } from "../../src/lib/store/concurrency/entries.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../src/lib/git/remote-ref-reader.js";
import type { GitExecOptions } from "../../src/lib/git/exec.js";

/** Prepare the empty separate store with a backing repository at origin's URL as its state remote. */
async function designateBacking(h: Awaited<ReturnType<typeof importFixture>>): Promise<void> {
  const directory = join(h.root, ".git/arc/store");
  await h.git("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
  const scope = [`--git-dir=${directory}`];
  await h.git("git", [...scope, "config", "remote.backing.url", h.origin]);
  await h.git("git", [...scope, "config", "remote.backing.arc-state", "push"]);
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

it("resumes a publication interrupted after its state push and retires origin's copy", async () => {
  const h = await importFixture();
  const tip = await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  const original = h.ports.exec;
  let interrupted = false;
  h.ports.exec = async (...args) => {
    const result = await original(...args);
    if (!interrupted && args[1].includes("push")) { interrupted = true; throw new Error("interrupt-after-publish"); }
    return result;
  };
  await expect(h.migrate()).rejects.toThrow("interrupt-after-publish");
  const state = async (exec: typeof h.git) => (await exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout
    .split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/")).sort();
  const published = await state(h.remote);
  expect(published).toContain(`${sourceRef} ${tip}`);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  h.ports.exec = original;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await state(h.remote)).toEqual(published.filter((line) => line !== `${sourceRef} ${tip}`));
  expect(await state(h.git)).toEqual(await state(h.remote));
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
});

it("prunes a kept tip its rerun no longer re-homes and leaves origin's copy in place", async () => {
  const h = await importFixture();
  const tip = await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  h.ports.migrateStep = async (step) => { if (step === "import.land") throw new Error("interrupt-import"); };
  await expect(h.migrate()).rejects.toThrow("interrupt-import");
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  await h.git("git", ["update-ref", "-d", sourceRef, tip]);
  h.ports.migrateStep = async () => {};
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
  expect((await h.remote("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.split("\n").filter(Boolean))
    .toHaveLength((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.split("\n").filter(Boolean).length);
});

const refs = async (exec: (file: string, args: string[]) => Promise<{ stdout: string }>, prefix: string, scope: string[] = []) =>
  (await exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout;

describe("Errand import interrupted in the separate layout", () => {
  it.each(["import.transient.local-delete", "import.publish"])("resumes a backing-published import interrupted at %s and retires origin's copy", async (boundary) => {
    const h = await importFixture("separate");
    await designateBacking(h);
    const tip = await seed(h, [ordinary]);
    await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
    h.ports.migrateStep = async (step) => { if (step === boundary) throw new Error("interrupt-import"); };
    await expect(h.migrate()).rejects.toThrow("interrupt-import");
    const store = [`--git-dir=${join(h.root, ".git/arc/store")}`];
    expect(await refs(h.git, sourceRef)).toBe(boundary === "import.transient.local-delete" ? `${sourceRef} ${tip}` : "");
    expect(await refs(h.git, keptPrefix)).toContain(tip);
    expect(await refs(h.remote, sourceRef)).toBe(`${sourceRef} ${tip}`);
    expect(await refs(h.remote, "refs/arc/work/")).toBe("");
    const landed = await refs(h.git, "refs/arc/work/", store);
    expect(landed).not.toBe("");
    h.ports.migrateStep = async () => {};
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(await refs(h.git, sourceRef)).toBe("");
    expect(await refs(h.git, keptPrefix)).toBe("");
    expect(await refs(h.remote, sourceRef)).toBe("");
    expect(await refs(h.git, "refs/arc/work/", store)).toBe(landed);
    expect(await refs(h.remote, "refs/arc/work/")).toBe(landed);
  });

  it("resumes a local-only import interrupted at its landing and names origin's retained copy", async () => {
    const h = await importFixture("separate");
    const tip = await seed(h, [ordinary]);
    await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
    h.ports.migrateStep = async (step) => { if (step === "import.land") throw new Error("interrupt-import"); };
    await expect(h.migrate()).rejects.toThrow("interrupt-import");
    const store = [`--git-dir=${join(h.root, ".git/arc/store")}`];
    expect(await refs(h.git, sourceRef)).toBe(`${sourceRef} ${tip}`);
    expect(await refs(h.git, keptPrefix)).toContain(tip);
    expect(await refs(h.git, "refs/arc/work/", store)).toBe("");
    h.ports.migrateStep = async () => {};
    const result = await h.migrate();
    if (result.status !== "ok") throw new Error(JSON.stringify(result));
    const conditions = result.result.notices.map(({ condition }) => condition);
    expect(conditions).toContain(`origin still holds ${sourceRef}; no state remote is designated.`);
    expect(conditions).not.toContain("The landing would mint the repository identity ID.");
    expect(await refs(h.git, sourceRef)).toBe("");
    expect(await refs(h.git, "refs/arc/tmp/migrate/import/")).toBe("");
    expect(await refs(h.git, "refs/arc/tmp/migrate/import/", store)).toBe("");
    expect(await refs(h.git, "refs/arc/work/", store)).not.toBe("");
    expect(await refs(h.remote, sourceRef)).toBe(`${sourceRef} ${tip}`);
  });
});

describe("Errand import moved to the other layout before its rerun", () => {
  it.each([["default", "import.publish", "off"], ["separate", "import.publish", "push"], ["separate", "import.transient.local-delete", "push"]] as const)(
    "finishes the cleanup of an import in %s interrupted at %s once origin's role is %s", async (layout, boundary, role) => {
      const h = await importFixture(layout);
      const tip = await seed(h, [ordinary]);
      await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
      h.ports.migrateStep = async (step) => { if (step === boundary) throw new Error("interrupt-import"); };
      await expect(h.migrate()).rejects.toThrow("interrupt-import");
      h.ports.migrateStep = async () => {};
      expect(await refs(h.git, keptPrefix)).toContain(tip);
      expect(await runStoreRemote(h.ports, { remote: "origin", role })).toMatchObject({ status: "ok",
        result: { layout: layout === "default" ? "separate" : "default" } });
      const result = await h.migrate();
      expect(result.status, JSON.stringify(result)).toBe("ok");
      expect(await refs(h.git, sourceRef)).toBe("");
      expect(await refs(h.git, keptPrefix)).toBe("");
      if (role === "push") expect(await refs(h.remote, sourceRef)).toBe("");
      else {
        expect(result).toMatchObject({ result: { notices: expect.arrayContaining([
          expect.objectContaining({ condition: `origin still holds ${sourceRef}; no state remote is designated.` })]) } });
        expect(await refs(h.remote, sourceRef)).toBe(`${sourceRef} ${tip}`);
      }
    });
});

it("re-homes the Errands a layout move out of the code repository's refs left in place", async () => {
  const h = await importFixture();
  const tip = await seed(h, [ordinary]);
  expect(await runStoreRemote(h.ports, { remote: "origin", role: "off" })).toMatchObject({ status: "ok", result: { layout: "separate" } });
  expect(await refs(h.git, sourceRef)).toBe(`${sourceRef} ${tip}`);
  const result = await h.migrate();
  expect(result.status, JSON.stringify(result)).toBe("ok");
  expect(await refs(h.git, "refs/arc/work/", [`--git-dir=${join(h.root, ".git/arc/store")}`])).not.toBe("");
  expect(await refs(h.git, sourceRef)).toBe("");
});

describe.each(["default", "separate"] as const)("Errand import in %s", (layout) => {
  if (layout === "default") {
    it("compares re-homed identity records against an independent source", async () => {
      const h = await importComparisonFixture(layout, async (fixture) => {
        const head = (await fixture.git("git", ["rev-parse", "HEAD"])).stdout.trim();
        const inbox = "# Inbox\n\n## Errand\n\n### **Captured**\n\n- _Description:_ Keep this source prose.\n\n### **Remain**\n\n- _Description:_ Keep this capture.\n";
        await mkdir(join(fixture.root, ".arc/user/andrew"), { recursive: true });
        await writeFile(join(fixture.root, ".arc/user/andrew/USER-INBOX.md"), inbox);
        await saveImportPersonal(fixture.root);
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
  }
  it("keeps advanced origin authority and completes cleanup after repair", async () => {
    const h = await importFixture(layout);
    if (layout === "separate") await designateBacking(h);
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

  if (layout === "default") {
    it("leaves transient refs and no kept tips after a trial", async () => {
      const h = await importFixture(layout);
      const tip = await seed(h, [ordinary]);
      expect(await h.migrate(true)).toMatchObject({ status: "ok" });
      expect((await h.git("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
      expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
    });
    it("re-homes every held identity's transient authority under the identity whose ref held it", async () => {
      const h = await importFixture(layout);
      const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      await seed(h, [ordinary]);
      const other = "refs/arc/user/alex/errands";
      await seed(h, [{ ...common, kind: "errand", purpose: "errand", slug: "alex-example", branch: "chore/alex-example", intent: "Keep this intent",
        origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }, { ...common, kind: "groom", slug: "groom-beta",
        anchorStub: "beta", members: ["beta"], openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }], "alex");
      const result = await h.migrate();
      expect(result.status, JSON.stringify(result)).toBe("ok");
      if (result.status === "ok") expect(result.result.notices.filter(({ condition }) => condition.includes(other))).toEqual([]);
      expect((await h.git("git", ["for-each-ref", "--format=%(refname)", sourceRef, other])).stdout).toBe("");
      const work = success(await createRefStore(h.ports).list({ family: "work-item", kind: "work-item/record" }));
      if (work.status !== "complete") throw new Error("Missing imported Errands");
      expect(work.records.map(({ reference, content }) => [reference.owner.name, JSON.parse(content).owner]).sort())
        .toEqual([["alex-example", "alex"], ["example", "andrew"]]);
      expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/alex/claims"])).stdout.trim()).toBe("refs/arc/user/alex/claims");
    });
    it.each([false, true])("moves the origin before stamping, reports source changes (%s), and falls back to intent", async (changed) => {
      const h = await importFixture(layout);
      const inbox = "# Inbox\n\n## Errand\n\n### **Captured**\n\n- _Description:_ Original source prose.\n\n### **Keep**\n\n- _Description:_ Unrelated capture.\n";
      await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
      await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), changed ? inbox.replace("Original source prose.", "Original source prose. Updated.") : inbox);
      await saveImportPersonal(h.root);
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
  }
});

it("reports a duplicated Errand origin title under a trial and imports once the titles differ", async () => {
  const h = await importFixture();
  const entry = "### **Captured**\n\n- _Description:_ Original source prose.\n";
  const inbox = `# Inbox\n\n## Errand\n\n${entry}\n${entry.replace("Original source prose.", "Second capture.")}`;
  await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), inbox);
  await saveImportPersonal(h.root);
  await seed(h, [{ ...common, kind: "errand", purpose: "errand", slug: "captured", branch: "chore/captured", intent: "Fallback captured",
    origin: "inbox", originEntry: "Captured", originEntrySourceDigest: null, state: "open", savedHead: null, changeRequest: null }]);
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("Captured"), remedy: expect.objectContaining({ text: expect.stringContaining("retry arc store migrate --import") }) })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), inbox.replace("### **Captured**\n\n- _Description:_ Second", "### **Recaptured**\n\n- _Description:_ Second"));
  await saveImportPersonal(h.root);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});

it("retires origin's transient copy with passive interaction and stable diagnostics", async () => {
  const h = await importFixture();
  await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  const original = h.ports.exec, calls: { args: string[]; options?: GitExecOptions }[] = [];
  h.ports.exec = async (command, args, options) => {
    if (["ls-remote", "push"].includes(args[0] ?? "") && args.some((arg) => arg.includes(sourceRef))) calls.push({ args, options });
    return original(command, args, options);
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", sourceRef])).stdout).toBe("");
  expect(calls.map(({ args }) => args[0]).sort()).toEqual(["ls-remote", "push"]);
  for (const { options } of calls) expect(options).toMatchObject({ diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION });
});

it("reports an origin entry a stray inbox heading keeps from reading under a trial, and imports once the heading is repaired", async () => {
  const h = await importFixture();
  const entry = "### **Captured**\n\n- _Description:_ Original source prose.\n";
  const clean = `# Inbox\n\n## Errand\n\n${entry}`;
  const inbox = `${clean}\n### Stray heading\n\n- _Description:_ Loose prose.\n`;
  await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), inbox);
  await saveImportPersonal(h.root);
  await seed(h, [{ ...common, kind: "errand", purpose: "errand", slug: "captured", branch: "chore/captured", intent: "Fallback captured", origin: "inbox",
    originEntry: "Captured", originEntrySourceDigest: inboxEntrySourceDigest(clean, "Captured"), state: "open", savedHead: null, changeRequest: null }]);
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("### Stray heading"), remedy: { text: expect.stringContaining("entry heading") } })]) } });
  if (trial.status !== "ok") throw new Error("Trial refused");
  expect(trial.result.notices.map(({ remedy }) => remedy?.text ?? "").join("\n")).not.toMatch(/one distinct title/u);
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), inbox.replace("### Stray heading", "### **Stray heading**"));
  await saveImportPersonal(h.root);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});

it("keeps the cleanup lease when origin declines a leased transient delete, and retires the copy once it accepts", async () => {
  const h = await importFixture();
  const tip = await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  const hook = join(h.origin, "hooks", "update");
  await writeFile(hook, `#!/bin/sh\n[ "$1" = ${sourceRef} ] && [ "$3" = ${"0".repeat(40)} ] && exit 1\nexit 0\n`);
  await chmod(hook, 0o755);
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining(`Could not retire origin's ${sourceRef}`), remedy: { argv: ["arc", "store", "migrate", "--import"] } } });
  expect((await h.remote("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  await writeFile(hook, "#!/bin/sh\nexit 0\n");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", sourceRef])).stdout).toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
});

it("keeps the cleanup lease when origin cannot be read with no state remote, and names its copy once it can", async () => {
  const h = await importFixture("separate");
  const tip = await seed(h, [ordinary]);
  await h.git("git", ["push", "origin", `${sourceRef}:${sourceRef}`]);
  h.ports.migrateStep = async (step) => { if (step === "import.transient.local-delete") await rename(h.origin, `${h.origin}.offline`); };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining("Could not read origin's transient refs"), remedy: { argv: ["arc", "store", "migrate", "--import"] } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  h.ports.migrateStep = async () => {};
  await rename(`${h.origin}.offline`, h.origin);
  const result = await h.migrate();
  expect(result).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: `origin still holds ${sourceRef}; no state remote is designated.` })]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
  expect((await h.remote("git", ["rev-parse", sourceRef])).stdout.trim()).toBe(tip);
});

it.each(["andrew", "none"] as const)("retains another identity's source until its replacement claims publish when importing as %s", async importing => {
  const h = await importFixture();
  const base = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const groom: TransientIdentityRecord = { ...common, kind: "groom", slug: "groom-beta", anchorStub: "beta", members: ["beta"],
    openedBaseHead: base, protection: "partial", branch: null, state: "open", changeRequest: null };
  const other = "refs/arc/user/alex/errands", tip = await seed(h, [groom], "alex");
  await h.git("git", ["push", "origin", `${other}:${other}`]);
  if (importing === "none") await h.git("git", ["config", "--unset", "arc.identity"]);
  const result = await h.migrate();
  expect(result).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("alex"),
    remedy: { text: expect.stringContaining("alex") } } });
  expect((await h.remote("git", ["rev-parse", other])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  const requirements = "refs/arc/tmp/migrate/import-required";
  const requiredTip = (await h.git("git", ["rev-parse", requirements])).stdout.trim();
  await h.git("git", ["update-ref", "-d", requirements, requiredTip]);
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished",
    condition: expect.stringContaining("publication"), remedy: { text: expect.stringContaining("Restore") } } });
  expect((await h.remote("git", ["rev-parse", other])).stdout.trim()).toBe(tip);
  await h.git("git", ["update-ref", requirements, requiredTip]);
  const alex = createRefStore({ ...h.ports, identity: async () => SlugSchema.parse("alex") });
  expect(success(await alex.push()).publishes.every(row => row.status !== "failed")).toBe(true);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", other])).stdout).toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
});

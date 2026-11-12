/** Repository-store reads compared with the existing lifecycle readers on real Git trees. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { onTestFinished, describe, expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, RecordReferenceSchema, StateVersionSchema } from "../../src/lib/store/identity.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import { resolveComposedLifecycleIndex } from "../../src/lib/work-unit/composed-lifecycle-index.js";
import { digestBytes } from "../../src/lib/kernel/canonical/canonical-json.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput, makeCommit } from "../helpers/integration.js";
import { TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { readTransientInFlightIndexes, projectTransientInFlightRead } from "../../src/lib/errand/record.js";
import { deriveInFlight } from "../../src/lib/git/in-flight-derivation.js";
import { success } from "../helpers/store/suite-tools.js";

async function fixture() {
  const root = await createTempRepo("arc-store-reads-");
  onTestFinished(async () => cleanupTempDir(root));
  const actual = makeGitExec(root);
  await actual("git", ["commit", "--allow-empty", "-m", "Initialize repository"]);
  const exec: typeof actual = (command, args, options) => {
    if (args[0] === "fetch" || args[0] === "push") throw new Error("A listing must not contact a remote");
    return actual(command, args, options);
  };
  const ports = createDefaultStorePorts({ checkoutRoot: root, exec, execInput: makeGitExecInput(root) });
  const store = createStore(ports);
  const reference = (name: string, kind = "work-item/meta") => RecordReferenceSchema.parse({ kind,
    owner: OwnerIdentitySchema.parse({ type: "work-item", name }) });
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
  };
  const commit = async (message = "Save lifecycle records") => { await exec("git", ["add", "."]); return makeCommit(root, message); };
  return { root, exec, ports, store, reference, put, commit };
}
describe("tracked meta and companion reads", () => {
  it.each([true, false])("adds companion placement-only evidence after validating the meta (%s)", async (validContent) => {
    const h = await fixture();
    const path = ".arc/completed/2026-Q4/01_example/meta-example.md";
    const content = makeMetaFixture("example", { state: "Shipped" });
    await h.put(path, validContent ? content : content.replace("- **Design:** [none]", "- **Design:** [TBD]"));
    await h.put(".arc/completed/2026-Q4/01_example/draft-example.md", "draft bytes\n");
    const head = await h.commit();
    const listed = success(await h.store.list({ family: "work-item", kind: "work-item/draft", asOf: StateVersionSchema.parse(head) }));
    expect(listed).toMatchObject({ status: "complete", records: [], missed: true,
      diagnostics: [expect.objectContaining({ key: path, kind: "malformed" })] });
    if (listed.status !== "complete") throw new Error("Expected a diagnostic-bearing inventory");
    if (validContent) expect(listed.diagnostics[0]).toHaveProperty("rule", "placement");
    else expect(listed.diagnostics[0]).not.toHaveProperty("rule");
  });
  it.each([
    [".arc/active/meta-example.md", "Active", { kind: "active" }],
    [".arc/backlog/planned/example/meta-example.md", "Planning", { kind: "backlog", commitment: "planned" }],
    [".arc/backlog/provisional/example/meta-example.md", "Planning", { kind: "backlog", commitment: "provisional" }],
    [".arc/backlog/planned/group/sub/example/meta-example.md", "Planning", { kind: "backlog", commitment: "planned" }],
    [".arc/completed/2026-q4/01_example/meta-example.md", "Shipped", { kind: "completed", quarter: "2026-q4", sequence: "01" }],
  ] as const)("preserves parsed fields and directory placement at %s", async (path, state, placement) => {
    const h = await fixture();
    const content = makeMetaFixture("example", { state, cohort: path.includes("group/sub") ? "group/sub" : null });
    await h.put(path, content);
    const legacy = await buildLifecycleIndex({ cwd: h.root, fs: h.ports.fs });
    expect(legacy.get("example")?.path).toBe(path);
    const listed = success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(listed).toMatchObject({ status: "complete", records: [{ placement, fields: parseMetaRecord(content),
      content, version: digestBytes(Buffer.from(content)), formatVersion: 1, conflicts: [] }] });
  });
  it("diagnoses legacy paths the layout cannot place and invalid filename slugs", async () => {
    const h = await fixture();
    for (const [name, path, state] of [
      ["flat-plan", ".arc/backlog/planned/meta-flat-plan.md", "Planning"],
      ["flat-archive", ".arc/completed/meta-flat-archive.md", "Shipped"],
      ["upper", ".arc/completed/2026-Q4/01_upper/meta-upper.md", "Shipped"],
    ] as const) await h.put(path, makeMetaFixture(name, { state }));
    await h.put(".arc/active/meta-Bad_Name.md", makeMetaFixture("bad-name"));
    const legacy = await buildLifecycleIndex({ cwd: h.root, fs: h.ports.fs });
    expect([...legacy.keys()]).toEqual(expect.arrayContaining(["flat-plan", "flat-archive", "upper"]));
    const listed = success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(listed.status).toBe("complete");
    if (listed.status === "complete") { expect(listed.records).toEqual([]); expect(listed.diagnostics).toHaveLength(4); }
  });
  it("reads one live branch copy with its task list, unknown companion, and paired spec halves", async () => {
    const h = await fixture();
    await h.exec("git", ["checkout", "-b", "feat/example"]);
    const content = makeMetaFixture("example", { branch: "feat/example", taskList: "tasks-another.md" });
    await h.put(".arc/active/meta-example.md", content);
    for (const [file, bytes] of [["draft-example.md", "draft\n \n"], ["tasks-example.md", "tasks\n"],
      ["research-example.md", "research\n"], ["spec-example-prd.md", "prd\n"], ["spec-example-rfc.md", "rfc\n"],
      ["cohort-example.md", "not a companion\n"]]) await h.put(`.arc/active/${file}`, bytes ?? "");
    await h.commit(); await h.exec("git", ["checkout", "main"]);
    const legacy = await resolveComposedLifecycleIndex({ cwd: h.root, fs: h.ports.fs,
      oracle: { exec: h.exec, acquisitionPolicy: "local", baseBranch: "main" } });
    expect(legacy.recordsBySlug.get("example")?.selected.source.kind).toBe("in-flight-meta");
    const meta = success(await h.store.read({ reference: h.reference("example") }));
    expect(meta.content).toBe(content);
    expect(meta.fields).toEqual(parseMetaRecord(content));
    expect(success(await h.store.read({ reference: h.reference("example", "work-item/draft") })).content).toBe("draft\n \n");
    expect(success(await h.store.read({ reference: h.reference("example", "work-item/task-list") })).content).toBe("tasks\n");
    const companions = success(await h.store.list({ family: "work-item", kind: "work-item/companion" }));
    expect(companions).toMatchObject({ status: "complete", records: expect.any(Array) });
    if (companions.status === "complete") expect(companions.records.map((record) => record.reference.key).sort()).toEqual(["research", "spec-prd", "spec-rfc"]);
    expect(success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } })).status).toBe("absent");
  });
  it("uses the parked pointer's bytes and version while listing the branch's projected fields", async () => {
    const h = await fixture();
    const branch = makeMetaFixture("example", { branch: "feat/example", cohort: "group", nextTask: "Branch progress" });
    await h.exec("git", ["checkout", "-b", "feat/example"]);
    await h.put(".arc/active/meta-example.md", branch); await h.put(".arc/active/draft-example.md", "branch draft\n");
    await h.commit(); await h.exec("git", ["checkout", "main"]);
    const pointer = makeMetaFixture("example", { branch: "feat/example", cohort: "group", nextTask: "Pointer progress" });
    await h.put(".arc/backlog/planned/group/example/meta-example.md", pointer);
    await h.put(".arc/backlog/planned/group/example/draft-example.md", "pointer draft\n");
    const legacy = await resolveComposedLifecycleIndex({ cwd: h.root, fs: h.ports.fs,
      oracle: { exec: h.exec, acquisitionPolicy: "local", baseBranch: "main" } });
    expect(legacy.recordsBySlug.get("example")?.writablePath).toBe(".arc/backlog/planned/group/example/meta-example.md");
    const record = success(await h.store.read({ reference: h.reference("example") }));
    expect(record).toMatchObject({ content: pointer, version: digestBytes(Buffer.from(pointer)), placement: { kind: "backlog", commitment: "planned" } });
    const listed = success(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
    expect(listed).toMatchObject({ status: "complete", records: [{ fields: parseMetaRecord(branch), version: record.version, placement: record.placement }] });
    expect(success(await h.store.read({ reference: h.reference("example", "work-item/draft") })).content).toBe("pointer draft\n");
  });
  it("selects an accepted completed duplicate over an unplaceable planned state while retaining flat-active precedence", async () => {
    const h = await fixture();
    await h.put(".arc/backlog/planned/example/meta-example.md", makeMetaFixture("example").replace("`Active`", "`Unknown`"));
    const completed = makeMetaFixture("example", { state: "Shipped" });
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", completed);
    const held = success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(held).toMatchObject({ status: "complete", records: [{ content: completed, placement: { kind: "completed" } }] });
    const active = makeMetaFixture("example").replace("`Active`", "`Unknown`");
    await h.put(".arc/active/meta-example.md", active);
    expect(success(await h.store.read({ reference: h.reference("example") })).content).toBe(active);
    expect(success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } })))
      .toMatchObject({ status: "complete", records: [{ content: active, placement: { kind: "active" } }] });
  });
  it.each([true, false])("reads recorded Errands using the writer identity (configured: %s)", async (configured) => {
    const h = await fixture();
    await h.exec("git", ["config", "user.name", "andrew"]);
    if (configured) await h.exec("git", ["config", "arc.identity", "andrew"]);
    const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", slug: "recorded-errand",
      claimId: "a".repeat(32), purpose: "errand", origin: "description", originEntry: null,
      intent: "Exercise recorded branch discovery", branch: "chore/recorded-errand", state: "open",
      savedHead: null, changeRequest: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" });
    if (record.branch === null) throw new Error("The Errand fixture requires its branch");
    await h.exec("git", ["branch", record.branch]);
    expect((await transactTransientIdentities({ exec: h.exec, execInput: makeGitExecInput(h.root), identity: "andrew" }, {
      remote: null, message: "Record Errand", transform: (basis) => ({ kind: "applied",
        records: new Map([...basis, [record.slug, record]]), value: null }),
    })).kind).toBe("applied");
    const identity = await h.ports.identity();
    expect(identity).toBe("andrew");
    if (identity === null) throw new Error("The writer identity is unavailable");
    const transient = projectTransientInFlightRead(await readTransientInFlightIndexes({ exec: h.exec, identity }));
    const derived = await deriveInFlight({ exec: h.exec, identity, teamMode: false, localOnly: true,
      errandSlugByBranch: transient.indexes.slugByBranch, errandRecordsComplete: transient.complete });
    expect(derived.entries).toEqual(expect.arrayContaining([expect.objectContaining({ branch: record.branch, slug: record.slug })]));
    expect(derived.residue.filter((item) => item.branch === record.branch)).toEqual([]);
    expect(success(await h.store.list({ family: "work-item", kind: "work-item/meta" })).status).toBe("absent");
  });
  it("selects only origin for state publication even when upstream is configured", async () => {
    const h = await fixture();
    await h.exec("git", ["remote", "add", "upstream", h.root]);
    expect(await h.ports.remote()).toBeNull();
    await h.exec("git", ["remote", "add", "origin", h.root]);
    expect(await h.ports.remote()).toBe("origin");
  });
});

/** The capture gates' inbox reads answer through the registered command over real refs. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { entryVersion } from "../../src/lib/store/kinds/entry-fields.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

const capture = "### **Concern**\n- _Created:_ `2026-01-01`\n- WU_Target: example\n- _Id:_ `12345678`\n\nProse";

async function fixture() {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS)), exec = makeGitExec(f.root);
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(f.root, ".arc/system"), { recursive: true });
  await writeFile(join(f.root, ".arc/system/arc-config.yml"), "branch.base: main\nsession.remote_sync: disabled\n");
  await writeFile(join(f.root, ".gitignore"), ".arc-checkouts/\n.arc/system/.internal/\n.arc/user/\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Configure inbox fixture"]);
  const ref = f.reference("project-registry/identity");
  success(await f.store.write({ action: "put", reference: ref, expected: null, content: f.content(ref),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function inbox(f: Fixture, args: readonly string[]) {
  const previous = process.cwd(), exit = process.exitCode;
  let stdout = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    binding.store = f.store; process.chdir(f.root); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "inbox", ...args, "--json"]);
    return { exitCode: process.exitCode ?? 0, result: JSON.parse(stdout) as Record<string, unknown> };
  } finally { binding.store = null; out.mockRestore(); err.mockRestore(); process.chdir(previous); process.exitCode = exit; }
}

function ageDays(created: string): number {
  return Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(created)) / 86_400_000);
}

it("answers a personal target clear, named with each capture's ID and version, or refused for a malformed target", async () => {
  const f = await fixture();
  await seed(f, f.reference("personal/inbox"), `## Work Unit\n${capture}\n`);
  expect(await inbox(f, ["personal", "--target", "elsewhere"])).toMatchObject({ exitCode: 0,
    result: { mode: "inbox", state: "clear", list: "personal", target: "elsewhere", entries: [] } });
  expect(await inbox(f, ["personal", "--target", "example"])).toMatchObject({ exitCode: 0,
    result: { state: "named", target: "example",
      entries: [{ id: "12345678", version: entryVersion({ section: "Work Unit", bytes: capture }), raw: capture }] } });
  expect(await inbox(f, ["personal", "--target", "Not A Slug"])).toMatchObject({ exitCode: 1,
    result: { state: "refused", code: "invalid-input", list: "personal" } });
});

it.each(["project", "work-item-one"])("refuses a target filter on the %s list", async list => {
  const f = await fixture();
  if (list !== "project") await seed(f, f.reference("work-item/meta"), makeMetaFixture(list, { owner: "test-user", state: "Active" }));
  expect(await inbox(f, [list, "--target", "example"])).toMatchObject({ exitCode: 1,
    result: { state: "refused", code: "invalid-input", list, remedy: { text: expect.stringContaining("arc inbox personal --target") } } });
});

it("accepts every selector the quick reference shows with --target", async () => {
  const reference = await readFile(new URL("../../arc/reference/QUICK-REFERENCE.template.md", import.meta.url), "utf8");
  const selectors = [...reference.matchAll(/^arc inbox (\S+) .*--target\b/gmu)]
    .flatMap(match => match[1]!.replace(/[<>]/gu, "").split("|"));
  expect(selectors).toContain("personal");
  const f = await fixture();
  await seed(f, f.reference("work-item/meta"), makeMetaFixture("work-item-one", { owner: "test-user", state: "Active" }));

  const refusals: string[] = [];
  for (const selector of selectors) {
    const list = selector === "slug" ? "work-item-one" : selector;
    const { exitCode, result } = await inbox(f, [list, "--target", "work-item-one"]);
    if (exitCode !== 0) refusals.push(`arc inbox ${list} --target work-item-one: ${result.code}`);
  }
  expect(refusals).toEqual([]);
});

it("lists a work unit's inbound entries with their pending count and oldest age", async () => {
  const f = await fixture();
  const primary = await seed(f, f.reference("work-item/meta"), makeMetaFixture("work-item-one", { owner: "test-user", state: "Active" }));
  const later = "### **Later concern**\n- _Created:_ `2026-01-05`\n- _Id:_ `87654321`\n\nProse";
  await seed(f, recordReferences["work-item/inbound"](primary.reference.owner), `## Inbound\n${capture}\n\n${later}\n`);
  const before = ageDays("2026-01-01");
  const listed = await inbox(f, ["work-item-one"]);
  expect(listed, JSON.stringify(listed.result)).toMatchObject({ exitCode: 0, result: { state: "listed", list: "work-item-one",
    entries: [{ id: "12345678" }, { id: "87654321" }], pending: { count: 2, oldestDate: "2026-01-01" } } });
  expect([before, ageDays("2026-01-01")]).toContain((listed.result.pending as { oldestAgeDays: number }).oldestAgeDays);
});

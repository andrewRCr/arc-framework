/** Off-branch session context lives in the named work unit's meta projection. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { materializeWorkUnitSessionNotesPath, resolveWorkUnitSessionNotesPath } from "../../../src/lib/handoff/session-notes-path.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

it.each([false, true])("resolves the record's meta without consulting workspace files, completed=%s", async completed => {
  const h = createLifecycleHarness();
  await h.seedMeta("demo", { state: completed ? "Shipped" : "Planning", currentWorkflow: completed ? null : "draft-design" }, completed
    ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  const result = await resolveWorkUnitSessionNotesPath("/linked", "andrew", "demo", { store: h.store,
    access: async () => { throw new Error("Several stale workspace folders exist"); } });
  expect(result).toEqual({ status: "resolved", path: completed
    ? "/linked/.arc/completed/2026-q4/01_demo/meta-demo.md" : "/linked/.arc/active/meta-demo.md" });
  expect(materializeWorkUnitSessionNotesPath("/linked", "andrew", "demo"))
    .toBe("/linked/.arc/user/andrew/demo/SESSION-NOTES.md");
});

it("preserves absent versus failed operational reads", async () => {
  const h = createLifecycleHarness();
  expect(await resolveWorkUnitSessionNotesPath("/linked", "andrew", "missing", { store: h.store,
    access: async () => { throw new Error("Do not read stale workspace"); } })).toEqual({ status: "absent" });
});

it("closes only the workspace folder and leaves the projected session-context meta", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, access } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { runUserClose } = await import("../../../src/commands/user/close.js");
  const cwd = await mkdtemp(join(tmpdir(), "arc-close-context-"));
  try {
    const meta = join(cwd, ".arc/active/meta-demo.md");
    const seed = materializeWorkUnitSessionNotesPath(cwd, "andrew", "demo");
    await mkdir(join(cwd, ".arc/active"), { recursive: true });
    await mkdir(join(cwd, ".arc/user/andrew/demo"), { recursive: true });
    await writeFile(meta, "Authoritative session context");
    await writeFile(seed, "Retired workspace seed");
    await runUserClose({ cwd, identity: "andrew", wuName: "demo" });
    expect(await readFile(meta, "utf8")).toBe("Authoritative session context");
    await expect(access(seed)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

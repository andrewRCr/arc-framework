import { readFileSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { expect, it } from "vitest";
import { createProjectionEnginePorts } from "../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../src/lib/store/projection/index-file.js";
import { locateProjection } from "../../../src/lib/store/projection/location.js";
import { expectLifecycleResult, lifecycleRepository, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta } from "../../helpers/store-lifecycle-fixture.js";

it("resolves the capture's named Class write and checkout-scoped Design write independently", async () => {
  const { repo, run } = await lifecycleRepository();
  const stub = "backlog-item";
  const holder = "started-item";
  expectLifecycleResult(await run(["stub", stub, "--commitment", "planned", "--priority", "P2", "--class", "Light"]), 0, /backlog-item/u);
  expect(await readLifecycleMeta(repo, stub)).toMatchObject({ placement: { kind: "backlog" }, fields: { state: "Planning" } });
  const metaPath = await run(["view", "meta", "--for", stub, "--path"]);
  expectLifecycleResult(metaPath, 0, /meta-backlog-item\.md/u);
  await writeFile(resolve(repo, dirname(metaPath.stdout.trim()), `draft-${stub}.md`), "# Draft: Backlog item\n");
  const save = await run(["save"]);
  expect(save.exitCode, save.output).toBe(0);

  expectLifecycleResult(await run(["repoint-design", "draft-created"]), 1, /none resolved in this worktree/u);
  expectLifecycleResult(await run(["start", holder, "--new", "--here", "--yes"]), 0, /started-item/u);
  expectLifecycleResult(await run(["set-class", "Heavy", stub]), 0, /backlog-item/u);
  expect((await readLifecycleMeta(repo, holder)).fields).toMatchObject({ design: [] });
  expectLifecycleResult(await run(["repoint-design", "draft-created"]), 0, /draft-started-item\.md/u);
  expect((await readLifecycleMeta(repo, holder)).fields).toMatchObject({ design: [`draft-${holder}.md`] });
  expect((await readLifecycleMeta(repo, stub)).fields).toMatchObject({ workClass: "Heavy", design: [] });
}, LIFECYCLE_TIMEOUT_MS);

it("keeps the checkout's draft repoint off the pre-start grooming path", () => {
  const workflow = readFileSync(resolve(import.meta.dirname,
    "../../../arc/system/workflows/arc/draft-design.md"), "utf8");
  const capture = workflow.slice(workflow.indexOf("## Capture the draft"), workflow.indexOf("## Next Step"));
  const exit = capture.indexOf("**Groom-and-stop");
  expect(exit).toBeGreaterThan(0);

  // A repoint shared with grooming must distinguish the checkout holder from the selected stub.
  const beforeExit = capture.slice(0, exit).split(/\r?\n\s*\r?\n/u).map(step => step.replace(/\s+/gu, " ").trim());
  const repoint = beforeExit.findIndex(step => step.includes("`arc repoint-design draft-created`"));
  if (repoint < 0) return;
  const checksHolder = /\bcheckout\b[^.!?]*\b(?:holds?|owns?|bound|claimed)\b|\b(?:held|bound|claimed|own)\b[^.!?]*\b(?:checkout|here)\b/iu;
  const skipsStub = /\b(?:skip|except|exclude)\b[^.!?]*\b(?:stubs?|grooming|pre-start)\b/iu;
  const guarded = beforeExit.slice(0, repoint + 1).some(step => checksHolder.test(step) || skipsStub.test(step));
  expect(guarded, `Expected a checkout-holder check or a stub exit before the repoint. Found: ${beforeExit[repoint]}`).toBe(true);
});

it.each([
  ["create-spec.md", "**Mark the stage**", "arc set-stage create-spec"],
  ["create-spec.md", "**Update the meta", "arc finalize create-spec"],
  ["generate-tasks.template.md", "### Canonicalize active delivery authoring", "arc delivery plan inventory schema"],
  ["generate-tasks.template.md", "**Update the meta", "arc finalize generate-tasks"],
])("checks the selected checkout holder in %s at %s before %s", (file, start, command) => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../../arc/system/workflows/arc", file), "utf8");
  const from = workflow.indexOf(start);
  const to = workflow.indexOf(`\`${command}`, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  const gate = workflow.slice(from, to);
  expect(gate).toMatch(/\bPlanning\b/u);
  expect(gate).toMatch(/\bstarted\b/u);
  expect(gate).toMatch(/`arc locus`[^.]*\bcheckout holds\s+(?:the selected unit|that started work unit|`?\{name\})/u);
  if (start === "**Mark the stage**") expect(gate).toMatch(/\bwithout a draft\b/u);
  if (start === "**Update the meta") {
    expect(gate).toMatch(/\bstub\b[^.]*`arc set-class <Class> \{name\}`/u);
  }
});

it("preserves unchecked projection edits during an approved no-draft confirmation", async () => {
  const { repo, run } = await lifecycleRepository();
  await run(["start", "determinate", "--new", "--here", "--yes"]);
  const meta = await run(["view", "meta", "--path"]);
  expectLifecycleResult(meta, 0, /meta-determinate\.md/u);
  const path = join(dirname(meta.stdout.trim()), "notes-determinate.md");
  await appendFile(path, "# Notes\n\nAn independent note.\n");
  const refreshed = await run(["status", "--json"]);
  expect(refreshed.exitCode, refreshed.output).toBe(0);

  const location = await locateProjection(repo, createProjectionEnginePorts(repo));
  const changed = async (): Promise<boolean> => {
    const disk = await readProjectionIndex(location, true, { groups: "all" });
    if (disk.kind !== "index") throw new Error("Expected a readable projection index");
    const entry = disk.index.entries[relative(repo, path).replaceAll("\\", "/")];
    if (entry?.kind !== "record") throw new Error("Expected projected metadata");
    return entry.changed;
  };
  expect(await changed()).toBe(true);

  const workflow = readFileSync(resolve(import.meta.dirname,
    "../../../arc/system/workflows/arc/draft-design.md"), "utf8");
  const capture = workflow.slice(workflow.indexOf("## Capture the draft"), workflow.indexOf("## Next Step"));
  const steps = capture.split(/\r?\n\s*\r?\n/u);
  const save = steps.findIndex(step => /^arc save$/mu.test(step));
  expect(save).toBeGreaterThan(0);
  const saveCondition = (steps[save - 1] ?? "").replace(/\s+/gu, " ");
  if (!/(?:on|only) a draft-producing path/iu.test(saveCondition)) {
    const saved = await run(["save"]);
    expect(saved.exitCode, saved.output).toBe(0);
  }
  expect(await changed()).toBe(true);
  expect(capture).toContain("`arc set-class <Class> <slug>`");
  expectLifecycleResult(await run(["set-class", "Light", "determinate"]), 0, /determinate/u);
  expect(await changed()).toBe(true);
}, LIFECYCLE_TIMEOUT_MS);

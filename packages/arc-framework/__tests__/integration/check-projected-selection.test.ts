/** Projected feedback through public handlers, real Git, and live ignored file content. */
import { afterEach, expect, it, vi } from "vitest";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { handleCheckIncrement, handleCheckRun, handleCheckSegment } from "../../src/commands/check.js";
import type { CheckScopeOptions } from "../../src/handlers/check/run-cli.js";
import type { ProjectedSelectionReader } from "../../src/lib/checks/projected-selection.js";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";

const repositories: string[] = [];
const changedPath = ".arc/active/current/notes-unit.md";
const otherPath = ".arc/active/in-flight/other/notes-other.md";
const context = makeInteractionContext({ noInput: true, machineReadable: true });
afterEach(async () => { vi.unstubAllEnvs(); await removeGitBackedDirs(repositories.splice(0)); });

async function fixture() {
  vi.stubEnv("FORCE_COLOR", undefined);
  const root = await createDeclaredCheckRepository({
    selected: { command: [process.execPath, "inspect.cjs"], mode: "selection", inputs: ["**/*.md", "!.arc/completed/**"] },
    ordinary: { command: [process.execPath, "-e", "console.log('ordinary content')"], gate: "commit", inputs: ["src/**"] },
  });
  repositories.push(root);
  await appendFile(join(root, ".gitignore"), ".arc/active/\n.arc/completed/\n");
  await writeFile(join(root, "inspect.cjs"), `const fs=require('node:fs');
const paths=process.argv.slice(2), contents=paths.map(p=>fs.readFileSync(p,'utf8'));
let count=0;try{count=JSON.parse(fs.readFileSync('receipt.json','utf8')).count||0}catch{}
fs.writeFileSync('receipt.json',JSON.stringify({count:++count}));
console.log(JSON.stringify({paths,contents,count}));process.exit(contents.some(c=>c.includes('BAD'))?1:0);
`);
  for (const path of [changedPath, otherPath, ".arc/completed/notes-old.md"]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `live ${path}\n`);
  }
  const reader: ProjectedSelectionReader = (_root, options) => Promise.resolve({ status: "ok",
    paths: options.changed ? [changedPath] : [changedPath, otherPath, ".arc/completed/notes-old.md"] });
  return { root, reader };
}

async function named(root: string, reader: ProjectedSelectionReader, options: CheckScopeOptions = {}, ids = ["selected"]) {
  const result = await runHandlerAt(root, () => handleCheckRun(ids, { json: true, ...options }, context,
    { readProjectedSelection: reader }));
  return { ...result, envelope: JSON.parse(result.stdout) };
}

it.each(["increment", "segment"] as const)("checks changed live ignored content at %s", async form => {
  const { root, reader } = await fixture();
  const handler = form === "increment" ? handleCheckIncrement : handleCheckSegment;
  const result = await runHandlerAt(root, () => handler({ json: true }, context, { readProjectedSelection: reader }));
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const check = JSON.parse(result.stdout).result.checks.find((entry: { id: string }) => entry.id === "selected");
  expect(check).toMatchObject({ kind: "feedback", outcome: "passed", record: { status: "not-recordable" } });
  expect(JSON.parse(check.output)).toMatchObject({ paths: [changedPath], contents: [`live ${changedPath}\n`] });
});

it.each([
  { options: {}, expected: [changedPath, otherPath] },
  { options: { all: true }, expected: [changedPath, otherPath] },
  { options: { paths: [".arc/active/current", "src"] }, expected: [changedPath] },
  { options: { changed: true }, expected: [changedPath] },
  { options: { staged: true }, expected: [changedPath] },
  { options: { range: true as const }, expected: [changedPath] },
])("intersects the public named scope $options", async ({ options, expected }) => {
  const { root, reader } = await fixture();
  const result = await named(root, reader, { ...options, ci: true });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.envelope.result.checks[0].output).paths).toEqual(expected);
});

it("executes selection again while an ordinary check reuses its recorded pass", async () => {
  const { root, reader } = await fixture();
  const first = await named(root, reader, {}, ["selected", "ordinary"]);
  const second = await named(root, reader, {}, ["selected", "ordinary"]);
  expect(first.exitCode, first.stdout).toBe(0);
  expect(second.exitCode, second.stdout).toBe(0);
  expect(second.envelope.result.checks).toMatchObject([{ outcome: "passed", record: { status: "not-recordable" } },
    { id: "ordinary", outcome: "reused" }]);
  expect(JSON.parse(first.envelope.result.checks[0].output).count).toBe(1);
  expect(JSON.parse(second.envelope.result.checks[0].output).count).toBe(2);
});

it("reports unavailable selection beside ordinary results and succeeds after repair", async () => {
  const { root, reader } = await fixture();
  const unavailable: ProjectedSelectionReader = () => Promise.resolve({ status: "unavailable", reason: "projection unavailable" });
  const refused = await named(root, unavailable, { serial: true }, ["selected", "ordinary"]);
  expect(refused.exitCode).toBe(2);
  expect(refused.envelope.result.checks).toMatchObject([
    { outcome: "couldn't run", reason: "projection unavailable", remedy: "arc check run selected --all" },
    { id: "ordinary", outcome: "passed" },
  ]);
  expect((await named(root, reader, { serial: true }, ["selected", "ordinary"])).exitCode).toBe(0);
});

it("preserves serial ordinary results after temporary-index failure and retries the same scope", async () => {
  const { root, reader } = await fixture();
  const failing: ProjectedSelectionReader = async (...args) => {
    vi.stubEnv("TMPDIR", join(root, "unavailable-temp-parent"));
    vi.stubEnv("TEMP", join(root, "unavailable-temp-parent"));
    vi.stubEnv("TMP", join(root, "unavailable-temp-parent"));
    return reader(...args);
  };
  const refused = await named(root, failing, { serial: true }, ["selected", "ordinary"]);
  expect(refused.exitCode, refused.stdout).toBe(2);
  expect(refused.envelope.result.checks).toMatchObject([
    { outcome: "couldn't run", reason: expect.stringContaining("unavailable-temp-parent"), remedy: "arc check run selected --all" },
    { id: "ordinary", outcome: "passed" },
  ]);
  vi.unstubAllEnvs();
  expect((await named(root, reader, { serial: true }, ["selected", "ordinary"])).exitCode).toBe(0);
});

it("reports failed feedback, then checks corrected live content on retry", async () => {
  const { root, reader } = await fixture();
  await writeFile(join(root, changedPath), "BAD\n");
  const failed = await runHandlerAt(root, () => handleCheckIncrement({ json: true }, context, { readProjectedSelection: reader }));
  expect(failed.exitCode).toBe(1);
  expect(JSON.parse(failed.stdout).result.checks).toContainEqual(expect.objectContaining({ id: "selected",
    kind: "feedback", outcome: "failed", remedy: "arc check run selected --changed" }));
  await writeFile(join(root, changedPath), "corrected\n");
  const corrected = await named(root, reader, { changed: true });
  expect(corrected.exitCode).toBe(0);
  expect(JSON.parse(corrected.envelope.result.checks[0].output).contents).toEqual(["corrected\n"]);
});

it("forecasts paths without executing and keeps the production fallback empty", async () => {
  const { root, reader } = await fixture();
  const dry = await named(root, reader, { dryRun: true });
  expect(dry.exitCode).toBe(0);
  expect(dry.envelope.result.checks[0]).toMatchObject({ outcome: "would run", mode: "selection",
    batches: [[process.execPath, "inspect.cjs", changedPath, otherPath]] });
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const empty = await runHandlerAt(root, () => handleCheckRun(["selected"], { json: true }, context));
  expect(empty.exitCode).toBe(0);
  expect(JSON.parse(empty.stdout).result.checks).toMatchObject([{ outcome: "not selected", reason: "no files to check" }]);
});

it("executes a large projected list in bounded literal process batches", async () => {
  const { root } = await fixture();
  const paths = Array.from({ length: 300 }, (_, index) => `.arc/active/current/${index}-${"x".repeat(100)}.md`).sort();
  await Promise.all(paths.map(path => writeFile(join(root, path), `content ${path}\n`)));
  const reader: ProjectedSelectionReader = () => Promise.resolve({ status: "ok", paths });
  const result = await named(root, reader);
  expect(result.exitCode, result.stdout).toBe(0);
  const batches = result.envelope.result.checks[0].output.split("\n").map((line: string) => JSON.parse(line));
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flatMap((batch: { paths: string[] }) => batch.paths)).toEqual(paths);
  expect(batches.flatMap((batch: { contents: string[] }) => batch.contents)).toEqual(paths.map(path => `content ${path}\n`));
});

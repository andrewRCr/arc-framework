/** Publication and withdrawal retain their selected generation through Candidate and Git boundaries. */
import { expect, it } from "vitest";
import { attestStorePublication as attestPublication } from "../helpers/store/publication-fixture.js";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";


it.each([false, true])("publishes the live generation with real Candidate evidence, former=%s", async former => {
  const f = await lifecycleReuseFixture(former);
  await attestPublication(f);
  const result = await repairCli(f, ["publish", "example", "--json"], { store: f.store });
  expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "published" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference })).fields).toMatchObject({ state: "Integrating" });
}, 60_000);

it.each([false, true])("reopens the live generation and withdraws its logical request, former=%s", async former => {
  const f = await lifecycleReuseFixture(former, { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: `tasks-${former ? "current" : "example"}.md` });
  const branch = `feat/${f.name}`;
  await f.exec("git", ["switch", "-c", branch]);
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { links: { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "link" } }));
  const tasks = `# Task List: ${f.name}\n\n### \`[x]\` **1.1 Done**\n`;
  await f.seed(recordReferences["work-item/task-list"](f.live.reference.owner), tasks);
  await mkdir(join(f.cwd, ".arc", "active"), { recursive: true });
  await writeFile(join(f.cwd, ".arc", "active", `tasks-${f.name}.md`), tasks);
  const bin = join(f.cwd, ".git", "host-bin"), state = join(bin, "request.json");
  await mkdir(bin); await writeFile(state, JSON.stringify({ state: "OPEN", isDraft: false }));
  await writeFile(join(bin, "gh"), `#!${process.execPath}\nconst fs = require('node:fs');\nconst state = ${JSON.stringify(state)};\nif (process.argv[3] === 'view') process.stdout.write(fs.readFileSync(state));\nelse if (process.argv[3] === 'close') fs.writeFileSync(state, JSON.stringify({state:'CLOSED'}));\nelse throw new Error('Unexpected host operation');\n`);
  await chmod(join(bin, "gh"), 0o755);
  const oldPath = process.env.PATH;
  let result: Awaited<ReturnType<typeof repairCli>>;
  try { process.env.PATH = `${bin}:${oldPath ?? ""}`; result = await repairCli(f, ["reopen", "example"], { store: f.store }); }
  finally { process.env.PATH = oldPath; }
  expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference })).fields).toMatchObject({ state: "Active" });
  expect(JSON.parse(await readFile(state, "utf8"))).toMatchObject({ state: "CLOSED" });
}, 60_000);

it("publishes an attested Candidate while its clashed dependency remains held", async () => {
  const f = await lifecycleReuseFixture(false);
  const target = await f.seedMeta("target", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const other = await f.seedMeta("other");
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { content: writeMetaDependsOn(f.live.content, ["target"]) }),
    provenance: { verb: "fixture", lifecycleAction: "edit" } }));
  await attestPublication(f);
  const store = createClashDouble(f.store, { slug: "target", holders: [target.reference, other.reference] });
  const result = await repairCli(f, ["publish", "example", "--json"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "published" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference })).fields).toMatchObject({ state: "Integrating", dependsOn: ["target"] });
  expect(lifecycleSuccess(await f.store.read({ reference: target.reference }))).toEqual(target);
  expect(lifecycleSuccess(await f.store.read({ reference: other.reference }))).toEqual(other);
}, 60_000);

/** Real command runs retain every outcome after fixers finish. */
import { afterEach, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("executes every selected command and reports every failure after both fixers finish", async () => {
  const script = "const fs=require('node:fs');const[id,kind,exit]=process.argv.slice(1);const prior=fs.existsSync('receipt.json')?fs.readFileSync('receipt.json','utf8'):'';if(kind==='ordinary'&&!prior.includes('fixer-two done'))process.exit(91);fs.appendFileSync('receipt.json',id+' done\\n');console.log(id);process.exit(Number(exit))";
  const check = (id: string, fixes = false, exit = 0) => ({
    command: [process.execPath, "-e", script, id, fixes ? "fixer" : "ordinary", String(exit)],
    fixes, cache: false, inputs: ["src/**"],
  });
  const checks = { ordinary: check("ordinary"), "fixer-one": check("fixer-one", true),
    "fail-one": check("fail-one", false, 11), "fixer-two": check("fixer-two", true), "fail-two": check("fail-two", false, 17) };
  const root = await createDeclaredCheckRepository(checks);
  repositories.push(root);
  const result = await runArc(["check", "run", ...Object.keys(checks), "--serial", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "ordinary", outcome: "passed" }, { id: "fixer-one", outcome: "passed" },
    { id: "fail-one", outcome: "failed" }, { id: "fixer-two", outcome: "passed" }, { id: "fail-two", outcome: "failed" },
  ]);
  expect((await readFile(join(root, "receipt.json"), "utf8")).trim().split("\n"))
    .toEqual(["fixer-one done", "fixer-two done", "ordinary done", "fail-one done", "fail-two done"]);
});

it("executes a declared sharded check without adding a shard argument", async () => {
  const root = await createDeclaredCheckRepository({ sharded: {
    command: [process.execPath, "capture.cjs"], shards: { count: 4, argument: "--shard={index}/{count}" },
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "sharded", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "sharded", outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({ cwd: root, args: [] });
});

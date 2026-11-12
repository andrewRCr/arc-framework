/** Complete selected shard plans preserve native command/probe and repository environment boundaries. */
import { afterEach, expect, it } from "vitest";
import { access, appendFile, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createShardedCheckFixture } from "../helpers/sharded-check-fixture.js";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { LOCAL_RUNNER_EXAMPLE } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux").each(["files", "project"] as const)(
  "keeps identical-argv %s commands and probes on captured code despite caller and worker Git overrides", async mode => {
    const other = await createDeclaredCheckRepository({ other: { command: [process.execPath, "--version"] } });
    directories.push(other);
    const command = [process.execPath, "capture.cjs"];
    const fixture = await createShardedCheckFixture(directories, { mode: "execute", check: {
      mode, pass_paths: mode === "files" ? false : true,
      shards: { count: 2, argument: "--shard={index}/{count}", routed: true },
      runtime_inputs: [1, 2].map(index => [...command, `--shard=${index}/2`]),
      environment_inputs: { SCALAR: "value", EXPLICIT_FILE: "file", OBSERVE: "value" },
    }, program: `const fs=require('node:fs');const cp=require('node:child_process');
      const row={args:process.argv.slice(2),head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
        tree:process.env.ARC_CHECK_TREE,base:process.env.ARC_CHECK_BASE,merged:process.env.ARC_CHECK_MERGED,
        scalar:process.env.SCALAR,file:fs.readFileSync(process.env.EXPLICIT_FILE).toString('hex')};
      fs.appendFileSync(process.env.OBSERVE,JSON.stringify(row)+'\\n');process.stdout.write(JSON.stringify(row)+'\\n');` });
    const observation = join(fixture.home, "observations");
    await appendFile(join(fixture.root, ".gitignore"), "*.secret\n");
    await writeFile(join(fixture.root, "input.secret"), Buffer.from([0, 255, 13, 10]));
    await symlink("input.secret", join(fixture.root, "link.secret"));
    const poison = { GIT_DIR: join(other, ".git"), GIT_WORK_TREE: other, GIT_OBJECT_DIRECTORY: join(other, ".git/objects"),
      GIT_CONFIG: join(other, ".git/config"), GIT_CONFIG_PARAMETERS: "'core.bare'='true'", GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: other,
      ARC_CHECK_TREE: "stale", ARC_CHECK_BASE: "stale", ARC_CHECK_MERGED: "stale" };
    const wrapper = `Object.assign(process.env,${JSON.stringify(poison)});
      process.argv.splice(1,0,${JSON.stringify(LOCAL_RUNNER_EXAMPLE)},'--known-node-runtime','--state-root',${JSON.stringify(join(fixture.home, "state"))});
      await import(${JSON.stringify(pathToFileURL(LOCAL_RUNNER_EXAMPLE).href)});`;
    await writeFile(fixture.configuration, JSON.stringify({ "checks.runner": [process.execPath, "--input-type=module", "-e", wrapper] }));
    const git = createExecaGitExec();
    const expectedHead = (await git("git", ["rev-parse", "HEAD"], { cwd: fixture.root })).stdout.trim();
    const otherHead = (await git("git", ["rev-parse", "HEAD"], { cwd: other })).stdout.trim();
    expect(expectedHead).not.toBe(otherHead);
    const result = await runArc(["check", "run", "example", "--json"], fixture.root, {
      env: { ...fixture.environment, ...poison, SCALAR: "", EXPLICIT_FILE: "link.secret", OBSERVE: observation },
    });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.result.checks[0].outcome).toBe("passed");
    const commands = envelope.result.checks[0].output.trim().split("\n").map((line: string) => JSON.parse(line));
    expect(commands).toHaveLength(2);
    expect(commands.map((row: { args: string[] }) => row.args)).toEqual([1, 2].map(index => [`--shard=${index}/2`]));
    const rows = (await readFile(observation, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(rows.length).toBeGreaterThan(commands.length);
    for (const row of rows) {
      expect(row).toMatchObject({ head: expectedHead, scalar: "", file: "00ff0d0a" });
      if (mode === "project" || row.tree === undefined) {
        expect(row).not.toHaveProperty("tree"); expect(row).not.toHaveProperty("base"); expect(row).not.toHaveProperty("merged");
      }
    }
    for (const row of commands) {
      if (mode === "files") {
        expect(row.tree).toBe(envelope.result.tree);
        expect(row.base).toBe(envelope.result.base);
        expect(row.merged).toBe(envelope.result.merged?.join(" ") || undefined);
      }
      else expect(row).not.toHaveProperty("tree");
    }
    const probes = rows.filter(row => row.tree === undefined);
    expect(probes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(probes.map(row => JSON.stringify(row.args))))
      .toEqual(new Set(commands.map((row: { args: string[] }) => JSON.stringify(row.args))));
  }, 30_000,
);

it("refuses a reserved shard binding before preparation and executes after declaration repair", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group",
    check: { environment_inputs: { GIT_DIR: "value", SCALAR: "value" } },
    program: "process.stdout.write(process.env.SCALAR)",
  });
  const refused = await runArc(["check", "run", "example", "--json"], fixture.root, {
    env: { ...fixture.environment, SCALAR: "repaired" },
  });
  expect(refused.exitCode, refused.stdout + refused.stderr).toBe(2);
  expect(JSON.parse(refused.stdout).error.message).toMatch(/environment_inputs.*remove.*retry/su);
  await expect(access(join(fixture.home, "requests"))).rejects.toThrow();
  const path = join(fixture.root, ".arc/system/arc-checks.yml");
  const declaration = JSON.parse(await readFile(path, "utf8"));
  delete declaration.checks.example.environment_inputs.GIT_DIR;
  await writeFile(path, JSON.stringify(declaration));
  const repaired = await runArc(["check", "run", "example", "--json"], fixture.root, {
    env: { ...fixture.environment, SCALAR: "repaired" },
  });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired".repeat(3) });
});

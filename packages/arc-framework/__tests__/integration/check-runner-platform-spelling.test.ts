/** Actual prepared commands consume stored case/Unicode spellings from selected source capture. */
import { afterEach, expect, it } from "vitest";
import { rename } from "node:fs/promises";
import { join, sep } from "node:path";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each([{ code: "input.txt", stored: "INPUT.TXT" }, { code: "é.txt", stored: "e\u0301.txt" }])(
  "executes captured spelling $stored when selected code names $code", async ({ code, stored }) => {
    const fixture = await selectedExecutionFixture(directories, "execute");
    if (code !== "input.txt") {
      await rename(join(fixture.root, "input.txt"), join(fixture.root, code));
      await fixture.io.git("git", ["config", "core.precomposeunicode", "true"], { cwd: fixture.root });
      await fixture.io.git("git", ["add", "-A"], { cwd: fixture.root });
      await fixture.io.git("git", ["commit", "-m", "source spelling"], { cwd: fixture.root });
    }
    const resolved = await resolveCheckRequest(fixture.io.git, fixture.root, { form: { kind: "run", ids: ["example"] }, scope: { kind: "staged" } });
    if (resolved.status !== "resolved") throw new Error(resolved.message);
    const aliases = new Map<string, string>();
    const source = { ...fixture.io.source,
      readDirectory: async (parent: string) => {
        const names = await fixture.io.source.readDirectory(parent);
        // Model caller materialization on a filesystem whose catalog alias resolves to this stored name.
        if (parent.endsWith(`${sep}selected`) && names.some(name => Buffer.from(name).toString("utf8") === code)) {
          await rename(join(parent, code), join(parent, stored));
          aliases.set(join(parent, code), join(parent, stored));
          return fixture.io.source.readDirectory(parent);
        }
        return names;
      },
      lstat: (path: string) => fixture.io.source.lstat(aliases.get(path) ?? path),
    };
    let output = "";
    const prepared = await prepareSelectedCheckExecution({ ...fixture.input, request: resolved.request, paths: [code],
      check: { ...fixture.input.check, command: [process.execPath, "-e",
        "const fs=require('node:fs');const paths=process.argv.slice(1);process.stdout.write(JSON.stringify({paths,bytes:paths.map(path=>fs.readFileSync(path,'utf8'))}));"] },
      onOutput: value => { output += Buffer.from(value.bytes).toString(); },
    }, { ...fixture.io, source });
    if (prepared.status !== "ready") throw new Error(prepared.reason);
    const execution = prepared.execution;
    try {
      const invocation = execution.plan.invocations[0];
      if (invocation === undefined) throw new Error("Expected a planned command");
      const result = await execution.run(invocation.id);
      expect(result.status).toBe("settled");
      expect(result.outcomes.get(invocation.id)).toEqual({ status: "completed", exitCode: 0 });
      expect(JSON.parse(output)).toEqual({ paths: [stored], bytes: ["captured source\r\n"] });
    } finally { await execution.close(); }
  }, 30_000);

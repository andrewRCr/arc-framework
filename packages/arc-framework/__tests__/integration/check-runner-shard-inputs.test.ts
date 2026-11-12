/** Shard siblings retain captured source and explicit input presence independently of reuse. */
import { afterEach, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux").each(["unset", "empty", "file"] as const)(
  "replays captured %s inputs and fixed source to every uncached unknown-runtime sibling", async state => {
    const script = `const fs=require('node:fs');
      const expected=${JSON.stringify(state)};
      if(fs.readFileSync('input.txt','utf8')!=='captured source\\r\\n')process.exit(10);
      if(process.env.SCALAR!=='')process.exit(11);
      if(expected==='unset' && process.env.EXPLICIT_FILE!==undefined)process.exit(12);
      if(expected==='empty' && process.env.EXPLICIT_FILE!=='')process.exit(13);
      if(expected==='file' && !fs.readFileSync(process.env.EXPLICIT_FILE).equals(Buffer.from([0,255,13,10])))process.exit(14);
      process.stdout.write(process.argv.at(-1));`;
    const fixture = await createRunnerCheckRepository(directories, root => writeFile(join(root, "check.cjs"), script));
    const check = CheckDeclarationSchema.parse({ checks: { example: { ...fixture.input.check, cache: false,
      shards: { count: 2, argument: "--shard={index}/{count}", routed: true },
    } } }).checks.example!;
    const prepared = await prepareSelectedCheckExecution({ ...fixture.input, check,
      environment: { SCALAR: "", ...(state === "unset" ? {} : { EXPLICIT_FILE: state === "empty" ? "" : "input.secret" }) },
    }, fixture.io);
    if (prepared.status !== "ready") throw new Error(prepared.reason);
    try {
      expect(prepared.execution.runtime).toBeUndefined();
      expect(prepared.execution.plan.invocations).toHaveLength(2);
      await writeFile(join(fixture.root, "input.txt"), "changed live source");
      await writeFile(join(fixture.root, "input.secret"), "changed live file");
      for (const invocation of prepared.execution.plan.invocations) {
        const result = await prepared.execution.run(invocation.id);
        expect([...result.outcomes.values()]).toEqual([{ status: "completed", exitCode: 0 }]);
      }
      await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
    } finally { await prepared.execution.close(); }
  }, 30_000,
);

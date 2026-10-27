/** The independent example applies native environment and notice policy on each actual child. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { GIT_REPOSITORY_LOCAL_ENVIRONMENT } from "../../src/lib/git/process-executor.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const exampleURL = new URL("../../examples/check-runner/local.mjs", import.meta.url);
const example = fileURLToPath(exampleURL);
const directories: string[] = [];
const localIt = it.runIf(process.platform === "linux");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

localIt.each(["files", "project"] as const)("clears worker overrides and preserves explicit/case-sensitive ambient inputs for %s commands", async mode => {
  const fixture = await selectedExecutionFixture(directories);
  const staleNotice = join(fixture.root, "notice.secret");
  await writeFile(staleNotice, "not run: stale caller notice");
  const stateRoot = join(fixture.root, "adapter.secret");
  const wrapper = `
    for(const name of ${JSON.stringify([...GIT_REPOSITORY_LOCAL_ENVIRONMENT])}){
      process.env[name]='wrong repository';process.env[name.toLowerCase()]='wrong repository';
    }
    for(const name of ['ARC_CHECK_BASE','ARC_CHECK_TREE','ARC_CHECK_MERGED'])process.env[name]='stale';
    process.env.ARC_CHECK_NOTICE=${JSON.stringify(staleNotice)};
    process.env.scalar='ambient lowercase';process.env.ABSENT_INPUT='worker stale';process.env.EMPTY_INPUT='worker stale';
    process.argv.splice(1,0,${JSON.stringify(example)},'--state-root',${JSON.stringify(stateRoot)});
    await import(${JSON.stringify(exampleURL.href)});
  `;
  const chunks: Buffer[] = [];
  const longReason = "x".repeat(450);
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    environment: { ...fixture.input.environment, EMPTY_INPUT: "" },
    check: { ...fixture.input.check, environment_inputs: { ...fixture.input.check.environment_inputs,
      ABSENT_INPUT: "value", EMPTY_INPUT: "file" } },
    configuration: { file: fixture.input.configuration.file, argv: [process.execPath, "--input-type=module", "-e", wrapper] },
    buildPlan: context => ({ invocations: [{ id: "check", cwd: ".", shell: false,
      argv: [process.execPath, "-e", `
        const fs=require('node:fs');
        const names=${JSON.stringify([...GIT_REPOSITORY_LOCAL_ENVIRONMENT])};
        fs.writeFileSync(process.env.ARC_CHECK_NOTICE,${JSON.stringify(mode === "project" ? `not run: ${longReason}\r info\u0001text \n` : " local execution\r\n")});
        process.stdout.write(JSON.stringify({scalar:process.env.SCALAR,lowercase:process.env.scalar,
          file:[...fs.readFileSync(process.env.EXPLICIT_FILE)],absent:Object.hasOwn(process.env,'ABSENT_INPUT'),empty:process.env.EMPTY_INPUT,
          derived:Object.fromEntries(['ARC_CHECK_TREE','ARC_CHECK_BASE','ARC_CHECK_MERGED'].filter(name=>Object.hasOwn(process.env,name)).map(name=>[name,process.env[name]])),
          gitVariables:Object.keys(process.env).filter(name=>names.includes(name.toUpperCase())),notice:process.env.ARC_CHECK_NOTICE,
          head:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));
        process.exit(${mode === "project" ? 7 : 0});
      `], ...(mode === "files" ? { commandContent: { tree: context.source.manifest.coordinates.tree } } : {}) }],
    probes: { global: [], check: [] } }), onOutput: output => { chunks.push(Buffer.from(output.bytes)); },
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    const result = await prepared.execution.run("check");
    expect(result.outcomes.get("check")).toEqual(mode === "files" ? { status: "completed", exitCode: 0, notice: "local execution" }
      : { status: "completed", exitCode: 7, notice: `not run: ${longReason}`.slice(0, 200), notRunReason: longReason.slice(0, 200) });
    const output = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    expect(output).toMatchObject({ scalar: "literal\nvalue", lowercase: "ambient lowercase", file: [0, 255, 13, 10],
      absent: false, empty: "", gitVariables: [], derived: mode === "files" ? { ARC_CHECK_TREE: fixture.input.request.tree } : {},
      head: fixture.input.request.source.head.status === "known" ? fixture.input.request.source.head.commit : undefined });
    expect(output.notice).not.toBe(staleNotice);
    expect(await readFile(staleNotice, "utf8")).toBe("not run: stale caller notice");
  } finally { await prepared.execution.close(); }
});

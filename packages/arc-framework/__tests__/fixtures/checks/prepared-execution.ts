/** Real selected repositories and standalone protocol fixtures for prepared execution tests. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore } from "../../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { resolveCheckRequest } from "../../../src/lib/checks/resolve-request.js";
import { nodeSourcePresentationIO } from "../../../src/lib/checks/runner/source-io.js";
import type { PrepareSelectedCheckExecutionInput, CheckExecutionIO } from "../../../src/lib/checks/runner/execution.js";

export type PreparedAdapterMode = "unknown" | "known" | "missing-runtime" | "source-bytes" | "manifest"
  | "environment" | "unavailable" | "disappeared" | "bad-source-claim";

export function preparedAdapterScript(mode: PreparedAdapterMode): string {
  return `const mode=${JSON.stringify(mode)};` + `
    const fs=require('node:fs');
    const path=require('node:path');
    const lines=require('node:readline').createInterface({input:process.stdin});
    const send=message=>process.stdout.write(JSON.stringify(message)+'\\n');
    lines.on('line', line=>{
      const request=JSON.parse(line);
      if(request.method==='check/prepare'){
        const plan=request.params;
        if(mode==='unavailable'){
          send({jsonrpc:'2.0',id:request.id,result:{status:'unavailable',planId:plan.planId,
            reason:'No compatible placement',remedy:'Repair adapter placement and retry.',settled:true}});
          return;
        }
        const recovery={jsonrpc:'2.0',method:'check/recovery',params:{planId:plan.planId,
          instructions:'Inspect and settle this test attempt by its plan UUID.'}};
        if(mode==='disappeared'){
          process.stdout.write(JSON.stringify(recovery)+'\\n',()=>process.exit(0));
          return;
        }
        send(recovery);
        if(mode==='source-bytes')fs.writeFileSync(path.join(plan.source.root,'input.txt'),'altered source');
        if(mode==='manifest')fs.writeFileSync(plan.source.manifest,'invalid manifest');
        if(mode==='environment')fs.writeFileSync(plan.environment.EXPLICIT_FILE.path,'altered explicit input');
        const runtime=(mode==='known'||mode==='missing-runtime')?{kind:'known',
          bindings:mode==='missing-runtime'?[]:plan.invocations.map(invocation=>({invocationId:invocation.id,
            identity:'sha256:'+'b'.repeat(64),probes:[...plan.probes.global,...plan.probes.check].map(probe=>({
              id:probe.id,stdout:String.fromCharCode(32,10)+probe.id+String.fromCharCode(13,10)}))}))}
          :{kind:'unknown',reason:'Test placement has no reusable qualification.'};
        send({jsonrpc:'2.0',id:request.id,result:{status:'ready',planId:plan.planId,contextId:'prepared-context',
          sourceDigest:mode==='bad-source-claim'?'sha256:'+'c'.repeat(64):plan.source.digest,
          capabilities:{runGroup:false},runtime}});
      }else if(request.method==='check/release'){
        send({jsonrpc:'2.0',id:request.id,result:{contextId:request.params.contextId,released:true}});
      }else if(request.method==='check/run'||request.method==='check/runGroup'){
        process.stdout.write('unexpected execution before input validation\\n');
      }
    });
  `;
}

export async function selectedExecutionFixture(directories: string[], mode: PreparedAdapterMode = "unknown"):
Promise<{ root: string; input: PrepareSelectedCheckExecutionInput; io: CheckExecutionIO; captures: string[] }> {
  const root = await createTempRepoCore({ prefix: "arc-prepared-execution-" });
  directories.push(root);
  const git = createExecaGitExec();
  await writeFile(join(root, "input.txt"), "captured source\r\n");
  await writeFile(join(root, "check.cjs"), "process.exit(0);\n");
  await writeFile(join(root, ".gitignore"), "*.secret\n");
  await writeFile(join(root, "input.secret"), Buffer.from([0, 255, 13, 10]));
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "check inputs"], { cwd: root });
  const resolved = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["example"] } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  const check = CheckDeclarationSchema.parse({ checks: { example: { runner: true, mode: "files",
    command: [process.execPath, "check.cjs"], environment_inputs: { EXPLICIT_FILE: "file", SCALAR: "value" } } } }).checks.example!;
  const captures: string[] = [];
  const io = { git, gitRaw: createExecaRawGitExec(), source: { ...nodeSourcePresentationIO,
    files: { ...nodeSourcePresentationIO.files, createDirectory: async () => {
      const directory = await nodeSourcePresentationIO.files.createDirectory();
      captures.push(directory); directories.push(directory);
      return directory;
    } } } };
  return { root, captures, io, input: { callerRoot: root, request: resolved.request, check,
    paths: ["input.txt"], configuration: { file: join(root, "machine.yml"), argv: [process.execPath, "-e", preparedAdapterScript(mode)] },
    environment: { EXPLICIT_FILE: "input.secret", SCALAR: "literal\nvalue" }, globalRuntimeInputs: [[process.execPath, "--version"]] } };
}

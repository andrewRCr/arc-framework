/** Ordinary writer recovery cannot turn an unrelated failure into permission evidence. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { probeHostRoles } from "../benchmarks/ref-host-access.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { GitProcessError, isGitProcessError } from "../../src/lib/git/process-error.js";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";
import { alterHostFailure, hostProofFaults } from "../helpers/host-proof-faults.js";

it.each(["permission", "permission-before-advertisement", "local-setup", ...hostProofFaults] as const)("credits only completed permission denial (%s), retaining pending content and repair", async fault => {
  const fixture = await createRefTestRepository(); onTestFinished(fixture.cleanup);
  await fixture.exec("git", ["config", "arc.identity", "andrew"]);
  const evidence = join(fixture.root, "evidence"); await mkdir(evidence);
  const hook = join(fixture.remote, "hooks", "pre-receive"), controller = join(fixture.root, "role-control.mjs");
  await writeFile(controller, `import {writeFileSync} from "node:fs";\nconst reader = process.argv.at(-1) === "reader";\nwriteFileSync(${JSON.stringify(hook)}, reader ? '#!/bin/sh\\necho "User permission denied for writing" >&2\\nexit 1\\n' : '#!/bin/sh\\nexit 0\\n', {mode:0o755});\nprocess.stdout.write(JSON.stringify({role:reader ? "reader" : "writer"}));\n`);
  const exec = createExecaGitExec(undefined, { ...process.env, LC_ALL: "C", LANG: "C", FORCE_COLOR: undefined });
  const native = async (_label: string, cwd: string, args: string[]) => (await exec("git", args, { cwd, preserveOutput: true })).stdout;
  const ports = (checkoutRoot: string) => createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null });
  const ownerStore = createRefStore(ports(fixture.root));
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/host-role.md" });
  const provenance = { verb: "edit", lifecycleAction: "save" };
  expect((await ownerStore.write({ action: "put", expected: null, provenance,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: JSON.stringify({projectId: "8ac1d57c-fbbd-48b0-87c7-670399066931"}) })).status).toBe("ok");
  expect((await ownerStore.write({ action: "put", expected: null, reference, provenance, content: "Baseline.\n" })).status).toBe("ok");
  expect((await ownerStore.push()).status).toBe("ok");
  const createTransport = () => ({
    git: async (label: string, cwd: string, args: string[]) => {
      try { return await native(label, cwd, args); }
      catch (error) {
        if (label === "member-permission-rejection" && isGitProcessError(error) && fault !== "permission") {
          if (fault === "local-setup") throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128,
            stderr: "fatal: cannot push without configured remote" });
          if (fault === "permission-before-advertisement") throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128,
            stderr: "remote: Write access to repository not granted.\nfatal: The requested URL returned error: 403" });
          if (fault === "transport") throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128,
            stderr: "fatal: the remote end hung up unexpectedly" });
          throw alterHostFailure(error, fault);
        }
        throw error;
      }
    },
    store: (checkoutRoot: string) => {
      const defaults = ports(checkoutRoot);
      // The public backend first sees transport loss. The direct raw check must establish the cause independently.
      return createRefStore({ ...defaults, exec: async (command, args, options) => {
        if (fault === "transport" && args.includes("push")) {
          const hookText = await readFile(hook, "utf8").catch(() => "");
          if (hookText.includes("denied")) throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 128,
            stderr: "fatal: the remote end hung up unexpectedly" });
        }
        return defaults.exec(command, args, options);
      } });
    },
  });
  const results = await probeHostRoles({ root: fixture.root, remote: fixture.remote, evidence, ownerGit: native,
    settings: { member: {}, roleControl: [process.execPath, controller] }, reference,
    personalRef: "refs/arc/user/andrew/personal", ownerStore, owned: new Map() }, createTransport);
  expect(results.ordinaryWriter?.status).toBe("passed");
  expect(results.readOnly?.status).toBe(fault === "permission" || fault === "permission-before-advertisement" ? "passed" : "unverified");
  const read = await ownerStore.read({ reference });
  expect(read.status === "ok" && read.result.content).toBe("Read-only identity's unpublished local edit.\r\n");
}, 30_000);

/** Repository-only resumable qualification coordinator over developer-authenticated live re-queries. */

import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { QualificationScope } from "./runtime/qualification-contract.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { GhQualificationProbePort, type QualificationProbeDescriptor } from "./runtime/gh-qualification-port.js";
import type { ProcessRunner } from "./runtime/gh-action-port.js";
import { FileQualificationCheckpointStore, FileQualificationRawStore } from "./runtime/qualification-storage.js";

const execute = promisify(execFile);

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

async function jsonFile<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    throw new Error("qualification-input-invalid");
  }
}

const processRunner: ProcessRunner = {
  run: async (command, args) => {
    try {
      const result = await execute(command, args, { maxBuffer: 10 * 1024 * 1024 });
      return { stdout: result.stdout };
    } catch {
      throw new Error("qualification-process-failed");
    }
  },
};

const repositoryRoot = (await processRunner.run("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
const qualificationRoot = resolve(required("ARC_QUALIFICATION_DIR"));
const relativeRoot = relative(repositoryRoot, qualificationRoot);
if (!isAbsolute(qualificationRoot)
  || relativeRoot === ""
  || (!relativeRoot.startsWith("..") && !isAbsolute(relativeRoot))) {
  throw new Error("qualification-directory-must-be-private-outside-repository");
}
const qualificationRootStat = await stat(qualificationRoot);
if (!qualificationRootStat.isDirectory() || qualificationRootStat.mode & 0o077) {
  throw new Error("qualification-directory-permissions-not-private");
}
async function privateInput(name: string): Promise<string> {
  const path = resolve(required(name));
  const relativePath = relative(qualificationRoot, path);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("qualification-input-outside-private-directory");
  }
  if ((await stat(path)).mode & 0o077) throw new Error("qualification-input-permissions-not-private");
  return path;
}
const scope = await jsonFile<QualificationScope>(await privateInput("ARC_QUALIFICATION_SCOPE"));
const descriptors = await jsonFile<QualificationProbeDescriptor[]>(await privateInput("ARC_QUALIFICATION_PROBES"));
const [owner, repo] = scope.repositoryRef.split("/");
if (owner === undefined || repo === undefined) throw new Error("qualification-repository-invalid");

const result = await SELF_HOSTING_REVIEW_GATE.runQualification({
  scope,
  inspectWorkspace: async () => ({
    clean: (await processRunner.run("git", ["status", "--porcelain"])).stdout.trim().length === 0,
    branch: (await processRunner.run("git", ["branch", "--show-current"])).stdout.trim(),
    headSha: (await processRunner.run("git", ["rev-parse", "HEAD"])).stdout.trim(),
    remoteDefaultBranch: (await processRunner.run("gh", [
      "api", `repos/${scope.repositoryRef}`, "--jq", ".default_branch",
    ])).stdout.trim(),
    remoteDefaultSha: (await processRunner.run("gh", [
      "api", `repos/${scope.repositoryRef}/branches/${encodeURIComponent(scope.defaultBranch)}`, "--jq", ".commit.sha",
    ])).stdout.trim(),
    actorIdentity: (await processRunner.run("gh", ["api", "user", "--jq", ".id"])).stdout.trim(),
  }),
  checkpoints: new FileQualificationCheckpointStore(qualificationRoot),
  raw: new FileQualificationRawStore(qualificationRoot),
  probes: new GhQualificationProbePort(processRunner, descriptors),
  resume: process.env.ARC_QUALIFICATION_RESUME === "true",
});
if (result.status === "qualified") {
  await writeFile(resolve(qualificationRoot, "candidate.json"), `${JSON.stringify(result.candidate)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, matrixDigest: result.candidate.matrixDigest })}\n`);
} else {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 1;
}

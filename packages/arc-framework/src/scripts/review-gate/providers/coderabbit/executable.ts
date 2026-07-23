/** Resolve and identify the exact CodeRabbit executable artifact used for a run. */

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access as nodeAccess,
  readFile as nodeReadFile,
  realpath as nodeRealpath,
} from "node:fs/promises";
import { delimiter, extname, join } from "node:path";

import { execa } from "execa";

interface CodeRabbitExecutableResolutionDependencies {
  access(path: string, mode: number): Promise<void>;
  realpath(path: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  interrogate(path: string): Promise<string>;
  pathValue: string;
  pathExtValue: string;
  platform: NodeJS.Platform;
}

export interface ResolvedCodeRabbitExecutable {
  path: string;
  digest: `sha256:${string}`;
  qualifiedVersion: string;
}

/** Stable absence result for a configured executable that this runtime cannot launch. */
export class CodeRabbitExecutableUnavailableError extends Error {
  readonly code = "capability-unsupported" as const;

  constructor(command: string) {
    super(`frontline executable not found: ${command}`);
    this.name = "CodeRabbitExecutableUnavailableError";
  }
}

function executableNames(
  command: string,
  platform: NodeJS.Platform,
  pathExtValue: string,
): string[] {
  if (platform !== "win32" || extname(command) !== "") return [command];
  const extensions = pathExtValue
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  return extensions.map((extension) => `${command}${extension.toLowerCase()}`);
}

async function findExecutable(
  command: string,
  dependencies: CodeRabbitExecutableResolutionDependencies,
): Promise<string> {
  const names = executableNames(command, dependencies.platform, dependencies.pathExtValue);
  for (const directory of dependencies.pathValue.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        await dependencies.access(candidate, constants.X_OK);
        return await dependencies.realpath(candidate);
      } catch {
        // Continue through PATH without treating a missing candidate as a provider failure.
      }
    }
  }
  throw new CodeRabbitExecutableUnavailableError(command);
}

async function interrogateVersion(path: string): Promise<string> {
  const result = await execa(path, ["--version"], {
    reject: true,
    stripFinalNewline: false,
  });
  return `${result.stdout}\n${result.stderr}`;
}

function parseVersion(output: string): string {
  const match = /(?:^|[^0-9])([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)(?:$|[^0-9])/u.exec(output);
  if (match?.[1] === undefined) throw new Error("CodeRabbit executable returned an unrecognized version");
  return match[1];
}

/** Resolve once, hash and interrogate that path, then return it for the provider launch. */
export async function resolveCodeRabbitExecutable(
  command: string,
  overrides: Partial<CodeRabbitExecutableResolutionDependencies> = {},
): Promise<ResolvedCodeRabbitExecutable> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(command)) {
    throw new Error("invalid frontline executable name");
  }
  const dependencies: CodeRabbitExecutableResolutionDependencies = {
    access: nodeAccess,
    realpath: nodeRealpath,
    readFile: nodeReadFile,
    interrogate: interrogateVersion,
    pathValue: process.env.PATH ?? "",
    pathExtValue: process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD",
    platform: process.platform,
    ...overrides,
  };
  const path = await findExecutable(command, dependencies);
  const [bytes, versionOutput] = await Promise.all([
    dependencies.readFile(path),
    dependencies.interrogate(path),
  ]);
  return {
    path,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    qualifiedVersion: `coderabbit/${parseVersion(versionOutput)}`,
  };
}

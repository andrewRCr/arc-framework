/** Handler boundary for the read-only `arc locus` command. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { LocusEnvelopeV1 } from "../lib/locus/schema/index.js";
import { formatLocusEnvelope, validateLocusEnvelope } from "../commands/locus.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
import { createLocusEvidenceIO } from "../lib/locus/evidence.js";
import { readLocusEnvelope } from "../lib/locus/reader.js";
import { createPlatformProcessInspector } from "../lib/locus/platform-inspectors.js";
import { resolveIdentity } from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { requireArcProjectRoot } from "./shared.js";

export interface LocusCliOptions {
  json?: boolean;
}

export interface LocusCliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
  exit(code: number): void;
}

export interface LocusCliDependencies {
  read(): Promise<LocusEnvelopeV1>;
  output: LocusCliOutput;
}

/** Emit exactly one validated roster envelope or one human display. */
export async function runLocusCli(
  options: LocusCliOptions,
  dependencies: LocusCliDependencies,
): Promise<void> {
  const envelope = validateLocusEnvelope(await dependencies.read());
  if (options.json) {
    dependencies.output.stdout(`${JSON.stringify(envelope)}\n`);
  } else if (envelope.ok) {
    dependencies.output.stdout(formatLocusEnvelope(envelope));
  } else {
    dependencies.output.stderr(`Error [${envelope.error.code}]: ${envelope.error.message}\n`);
  }
  dependencies.output.exit(envelope.ok ? 0 : 1);
}

/** Bind the public reader to local filesystem, Git, and process-inspector ports. */
export async function handleLocus(options: LocusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const identity = await resolveIdentity({ exec: gitExec });
  const inspector = createPlatformProcessInspector();
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
  const identityGlobalUserDir = identity === null
    ? null
    : (await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: gitExec }))
      .identityGlobalRoot;
  await runLocusCli(options, {
    read: () => readLocusEnvelope({
      identity,
      pathFlavor: process.platform === "win32" ? "windows" : "posix",
      evidenceIO: createLocusEvidenceIO({ exec: gitExec, identity: identity ?? "", inspector }),
      subjectMetaIO: {
        readFile: (path) => readFile(path, "utf8"),
        pathExists: async (path) => access(path).then(() => true, () => false),
        realpath,
        lstat,
      },
      identityGlobalUserDir,
      activeExtensions: activeExtensions.active,
    }),
    output: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      exit: (code) => { process.exitCode = code; },
    },
  });
}

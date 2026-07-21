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
import { createUserIOContext } from "../lib/io-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import { attachLocusAtRuntime, releaseLocusAtRuntime } from "../lib/locus/command-runtime.js";
import { formatErrandOpenResult } from "./errand.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import type { LocusMutationResultV1 } from "../lib/locus/schema/index.js";

export interface LocusCliOptions {
  json?: boolean;
}

export interface LocusAttachOptions extends LocusCliOptions { checkout?: string }
export interface LocusReleaseOptions extends LocusCliOptions { checkout?: string; lease: string }

/** Attach the entering process to one reader-trusted managed checkout. */
export async function handleLocusAttach(options: LocusAttachOptions): Promise<void> {
  await handleLocusMutation("attach", options);
}

/** Release only one caller-named exact lease generation. */
export async function handleLocusRelease(options: LocusReleaseOptions): Promise<void> {
  await handleLocusMutation("release", options);
}

async function handleLocusMutation(
  action: "attach" | "release",
  options: LocusAttachOptions | LocusReleaseOptions,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const identity = await resolveIdentityWithPrompt(false);
  if (identity === null) return;
  const io = createUserIOContext();
  if (!io.execInput) {
    emitMutation(createLocusMutationResult({
      outcome: "error", operation: action === "attach" ? "locus-attach" : "locus-release",
      error: { code: `locus.${action}.identity`, message: "The stdin Git boundary is unavailable." },
      recommendedPromptText: "Resolve the identity boundary before retrying.",
    }), options.json === true);
    return;
  }
  const { settings } = await readConfigSettings(cwd);
  const runtimeOptions = {
    checkout: options.checkout, base: settings["branch.base"], identity, cwd,
    postCreateScript: settings["worktree.post_create"],
    registeredHarnessDirs: settings["worktree.harness_dirs"],
    io: { ...io, execInput: io.execInput },
  };
  const result = action === "attach"
    ? await attachLocusAtRuntime(runtimeOptions)
    : await releaseLocusAtRuntime({ ...runtimeOptions, leaseId: (options as LocusReleaseOptions).lease });
  emitMutation(result, options.json === true);
}

function emitMutation(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  (formatted.stream === "stdout" ? process.stdout : process.stderr).write(formatted.text);
  process.exitCode = formatted.exitCode;
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

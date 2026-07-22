/**
 * I/O boundary for the read-only `arc view` command.
 *
 * @module
 */

import { execFile, spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  resolveTaskListPath,
  runActiveSessionInitStatusInternal,
  type ActiveSessionInitInternalResult,
} from "../commands/active.js";
import { runView } from "../commands/view.js";
import { parseMetaFile } from "../lib/active/meta-reader.js";
import { gitConfigGet, resolveIdentity } from "../lib/git/index.js";
import { resolveWorkUnitSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveActiveCohortDocPath } from "../lib/session-init/cohort-doc.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { WorkUnitPlacement } from "../lib/layout/index.js";
import { resolveViewArtifact, type ViewArtifactDependencies } from "../lib/view-artifact.js";
import {
  renderViewWithPager,
  resolveViewRenderer,
  type PagerProcessInput,
  type PathCommandProbe,
} from "../lib/view-renderer.js";
import type { ViewTargetResult } from "../lib/view/types.js";
import { resolveViewClock } from "../lib/view/clock.js";
import { buildLifecycleIndex, type LifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { requireArcProjectRoot } from "./shared.js";

const execFileAsync = promisify(execFile);

export interface ViewCliOptions {
  project?: boolean;
  current?: boolean;
  for?: string;
}

/** Convert the command-owned active envelope into the neutral viewer target. */
export function adaptActiveViewTarget(
  internal: ActiveSessionInitInternalResult,
  currentBranch: string | null,
): ViewTargetResult {
  const { result } = internal;
  let semantic = internal.resolved;
  let taskListPath: string | null = null;

  if (result.resolution === "single" && result.path !== null && semantic !== null) {
    return {
      status: "resolved",
      slug: semantic.slug,
      placement: semantic.placement,
      location: "active",
      metaPath: result.path,
      taskListPath: result.taskListPath ?? null,
    };
  }
  if (result.resolution === "multiple") {
    const matches = internal.candidates.filter(
      (entry) => entry.candidate.branch !== null && entry.candidate.branch === currentBranch,
    );
    if (matches.length !== 1) return { status: "unavailable" };
    semantic = matches[0] ?? null;
    if (semantic !== null) {
      taskListPath = resolveTaskListPath(semantic.candidate.path, semantic.candidate.taskList);
    }
  }

  if (semantic === null) return { status: "unavailable" };
  return {
      status: "resolved",
      slug: semantic.slug,
      placement: semantic.placement,
      location: "active",
      metaPath: semantic.candidate.path,
      taskListPath,
  };
}

/** Resolve CLI context, run the viewer, and preserve stdout/stderr separation. */
export async function handleView(
  kind: string | undefined,
  options: ViewCliOptions,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const io = createUserIOContext();
  const identity = await resolveIdentity({ exec: gitExec });
  const dependencies = createViewDependencies(cwd, io.readFile);
  const clock = await resolveViewClock({
    cwd,
    exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, cwd }),
    readFile: io.readFile,
  });
  const result = await runView({
    cwd,
    kind,
    project: Boolean(options.project),
    identity,
    current: Boolean(options.current),
    ...(options.for === undefined ? {} : { forSlug: options.for }),
    nonInteractive: process.env.CI === "true" || !process.stdout.isTTY,
  }, {
    resolveArtifact: (input) => resolveViewArtifact(input, dependencies),
    readFile: io.readFile,
    resolveRenderer: () => resolveViewRenderer({
      cwd,
      exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, cwd }),
      readFile: io.readFile,
      probe: probePathCommand,
    }),
    renderWithPager: (input) => renderViewWithPager({
      ...input,
      terminalWidth: process.stdout.columns,
    }, { run: runPagerProcess, environment: process.env }),
    clock,
  });

  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function createViewDependencies(
  cwd: string,
  readUtf8: (path: string) => Promise<string>,
): ViewArtifactDependencies {
  return {
    resolveAmbientTarget: async ({ identity }) => {
      const result = await runActiveSessionInitStatusInternal({
        cwd,
        identity,
        role: await gitConfigGet(gitExec, "arc.role"),
        exec: gitExec,
      });
      return adaptActiveViewTarget(result, await resolveCurrentBranch(cwd));
    },
    resolveExplicitTarget: async ({ slug }) => {
      const index = await buildLifecycleIndex({
        cwd,
        fs: {
          readdir: (path) => readdir(path, { withFileTypes: true }),
          readFile: readUtf8,
        },
      });
      return resolveExplicitViewTarget({ cwd, slug, index, readFile: readUtf8 });
    },
    resolveCohort: ({ activeMetaPath }) => resolveActiveCohortDocPath({
      cwd,
      activeMetaPath,
      fs: { readFile: readUtf8, pathExists },
    }),
    resolveSessionNotes: ({ identity: resolvedIdentity, workUnitName }) =>
      resolveWorkUnitSessionNotesPath(cwd, resolvedIdentity, workUnitName, { access }),
    resolveUserSurfaces: ({ identity: resolvedIdentity }) =>
      resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(resolvedIdentity), exec: gitExec }),
    pathExists,
  };
}

/** Classify one explicit slug from the checkout-local lifecycle projection. */
export async function resolveExplicitViewTarget(input: {
  cwd: string;
  slug: string;
  index: LifecycleIndex;
  readFile: (path: string) => Promise<string>;
}): Promise<ViewTargetResult> {
  const entry = input.index.get(input.slug);
  if (entry === undefined) return { status: "unavailable", slug: input.slug };
  if (entry.location === "completed") return { status: "completed", slug: input.slug };
  try {
    const slug = SlugSchema.safeParse(entry.slug);
    if (!slug.success) return { status: "unavailable", slug: input.slug };
    const cohort = [];
    for (const segment of entry.cohort?.split("/") ?? []) {
      const parsed = SlugSchema.safeParse(segment);
      if (!parsed.success) return { status: "unavailable", slug: input.slug };
      cohort.push(parsed.data);
    }
    if (cohort.length > 2) return { status: "unavailable", slug: input.slug };
    const placement: WorkUnitPlacement = entry.location === "active"
      ? { kind: "active", scope: { kind: "project" } }
      : {
          kind: "backlog",
          commitment: entry.location === "planned" ? "planned" : "provisional",
          cohort,
        };
    const meta = parseMetaFile(await input.readFile(join(input.cwd, entry.path)));
    return {
      status: "resolved",
      slug: slug.data,
      placement,
      location: entry.location,
      metaPath: entry.path,
      taskListPath: resolveTaskListPath(entry.path, meta.taskList),
    };
  } catch {
    return { status: "unavailable", slug: input.slug };
  }
}

async function resolveCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const result = await gitExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = result.stdout.trim();
    return branch === "" || branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

const probePathCommand: PathCommandProbe = async (command) => {
  try {
    await execFileAsync(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
};

function runPagerProcess(input: PagerProcessInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, [...input.args], {
      env: input.env,
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${input.command} exited with status ${code ?? "unknown"}.`));
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(input.input);
  });
}

/**
 * I/O boundary for the read-only `arc view` command.
 */

import { runView } from "../commands/view.js";
import { resolveIdentity } from "../lib/git/index.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveViewArtifact } from "../lib/view-artifact.js";
import { renderViewWithPager, resolveViewRenderer } from "../lib/view-renderer.js";
import { isNonInteractiveEnvironment, requireArcProjectRoot } from "./shared.js";

export interface ViewCliOptions {
  project?: boolean;
  current?: boolean;
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
  const result = await runView({
    cwd,
    kind,
    project: Boolean(options.project),
    identity,
    current: Boolean(options.current),
    nonInteractive: isNonInteractiveEnvironment(),
  }, {
    resolveArtifact: resolveViewArtifact,
    readFile: io.readFile,
    resolveRenderer: () => resolveViewRenderer({
      cwd,
      exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, cwd }),
      readFile: io.readFile,
    }),
    renderWithPager: (input) => renderViewWithPager(input),
  });

  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

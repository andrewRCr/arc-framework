/** Production adapter for the shared session locus-state probe. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec } from "../lib/git/exec.js";
import { readPrimarySafety } from "../lib/locus/primary-safety.js";
import { createLocusEvidenceIO } from "../lib/locus/evidence.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../lib/locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../lib/locus/process-inspector.js";
import { readLocusState } from "../lib/locus/reader.js";
import type { LocusStateV1 } from "../lib/locus/schema/index.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";

export interface LocusStateProbeOptions {
  readonly cwd: string;
  readonly identity: string;
  readonly baseBranch: string;
  readonly exec: GitExec;
}

/** Read one network-free locus interpretation for a session operation. */
export async function runLocusStateProbe(options: LocusStateProbeOptions): Promise<LocusStateV1> {
  const inspector = createPlatformProcessInspector();
  // An unverifiable anchor is a state the model represents, not a probe failure: the reader accepts
  // it, and `current` then resolves to none because no persisted lease anchor can equal it. Refusing
  // here would cost the whole snapshot at exactly the unrecognized invocation boundaries where
  // conservative state matters most. Mutating callers reject the unverifiable arm themselves.
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd: options.cwd,
    identity: SlugSchema.parse(options.identity),
    exec: options.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity,
    pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir,
    enteringAnchor: anchor,
    readPrimarySafety: (primaryPath) => readPrimarySafety({
      primaryPath,
      baseBranch: options.baseBranch,
      exec: options.exec,
    }),
  });
}

/** Construct independent code-only Git administration beside frozen presentation. */
import type { SourceMaterializationIO } from "./source-materialize.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";
import { join } from "node:path";
import { SourceCoordinatesSchema, type SourceCoordinates } from "./contract-source.js";
import { SourceCaptureError } from "./source-error.js";

function roots(coordinates: SourceCoordinates): string[] {
  return [...new Set([coordinates.tree, ...(coordinates.head === undefined ? [] : [coordinates.head]),
    ...(coordinates.base === undefined ? [] : [coordinates.base]), ...coordinates.merged])];
}

async function objectFormat(io: SourceMaterializationIO, callerRoot: string, coordinates: SourceCoordinates): Promise<string> {
  if (!SourceCoordinatesSchema.safeParse(coordinates).success) throw new SourceCaptureError("Source Git coordinates are invalid");
  const format = (await io.git("git", ["rev-parse", "--show-object-format=storage"], {
    cwd: callerRoot, objectAccess: "local-only",
  })).stdout.trim();
  if (format !== "sha1" && format !== "sha256") {
    throw new SourceCaptureError("Source Git object format is unsupported; use a supported SHA-1 or SHA-256 Git installation");
  }
  if (roots(coordinates).some(oid => oid.length !== (format === "sha1" ? 40 : 64))) {
    throw new SourceCaptureError("Source Git coordinates do not match the repository object format");
  }
  return format;
}

async function requireUnusedGitDirectory(io: SourceMaterializationIO, directory: string): Promise<void> {
  try { await io.source.lstat(directory); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return; throw cause; }
  throw new SourceCaptureError("Source Git administration already exists; retry with a fresh captured root");
}

/** Add self-contained Git objects and coordinates without checking out source files again. */
export async function addSourceGitMetadata(io: SourceMaterializationIO, callerRoot: string,
  source: FrozenSourcePresentation): Promise<void> {
  const directory = join(source.root, ".git");
  let owned = false;
  try {
    const coordinates = source.manifest.coordinates;
    const format = await objectFormat(io, callerRoot, coordinates);
    await requireUnusedGitDirectory(io, directory);
    owned = true;
    const hooks = join(directory, "hooks");
    await io.source.mkdir(hooks);
    const options = { cwd: source.root, objectAccess: "local-only" as const };
    const administration = [`--git-dir=${directory}`, `--work-tree=${source.root}`, "-c", `core.hooksPath=${hooks}`];
    await io.git("git", [...administration, "-c", "init.defaultRefFormat=files", "init", "--quiet", "--template=",
      `--object-format=${format}`, "--initial-branch=source"], options);
    const pack = join(directory, "objects", "pack");
    await io.source.mkdir(pack);
    await io.gitRaw(["pack-objects", "--revs", join(pack, "pack")], {
      cwd: callerRoot, objectAccess: "local-only", input: Buffer.from(`${roots(coordinates).join("\n")}\n`),
    });
    if (coordinates.head !== undefined) {
      await io.git("git", [...administration, "-c", "core.logAllRefUpdates=false", "update-ref", "--no-deref", "HEAD", coordinates.head], options);
    }
    await io.git("git", [...administration, "read-tree", coordinates.tree], options);
    await io.git("git", [...administration, "fsck", "--connectivity-only", "--no-reflogs", "--no-dangling", ...roots(coordinates)], options);
  } catch (cause) {
    if (owned) await io.source.files.removeDirectory(directory);
    const reason = cause instanceof SourceCaptureError ? cause.message : "Required local Git code objects or independent Git administration could not be established";
    throw new Error(`${reason}. Repair the repository, required objects or Git installation and retry with a fresh capture; keep the check local if its code history cannot be made self-contained.`, { cause });
  }
}

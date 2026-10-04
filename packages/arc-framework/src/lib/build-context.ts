/** Managed installation and runtime identity for repository build qualification. */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";

/** Runtime dimensions consumed by the native compiler and loaders. */
export interface BuildRuntimeContext {
  readonly node: string;
  readonly platform: string;
  readonly architecture: string;
}

/** Shared identity and baseline digests of its concrete installation inputs. */
export interface BuildContext {
  readonly identity: string;
  readonly contents: Readonly<Record<string, string>>;
}

/**
 * Capture managed dependency and runtime controls independently of source graphs.
 * @param packageRoot - Actual consuming package boundary
 * @param runtime - Runtime dimensions, injectable for qualification fixtures
 * @returns Shared identity and concrete input digests
 */
export function captureBuildContext(packageRoot: string, runtime: BuildRuntimeContext = {
  node: process.version, platform: process.platform, architecture: process.arch,
}): BuildContext {
  const root = resolve(packageRoot, "../..");
  const contents: Record<string, string> = {};
  const read = (file: string): Record<string, unknown> => {
    const bytes = readFileSync(file);
    contents[relative(root, file).split(sep).join("/")] = createHash("sha256").update(bytes).digest("hex");
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Unusable JSON controls in ${file}`);
    }
    return parsed as Record<string, unknown>;
  };
  try {
    read(join(root, "package.json"));
    read(join(packageRoot, "package.json"));
    validateInstallation(read(join(root, "package-lock.json")));
    validateInstallation(read(join(root, "node_modules/.package-lock.json")));
    const edges: { consumer: string; name: string; entry: string }[] = [];
    const tool = (consumer: string, name: string): string => {
      const entry = createRequire(consumer).resolve(name);
      const manifest = findToolManifest(entry, name);
      const metadata = read(manifest);
      if (typeof metadata.version !== "string" || metadata.version.length === 0) {
        throw new Error(`Missing installed version for ${name}`);
      }
      edges.push({ consumer: relative(root, consumer), name, entry: relative(root, entry) });
      return entry;
    };
    const consumer = join(packageRoot, "package.json");
    const tsup = tool(consumer, "tsup");
    const loader = tool(consumer, "bundle-require");
    tool(consumer, "typescript");
    tool(tsup, "esbuild");
    tool(tsup, "bundle-require");
    tool(loader, "esbuild");
    tool(loader, "load-tsconfig");
    const identity = createHash("sha256").update(JSON.stringify({
      contents: Object.entries(contents).sort(([a], [b]) => a.localeCompare(b)),
      edges: edges.map((edge) => ({ ...edge,
        consumer: edge.consumer.split(sep).join("/"), entry: edge.entry.split(sep).join("/"),
      })), runtime,
    })).digest("hex");
    return { identity, contents };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Build installation evidence unavailable: ${detail}; run npm ci, then npm run build:fast.`,
      { cause: error });
  }
}

function validateInstallation(value: Record<string, unknown>): void {
  if ((value.lockfileVersion !== 2 && value.lockfileVersion !== 3)
    || typeof value.packages !== "object" || value.packages === null || Array.isArray(value.packages)
    || Object.keys(value.packages).length === 0) {
    throw new Error("Missing or unusable npm installed resolution metadata");
  }
}

function findToolManifest(entry: string, name: string): string {
  for (let current = dirname(entry); current !== dirname(current); current = dirname(current)) {
    const file = join(current, "package.json");
    if (existsSync(file)) {
      const metadata = JSON.parse(readFileSync(file, "utf8")) as { name?: unknown };
      if (metadata.name === name) return file;
    }
  }
  throw new Error(`Could not identify installed ${name} from ${entry}`);
}

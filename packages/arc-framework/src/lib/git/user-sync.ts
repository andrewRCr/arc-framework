/**
 * User directory serialization for git notes portability.
 *
 * Serializes eligible text files from `user/{identity}/` into a JSON manifest
 * suitable for git note storage. Binary files, security-sensitive files, and
 * oversized files are skipped with structured warnings.
 */

/** Maximum file size in bytes (256KB). */
export const MAX_FILE_SIZE = 256 * 1024;

/** Extensions allowed for serialization (lowercase, with leading dot). */
export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  // Documentation
  ".md", ".txt", ".rst", ".adoc", ".org",
  // Config
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties",
  // Code
  ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".rb", ".java",
  ".c", ".cpp", ".h", ".cs", ".php", ".swift", ".kt",
  // Shell
  ".sh", ".bash", ".zsh", ".fish", ".ps1",
  // Web/markup
  ".html", ".htm", ".xml", ".css",
  // Data
  ".csv", ".tsv", ".sql", ".graphql",
  // Dev tools
  ".diff", ".patch", ".log",
]);

/** Compound extensions that are allowed (checked before single-extension lookup). */
export const ALLOWED_COMPOUND_EXTENSIONS: ReadonlySet<string> = new Set([
  ".env.example",
]);

/** Extensions explicitly excluded (blocked even if they look text-like). */
export const EXCLUDED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".env", ".ipynb", ".svg",
]);

/** Extensionless filenames allowed by name match. */
export const KNOWN_EXTENSIONLESS: ReadonlySet<string> = new Set([
  "Makefile", "Dockerfile", "Gemfile", "Rakefile", "Procfile",
  "Vagrantfile", "Brewfile", "Justfile",
]);

/** Reason a file was skipped during serialization. */
export type SkipReason = "type" | "size" | "excluded";

/** Warning about a file skipped during serialization. */
export interface SkipWarning {
  path: string;
  reason: SkipReason;
  detail: string;
}

/** Serialized user directory manifest. */
export interface SyncManifest {
  version: 1;
  files: Record<string, string>;
}

/** Result of serializing a user directory. */
export interface SerializeResult {
  manifest: SyncManifest;
  warnings: SkipWarning[];
}

/**
 * Check whether a filename is explicitly excluded.
 *
 * @param filename - Base filename (e.g., "secrets.env")
 * @returns true if the file's extension is in the exclusion list
 */
export function isExcludedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Check whether a filename is eligible for serialization.
 *
 * Checks compound extensions first (e.g., `.env.example`), then single
 * extensions, then known extensionless filenames. Returns false for
 * explicitly excluded files regardless of extension match.
 *
 * @param filename - Base filename (e.g., "notes.md", "Makefile")
 * @returns true if the file type is allowed for serialization
 */
export function isAllowedFile(filename: string): boolean {
  if (isExcludedFile(filename)) return false;

  const lower = filename.toLowerCase();

  // Compound extensions (e.g., .env.example)
  for (const ext of ALLOWED_COMPOUND_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  // Single extension
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex !== -1) {
    const ext = lower.slice(dotIndex);
    return ALLOWED_EXTENSIONS.has(ext);
  }

  // Extensionless — match by exact filename
  return KNOWN_EXTENSIONLESS.has(filename);
}

// --- Serialization I/O types ---

/** Directory entry with name and size (injectable for testability). */
export interface DirEntry {
  name: string;
  size: number;
}

/** Read directory entries (name + size). */
export type ReadDirFn = (dirPath: string) => Promise<DirEntry[]>;

/** Read file content as UTF-8 string. */
export type ReadFileFn = (filePath: string) => Promise<string>;

/** Write file content as UTF-8 string. */
export type WriteFileFn = (filePath: string, content: string) => Promise<void>;

// --- Serialize / Deserialize ---

/** Files excluded from serialization by name (framework-managed, not user content). */
const EXCLUDED_NAMES: ReadonlySet<string> = new Set(["README.md"]);

/**
 * Serialize eligible files from a user directory into a JSON manifest.
 *
 * Reads the directory, filters by allowlist/exclusions/size cap, and returns
 * a manifest with file contents plus warnings for any skipped files.
 *
 * @param userDir - Absolute path to the user directory
 * @param readDir - Injectable directory reader
 * @param readFile - Injectable file reader
 * @returns Manifest and warnings about skipped files
 */
export async function serialize(
  userDir: string,
  readDir: ReadDirFn,
  readFile: ReadFileFn,
): Promise<SerializeResult> {
  const entries = await readDir(userDir);
  const files: Record<string, string> = {};
  const warnings: SkipWarning[] = [];

  for (const entry of entries) {
    // Skip framework-managed files
    if (EXCLUDED_NAMES.has(entry.name)) continue;

    // Check explicit exclusions first (specific warning)
    if (isExcludedFile(entry.name)) {
      warnings.push({
        path: entry.name,
        reason: "excluded",
        detail: "file type explicitly excluded from sync",
      });
      continue;
    }

    // Check allowlist
    if (!isAllowedFile(entry.name)) {
      warnings.push({
        path: entry.name,
        reason: "type",
        detail: "file type not in text allowlist",
      });
      continue;
    }

    // Check size cap
    if (entry.size > MAX_FILE_SIZE) {
      warnings.push({
        path: entry.name,
        reason: "size",
        detail: `file exceeds ${MAX_FILE_SIZE / 1024}KB size cap (${Math.round(entry.size / 1024)}KB)`,
      });
      continue;
    }

    const content = await readFile(`${userDir}/${entry.name}`);
    files[entry.name] = content;
  }

  return {
    manifest: { version: 1, files },
    warnings,
  };
}

/** Check whether a filename is safe for deserialization (no path traversal). */
function isSafeFilename(name: string): boolean {
  if (name !== name.trim()) return false;
  if (name.length === 0) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  return true;
}

/**
 * Deserialize a manifest back into files in the user directory.
 *
 * Validates each filename to prevent path traversal from untrusted git
 * note content. Files with suspicious names are silently skipped.
 *
 * @param userDir - Absolute path to the user directory
 * @param manifest - Previously serialized manifest
 * @param writeFile - Injectable file writer
 */
export async function deserialize(
  userDir: string,
  manifest: SyncManifest,
  writeFile: WriteFileFn,
): Promise<void> {
  for (const [name, content] of Object.entries(manifest.files)) {
    if (!isSafeFilename(name)) continue;
    await writeFile(`${userDir}/${name}`, content);
  }
}

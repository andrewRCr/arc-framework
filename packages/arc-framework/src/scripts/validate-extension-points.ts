/**
 * Extension-point reference validator — pre-commit hook entry point (CHECK 16).
 *
 * Workflows mark extension fire points with anchor-suffix markers
 * (e.g., `### 3. Post-Context-Load Extensions · `#post-context-load``
 * or `**Extensions** · `#post-task-quality`: …`). Every reference must
 * resolve to a matching `system/extensions/<name>.md` file in the same
 * copy — .arc/ workflow → .arc/ extension; package-source workflow →
 * package-source extension. Cross-copy resolution is rejected by design:
 * the two trees evolve independently, and a reference pointing at an
 * extension only present in the other copy would silently break on sync.
 *
 * Complements CHECK 15 (package-source neutrality): CHECK 15 asserts
 * extension bodies and frontmatter toggles are neutral in the package
 * source; CHECK 16 asserts workflow references have a target. No overlap
 * — different surfaces, different diagnostics. Existence is the pass
 * criterion here; `active:` values and body content are not inspected.
 *
 * @module
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runPathListScript } from "./cli-runner.js";
import { classifyExtensionRefs } from "../lib/extensions/orphan-detector.js";
import { scanExtensionPoints, type ScanInput } from "../lib/extensions/point-scanner.js";

/** Workflow-path classification for extension-point validation. */
export type WorkflowPathClassification =
  | "arc-workflow"
  | "package-workflow"
  | "other";

/** Aggregate validation outcome. */
export interface ExtensionPointResult {
  pass: boolean;
  diagnostics: string[];
}

const ARC_WORKFLOW_PATH = /(?:^|\/)\.arc\/system\/workflows\//;
const PACKAGE_WORKFLOW_PATH =
  /(?:^|\/)packages\/arc-framework\/arc\/system\/workflows\//;

const ARC_EXTENSIONS_DIR = ".arc/system/extensions";
const PACKAGE_EXTENSIONS_DIR = "packages/arc-framework/arc/system/extensions";

/**
 * Classify a staged path for extension-point validation.
 *
 * Only `.md` files under `.arc/system/workflows/**` and
 * `packages/arc-framework/arc/system/workflows/**` are checked. Everything
 * else — strategies, task lists, source files, and READMEs outside the
 * workflow tree — is `other` and silently skipped. A marker appearing in
 * a non-workflow file is not a workflow contract and is out of scope.
 */
export function classifyWorkflowPath(path: string): WorkflowPathClassification {
  if (!path.endsWith(".md")) return "other";
  if (ARC_WORKFLOW_PATH.test(path)) return "arc-workflow";
  if (PACKAGE_WORKFLOW_PATH.test(path)) return "package-workflow";
  return "other";
}

/**
 * Validate a set of staged paths for extension-point reference resolution.
 *
 * @param paths - Staged file paths from the hook's filtered candidate list.
 * @param readFile - Reads the workflow content at a given path.
 * @param listExtensions - Returns the basename listing for one of the two
 *   copies — `arc` or `package`. Called at most once per copy, and only
 *   when that copy has at least one candidate workflow in the input.
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
  listExtensions: (copy: "arc" | "package") => string[],
): ExtensionPointResult {
  const arcInputs: ScanInput[] = [];
  const packageInputs: ScanInput[] = [];

  for (const path of paths) {
    const classification = classifyWorkflowPath(path);
    if (classification === "other") continue;
    const content = readFile(path);
    if (classification === "arc-workflow") arcInputs.push({ path, content });
    else packageInputs.push({ path, content });
  }

  const diagnostics: string[] = [];

  if (arcInputs.length > 0) {
    const refs = scanExtensionPoints(arcInputs);
    const { orphans } = classifyExtensionRefs(refs, listExtensions("arc"));
    for (const ref of orphans) {
      diagnostics.push(
        `${ref.workflowPath}:${ref.lineNumber}: extension-point reference \`#${ref.extensionName}\` has no matching \`${ARC_EXTENSIONS_DIR}/${ref.extensionName}.md\``,
      );
    }
  }

  if (packageInputs.length > 0) {
    const refs = scanExtensionPoints(packageInputs);
    const { orphans } = classifyExtensionRefs(refs, listExtensions("package"));
    for (const ref of orphans) {
      diagnostics.push(
        `${ref.workflowPath}:${ref.lineNumber}: extension-point reference \`#${ref.extensionName}\` has no matching \`${PACKAGE_EXTENSIONS_DIR}/${ref.extensionName}.md\``,
      );
    }
  }

  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

function listExtensionBasenames(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript((paths, readFile) =>
    validateFiles(paths, readFile, (copy) =>
      listExtensionBasenames(
        copy === "arc" ? ARC_EXTENSIONS_DIR : PACKAGE_EXTENSIONS_DIR,
      ),
    ),
  );
}

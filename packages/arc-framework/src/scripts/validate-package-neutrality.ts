/**
 * Package-source neutrality validator — pre-commit hook entry point.
 *
 * Framework package source must ship neutral defaults for per-file methods and
 * extensions: `active: false` / `override-active: false` frontmatter and
 * `[No extension configured]` / `[No override configured]` placeholder bodies.
 * Local customizations (adopter overrides, a self-hosted project copy) legitimately
 * diverge — this check runs only against paths under
 * `packages/arc-framework/arc/system/{extensions,methods}/`.
 *
 * Complements the frontmatter schema validator (schema correctness) with a
 * semantic gate: schema-valid content can still carry the wrong intent for a
 * package source. The check exists because the informal two-copy sync
 * convention has proven unreliable under authoring volume — once a single
 * personal-repo customization mirrors into the package copy it ships to every
 * adopter.
 *
 * @module
 */

import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { runPathListScript } from "./cli-runner.js";
import {
  parseExtensionFrontmatter,
  parseMethodFrontmatter,
} from "../lib/frontmatter/index.js";

/** Path classifications the neutrality validator dispatches on. */
export type PackagePathClassification =
  | "package-method"
  | "package-extension"
  | "other";

/** Aggregate validation outcome. */
export interface NeutralityResult {
  pass: boolean;
  diagnostics: string[];
}

const PACKAGE_METHOD_PATH =
  /(?:^|\/)packages\/arc-framework\/arc\/system\/methods\/([^/]+)\.md$/;
const PACKAGE_EXTENSION_PATH =
  /(?:^|\/)packages\/arc-framework\/arc\/system\/extensions\/([^/]+)\.md$/;

const EXTENSION_PLACEHOLDER = "[No extension configured]";
const METHOD_PLACEHOLDER = "[No override configured]";

/**
 * Classify a staged path for neutrality checking.
 *
 * Returns `package-method` or `package-extension` only for per-file entries
 * under the package-source directories (excluding `README.md`). All other
 * paths — including `.arc/` copies, aggregates, and unrelated files — are
 * `other` and silently skipped.
 */
export function classifyPackagePath(path: string): PackagePathClassification {
  const methodMatch = PACKAGE_METHOD_PATH.exec(path);
  if (methodMatch && methodMatch[1] !== "README") return "package-method";
  const extensionMatch = PACKAGE_EXTENSION_PATH.exec(path);
  if (extensionMatch && extensionMatch[1] !== "README") return "package-extension";
  return "other";
}

/**
 * Extract the body of a specific `## <section-name>` section.
 *
 * Body runs from the first line after the header until the next `## ` heading
 * or a line that is exactly `---` (the reference-link-block separator
 * convention used throughout ARC method and extension files). Leading and
 * trailing blank lines are stripped; internal structure is preserved.
 *
 * Returns `null` when the section header is absent.
 */
export function extractSectionBody(
  content: string,
  sectionHeader: string,
): string | null {
  const lines = content.split("\n");
  const headerLine = `## ${sectionHeader}`;
  const startIdx = lines.findIndex((l) => l === headerLine);
  if (startIdx === -1) return null;
  const body: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ") || line === "---") break;
    body.push(line);
  }
  while (body.length > 0 && body[0] === "") body.shift();
  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  return body.join("\n");
}

/**
 * Validate a set of staged paths for package-source neutrality.
 *
 * Paths classified as `other` are skipped silently — the hook invokes this
 * script with the full staged file list and filtering happens here. When
 * frontmatter fails to parse, neutrality diagnostics are suppressed (the
 * schema-validation hook, CHECK 12, surfaces that class of error).
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
): NeutralityResult {
  const diagnostics: string[] = [];
  for (const path of paths) {
    const classification = classifyPackagePath(path);
    if (classification === "other") continue;

    const content = readFile(path);
    const fileBase = basename(path, ".md");

    if (classification === "package-method") {
      const parsed = parseMethodFrontmatter(content, fileBase);
      if (!parsed.frontmatter) continue;
      if (parsed.frontmatter["override-active"]) {
        diagnostics.push(
          `${path}: package source must ship \`override-active: false\` (found true). Set to false; local override toggling belongs only in the .arc/ copy.`,
        );
      }
      const body = extractSectionBody(content, `${fileBase}.override`);
      if (body === null) {
        diagnostics.push(
          `${path}: missing \`## ${fileBase}.override\` section`,
        );
      } else if (body !== METHOD_PLACEHOLDER) {
        diagnostics.push(
          `${path}: \`.override\` body must be exactly \`${METHOD_PLACEHOLDER}\` in package source; found custom content. Move local customization to the .arc/ copy only.`,
        );
      }
    } else {
      const parsed = parseExtensionFrontmatter(content, fileBase);
      if (!parsed.frontmatter) continue;
      if (parsed.frontmatter.active) {
        diagnostics.push(
          `${path}: package source must ship \`active: false\` (found true). Set to false; local activation belongs only in the .arc/ copy.`,
        );
      }
      const body = extractSectionBody(content, `${fileBase}.actions`);
      if (body === null) {
        diagnostics.push(
          `${path}: missing \`## ${fileBase}.actions\` section`,
        );
      } else if (body !== EXTENSION_PLACEHOLDER) {
        diagnostics.push(
          `${path}: \`.actions\` body must be exactly \`${EXTENSION_PLACEHOLDER}\` in package source; found custom content. Move local customization to the .arc/ copy only.`,
        );
      }
    }
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript(validateFiles);
}

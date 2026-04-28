/**
 * Extension-point reference scanner.
 *
 * Workflow bodies anchor their extension fire points with a `·` separator
 * followed by an inline-code `#<name>` marker. The scanner walks each
 * provided workflow file line-by-line and records every occurrence as a
 * structured reference. Both the trailing-header form
 * (`### 3. … · `#post-context-load``) and the inline-bullet form
 * (`- **Extensions** · `#post-task-quality`: …`) resolve through the same
 * anchor, so one pattern suffices.
 *
 * Caller responsibility: the scanner accepts an explicit file list so each
 * consumer picks its own corpus — the `arc extensions status` probe walks
 * every workflow; the pre-commit hook walks only staged files.
 *
 * @module
 */

/** One workflow file already loaded into memory. */
export interface ScanInput {
  /** Caller-chosen label used verbatim in the result's `workflowPath`. */
  path: string;
  content: string;
}

/** A structured extension-point reference found in a workflow body. */
export interface ExtensionPointRef {
  workflowPath: string;
  /** 1-based line number within the file. */
  lineNumber: number;
  extensionName: string;
}

/**
 * Match `· ` followed by a backtick-delimited `#<kebab-name>`. The name must
 * start with a lowercase letter and contain only lowercase letters, digits,
 * and hyphens — the extension-directory filename convention.
 */
const EXTENSION_POINT_PATTERN = /·\s+`#([a-z][a-z0-9-]*)`/g;

/**
 * Scan every line of every workflow for extension-point markers.
 *
 * @param inputs - Workflow files (the caller decides which files to pass).
 * @returns References in caller-order, then by line order within each file.
 */
export function scanExtensionPoints(inputs: ScanInput[]): ExtensionPointRef[] {
  const refs: ExtensionPointRef[] = [];
  for (const { path, content } of inputs) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      EXTENSION_POINT_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = EXTENSION_POINT_PATTERN.exec(line)) !== null) {
        // The capture group is required for a successful match; narrow
        // explicitly rather than asserting via cast.
        const extensionName = match[1];
        if (extensionName === undefined) continue;
        refs.push({
          workflowPath: path,
          lineNumber: i + 1,
          extensionName,
        });
      }
    }
  }
  return refs;
}

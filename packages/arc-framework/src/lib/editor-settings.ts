/** Opt-in editor settings for browsing and editing projected operational state. */
import { applyEdits, createScanner, findNodeAtLocation, modify, parseTree, printParseErrorCode, type JSONPath, type Node, type ParseError } from "jsonc-parser";
import { projectedRootPatterns } from "./layout/index.js";

const ZED_KEY = "file_scan_inclusions";
const ROOT_GLOBS = projectedRootPatterns().map(pattern => `${pattern}**`);

/** The same identity-independent inclusions used by checkout settings and personal setup guidance. */
export function zedProjectionInclusions(): readonly string[] { return ["...", ...ROOT_GLOBS]; }

/** A copyable user-level setting, shown only when setup selected off-branch personal state. */
export function zedProjectionSettingsMessage(): string {
  return `Zed user settings: "file_scan_inclusions": [${zedProjectionInclusions().map(value => JSON.stringify(value)).join(", ")}]`;
}

/** Editors with supported checkout settings. */
export type ProjectionEditor = "vscode" | "zed";

/** A complete settings edit, or a refusal that preserves the input. */
export type EditorSettingsEdit = { readonly status: "ok"; readonly content: string | null }
  | { readonly status: "refused"; readonly condition: string };

/** Merge or remove ARC's keys without changing unrelated JSONC. */
export function mergeEditorSettings(content: string | null, editor: ProjectionEditor, remove = false): EditorSettingsEdit {
  if (content === null && remove) return { status: "ok", content };
  const source = content ?? "{}\n";
  const invalid = invalidSettings(source, editor);
  if (invalid !== null) return { status: "refused", condition: invalid };
  const updated = editor === "zed" ? mergeZed(source, remove) : mergeVscode(source, remove);
  const failed = invalidSettings(updated, editor);
  return failed === null ? { status: "ok", content: updated } : { status: "refused", condition: failed };
}

function mergeVscode(source: string, remove: boolean): string {
  if (remove) {
    const value = valueAt(source, ["files.readonlyFromPermissions"]);
    return value?.value === true ? removeValue(source, ["files.readonlyFromPermissions"]) : source;
  }
  return setValue(source, ["files.readonlyFromPermissions"], true);
}

function invalidSettings(source: string, editor: ProjectionEditor): string | null {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { allowTrailingComma: true });
  const error = errors[0];
  if (error !== undefined) return `JSONC ${printParseErrorCode(error.error)} at offset ${error.offset}.`;
  if (root?.type !== "object") return "Editor settings must be a JSONC object.";
  const list = findNodeAtLocation(root, [ZED_KEY]);
  if (editor === "zed" && list !== undefined && (list.type !== "array" || list.children?.some(child => child.type !== "string"))) {
    return `${ZED_KEY} must be a string array; preserve custom inclusions as string entries.`;
  }
  return null;
}

function mergeZed(source: string, remove: boolean): string {
  const node = valueAt(source, [ZED_KEY]);
  if (node === undefined) return remove ? source : setValue(source, [ZED_KEY], zedProjectionInclusions());
  const values: readonly unknown[] = node.children?.map(child => child.value as unknown) ?? [];
  if (remove) return removeZed(source, values);
  let text = source;
  if (values[0] !== "...") {
    const defaults = values.indexOf("...");
    if (defaults !== -1) text = removeValue(text, [ZED_KEY, defaults]);
    text = applyEdits(text, modify(text, [ZED_KEY, 0], "...", { isArrayInsertion: true }));
  }
  for (const glob of ROOT_GLOBS) {
    if (!values.includes(glob)) text = setValue(text, [ZED_KEY, -1], glob);
  }
  return text;
}

function removeZed(source: string, values: readonly unknown[]): string {
  const isRoot = (value: unknown): boolean => ROOT_GLOBS.some(glob => value === glob);
  const kept = values.filter(value => !isRoot(value));
  if (kept.length === 1 && kept[0] === "...") return removeValue(source, [ZED_KEY]);
  let text = source;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (isRoot(values[index])) text = removeValue(text, [ZED_KEY, index]);
  }
  return text;
}

function setValue(text: string, path: JSONPath, value: unknown): string {
  return applyEdits(text, modify(text, path, value, {}));
}

function valueAt(text: string, path: JSONPath): Node | undefined {
  const root = parseTree(text, undefined, { allowTrailingComma: true });
  return root === undefined ? undefined : findNodeAtLocation(root, path);
}

/** Delete owned tokens and one separator, retaining comments and whitespace around and within the value. */
function removeValue(text: string, path: JSONPath): string {
  const value = valueAt(text, path);
  if (value === undefined) return text;
  const node = value.parent?.type === "property" ? value.parent : value;
  const siblings = node.parent?.children ?? [], index = siblings.indexOf(node);
  const scanner = createScanner(text, true);
  scanner.setPosition(node.offset + node.length);
  scanner.scan();
  const edits = [{ offset: node.offset, length: node.length, content: nodeTrivia(text, node) }];
  if (text[scanner.getTokenOffset()] === ",") edits.push({ offset: scanner.getTokenOffset(), length: 1, content: "" });
  else if (index > 0) {
    const previous = siblings[index - 1];
    if (previous !== undefined) {
      scanner.setPosition(previous.offset + previous.length);
      scanner.scan();
      edits.push({ offset: scanner.getTokenOffset(), length: 1, content: "" });
    }
  }
  return applyEdits(text, edits);
}

function nodeTrivia(text: string, node: Node): string {
  const source = text.slice(node.offset, node.offset + node.length), scanner = createScanner(source, false);
  let trivia = "";
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) {
    const lexeme = source.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
    if (/^\s|^\/[/*]/u.test(lexeme)) trivia += lexeme;
  }
  return trivia;
}

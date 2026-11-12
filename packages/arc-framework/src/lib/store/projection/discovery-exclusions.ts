/** Identify editor/system side files and legacy derived views before discovery inspects them. */
import { MACHINE_LOCAL_PATHS } from "../registry.js";
import { resolveArcPath } from "../../layout/index.js";
import { IDENTITY_STATUS_FILENAME } from "../../user-surfaces.js";

const FOLDER_SIDE_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".directory"]);
const EDITOR_SIDE_FILE = /~$|^\.#|^#.*#$|^\..*\.sw.$|^4913$|\.tmp\.[0-9]+\.[0-9a-fA-F]+$/u;
const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

/** Whether a managed path names a side file or one of the legacy derived views. */
export function isExcludedProjectionFile(path: string): boolean {
  const parts = path.split("/"), name = parts.at(-1) ?? "";
  if (FOLDER_SIDE_FILES.has(name) || name.startsWith("._") || EDITOR_SIDE_FILE.test(name)) return true;
  return path === ROADMAP_PATH || parts.length === 4 && parts[0] === ".arc" && parts[1] === "user"
    && name === IDENTITY_STATUS_FILENAME;
}


/** Whether a managed path is excluded from projection discovery and content admission. */
export function isExcludedProjectionPath(path: string): boolean {
  return isExcludedProjectionFile(path) || isMachineLocalProjectionPath(path);
}

/** Whether a checkout-relative path is covered by an applicable machine-local registry rule. */
export function isMachineLocalProjectionPath(path: string): boolean {
  const segments = path.split("/");
  return MACHINE_LOCAL_PATHS.some(rule => {
    const prefix = rule.root === "user" ? [".arc", "user"] : rule.root === "checkout" ? [] : null;
    if (prefix === null) return false;
    const pattern = [...prefix, ...rule.pattern.replace(/\/\*\*$/u, "").split("/")];
    return segments.length >= pattern.length && pattern.every((part, index) => (
      part === "*" || part === "<identity>" || part === segments[index]
    ));
  });
}

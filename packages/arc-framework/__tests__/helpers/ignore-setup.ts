/** Metadata and create-only operations over the same virtual files a command fixture reads and writes. */
import { sep } from "node:path";
import type { IgnoreSetupIO } from "../../src/lib/template/ignore-files.js";

export function virtualIgnoreSetup(files: Map<string, string>): Required<IgnoreSetupIO> {
  const identities = new Map<string, number>();
  return {
    mkdir: async () => undefined,
    lstat: async (path) => {
      const file = files.has(path);
      const directory = [...files.keys()].some((name) => name.startsWith(`${path}${sep}`));
      if (!file && !directory) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (!identities.has(path)) identities.set(path, identities.size + 1);
      return { isFile: () => file, isSymbolicLink: () => false, nlink: 1, dev: 1, ino: identities.get(path)! };
    },
    exclusiveCreate: async (path, content) => {
      if (files.has(path)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      files.set(path, content);
    },
  };
}

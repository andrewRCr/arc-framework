/**
 * Reference material may not promise a command the CLI does not register.
 *
 * Both sides are derived — documented invocations from the quick-reference copies, live paths from
 * the Commander source scan — so removing a command surfaces here without anyone maintaining a list.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { loadRepositoryCommandInputSnapshot } from "../../src/lib/command-input/repository-inventory.js";

const root = resolve(import.meta.dirname, "../../../..");
const sourceRoot = resolve(root, "packages/arc-framework/src");

const REFERENCES = [
  { label: "project", path: resolve(root, ".arc/reference/QUICK-REFERENCE.md") },
  { label: "package", path: resolve(root, "packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md") },
] as const;

/** One documented invocation and the command path its leading words name. */
interface DocumentedInvocation {
  readonly line: string;
  readonly words: readonly string[];
}

/**
 * Collect the `arc …` invocations a reference document publishes.
 *
 * Only the leading bare words are kept — the first operand, option, or alternation ends the command
 * path, so `arc errand open <slug> --intent <text>` contributes `errand open`.
 */
function documentedInvocations(content: string): DocumentedInvocation[] {
  const invocations: DocumentedInvocation[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("arc ")) continue;
    const words: string[] = [];
    for (const token of line.slice("arc ".length).split(/\s+/u)) {
      if (!/^[a-z][a-z0-9-]*$/u.test(token)) break;
      words.push(token);
    }
    if (words.length > 0) invocations.push({ line, words });
  }
  return invocations;
}

/**
 * Resolve a documented invocation to the registered command it names.
 *
 * Every bare word is a command segment — operands and options are bracketed — so a resolution that
 * leaves words over has not found the documented command, only an ancestor of it. Falling back to
 * that ancestor is what lets a group outlive the subcommand a document still promises.
 */
function resolveCommandPath(words: readonly string[], registered: ReadonlySet<string>): string | null {
  const path = words.join(" ");
  return registered.has(path) ? path : null;
}

describe("documented command surface", () => {
  let registered!: ReadonlySet<string>;

  beforeAll(async () => {
    const snapshot = await loadRepositoryCommandInputSnapshot(sourceRoot);
    const paths = new Set<string>();
    for (const command of snapshot.source.commands) {
      paths.add(command.path);
      const segments = command.path.split(" ");
      // Group commands (`errand`, `locus`) carry no action of their own, so they are named only by
      // their children's paths. Registering every ancestor keeps a documented group resolvable.
      for (let length = 1; length < segments.length; length += 1) paths.add(segments.slice(0, length).join(" "));
      for (const alias of command.aliases) {
        paths.add([...segments.slice(0, -1), alias].join(" "));
      }
    }
    registered = paths;
  });

  it.each(REFERENCES)("publishes only registered commands in the $label quick reference", async ({ path }) => {
    const invocations = documentedInvocations(await readFile(path, "utf8"));
    expect(invocations.length).toBeGreaterThan(0);

    const unregistered = invocations
      .filter((invocation) => resolveCommandPath(invocation.words, registered) === null)
      .map((invocation) => invocation.line);

    expect(unregistered).toEqual([]);
  });

  it("refuses a documented subcommand whose surviving parent group is all that registers", () => {
    const [documented] = documentedInvocations("arc errand open <slug> --intent <text> [--json]\n");

    expect(documented?.words).toEqual(["errand", "open"]);
    expect(resolveCommandPath(documented?.words ?? [], new Set(["errand", "errand close"]))).toBeNull();
    expect(resolveCommandPath(documented?.words ?? [], new Set(["errand", "errand open"]))).toBe("errand open");
  });

  it("stops the command path at the first operand, option, or alternation", () => {
    const lines = [
      "arc locus resolve <record-id> --action resume|abandon",
      "arc errand link <slug> (--from-inbox <entry> | --inbox-entry-file <path|->)",
      "arc status --project",
    ].join("\n");

    expect(documentedInvocations(lines).map((invocation) => invocation.words)).toEqual([
      ["locus", "resolve"],
      ["errand", "link"],
      ["status"],
    ]);
  });
});

/**
 * Neither reference material nor emitted corrective actions may promise a command the CLI does not
 * register.
 *
 * Every side is derived — documented invocations from the quick-reference copies, emitted
 * invocations from the source literals commands hand back to their caller, live paths from the
 * Commander source scan — so removing a command surfaces here without anyone maintaining a list.
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
 * Collect the `arc …` invocations a source file hands back to its caller.
 *
 * A locus, refusal, or next-action emits its corrective command as a string literal, so the leading
 * bare words of every such literal name a command path the CLI must register. Two derived filters
 * keep prose out: comment lines are dropped, and the path must close the literal or run into an
 * option, an interpolation, or an operand — which a sentence carrying a command name never does.
 */
function emittedInvocations(sourceText: string): DocumentedInvocation[] {
  const code = sourceText
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/u.test(line))
    .join("\n");
  const invocations: DocumentedInvocation[] = [];
  const pattern = /[`'"]arc ((?:[a-z][a-z0-9-]*)(?: [a-z][a-z0-9-]*)*)(?=[`'"]| (?:-|\$\{|<|\[|\{))/gu;
  for (const match of code.matchAll(pattern)) {
    const words = match[1]?.split(" ") ?? [];
    if (words.length > 0) invocations.push({ line: `arc ${match[1] ?? ""}`, words });
  }
  return invocations;
}

/** Resolve a documented invocation to the registered command it names. */
function resolveCommandPath(words: readonly string[], registered: ReadonlySet<string>): string | null {
  const path = words.join(" ");
  return registered.has(path) ? path : null;
}

describe("documented command surface", () => {
  let registered!: ReadonlySet<string>;
  let sourceFiles!: Readonly<Record<string, string>>;

  beforeAll(async () => {
    const snapshot = await loadRepositoryCommandInputSnapshot(sourceRoot);
    sourceFiles = snapshot.sourceFiles;
    const paths = new Set<string>();
    for (const command of snapshot.source.commands) {
      paths.add(command.path);
      const segments = command.path.split(" ");
      for (let length = 1; length < segments.length; length += 1) {
        paths.add(segments.slice(0, length).join(" "));
      }
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

  it("registers every command the source emits as a corrective action", () => {
    const emitted = Object.entries(sourceFiles)
      .flatMap(([file, text]) => emittedInvocations(text).map((invocation) => ({ file, invocation })));
    // The scan is derived, so an over-tight filter would pass by finding nothing. The Candidate
    // spine's own next actions are the fixed point that proves it still sees emitted commands.
    expect(emitted.map(({ invocation }) => invocation.line))
      .toEqual(expect.arrayContaining(["arc review pre-publication", "arc publish", "arc attest"]));

    const unregistered = emitted
      .filter(({ invocation }) => resolveCommandPath(invocation.words, registered) === null)
      .map(({ file, invocation }) => `${file}: ${invocation.line}`);

    expect(unregistered).toEqual([]);
  });

  it("reads the command path out of an interpolated emitted literal", () => {
    const emitted = emittedInvocations("const c = `arc review pre-publication ${workUnit} --json`;");

    expect(emitted.map((invocation) => invocation.words)).toEqual([["review", "pre-publication"]]);
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
      "arc errand link <slug> (--from-inbox <entry> | --inbox-title-file <path|->)",
      "arc status --project",
    ].join("\n");

    expect(documentedInvocations(lines).map((invocation) => invocation.words)).toEqual([
      ["locus", "resolve"],
      ["errand", "link"],
      ["status"],
    ]);
  });
});

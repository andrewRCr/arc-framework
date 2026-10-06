/**
 * Neither reference material nor emitted corrective actions may promise a command the CLI does not
 * register.
 *
 * Every side is derived — documented invocations from the quick-reference copies, emitted
 * invocations from the source literals commands hand back to their caller, live paths from the
 * Commander source scan — so removing a command surfaces here without anyone maintaining a list.
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import ts from "typescript";

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
  const source = ts.createSourceFile("commands.ts", sourceText, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node)) {
      const first = node.elements[0];
      if (first !== undefined && ts.isStringLiteralLike(first) && first.text === "arc") {
        const words: string[] = [];
        for (const element of node.elements.slice(1)) {
          if (!ts.isStringLiteralLike(element) || !/^[a-z][a-z0-9-]*$/u.test(element.text)) break;
          words.push(element.text);
        }
        if (words.length > 0) invocations.push({ line: `arc ${words.join(" ")}`, words });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return invocations;
}

/** Guidance trees whose `arc …` blocks an operator is told to run verbatim. */
const GUIDANCE_ROOTS = [
  { label: "project", path: resolve(root, ".arc/system/workflows") },
  { label: "project", path: resolve(root, ".arc/reference") },
  { label: "package", path: resolve(root, "packages/arc-framework/arc/system/workflows") },
  { label: "package", path: resolve(root, "packages/arc-framework/arc/reference") },
] as const;

/** One executable invocation a guidance document publishes, with the options it passes. */
interface GuidanceInvocation extends DocumentedInvocation {
  readonly options: readonly string[];
}

/**
 * Collect the `arc …` invocations a guidance document tells an operator to run.
 *
 * Shell continuations are joined first, so an option carried on its own line still belongs to the
 * command that opened the block — the shape a line-oriented sweep cannot see. Command substitutions
 * are then excised rather than split on, so a `$(gh … --json …)` cannot lend its options to the
 * `arc` command around it and cannot hide the outer command's own options behind it either.
 */
function guidanceInvocations(content: string): GuidanceInvocation[] {
  const logical: string[] = [];
  let pending: string | null = null;
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    pending = pending === null ? line : `${pending} ${line.trim()}`;
    if (pending.endsWith("\\")) {
      pending = pending.slice(0, -1);
      continue;
    }
    logical.push(pending);
    pending = null;
  }
  if (pending !== null) logical.push(pending);

  const invocations: GuidanceInvocation[] = [];
  for (const line of logical) {
    let bare = line;
    for (let previous = ""; bare !== previous;) {
      previous = bare;
      bare = bare.replace(/\$\([^()]*\)/gu, "");
    }
    for (const segment of bare.split(/\||&&|;/u)) {
      const match = /\barc ((?:[a-z][a-z0-9-]*)(?: [a-z][a-z0-9-]*)*)/u.exec(segment);
      if (match === null) continue;
      const words = match[1]?.split(" ") ?? [];
      const options = segment
        .slice(match.index + match[0].length)
        .split(/\s+/u)
        .filter((token) => /^--[a-z][a-z0-9-]*$/u.test(token));
      if (words.length > 0) invocations.push({ line: line.trim(), words, options });
    }
  }
  return invocations;
}

/** Resolve a documented invocation to the registered command it names. */
function resolveCommandPath(
  words: readonly string[],
  registered: ReadonlySet<string>,
  operandCommands: ReadonlySet<string> = new Set(),
): string | null {
  const path = words.join(" ");
  if (registered.has(path)) return path;
  for (let length = words.length - 1; length > 0; length -= 1) {
    const prefix = words.slice(0, length).join(" ");
    if (registered.has(prefix) && operandCommands.has(prefix)) return prefix;
  }
  return null;
}

describe("documented command surface", () => {
  let registered!: ReadonlySet<string>;
  let operandCommands!: ReadonlySet<string>;
  let declaresJson!: ReadonlySet<string>;
  let sourceFiles!: Readonly<Record<string, string>>;

  beforeAll(async () => {
    const snapshot = await loadRepositoryCommandInputSnapshot(sourceRoot);
    operandCommands = new Set(snapshot.source.commands.filter((command) => command.operands.length > 0)
      .map((command) => command.path));
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
    declaresJson = new Set(snapshot.source.commands
      .filter((command) => command.options.some((option) => option.flags.split(/[ ,|]+/u).includes("--json")))
      .map((command) => command.path));
  });

  it.each(REFERENCES)("publishes only registered commands in the $label quick reference", async ({ path }) => {
    const invocations = documentedInvocations(await readFile(path, "utf8"));
    expect(invocations.length).toBeGreaterThan(0);

    const unregistered = invocations
      .filter((invocation) => resolveCommandPath(invocation.words, registered, operandCommands) === null)
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
      .filter(({ invocation }) => resolveCommandPath(invocation.words, registered, operandCommands) === null)
      .map(({ file, invocation }) => `${file}: ${invocation.line}`);

    expect(unregistered).toEqual([]);
  });

  it("reads the command path out of an interpolated emitted literal", () => {
    const emitted = emittedInvocations("const c = `arc review pre-publication ${workUnit}`;");

    expect(emitted.map((invocation) => invocation.words)).toEqual([["review", "pre-publication"]]);
  });

  it("reads a corrective command path out of structured argv", () => {
    const emitted = emittedInvocations('const remedy = { argv: ["arc", "review", "status"] };');

    expect(emitted.map((invocation) => invocation.words)).toEqual([["review", "status"]]);
  });

  it("rejects an unregistered structured argv command", () => {
    const [emitted] = emittedInvocations('const remedy = { argv: ["arc", "not-registered"] };');

    expect(resolveCommandPath(emitted?.words ?? [], new Set(["review", "status"]))).toBeNull();
  });

  it("refuses a documented subcommand whose surviving parent group is all that registers", () => {
    const [documented] = documentedInvocations("arc errand open <slug> --intent <text> [--json]\n");

    expect(documented?.words).toEqual(["errand", "open"]);
    expect(resolveCommandPath(documented?.words ?? [], new Set(["errand", "errand close"]))).toBeNull();
    expect(resolveCommandPath(documented?.words ?? [], new Set(["errand", "errand open"]))).toBe("errand open");
  });

  it("accepts named operands in examples only when the registered command declares operands", () => {
    const paths = new Set(["start", "view", "review", "review resolve"]);
    const operands = new Set(["start", "view", "review resolve"]);
    expect(resolveCommandPath(["start", "my-work"], paths, operands)).toBe("start");
    expect(resolveCommandPath(["view", "tasks"], paths, operands)).toBe("view");
    expect(resolveCommandPath(["review", "resolve", "request"], paths, operands)).toBe("review resolve");
    expect(resolveCommandPath(["review", "missing"], paths, operands)).toBeNull();
    expect(resolveCommandPath(["missing", "my-work"], paths, operands)).toBeNull();
  });

  it("passes `--json` only to commands that declare it, across every guidance tree", async () => {
    expect(declaresJson.has("review status")).toBe(false);
    expect(declaresJson.has("review resolve")).toBe(false);
    expect(declaresJson.has("status")).toBe(true);

    const documents = await Promise.all(GUIDANCE_ROOTS.map(async ({ path }) => {
      const entries = await readdir(path, { recursive: true });
      const markdown = entries.filter((entry) => entry.endsWith(".md"));
      return Promise.all(markdown.map(async (entry) => {
        const file = resolve(path, entry);
        return { file, invocations: guidanceInvocations(await readFile(file, "utf8")) };
      }));
    }));
    const scanned = documents.flat();

    // The scan is derived, so an over-tight filter would pass by finding nothing. A command that
    // genuinely keeps the flag is the fixed point that proves the scan still sees `--json`.
    const passingJson = scanned
      .flatMap(({ invocations }) => invocations)
      .filter((invocation) => invocation.options.includes("--json"));
    expect(passingJson.length).toBeGreaterThan(0);

    const retired = scanned.flatMap(({ file, invocations }) => invocations
      .filter((invocation) => invocation.options.includes("--json"))
      .filter((invocation) => {
        const path = resolveCommandPath(invocation.words, registered);
        return path !== null && !declaresJson.has(path);
      })
      .map((invocation) => `${file.slice(root.length + 1)}: ${invocation.line}`));

    expect(retired).toEqual([]);
  });

  it("carries a continued option back to the command that opened the block", () => {
    const block = [
      "arc review checks await \\",
      "  --head-sha <sha> \\",
      "  --json",
    ].join("\n");

    expect(guidanceInvocations(block)).toEqual([
      { line: "arc review checks await  --head-sha <sha>  --json", words: ["review", "checks", "await"], options: ["--head-sha", "--json"] },
    ]);
  });

  it("keeps a nested substitution's options out of the surrounding command", () => {
    const line = 'arc archive {name} --pr-url "$(gh pr view {name} --json url --jq .url)"';

    expect(guidanceInvocations(line)).toEqual([
      { line, words: ["archive"], options: ["--pr-url"] },
    ]);
  });

  it("keeps the outer command's own options from behind a substitution", () => {
    const line = 'arc review status --target "$(gh pr view {name} --json url --jq .url)" --json';

    expect(guidanceInvocations(line)).toEqual([
      { line, words: ["review", "status"], options: ["--target", "--json"] },
    ]);
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

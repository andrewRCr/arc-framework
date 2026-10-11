/** Proposals preserve authored commands without activating an event gate. */
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { extractCheckProposal } from "../../../../src/lib/checks/bootstrap-extraction.js";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";

const fenced = (body: string, language = "bash") => `\`\`\`${language}\n${body}\n\`\`\``;
const quick = (body: string) => `# Commands\n## Quality Gate Commands\n${body}\n## Publishing\n${fenced("do-not-extract")}`;
const method = (active: boolean, body: string) => `---\nname: quality-gate-commands\ndescription: Project commands\noverride-active: ${active}\n---\n## quality-gate-commands.override\n${body}\n## quality-gate-commands.default\n${fenced("do-not-extract")}`;
const actions = (name: string, body: string) => `---\nname: ${name}\ndescription: Extra checks\nactive: false\n---\n## ${name}.actions\n${body}\n`;

describe("check proposal extraction", () => {
  it("preserves each shell command, tier mapping, and source without assigning gates", () => {
    const result = extractCheckProposal({ quickReference: quick([
      "### Incremental — Tier 1 (per-task)", fenced("# explanation\nnpm run lint && echo ready\nnpm run types", "sh"),
      "### Integration — Tier 2", fenced("npm test"), "### Release — Tier 3", fenced("npm run build"),
    ].join("\n")) });
    expect(result.commands.map(({ command, mappedGate }) => [command, mappedGate])).toEqual([
      ["# explanation\nnpm run lint && echo ready\nnpm run types\n", "commit"],
      ["npm test\n", "push"], ["npm run build\n", "merge"],
    ]);
    const declaration = CheckDeclarationSchema.parse(yaml.load(result.proposal));
    expect(Object.values(declaration.checks).map(({ command, shell, gate }) => ({ command, shell, gate })))
      .toEqual(result.commands.map(({ command }) => ({ command, shell: true, gate: undefined })));
    expect(result.proposal).toContain("# Mapped gate: commit");
    expect(result.proposal).toContain("# Source: .arc/reference/QUICK-REFERENCE.md");
  });

  it("deduplicates across tiers and surfaces, retaining the earliest deadline and every source", () => {
    const result = extractCheckProposal({
      quickReference: quick(`### Tier 3 complete\n${fenced("npm test")}`),
      method: method(true, `### Tier 2 custom\n${fenced("npm test")}`),
      postTask: actions("post-task-quality", fenced("npm test")),
      postUnit: actions("post-unit-quality", fenced("npm run integration")),
    });
    expect(result.commands).toEqual([
      { command: "npm test\n", mappedGate: "commit", sources: [
        ".arc/reference/QUICK-REFERENCE.md", ".arc/system/methods/quality-gate-commands.md",
        ".arc/system/extensions/post-task-quality.md",
      ] },
      { command: "npm run integration\n", mappedGate: "push", sources: [".arc/system/extensions/post-unit-quality.md"] },
    ]);
  });

  it("reports populated prose actions and excludes inactive method overrides and empty placeholders", () => {
    const result = extractCheckProposal({
      method: method(false, `### Tier 1\n${fenced("do-not-extract")}`),
      postTask: actions("post-task-quality", "Run the security scanner and inspect its findings."),
      postUnit: actions("post-unit-quality", "[No extension configured]"),
    });
    expect(result.commands).toEqual([]);
    expect(result.unextractable).toEqual([{ source: ".arc/system/extensions/post-task-quality.md",
      text: "Run the security scanner and inspect its findings." }]);
  });
});


it("preserves continued and stateful shell blocks as one inactive executable command", () => {
  const body = "# retain shell context\ncd nested\nexport MODE=strict\nnpm run lint \\\n  -- --strict";
  const result = extractCheckProposal({ postTask: actions("post-task-quality", fenced(body)) });
  expect(result.commands).toEqual([{ command: body + "\n", mappedGate: "commit",
    sources: [".arc/system/extensions/post-task-quality.md"] }]);
  expect(result.unextractable).toEqual([]);
  const declaration = CheckDeclarationSchema.parse(yaml.load(result.proposal));
  expect(declaration.checks["imported-1"]).toMatchObject({ command: body + "\n", shell: true });
  expect(declaration.checks["imported-1"]?.gate).toBeUndefined();
});

it("reports incomplete shell fences for manual authoring", () => {
  const result = extractCheckProposal({ postTask: actions("post-task-quality", "```bash\ncd nested\nnpm test") });
  expect(result.commands).toEqual([]);
  expect(result.unextractable).toEqual([{ source: ".arc/system/extensions/post-task-quality.md",
    text: "cd nested\nnpm test\n" }]);
});


it("preserves trailing blank lines after a shell continuation", () => {
  const body = "printf '<%s>' value \\\n\n";
  const result = extractCheckProposal({ postTask: actions("post-task-quality", fenced(body)) });
  expect(result.commands[0]?.command).toBe(body + "\n");
});

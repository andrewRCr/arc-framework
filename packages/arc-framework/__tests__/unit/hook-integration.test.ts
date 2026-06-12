/**
 * Unit tests for hook manager integration.
 *
 * Tests the integrateHooks function which adds ARC hook calls into
 * each supported hook manager's configuration.
 */

import { describe, it, expect } from "vitest";
import { integrateHooks } from "../../src/lib/hook-integration.js";
import type { HookManagerResult } from "../../src/lib/hook-manager.js";

/** Collects all writes for assertion. */
function makeIO(files: Record<string, string> = {}) {
  const written: Record<string, string> = {};
  return {
    written,
    readFile: async (path: string): Promise<string> => {
      const content = files[path];
      if (content !== undefined) return content;
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    writeFile: async (path: string, content: string) => {
      written[path] = content;
    },
  };
}

// -- Husky integration --

describe("integrateHooks — husky", () => {
  const detection: HookManagerResult = {
    manager: "husky",
    configPath: "/repo/.husky",
  };

  it("appends ARC hook calls to existing husky hook files", async () => {
    const io = makeIO({
      "/repo/.husky/pre-commit": "#!/usr/bin/env sh\nnpm run lint\n",
      "/repo/.husky/commit-msg": "#!/usr/bin/env sh\nnpx commitlint --edit $1\n",
      "/repo/.husky/pre-push": "#!/usr/bin/env sh\nnpm test\n",
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    expect(io.written["/repo/.husky/pre-commit"]).toContain(".arc/system/.internal/githooks/pre-commit");
    expect(io.written["/repo/.husky/commit-msg"]).toContain(".arc/system/.internal/githooks/commit-msg $1");
    // Pre-push forwards the remote args so the canonical hook can name the remote.
    expect(io.written["/repo/.husky/pre-push"]).toContain('.arc/system/.internal/githooks/pre-push "$@"');
    // Preserves existing content
    expect(io.written["/repo/.husky/pre-commit"]).toContain("npm run lint");
    expect(io.written["/repo/.husky/commit-msg"]).toContain("npx commitlint --edit $1");
    expect(io.written["/repo/.husky/pre-push"]).toContain("npm test");
  });

  it("creates hook files with shebang when they don't exist", async () => {
    const io = makeIO({});

    await integrateHooks(detection, io.readFile, io.writeFile);

    expect(io.written["/repo/.husky/pre-commit"]).toMatch(/^#!/);
    expect(io.written["/repo/.husky/pre-commit"]).toContain(".arc/system/.internal/githooks/pre-commit");
    expect(io.written["/repo/.husky/commit-msg"]).toMatch(/^#!/);
    expect(io.written["/repo/.husky/commit-msg"]).toContain(".arc/system/.internal/githooks/commit-msg $1");
    expect(io.written["/repo/.husky/pre-push"]).toMatch(/^#!/);
    expect(io.written["/repo/.husky/pre-push"]).toContain('.arc/system/.internal/githooks/pre-push "$@"');
  });

  it("is idempotent — does not duplicate entries on second run", async () => {
    const existing = "#!/usr/bin/env sh\n.arc/system/.internal/githooks/pre-commit\n";
    const existingMsg = "#!/usr/bin/env sh\n.arc/system/.internal/githooks/commit-msg $1\n";
    const existingPush = '#!/usr/bin/env sh\n.arc/system/.internal/githooks/pre-push "$@"\n';
    const io = makeIO({
      "/repo/.husky/pre-commit": existing,
      "/repo/.husky/commit-msg": existingMsg,
      "/repo/.husky/pre-push": existingPush,
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    // Should not write at all — nothing changed
    expect(io.written).toEqual({});
  });
});

// -- Lefthook integration --

describe("integrateHooks — lefthook", () => {
  const detection: HookManagerResult = {
    manager: "lefthook",
    configPath: "/repo/lefthook.yml",
  };

  it("adds ARC commands to existing lefthook config", async () => {
    const io = makeIO({
      "/repo/lefthook.yml": [
        "pre-commit:",
        "  commands:",
        "    lint:",
        "      run: npm run lint",
        "",
      ].join("\n"),
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    const output = io.written["/repo/lefthook.yml"];
    expect(output).toBeDefined();
    expect(output).toContain("arc-pre-commit");
    expect(output).toContain(".arc/system/.internal/githooks/pre-commit");
    expect(output).toContain("arc-commit-msg");
    expect(output).toContain(".arc/system/.internal/githooks/commit-msg {1}");
    expect(output).toContain("arc-pre-push");
    expect(output).toContain(".arc/system/.internal/githooks/pre-push {1} {2}");
    // Preserves existing commands
    expect(output).toContain("npm run lint");
  });

  it("creates hook sections when lefthook.yml has no pre-commit or commit-msg", async () => {
    const io = makeIO({
      "/repo/lefthook.yml": "# empty config\n",
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    const output = io.written["/repo/lefthook.yml"];
    expect(output).toBeDefined();
    expect(output).toContain("arc-pre-commit");
    expect(output).toContain("arc-commit-msg");
    expect(output).toContain("arc-pre-push");
  });

  it("is idempotent — does not duplicate entries on second run", async () => {
    const existing = [
      "pre-commit:",
      "  commands:",
      "    arc-pre-commit:",
      "      run: .arc/system/.internal/githooks/pre-commit",
      "commit-msg:",
      "  commands:",
      "    arc-commit-msg:",
      "      run: .arc/system/.internal/githooks/commit-msg {1}",
      "pre-push:",
      "  commands:",
      "    arc-pre-push:",
      "      run: .arc/system/.internal/githooks/pre-push {1} {2}",
      "",
    ].join("\n");
    const io = makeIO({ "/repo/lefthook.yml": existing });

    await integrateHooks(detection, io.readFile, io.writeFile);

    expect(io.written).toEqual({});
  });
});

// -- Pre-commit integration --

describe("integrateHooks — pre-commit", () => {
  const detection: HookManagerResult = {
    manager: "pre-commit",
    configPath: "/repo/.pre-commit-config.yaml",
  };

  it("adds ARC local hooks to existing pre-commit config", async () => {
    const io = makeIO({
      "/repo/.pre-commit-config.yaml": [
        "repos:",
        "  - repo: https://github.com/pre-commit/pre-commit-hooks",
        "    rev: v4.5.0",
        "    hooks:",
        "      - id: trailing-whitespace",
        "",
      ].join("\n"),
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    const output = io.written["/repo/.pre-commit-config.yaml"];
    expect(output).toBeDefined();
    expect(output).toContain("arc-pre-commit");
    expect(output).toContain(".arc/system/.internal/githooks/pre-commit");
    expect(output).toContain("arc-commit-msg");
    expect(output).toContain(".arc/system/.internal/githooks/commit-msg");
    expect(output).toContain("arc-pre-push");
    expect(output).toContain(".arc/system/.internal/githooks/pre-push");
    // Pre-push runs at the pre-push stage, not commit.
    expect(output).toContain("pre-push");
    expect(output).toContain("unsupported_script");
    // Preserves existing repos
    expect(output).toContain("trailing-whitespace");
  });

  it("creates repos list when config has none", async () => {
    const io = makeIO({
      "/repo/.pre-commit-config.yaml": "# minimal config\n",
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    const output = io.written["/repo/.pre-commit-config.yaml"];
    expect(output).toBeDefined();
    expect(output).toContain("arc-pre-commit");
    expect(output).toContain("arc-pre-push");
    expect(output).toContain("repo: local");
  });

  it("appends to existing local repo entry if one exists", async () => {
    const io = makeIO({
      "/repo/.pre-commit-config.yaml": [
        "repos:",
        "  - repo: local",
        "    hooks:",
        "      - id: my-custom-hook",
        "        name: My Hook",
        "        entry: scripts/check.sh",
        "        language: system",
        "        stages: [commit]",
        "",
      ].join("\n"),
    });

    await integrateHooks(detection, io.readFile, io.writeFile);

    const output = io.written["/repo/.pre-commit-config.yaml"];
    expect(output).toBeDefined();
    expect(output).toContain("arc-pre-commit");
    expect(output).toContain("arc-pre-push");
    expect(output).toContain("my-custom-hook");
  });

  it("is idempotent — does not duplicate entries on second run", async () => {
    const existing = [
      "repos:",
      "  - repo: local",
      "    hooks:",
      "      - id: arc-pre-commit",
      "        name: ARC Pre-Commit",
      "        entry: .arc/system/.internal/githooks/pre-commit",
      "        language: unsupported_script",
      "        stages:",
      "          - commit",
      "        files: .",
      "      - id: arc-commit-msg",
      "        name: ARC Commit Message",
      "        entry: .arc/system/.internal/githooks/commit-msg",
      "        language: unsupported_script",
      "        stages:",
      "          - commit-msg",
      '        files: ^$',
      "      - id: arc-pre-push",
      "        name: ARC Pre-Push",
      "        entry: .arc/system/.internal/githooks/pre-push",
      "        language: unsupported_script",
      "        stages:",
      "          - pre-push",
      '        files: ^$',
      "",
    ].join("\n");
    const io = makeIO({ "/repo/.pre-commit-config.yaml": existing });

    await integrateHooks(detection, io.readFile, io.writeFile);

    expect(io.written).toEqual({});
  });
});

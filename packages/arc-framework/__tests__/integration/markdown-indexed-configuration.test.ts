import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import {
  loadIndexedMarkdownConfigurationGroups,
} from "../../src/lib/markdown/indexed-configuration.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";

const execFileAsync = promisify(execFile);

let root: string;

async function write(path: string, content: string | Uint8Array): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function rootConfig(config: Record<string, unknown> = { default: true }): string {
  return JSON.stringify({ config, ...MARKDOWN_SELECTION, customRules: [] });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-index-config-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await write(".markdownlint-cli2.jsonc", rootConfig({ default: true, MD013: false }));
  await write("docs/.markdownlint-cli2.jsonc", "{ // staged override\n \"config\": { \"MD046\": false }\n}\n");
  await write("README.md", "# Root\n");
  await write("docs/guide.md", "# Guide\n");
  await execFileAsync("git", ["add", "--all"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("indexed Markdown configuration", () => {
  it("loads staged root and nested rules once and groups paths by inherited configuration", async () => {
    await write("docs/.markdownlint-cli2.jsonc", JSON.stringify({ config: { MD046: true } }));
    const readBlob = vi.fn((cwd: string, path: string) => readGitBlobBytes(cwd, null, path));

    const result = await loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob,
      markdownPaths: ["README.md", "docs/guide.md"],
    });

    expect(result.configPaths).toEqual([
      ".markdownlint-cli2.jsonc",
      "docs/.markdownlint-cli2.jsonc",
    ]);
    expect(result.groups).toEqual([
      {
        config: { default: true, MD013: false },
        paths: ["README.md"],
      },
      {
        config: { default: true, MD013: false, MD046: false },
        paths: ["docs/guide.md"],
      },
    ]);
    expect(readBlob.mock.calls.map(([, path]) => path)).toEqual(result.configPaths);
  });

  it("uses staged root rules and ignores unstaged configuration edits", async () => {
    await write(".markdownlint-cli2.jsonc", rootConfig({ default: false }));

    const result = await loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
      markdownPaths: ["README.md", "docs/guide.md"],
    });
    expect(result.groups.map(({ config }) => config)).toEqual([
      { default: true, MD013: false },
      { default: true, MD013: false, MD046: false },
    ]);
  });

  it("accepts empty supported options and removes a deleted nested override", async () => {
    await write(".markdownlint-cli2.jsonc", rootConfig({}));
    await execFileAsync("git", ["add", ".markdownlint-cli2.jsonc"], { cwd: root });
    await execFileAsync("git", ["rm", "-f", "docs/.markdownlint-cli2.jsonc"], { cwd: root });

    const result = await loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
      markdownPaths: ["README.md", "docs/guide.md"],
    });
    expect(result).toEqual({
      configPaths: [".markdownlint-cli2.jsonc"],
      groups: [{ config: {}, paths: ["README.md", "docs/guide.md"] }],
    });
  });

  it("rejects root selector drift and nested path options", async () => {
    await write(
      ".markdownlint-cli2.jsonc",
      JSON.stringify({ config: {}, ...MARKDOWN_SELECTION, globs: ["docs/**/*.md"], customRules: [] }),
    );
    await execFileAsync("git", ["add", ".markdownlint-cli2.jsonc"], { cwd: root });
    await expect(loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
      markdownPaths: ["README.md"],
    })).rejects.toThrow("Root globs do not match the authoritative selector in order");

    await write(".markdownlint-cli2.jsonc", rootConfig());
    await write("docs/.markdownlint-cli2.jsonc", JSON.stringify({ config: {}, ignores: ["generated/**"] }));
    await execFileAsync("git", ["add", "--all"], { cwd: root });
    await expect(loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
      markdownPaths: ["docs/guide.md"],
    })).rejects.toThrow("Nested configuration must not define ignores");
  });

  it("rejects malformed, invalid UTF-8, and executable configuration options", async () => {
    const assertRootFailure = async (content: string | Uint8Array, message: string): Promise<void> => {
      await write(".markdownlint-cli2.jsonc", content);
      await execFileAsync("git", ["add", ".markdownlint-cli2.jsonc"], { cwd: root });
      await expect(loadIndexedMarkdownConfigurationGroups({
        root,
        exec: makeGitExec(root),
        readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
        markdownPaths: ["README.md"],
      })).rejects.toThrow(message);
    };

    await assertRootFailure("{", "Malformed Markdown configuration");
    await assertRootFailure(Uint8Array.from([0xc3, 0x28]), "not valid UTF-8");
    await assertRootFailure(
      JSON.stringify({ config: [], ...MARKDOWN_SELECTION, customRules: [] }),
      "Markdown configuration config must be an object",
    );
    await assertRootFailure(
      JSON.stringify({ config: {}, ...MARKDOWN_SELECTION, customRules: ["./rule.mjs"] }),
      "customRules must be an empty array",
    );
    await assertRootFailure(
      JSON.stringify({ config: { extends: "./shared.json" }, ...MARKDOWN_SELECTION, customRules: [] }),
      "must not extend external files",
    );
    await assertRootFailure(
      JSON.stringify({ config: {}, ...MARKDOWN_SELECTION, customRules: [], markdownItPlugins: [] }),
      "Unsupported Markdown configuration option(s): markdownItPlugins",
    );
  });

  it("requires the supported root configuration", async () => {
    await execFileAsync("git", ["rm", "-f", ".markdownlint-cli2.jsonc"], { cwd: root });
    await expect(loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
      markdownPaths: ["README.md"],
    })).rejects.toThrow("Root Markdown configuration is missing");
  });

  it.each([
    ".markdownlint-cli2.yaml",
    ".markdownlint-cli2.cjs",
    ".markdownlint-cli2.mjs",
    ".markdownlint.jsonc",
    ".markdownlint.json",
    ".markdownlint.yaml",
    ".markdownlint.yml",
    ".markdownlint.cjs",
    ".markdownlint.mjs",
  ])("fails closed for recognized configuration form %s", async (path) => {
    await write(path, "{}\n");
    await execFileAsync("git", ["add", path], { cwd: root });
    await expect(loadIndexedMarkdownConfigurationGroups({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, selectedPath) => readGitBlobBytes(cwd, null, selectedPath),
      markdownPaths: ["README.md"],
    })).rejects.toThrow(`Unsupported Markdown configuration form: ${path}`);
  });
});

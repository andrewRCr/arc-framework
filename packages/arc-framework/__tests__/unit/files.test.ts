import { describe, it, expect, vi } from "vitest";
import {
  ensureDir,
  copyWithRendering,
  appendToGitignore,
  appendToGitattributes,
} from "../../src/lib/files.js";

describe("ensureDir", () => {
  it("creates nested directories recursively", async () => {
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    await ensureDir("/tmp/a/b/c", mockMkdir);
    expect(mockMkdir).toHaveBeenCalledWith("/tmp/a/b/c", { recursive: true });
  });

  it("is idempotent when directory already exists", async () => {
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    await ensureDir("/tmp/existing", mockMkdir);
    await ensureDir("/tmp/existing", mockMkdir);
    expect(mockMkdir).toHaveBeenCalledTimes(2);
  });
});

describe("copyWithRendering", () => {
  const mockWrite = vi.fn().mockResolvedValue(undefined);

  it("substitutes {{TOKEN}} placeholders from config map", async () => {
    const mockRead = vi
      .fn()
      .mockResolvedValue("Hello {{PROJECT_NAME}}, branch {{BASE_BRANCH}}");
    await copyWithRendering(
      "src.md",
      "dest.md",
      { PROJECT_NAME: "MyApp", BASE_BRANCH: "main" },
      {},
      mockRead,
      mockWrite,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      "dest.md",
      "Hello MyApp, branch main",
    );
  });

  it("processes conditional blocks based on config", async () => {
    const template = [
      "always here",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "only in arc-in-git",
      "<!-- arc:endif -->",
      "also always",
    ].join("\n");
    const mockRead = vi.fn().mockResolvedValue(template);
    await copyWithRendering(
      "src.md",
      "dest.md",
      {},
      { "pm.mode": "arc-in-git" },
      mockRead,
      mockWrite,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      "dest.md",
      "always here\nonly in arc-in-git\nalso always",
    );
  });

  it("excludes conditional blocks when condition does not match", async () => {
    const template = [
      "always here",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "only in arc-in-git",
      "<!-- arc:endif -->",
      "also always",
    ].join("\n");
    const mockRead = vi.fn().mockResolvedValue(template);
    await copyWithRendering(
      "src.md",
      "dest.md",
      {},
      { "pm.mode": "none" },
      mockRead,
      mockWrite,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      "dest.md",
      "always here\nalso always",
    );
  });

  it("passes through files with no tokens or conditionals unchanged", async () => {
    const plain = "# Simple file\n\nNo special markers here.\n";
    const mockRead = vi.fn().mockResolvedValue(plain);
    await copyWithRendering("src.md", "dest.md", {}, {}, mockRead, mockWrite);
    expect(mockWrite).toHaveBeenCalledWith("dest.md", plain);
  });
});

describe("appendToGitignore", () => {
  it("adds entry when not already present", async () => {
    const mockRead = vi.fn().mockResolvedValue("node_modules/\ndist/\n");
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await appendToGitignore(".gitignore", ".pristine/", mockRead, mockWrite);
    expect(mockWrite).toHaveBeenCalledWith(
      ".gitignore",
      "node_modules/\ndist/\n.pristine/\n",
    );
  });

  it("skips duplicate when entry already exists", async () => {
    const mockRead = vi
      .fn()
      .mockResolvedValue("node_modules/\n.pristine/\ndist/\n");
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await appendToGitignore(".gitignore", ".pristine/", mockRead, mockWrite);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe("appendToGitattributes", () => {
  it("adds entry when not already present", async () => {
    const mockRead = vi.fn().mockResolvedValue("*.md linguist-documentation\n");
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await appendToGitattributes(
      ".gitattributes",
      "WORK-STATUS.md merge=ours",
      mockRead,
      mockWrite,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      ".gitattributes",
      "*.md linguist-documentation\nWORK-STATUS.md merge=ours\n",
    );
  });

  it("skips duplicate when entry already exists", async () => {
    const mockRead = vi
      .fn()
      .mockResolvedValue("WORK-STATUS.md merge=ours\n*.md linguist-documentation\n");
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await appendToGitattributes(
      ".gitattributes",
      "WORK-STATUS.md merge=ours",
      mockRead,
      mockWrite,
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

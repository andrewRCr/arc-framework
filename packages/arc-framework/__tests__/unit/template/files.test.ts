import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureDir,
  copyWithRendering,
  appendToGitignore,
  writeArcGitignoreBlock,
  appendToGitattributes,
} from "../../../src/lib/template/index.js";

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

  beforeEach(() => {
    mockWrite.mockClear();
  });

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

describe("writeArcGitignoreBlock", () => {
  it("creates file with managed block when file does not exist", async () => {
    const mockRead = vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await writeArcGitignoreBlock(
      ".gitignore",
      [".arc/user/*/", ".arc/system/.internal/pristine.json"],
      mockRead,
      mockWrite,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      ".gitignore",
      "# ARC Framework (managed by arc cli)\n"
      + ".arc/system/.internal/pristine.json\n"
      + ".arc/user/*/\n"
      + "# end ARC\n",
    );
  });

  it("appends block to existing gitignore", async () => {
    const mockRead = vi.fn().mockResolvedValue("node_modules/\ndist/\n");
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await writeArcGitignoreBlock(
      ".gitignore",
      [".arc/user/*/"],
      mockRead,
      mockWrite,
    );
    const written = mockWrite.mock.calls[0]?.[1] as string;
    expect(written).toContain("node_modules/");
    expect(written).toContain("# ARC Framework (managed by arc cli)");
    expect(written).toContain(".arc/user/*/");
    expect(written).toContain("# end ARC");
  });

  it("replaces existing block contents", async () => {
    const existing = [
      "node_modules/",
      "# ARC Framework (managed by arc cli)",
      ".arc/user/*/",
      "# end ARC",
      "",
    ].join("\n");
    const mockRead = vi.fn().mockResolvedValue(existing);
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await writeArcGitignoreBlock(
      ".gitignore",
      [".arc/user/*/", ".claude/skills/arc-*/"],
      mockRead,
      mockWrite,
    );
    const written = mockWrite.mock.calls[0]?.[1] as string;
    expect(written).toContain(".claude/skills/arc-*/");
    expect(written).toContain(".arc/user/*/");
    // Block markers present exactly once
    expect(written.match(/# ARC Framework/g)?.length).toBe(1);
    expect(written.match(/# end ARC/g)?.length).toBe(1);
  });

  it("deduplicates entries", async () => {
    const mockRead = vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await writeArcGitignoreBlock(
      ".gitignore",
      [".arc/user/*/", ".arc/user/*/", ".claude/skills/arc-*/"],
      mockRead,
      mockWrite,
    );
    const written = mockWrite.mock.calls[0]?.[1] as string;
    expect(written.match(/\.arc\/user\/\*\//g)?.length).toBe(1);
  });

  it("migrates legacy scattered entries into the block", async () => {
    const existing = "node_modules/\n.arc/user/*/\ndist/\n";
    const mockRead = vi.fn().mockResolvedValue(existing);
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    await writeArcGitignoreBlock(
      ".gitignore",
      [".arc/user/*/", ".claude/skills/arc-*/"],
      mockRead,
      mockWrite,
    );
    const written = mockWrite.mock.calls[0]?.[1] as string;
    // Entry should be in the block, not scattered outside
    const blockStart = written.indexOf("# ARC Framework");
    const blockEnd = written.indexOf("# end ARC");
    const entryIdx = written.indexOf(".arc/user/*/");
    expect(entryIdx).toBeGreaterThan(blockStart);
    expect(entryIdx).toBeLessThan(blockEnd);
    // Should not appear before the block
    const beforeBlock = written.slice(0, blockStart);
    expect(beforeBlock).not.toContain(".arc/user/*/");
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

import { describe, it, expect } from "vitest";
import {
  isAllowedFile,
  serialize,
  deserialize,
  MAX_FILE_SIZE,
  type SerializeResult,
  type SyncManifest,
} from "../../../src/lib/git/user-sync.js";
import type { DirEntry } from "../../../src/lib/git/index.js";

describe("isAllowedFile", () => {
  it("allows extensionless known files by name", () => {
    expect(isAllowedFile("Makefile")).toBe(true);
    expect(isAllowedFile("Dockerfile")).toBe(true);
    expect(isAllowedFile("Gemfile")).toBe(true);
    expect(isAllowedFile("Procfile")).toBe(true);
    expect(isAllowedFile("Justfile")).toBe(true);
  });

  it("rejects unknown extensionless files", () => {
    expect(isAllowedFile("randomfile")).toBe(false);
    expect(isAllowedFile("NOTES")).toBe(false);
  });

  it("is case-sensitive for extensionless names but case-insensitive for extensions", () => {
    // Extensionless: exact match only
    expect(isAllowedFile("makefile")).toBe(false);
    expect(isAllowedFile("MAKEFILE")).toBe(false);
    // Extensions: case-insensitive
    expect(isAllowedFile("NOTES.MD")).toBe(true);
    expect(isAllowedFile("Config.JSON")).toBe(true);
  });

  it("rejects explicitly excluded files", () => {
    expect(isAllowedFile(".env")).toBe(false);
    expect(isAllowedFile("secrets.env")).toBe(false);
    expect(isAllowedFile("notebook.ipynb")).toBe(false);
    expect(isAllowedFile("diagram.svg")).toBe(false);
  });

  it("allows .env.example despite .env exclusion", () => {
    expect(isAllowedFile(".env.example")).toBe(true);
    expect(isAllowedFile("local.env.example")).toBe(true);
  });

  it("rejects binary file extensions", () => {
    const rejected = [
      "screenshot.png", "photo.jpg", "photo.jpeg", "icon.gif",
      "image.webp", "icon.ico", "scan.tiff", "logo.bmp",
      "document.pdf", "report.docx", "data.xlsx", "slides.pptx",
      "archive.zip", "backup.tar", "data.gz", "package.7z",
      "program.exe", "library.dll", "module.so", "code.o",
      "compiled.class", "module.pyc", "package.whl", "app.jar",
    ];
    for (const file of rejected) {
      expect(isAllowedFile(file), `expected ${file} to be rejected`).toBe(false);
    }
  });

  it("allows common text file extensions", () => {
    const allowed = [
      "SESSION-NOTES.md", "scratch.txt", "notes.rst", "guide.adoc",
      "outline.org", "config.json", "settings.yaml", "data.yml",
      "config.toml", "app.ini", "db.cfg", "server.conf",
      "app.properties", "snippet.js", "helper.ts", "component.jsx",
      "page.tsx", "script.py", "main.go", "lib.rs", "util.rb",
      "App.java", "main.c", "lib.cpp", "header.h", "Program.cs",
      "index.php", "app.swift", "Main.kt", "run.sh", "setup.bash",
      "init.zsh", "config.fish", "setup.ps1", "page.html", "index.htm",
      "data.xml", "styles.css", "data.csv", "data.tsv", "query.sql",
      "schema.graphql", "changes.diff", "fix.patch", "output.log",
    ];
    for (const file of allowed) {
      expect(isAllowedFile(file), `expected ${file} to be allowed`).toBe(true);
    }
  });
});

// --- Helper to build mock I/O for serialize/deserialize ---

function mockIO(files: Record<string, { content: string; size?: number }>) {
  const entries: DirEntry[] = Object.keys(files).map((name) => ({
    name,
    size: files[name]!.size ?? Buffer.byteLength(files[name]!.content),
  }));

  const readDir = async (): Promise<DirEntry[]> => entries;
  const readFile = async (path: string): Promise<string> => {
    const name = path.split("/").pop()!;
    const file = files[name];
    if (!file) throw new Error(`ENOENT: ${path}`);
    return file.content;
  };

  return { readDir, readFile };
}

describe("serialize", () => {
  it("includes allowed text files in manifest", async () => {
    const { readDir, readFile } = mockIO({
      "SESSION-NOTES.md": { content: "# Notes\nSome content" },
      "scratch.txt": { content: "scratch notes" },
      "config.json": { content: '{"key": "value"}' },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(result.warnings).toEqual([]);
    expect(Object.keys(result.manifest.files)).toHaveLength(3);
    expect(result.manifest.files["SESSION-NOTES.md"]).toBe("# Notes\nSome content");
    expect(result.manifest.files["scratch.txt"]).toBe("scratch notes");
    expect(result.manifest.files["config.json"]).toBe('{"key": "value"}');
    expect(result.manifest.version).toBe(2);
  });

  it("excludes README.md", async () => {
    const { readDir, readFile } = mockIO({
      "README.md": { content: "# User Dir" },
      "SESSION-NOTES.md": { content: "# Notes" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    expect(result.manifest.files["README.md"]).toBeUndefined();
  });

  it("skips binary files with type warning", async () => {
    const { readDir, readFile } = mockIO({
      "SESSION-NOTES.md": { content: "# Notes" },
      "screenshot.png": { content: "binary" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({
      path: "screenshot.png",
      reason: "type",
      detail: "file type not in text allowlist",
    });
  });

  it("skips explicitly excluded files with excluded warning", async () => {
    const { readDir, readFile } = mockIO({
      ".env": { content: "SECRET=abc" },
      "notebook.ipynb": { content: "{}" },
      "diagram.svg": { content: "<svg/>" },
      "SESSION-NOTES.md": { content: "# Notes" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    // .env is skipped silently by dotfile convention (no warning);
    // ipynb and svg are skipped with excluded warnings
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.reason === "excluded")).toBe(true);
  });

  it("skips files exceeding size cap with size warning", async () => {
    const { readDir, readFile } = mockIO({
      "huge.md": { content: "x", size: MAX_FILE_SIZE + 1 },
      "small.md": { content: "ok" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    expect(result.manifest.files["small.md"]).toBe("ok");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.reason).toBe("size");
  });

  it("includes extensionless known files", async () => {
    const { readDir, readFile } = mockIO({
      "Makefile": { content: "all: build" },
      "Dockerfile": { content: "FROM node:18" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(2);
    expect(result.manifest.files["Makefile"]).toBe("all: build");
  });

  it("returns empty manifest for empty directory", async () => {
    const readDir = async (): Promise<DirEntry[]> => [];
    const readFile = async (): Promise<string> => "";

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(result.manifest.files).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});

describe("deserialize", () => {
  it("writes manifest files to the target directory", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = {
      version: 1,
      files: {
        "SESSION-NOTES.md": "# Notes\nRestored",
        "scratch.txt": "scratch content",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(written["/repo/.arc/user/andrew/SESSION-NOTES.md"]).toBe("# Notes\nRestored");
    expect(written["/repo/.arc/user/andrew/scratch.txt"]).toBe("scratch content");
  });

  it("round-trips: serialize then deserialize restores original files", async () => {
    const originalFiles: Record<string, string> = {
      "SESSION-NOTES.md": "# Session\nWork context here",
      "ATOMIC-INBOX.md": "# Inbox\n- [ ] Fix thing",
      "scratch.py": "print('hello')\n",
    };

    const { readDir, readFile } = mockIO(
      Object.fromEntries(
        Object.entries(originalFiles).map(([k, v]) => [k, { content: v }]),
      ),
    );

    const { manifest } = await serialize("/repo/.arc/user/dev", readDir, readFile);

    // Deserialize into a fresh record
    const restored: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      const name = path.split("/").pop()!;
      restored[name] = content;
    };

    await deserialize("/repo/.arc/user/dev", manifest, writeFile);
    expect(restored).toEqual(originalFiles);
  });

  it("handles empty manifest gracefully", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = { version: 1, files: {} };
    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(Object.keys(written)).toHaveLength(0);
  });

  it("skips path traversal attacks but allows legitimate subdirectory paths", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = {
      version: 2,
      files: {
        "../../.git/config": "malicious content",
        "../etc/passwd": "another attack",
        "subfolder/file.md": "nested path",
        "valid.md": "safe content",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(Object.keys(written)).toHaveLength(2);
    expect(written["/repo/.arc/user/andrew/valid.md"]).toBe("safe content");
    expect(written["/repo/.arc/user/andrew/subfolder/file.md"]).toBe("nested path");
  });

  it("skips dot-dot and dot filenames but allows double-dot in normal names", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = {
      version: 1,
      files: {
        "..": "traversal",
        ".": "current dir",
        "backup..v2.md": "legitimate double-dot filename",
        " leading-space.md": "leading whitespace",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(Object.keys(written)).toHaveLength(1);
    expect(written["/repo/.arc/user/andrew/backup..v2.md"]).toBe("legitimate double-dot filename");
  });

  it("creates subdirectories via mkdirFn when provided", async () => {
    const written: Record<string, string> = {};
    const dirs: string[] = [];
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };
    const mkdirFn = async (path: string): Promise<undefined> => {
      dirs.push(path);
      return undefined;
    };

    const manifest: SyncManifest = {
      version: 2,
      files: {
        "flat.md": "flat content",
        "sub/nested.md": "nested content",
        "deep/path/file.txt": "deep content",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile, mkdirFn);
    expect(Object.keys(written)).toHaveLength(3);
    expect(written["/repo/.arc/user/andrew/sub/nested.md"]).toBe("nested content");
    expect(written["/repo/.arc/user/andrew/deep/path/file.txt"]).toBe("deep content");
    // mkdirFn called for subdirectory entries, not flat files
    expect(dirs).toContain("/repo/.arc/user/andrew/sub");
    expect(dirs).toContain("/repo/.arc/user/andrew/deep/path");
    expect(dirs).not.toContain("/repo/.arc/user/andrew");
  });

  it("rejects path traversal in subdirectory segments", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = {
      version: 2,
      files: {
        "sub/../escape.md": "traversal via segment",
        "sub/./same.md": "dot segment",
        "/absolute/path.md": "absolute path (leading slash = empty first segment)",
        "sub//double.md": "double slash (empty segment)",
        "valid/nested.md": "legitimate",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(Object.keys(written)).toHaveLength(1);
    expect(written["/repo/.arc/user/andrew/valid/nested.md"]).toBe("legitimate");
  });

  it("accepts v1 manifests (flat keys are valid relative paths)", async () => {
    const written: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      written[path] = content;
    };

    const manifest: SyncManifest = {
      version: 1,
      files: {
        "SESSION-NOTES.md": "# Notes",
        "scratch.txt": "scratch",
      },
    };

    await deserialize("/repo/.arc/user/andrew", manifest, writeFile);
    expect(Object.keys(written)).toHaveLength(2);
    expect(written["/repo/.arc/user/andrew/SESSION-NOTES.md"]).toBe("# Notes");
  });
});

describe("serialize — dotfile and subdirectory support", () => {
  it("skips dotfiles silently (no warning)", async () => {
    const { readDir, readFile } = mockIO({
      "SESSION-NOTES.md": { content: "# Notes" },
      ".pre-load-backup.json": { content: '{"version":2}' },
      ".hidden": { content: "secret" },
    });

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    expect(result.manifest.files["SESSION-NOTES.md"]).toBe("# Notes");
    // Dotfiles produce no warnings — they're silently excluded by convention
    expect(result.warnings).toEqual([]);
  });

  it("handles entries with relative paths (subdirectory support)", async () => {
    const entries: DirEntry[] = [
      { name: "SESSION-NOTES.md", size: 10 },
      { name: "drafts/idea.md", size: 15 },
      { name: "drafts/deep/nested.txt", size: 8 },
    ];
    const fileContents: Record<string, string> = {
      "SESSION-NOTES.md": "# Notes",
      "drafts/idea.md": "# Draft idea",
      "drafts/deep/nested.txt": "nested",
    };

    const readDir = async (): Promise<DirEntry[]> => entries;
    const readFile = async (path: string): Promise<string> => {
      const relPath = path.replace("/repo/.arc/user/andrew/", "");
      return fileContents[relPath] ?? "";
    };

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    expect(Object.keys(result.manifest.files)).toHaveLength(3);
    expect(result.manifest.files["drafts/idea.md"]).toBe("# Draft idea");
    expect(result.manifest.files["drafts/deep/nested.txt"]).toBe("nested");
    expect(result.manifest.version).toBe(2);
  });

  it("applies basename-based filtering to subdirectory entries", async () => {
    const entries: DirEntry[] = [
      { name: "drafts/.hidden-file", size: 5 },
      { name: "drafts/README.md", size: 10 },
      { name: "drafts/notes.md", size: 8 },
      { name: "drafts/secrets.env", size: 12 },
    ];
    const fileContents: Record<string, string> = {
      "drafts/notes.md": "notes",
    };

    const readDir = async (): Promise<DirEntry[]> => entries;
    const readFile = async (path: string): Promise<string> => {
      const relPath = path.replace("/repo/.arc/user/andrew/", "");
      return fileContents[relPath] ?? "";
    };

    const result = await serialize("/repo/.arc/user/andrew", readDir, readFile);
    // .hidden-file: skipped (dotfile), README.md: skipped (EXCLUDED_NAMES),
    // secrets.env: skipped (excluded extension), notes.md: included
    expect(Object.keys(result.manifest.files)).toHaveLength(1);
    expect(result.manifest.files["drafts/notes.md"]).toBe("notes");
    // Only secrets.env produces a warning (excluded extension)
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.path).toBe("drafts/secrets.env");
  });

  it("version 2 manifest round-trips with subdirectory entries", async () => {
    const originalFiles: Record<string, string> = {
      "SESSION-NOTES.md": "# Session",
      "drafts/idea.md": "# Idea",
    };
    const entries: DirEntry[] = Object.entries(originalFiles).map(([name, content]) => ({
      name,
      size: Buffer.byteLength(content),
    }));

    const readDir = async (): Promise<DirEntry[]> => entries;
    const readFile = async (path: string): Promise<string> => {
      const relPath = path.replace("/repo/.arc/user/dev/", "");
      return originalFiles[relPath] ?? "";
    };

    const { manifest } = await serialize("/repo/.arc/user/dev", readDir, readFile);
    expect(manifest.version).toBe(2);

    const restored: Record<string, string> = {};
    const writeFile = async (path: string, content: string): Promise<void> => {
      const relPath = path.replace("/repo/.arc/user/dev/", "");
      restored[relPath] = content;
    };

    await deserialize("/repo/.arc/user/dev", manifest, writeFile);
    expect(restored).toEqual(originalFiles);
  });
});

/** Link targets, heading anchors, and file selection for the installed-layout link audit. */

import { describe, expect, it } from "vitest";

import {
  auditLinks,
  headingAnchors,
  selectLinkAuditFiles,
  type LinkAuditIo,
} from "../../../src/scripts/audit-links.js";

function fixtureIo(files: Record<string, string>, directories: readonly string[] = []): LinkAuditIo {
  return {
    readFile(path) {
      const content = files[path];
      if (content === undefined) throw new Error(`no content for ${path}`);
      return content;
    },
    kind(path) {
      if (files[path] !== undefined) return "file";
      return directories.includes(path) ? "directory" : null;
    },
  };
}

const target = "# Target\n\n## Known Section\n\n## Use `arc check` \u00a7 Gates \u2014 now\n";

describe("headingAnchors", () => {
  it("derives the anchors GitHub renders for headings, numbering repeats", () => {
    expect([...headingAnchors(`${target}\n### Notes\n\nNotes\n-----\n`)]).toEqual([
      "target", "known-section", "use-arc-check--gates--now", "notes", "notes-1",
    ]);
  });

  it("skips a numbered slug an earlier heading already holds", () => {
    expect([...headingAnchors("## Retry\n\n## Retry-1\n\n## Retry\n\n## Retry\n")]).toEqual([
      "retry", "retry-1", "retry-2", "retry-3",
    ]);
  });

  it("includes HTML anchor ids and names", () => {
    const anchors = headingAnchors('<a id="custom"></a>\n\nText <a name="legacy"></a> here.\n');
    expect(anchors.has("custom")).toBe(true);
    expect(anchors.has("legacy")).toBe(true);
  });

  it("ignores heading-like lines inside fenced code", () => {
    expect([...headingAnchors("```md\n# Not a heading\n```\n")]).toEqual([]);
  });
});

describe("auditLinks", () => {
  it("passes links, images, and definitions that name existing files, directories, and headings", () => {
    const io = fixtureIo({
      ".arc/a/source.md": [
        "See [the target](target.md), [its section](target.md#known-section), and",
        "[the gate](./target.md#use-arc-check--gates--now). ![diagram](../img/flow.png)",
        "See [the folder](../b/) and [the reference][ref].",
        "",
        "[ref]: ../b/other.md#other",
        "",
      ].join("\n"),
      ".arc/a/target.md": target,
      ".arc/b/other.md": "# Other\n",
      ".arc/img/flow.png": "png",
    }, [".arc/b"]);
    expect(auditLinks([".arc/a/source.md"], io)).toEqual({ pass: true, diagnostics: [] });
  });

  it("refuses missing indexed sources with repair guidance and keeps auditing other files", () => {
    const missing = ".arc/a/missing file.md";
    const present = ".arc/a/source.md";
    const io = fixtureIo({ [present]: "See [it](gone.md).\n" });
    const missingIo: LinkAuditIo = {
      ...io,
      readFile(path) {
        if (path === missing) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return io.readFile(path);
      },
    };

    expect(auditLinks([missing, present], missingIo)).toEqual({
      pass: false,
      diagnostics: [
        `${missing}: indexed Markdown file is missing from the working tree; stage its deletion or restore the file`,
        `${present}:1:5: broken link -> gone.md`,
      ],
    });
  });

  it("preserves permission failures instead of presenting them as missing files", () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const io: LinkAuditIo = {
      readFile() { throw error; },
      kind() { return "file"; },
    };

    expect(() => auditLinks([".arc/a/source.md"], io)).toThrow(error);
  });

  it("reports a link to a missing file at its position", () => {
    const io = fixtureIo({ ".arc/a/source.md": "# Source\n\nSee [it](missing.md).\n" });
    expect(auditLinks([".arc/a/source.md"], io).diagnostics).toEqual([
      ".arc/a/source.md:3:5: broken link -> missing.md",
    ]);
  });

  it("reports a fragment that names no heading in the target", () => {
    const io = fixtureIo({
      ".arc/a/source.md": "See [it](target.md#unknown-section).\n",
      ".arc/a/target.md": target,
    });
    expect(auditLinks([".arc/a/source.md"], io).diagnostics).toEqual([
      ".arc/a/source.md:1:5: missing anchor -> target.md#unknown-section",
    ]);
  });

  it("checks reference definitions", () => {
    const io = fixtureIo({ ".arc/a/source.md": "See [it][ref].\n\n[ref]: gone.md\n" });
    expect(auditLinks([".arc/a/source.md"], io).diagnostics).toEqual([
      ".arc/a/source.md:3:1: broken link -> gone.md",
    ]);
  });

  it("resolves percent-encoded paths and fragments", () => {
    const io = fixtureIo({
      ".arc/a/source.md": "See [it](my%20target.md#known-section).\n",
      ".arc/a/my target.md": target,
    });
    expect(auditLinks([".arc/a/source.md"], io).pass).toBe(true);
  });

  it("resolves a path without its query string and still checks the fragment", () => {
    const io = fixtureIo({
      ".arc/a/source.md": [
        "See [raw](target.md?plain=1), [raw section](target.md?plain=1#known-section),",
        "and [raw missing](target.md?plain=1#unknown).",
        "",
      ].join("\n"),
      ".arc/a/target.md": target,
    });
    expect(auditLinks([".arc/a/source.md"], io).diagnostics).toEqual([
      ".arc/a/source.md:2:5: missing anchor -> target.md?plain=1#unknown",
    ]);
  });

  it("reports a link that leaves the repository without probing outside it", () => {
    const io = fixtureIo({ ".arc/a/source.md": "See [host file](../../../etc/hosts).\n" });
    const guarded: LinkAuditIo = {
      readFile: io.readFile,
      kind(path) {
        if (path.startsWith("..")) throw new Error(`probed outside the repository: ${path}`);
        return io.kind(path);
      },
    };
    expect(auditLinks([".arc/a/source.md"], guarded).diagnostics).toEqual([
      ".arc/a/source.md:1:5: link leaves the repository -> ../../../etc/hosts",
    ]);
  });

  it("skips external links, in-file fragments, and code", () => {
    const io = fixtureIo({
      ".arc/a/source.md": [
        "See [docs](https://example.com), [mail](mailto:x@example.com), and [below](#nowhere).",
        "",
        "Inline `[code](missing.md)` stays literal.",
        "",
        "```md",
        "[fenced](missing.md)",
        "```",
        "",
      ].join("\n"),
    });
    expect(auditLinks([".arc/a/source.md"], io)).toEqual({ pass: true, diagnostics: [] });
  });

  it("leaves fragments into non-Markdown targets unchecked", () => {
    const io = fixtureIo({
      ".arc/a/source.md": "See [line ten](run.sh#L10).\n",
      ".arc/a/run.sh": "#!/bin/sh\n",
    });
    expect(auditLinks([".arc/a/source.md"], io).pass).toBe(true);
  });
});

describe("selectLinkAuditFiles", () => {
  it("keeps tracked installed-layout Markdown outside the archive and template sources", () => {
    expect(selectLinkAuditFiles([
      ".arc/system/rules.md",
      ".arc/active/meta-example.md",
      ".arc/completed/2026/meta-old.md",
      ".arc/reference/templates/template-spec.md",
      ".arc/reference/brief.template.md",
      ".arc/system/arc-checks.yml",
      "packages/arc-framework/arc/system/rules.md",
      "README.md",
    ])).toEqual([".arc/active/meta-example.md", ".arc/system/rules.md"]);
  });
});

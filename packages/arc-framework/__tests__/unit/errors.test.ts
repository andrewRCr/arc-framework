/**
 * Unit tests for shared error handling utilities.
 */

import { describe, expect, it } from "vitest";
import {
  ArcError, UserFacingError, formatError, formatUnexpectedError,
  type ArcErrorCode,
} from "../../src/lib/errors.js";

describe("ArcError", () => {
  it("extends Error with a code property", () => {
    const err = new ArcError("something broke", "MANIFEST_MISSING");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ArcError);
    expect(err.message).toBe("something broke");
    expect(err.code).toBe("MANIFEST_MISSING");
    expect(err.name).toBe("ArcError");
  });
});

describe("UserFacingError", () => {
  it("stores whatHappened, why, and whatToDo fields", () => {
    const err = new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "Could not find .arc-manifest.json",
      why: "The project may not have been initialized with arc init",
      whatToDo: "Run arc init to set up the project",
    });

    expect(err).toBeInstanceOf(ArcError);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("MANIFEST_MISSING");
    expect(err.whatHappened).toBe("Could not find .arc-manifest.json");
    expect(err.why).toBe("The project may not have been initialized with arc init");
    expect(err.whatToDo).toBe("Run arc init to set up the project");
    expect(err.name).toBe("UserFacingError");
  });

  it("uses whatHappened as the Error message", () => {
    const err = new UserFacingError({
      code: "GIT_MISSING",
      whatHappened: "Git is not installed",
      why: "ARC requires git for version control operations",
      whatToDo: "Install git and ensure it is on your PATH",
    });

    expect(err.message).toBe("Git is not installed");
  });
});

describe("formatError", () => {
  it("formats a UserFacingError with code, merged summary, and fix", () => {
    const err = new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "Could not find .arc-manifest.json",
      why: "the project hasn't been initialized",
      whatToDo: "Run: arc init",
    });

    const output = formatError(err);
    const lines = output.split("\n");

    // Line 1: symbol + error code
    expect(lines[0]).toBe("✖ MANIFEST_MISSING");
    // Line 2: merged what + why as a single sentence
    expect(lines[1]).toBe("  Could not find .arc-manifest.json — the project hasn't been initialized.");
    // Blank separator before fix
    expect(lines[2]).toBe("");
    // Fix section
    expect(lines[3]).toBe("  Run: arc init");
  });

  it("ends the merged summary with a period if not already punctuated", () => {
    const err = new UserFacingError({
      code: "GIT_MISSING",
      whatHappened: "Git is not installed",
      why: "ARC requires git for merge operations",
      whatToDo: "Install git: https://git-scm.com",
    });

    const output = formatError(err);

    expect(output).toContain("Git is not installed — ARC requires git for merge operations.");
    expect(output).toContain("  Install git: https://git-scm.com");
  });

  it("preserves existing terminal punctuation on the why clause", () => {
    const err = new UserFacingError({
      code: "MANIFEST_INVALID",
      whatHappened: "Manifest is corrupt",
      why: "the JSON could not be parsed.",
      whatToDo: "Delete .arc-manifest.json and run: arc init",
    });

    const output = formatError(err);

    // Should not double-punctuate
    expect(output).toContain("Manifest is corrupt — the JSON could not be parsed.");
    expect(output).not.toContain("..");
  });

  it("formats a plain ArcError with code and message on one line", () => {
    const err = new ArcError("something broke", "MERGE_FAILED");
    const output = formatError(err);

    expect(output).toBe("✖ MERGE_FAILED: something broke");
  });

  it("formats an unknown Error with symbol and message", () => {
    const err = new Error("unexpected");
    const output = formatError(err);

    expect(output).toBe("✖ unexpected");
  });
});

describe("ArcErrorCode", () => {
  it("can be used for programmatic error handling", () => {
    const err = new ArcError("git not found", "GIT_MISSING");

    // Error codes enable switch/if-based handling without string matching
    const handle = (code: ArcErrorCode): string => {
      switch (code) {
        case "GIT_MISSING":
          return "install git";
        case "MANIFEST_MISSING":
          return "run init";
        case "MANIFEST_INVALID":
          return "check manifest";
        case "MERGE_FAILED":
          return "resolve conflicts";
        case "FILE_NOT_FOUND":
          return "check path";
        case "REGISTRY_FETCH_FAILED":
          return "check network";
        case "IDENTITY_MISSING":
          return "set identity";
        case "ALREADY_INSTALLED":
          return "use join or update";
        case "NO_ARC_INSTALLATION":
          return "run init first";
        case "RECIPE_INVALID":
          return "reinstall cli";
        case "NOT_INSTALLED":
          return "run init";
        case "NOT_IN_ARC_PROJECT":
          return "run from arc project";
        case "MANIFEST_VERSION_UNSUPPORTED":
          return "update cli";
        case "ROLE_FORBIDDEN":
          return "check permissions";
      }
    };

    expect(handle(err.code)).toBe("install git");
    expect(handle("NOT_IN_ARC_PROJECT")).toBe("run from arc project");
  });
});

describe("formatUnexpectedError", () => {
  it("formats a UserFacingError using formatError", () => {
    const err = new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "No manifest",
      why: "not initialized",
      whatToDo: "Run arc init",
    });
    const output = formatUnexpectedError(err);
    expect(output).toContain("MANIFEST_MISSING");
    expect(output).toContain("No manifest");
  });

  it("formats an ArcError using formatError", () => {
    const err = new ArcError("merge conflict", "MERGE_FAILED");
    const output = formatUnexpectedError(err);
    expect(output).toContain("MERGE_FAILED");
  });

  it("formats a plain Error without a stack trace", () => {
    const err = new Error("something broke");
    const output = formatUnexpectedError(err);
    expect(output).toContain("something broke");
    expect(output).not.toContain("at ");
  });

  it("formats a non-Error value", () => {
    const output = formatUnexpectedError("string error");
    expect(output).toContain("string error");
  });
});

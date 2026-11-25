/** Shared production decoding for editable draft, spec, and companion content. */
import { defineKindRegistration } from "../../registry.js";
import { readDesignPurpose } from "./purpose-reader.js";
import type { ParsedDesignRecord } from "./schema.js";

/** Each design kind admits all content and exposes its nullable raw Purpose. */
export const DESIGN_REGISTRATIONS = (["work-item/draft", "work-item/spec", "work-item/companion"] as const)
  .map((kind) => defineKindRegistration({
    kind,
    parser: (content: string) => ({
      success: true as const, data: { purpose: readDesignPurpose(content) } satisfies ParsedDesignRecord,
    }),
  }));

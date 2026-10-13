/** The Errand primary's shared slug checks at the store write boundary. */
import { defineKindRegistration } from "../../registry.js";
import { checkFormerSlug, checkSlugEdges } from "../work-item/index.js";

/** Protect former names and surviving dependency edges on Errand name acquisition. */
export const ERRAND_RECORD_REGISTRATION = defineKindRegistration({
  kind: "work-item/record",
  check: async (input) => (await Promise.all([checkFormerSlug(input), checkSlugEdges(input)])).flat(),
});

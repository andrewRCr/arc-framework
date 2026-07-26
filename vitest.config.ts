/**
 * Root discovery entry so bare `npx vitest` from the monorepo root finds the
 * CLI package suite. The package config owns tiers, roots, and isolation —
 * this file only points Vitest at it.
 */
export { default } from "./packages/arc-framework/vitest.config.ts";

/** Repository entry point for validated explicit Markdown file linting. */
import { main } from "./lint-markdown-worktree.js";

process.exitCode = await main(process.cwd(), process.argv.slice(2));

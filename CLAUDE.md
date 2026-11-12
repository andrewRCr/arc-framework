@AGENTS.md

Do not call `advisor` during deterministic ARC workflows (session init or recovery, handoff, commit ceremonies); reserve
it for design forks, including in implementation, and stuck debugging.

# Current Session

## Session Startup Protocol (AI: Execute First)

**⚠️ IMPORTANT**: This section reflects the **current working context** and should be updated when switching
between subdirectories or work contexts. See session-handoff.md for update protocol.

**Before reading work context below, verify environment:**

1. **Check working directory:**

   ```bash
   pwd
   # Expected: {{REPO_ROOT}} (or specify if working from subdirectory)
   # Example: /home/user/dev/myproject
   ```

2. **Verify runtime environment status (if applicable):**

   ```bash
   # For Docker-based projects:
   docker ps | grep {{PROJECT_CONTAINER_PREFIX}} | wc -l
   # Expected: {{EXPECTED_CONTAINER_COUNT}} ({{CONTAINER_LIST}})
   # Example: 5 (backend, frontend, cache, proxy, database)

   # For other runtime environments, adjust verification command accordingly
   ```

3. **Confirm tool availability (adjust path based on working directory):**

   ```bash
   # From repo root:
   ls {{VENV_PATH}}/bin/ | grep -E "{{QUALITY_TOOLS}}" | wc -l
   # Expected: {{EXPECTED_TOOL_COUNT}}+ ({{QUALITY_TOOL_LIST}} at minimum)
   # Example: 2+ (ruff and pytest at minimum)

   # Adjust path if working from subdirectory
   ```

4. **Path context for current working directory:**
   - Runtime config: `{{DOCKER_COMPOSE_PATH}}` (e.g., infrastructure/docker-compose.yml)
   - Virtual environment: `{{VENV_PATH}}/` (e.g., .venv-backend/)
   - Backend code: `{{BACKEND_CODE_PATH}}` (e.g., backend/apps/, backend/config/)
   - Frontend code: `{{FRONTEND_CODE_PATH}}` (e.g., frontend/src/)
   - Adjust paths if working from subdirectory

5. **Acknowledge orientation:**
   State: "Working from {{CURRENT_DIRECTORY}} ({{REPO_ROOT}}/), runtime environment is
   [running X containers/stopped/N/A], tools available at {{VENV_PATH}}/,
   using {{DOCKER_COMPOSE_PATH}} for container orchestration"

6. **Reference check:**
   Confirm access to DEVELOPMENT-RULES {{RULES_VERSION}} and QUICK-REFERENCE {{QUICKREF_VERSION}}
   (all commands in QUICK-REFERENCE assume {{DEFAULT_WORKING_DIRECTORY}})

---

## Session Information

**Branch**: {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}

**Feature Documents**:

- Main PRD: `.arc/active/feature/prd-{{FEATURE_NAME}}.md`
- Main Task List: `.arc/active/feature/tasks-{{FEATURE_NAME}}.md`
- Additional documents as needed

**Work Type**: [structured feature | technical improvement | incidental]

**Last Completed**: [task id or commit reference]

**Next Action**: [task id or next step]

---

## Session Context & Status

### Current Work Summary

[Brief description of current phase/milestone]

### Completed This Session

[List major accomplishments]

### In Progress

[Current focus areas]

---

## Blockers

**[None | List any blockers]**

- [Blocker description with context]

---

## Outstanding Questions

**[None | List questions needing resolution]**

- [Question with relevant context]

---

## Notes for Next Session

### Key Context for Resumption

[Important context needed when resuming work]

### Recent Insights

[Lessons learned or important discoveries]

### Next Steps

[Clear action items for next session]

---

**Last Updated**: {{YYYY-MM-DD}} ([brief update description])

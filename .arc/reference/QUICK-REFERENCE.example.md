# Quick Reference - {{PROJECT_NAME}}

**Version**: 1.1 | **Updated**: {{YYYY-MM-DD}} | **Location**: `.arc/reference/`

## About This Reference Directory

**Read every session:**

- `DEVELOPMENT-RULES.md` (constitution/) - Rules and quality standards
- `QUICK-REFERENCE.md` (this file) - Environment and commands
- `CURRENT-SESSION.md` (active/) - Work status and next actions

**Key documentation:**

- `constitution/` - Project principles (META-PRD, TECHNICAL-ARCHITECTURE, PROJECT-STATUS)
- `workflows/` - Core process guides (0-define-constitution.md, 1-create-prd.md, 2-generate-tasks.md,
  3-process-task-loop.md)
- `workflows/supplemental/` - Supporting workflows (atomic-commit.md, session-handoff.md, manage-incidental-work.md,
  maintain-docs.md)
- `strategies/` - Technical approaches (project-specific strategy documents)
- `ai-instructions/` - AI-specific guidance (AGENTS.md, CLAUDE.md, GEMINI.md, WARP.md, copilot-instructions.md)

---

## Environment & Path Context

**Repository Root**: `{{REPO_ROOT}}`
**All commands in this document assume you are at repository root unless otherwise specified.**

### Critical Path Reference

| Resource | Location from Repo Root | Why It Matters |
|----------|-------------------------|----------------|
| Docker Compose | `{{DOCKER_COMPOSE_PATH}}` | Required for all Docker operations |
| Backend venv | `{{BACKEND_VENV_PATH}}/bin/` | Host tools (linters, type checkers) |
| Backend code | `{{BACKEND_CODE_PATH}}` | Type checking, linting targets |
| Frontend code | `{{FRONTEND_CODE_PATH}}` | Frontend operations |
| .arc docs | `.arc/` | Documentation |

**Working Directory Note**: Your actual working directory may vary (subdirectories or root). CURRENT-SESSION.md
contains context-specific paths adjusted for your current location.

### Network Architecture & Ports

**Container Network** (if using Docker):

```
Browser → Proxy ({{PROXY_PORT}}) → Backend ({{BACKEND_PORT}}) {{BACKEND_PROTOCOL}}
                                  → Frontend ({{FRONTEND_PORT}}) {{FRONTEND_PROTOCOL}}
```

**Direct Access Ports** (example tech stack):

- **Backend API**: `{{BACKEND_PROTOCOL}}://localhost:{{BACKEND_PORT}}` (example: direct HTTPS access)
- **Frontend Dev Server**: `{{FRONTEND_PROTOCOL}}://localhost:{{FRONTEND_PORT}}` (example: Vite dev server)
- **Proxy**: `{{PROXY_PROTOCOL}}://localhost:{{PROXY_PORT}}` (example: unified entry point)

**For Testing/Development:**

- **API Testing**: Use `{{BACKEND_PROTOCOL}}://localhost:{{BACKEND_PORT}}` with appropriate flags
- **Browser Testing**: Use proxy if available for production-like routing
- **Frontend Development**: Use direct frontend port for hot reload

**Important Notes** (adjust for your stack):

- Backend protocol and certificate setup
- Frontend environment variables and API base URL configuration
- Internal services that don't need exposed ports

---

## Command Patterns

All commands shown from **repository root**. If you're in a subdirectory, adjust paths accordingly
(see CURRENT-SESSION.md for your context).

### Type Checking (Backend - Python example)

```bash
# Fast: Via npx (if using Pyright)
npx pyright {{BACKEND_CODE_PATH}} --project {{BACKEND_PROJECT_ROOT}}

# Comprehensive: Custom script
{{BACKEND_VENV_PATH}}/bin/python {{BACKEND_CODE_PATH}}/scripts/type_check.py
```

### Linting (Backend - Python example)

```bash
# Host venv (FAST with auto-fix) - Recommended for development
{{BACKEND_VENV_PATH}}/bin/{{BACKEND_LINTER}} check {{BACKEND_CODE_PATH}} --fix

# Docker (consistent across environments)
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{BACKEND_LINTER}} check {{BACKEND_CODE_IN_CONTAINER}} --fix

# Note: From inside backend/ directory, adjust paths as needed
```

### Testing (Backend - example requiring Docker)

**CRITICAL: Adjust based on your test requirements** (database, services, etc.)

**Test Runner**: {{TEST_RUNNER}} (e.g., pytest, jest, etc.)

```bash
# Run all tests (standard)
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} {{TEST_PATH}}

# Parallel execution (if supported)
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} -n auto {{TEST_PATH}}

# With coverage
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} --cov={{COVERAGE_PATH}} --cov-report=term-missing {{TEST_PATH}}

# IMPORTANT: Coverage path format depends on your test runner
# Check documentation for module vs file path requirements
```

### Linting (Frontend - example)

```bash
# Via Docker
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run lint

# With auto-fix
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run lint -- --fix
```

### Type Checking (Frontend - TypeScript example)

```bash
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run type-check
```

### Markdown Linting

**⚠️ Run from repo root** - Config file must be discoverable

```bash
# Check all files
npx markdownlint-cli2 "README.md" ".arc/**/*.md"

# Auto-fix all files
npx markdownlint-cli2 --fix "README.md" ".arc/**/*.md"

# Check single file only (bypass config globs)
npx markdownlint-cli2 --no-globs "path/to/file.md"

# Auto-fix single file only
npx markdownlint-cli2 --fix --no-globs "path/to/file.md"
```

**Important:**

- Without `--no-globs`, markdownlint-cli2 processes config globs **in addition to** specified files
- Use `--no-globs` when checking/fixing individual files to avoid processing entire workspace
- VS Code extension may use separate config file

---

## Quality Gate Commands

Reference for DEVELOPMENT-RULES quality gates. Run these before any commit.

```bash
# 1. Backend Tests
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} {{TEST_PATH}}

# 2. Frontend Tests
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm test

# 3. Backend Linting (with auto-fix)
{{BACKEND_VENV_PATH}}/bin/{{BACKEND_LINTER}} check {{BACKEND_CODE_PATH}} --fix

# 4. Frontend Linting
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run lint

# 5. TypeScript Type Checking
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run type-check

# 6. Backend Type Safety
npx pyright {{BACKEND_CODE_PATH}} --project {{BACKEND_PROJECT_ROOT}}

# 7. Markdown Linting (with auto-fix)
npx markdownlint-cli2 --fix "README.md" ".arc/**/*.md"
```

---

## Docker Operations

```bash
# Check container status
docker ps | grep {{PROJECT_CONTAINER_PREFIX}}

# View logs
docker compose -f {{DOCKER_COMPOSE_PATH}} logs {{BACKEND_CONTAINER}}
docker compose -f {{DOCKER_COMPOSE_PATH}} logs {{FRONTEND_CONTAINER}}

# Follow logs (real-time)
docker compose -f {{DOCKER_COMPOSE_PATH}} logs -f {{BACKEND_CONTAINER}}

# Shell access
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} bash
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} sh

# Rebuild after dependency changes
docker compose -f {{DOCKER_COMPOSE_PATH}} up --build

# Start services
docker compose -f {{DOCKER_COMPOSE_PATH}} up -d

# Stop services
docker compose -f {{DOCKER_COMPOSE_PATH}} down
```

---

## Tool Decision Tree

```
Need to run a command?
│
├─ Type checking (Backend)?
│  └─ npx pyright {{BACKEND_CODE_PATH}} --project {{BACKEND_PROJECT_ROOT}}
│
├─ Linting (Backend)?
│  └─ {{BACKEND_VENV_PATH}}/bin/{{BACKEND_LINTER}} check {{BACKEND_CODE_PATH}} --fix
│
├─ Testing (Backend)?
│  └─ docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} {{TEST_PATH}}
│     (Adjust based on service requirements - database, etc.)
│
├─ API Testing?
│  └─ curl {{CURL_FLAGS}} {{BACKEND_PROTOCOL}}://localhost:{{BACKEND_PORT}}/{{API_PREFIX}}/endpoint
│
├─ Linting/Type-checking (Frontend)?
│  └─ docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{FRONTEND_CONTAINER}} npm run [lint|type-check]
│
├─ Markdown linting?
│  └─ npx markdownlint-cli2 --fix "README.md" ".arc/**/*.md"
│
└─ Unsure?
   └─ Use Docker (always consistent across environments)
```

---

## Common Patterns

### Incremental Quality Checks (After Sub-Task)

```bash
# Type check specific files
npx pyright {{BACKEND_CODE_PATH}}/path/to/file.py --project {{BACKEND_PROJECT_ROOT}}

# Lint and fix specific files
{{BACKEND_VENV_PATH}}/bin/{{BACKEND_LINTER}} check {{BACKEND_CODE_PATH}}/path/to/file.py --fix

# Run specific test file
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} {{TEST_PATH}}/path/to/test_file.py -v

# Coverage for specific modules (check test runner documentation for path format)
docker compose -f {{DOCKER_COMPOSE_PATH}} exec {{BACKEND_CONTAINER}} {{TEST_RUNNER}} --cov={{MODULE_PATH}} --cov-report=term-missing {{TEST_PATH}}
```

---

## Anti-Patterns

### Path Confusion

❌ Assuming you're at repo root without checking
❌ Using `cd` commands unnecessarily
❌ Forgetting `-f {{DOCKER_COMPOSE_PATH}}` for Docker Compose

✅ Check `pwd` first
✅ Use absolute paths or correct relative paths
✅ Always use `-f` flag with explicit path for Docker Compose

### Docker Assumptions

❌ "Docker isn't running" without verifying
❌ Running tests from host (if services are required)
❌ Assuming containers are up without checking
❌ Using wrong ports

✅ Verify: `docker ps | grep {{PROJECT_CONTAINER_PREFIX}}` (expect {{EXPECTED_CONTAINER_COUNT}} containers)
✅ Use Docker when services are required
✅ Check container status before operations
✅ Use correct ports per Network Architecture section

### Command Construction

❌ Using commands from DEVELOPMENT-RULES without checking paths
❌ Mixing repo-root and subdirectory paths
❌ Assuming tools are in PATH vs. venv

✅ Use commands from QUICK-REFERENCE (paths correct for repo root)
✅ Adjust paths based on your working directory (see CURRENT-SESSION.md)
✅ Use explicit paths for venv tools: `{{BACKEND_VENV_PATH}}/bin/[tool]`

---

## Key Reminders

1. **Docker Compose location**: `{{DOCKER_COMPOSE_PATH}}` (from repo root)
2. **Tests may require Docker**: Check if backend tests need database/service access
3. **Venv location**: `{{BACKEND_VENV_PATH}}/bin/` (from repo root)
4. **Working directory varies**: Check CURRENT-SESSION.md for context-specific paths
5. **Tool availability**: Some tools work from anywhere (npx), others need correct CWD

---

## Additional Resources

- **DEVELOPMENT-RULES.md** - Quality standards and protocols (what/why)
- **CURRENT-SESSION.md** - Current work context and adjusted paths for your working directory
- **TECHNICAL-ARCHITECTURE.md** - System design and methodology
- **3-process-task-loop.md** - Workflow for task execution
- **supplemental/atomic-commit.md** - Commit creation and review process
- **supplemental/session-handoff.md** - Session handoff protocol
- **supplemental/maintain-docs.md** - Documentation maintenance workflow
- **strategies/** - Project-specific technical approaches and patterns

---

**Version Note**: Commands assume repo root. If working from subdirectory, see CURRENT-SESSION.md
"Session Startup Protocol" for adjusted paths.

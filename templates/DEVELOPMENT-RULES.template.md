# Development Rules - {{PROJECT_NAME}}

Version: {{SYSTEM_VERSION}}
Rules Hash: {{RULES_HASH}}

- Manual commit control
- Feature branch workflow (prefix: {{FEATURE_BRANCH_PREFIX}})
- Quality gates (use profile commands)
  - Backend tests: {{BACKEND_TEST_CMD}}
  - Frontend tests: {{FRONTEND_TEST_CMD}}
  - Backend lint: {{BACKEND_LINT_CMD}}
  - Frontend lint: {{FRONTEND_LINT_CMD}}
  - TypeScript check: {{TS_TYPECHECK_CMD}}
  - Markdown lint: {{MARKDOWN_LINT_CMD}}
- Comprehensive Task Context Analysis before commits

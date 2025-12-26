# {{PROJECT_NAME}} Technical Architecture

<!--
Document your technical implementation. Replace {{PLACEHOLDERS}} with your actual stack and patterns.
Focus on implementation details, not product vision (that's in META-PRD).
-->

This document outlines the technical architecture of {{PROJECT_NAME}}, covering the
{{COMPONENTS - e.g., "frontend, backend, and infrastructure"}}.

## 1. Overview

<!-- High-level description of your system architecture and main components -->

{{PROJECT_NAME}} is {{SYSTEM_TYPE - e.g., "a modern full-stack web application", "a REST API service",
"a CLI tool"}}. The architecture is composed of:

- **{{PRIMARY_COMPONENT}}**: {{DESCRIPTION}}
- **{{SECONDARY_COMPONENT}}**: {{DESCRIPTION}}
- **{{DATA_LAYER}}**: {{DESCRIPTION}}
- **{{INFRASTRUCTURE}}**: {{DESCRIPTION}}

## 2. Backend

<!-- Describe backend implementation: framework, language, database, authentication, libraries, code organization -->

### Technology Stack

- **Framework**: {{FRAMEWORK_AND_VERSION}}
- **Language**: {{LANGUAGE_AND_VERSION}}
- **Database**: {{DATABASE_TECH}}
- **Authentication**: {{AUTH_STRATEGY - e.g., "JWT with HTTP-only cookies", "OAuth 2.0", "Django sessions"}}
- **API Documentation**: {{API_DOCS - e.g., "OpenAPI 3 with Swagger UI at /api/docs"}}
- **Code Style**: {{LINTING - e.g., "Ruff (configured via pyproject.toml)", "ESLint"}}
- **Type Checking**: {{TYPE_CHECKER - e.g., "Pyright with django-types", "TypeScript strict mode"}}

### Key Libraries

- `{{LIBRARY_1}}`: {{PURPOSE}}
- `{{LIBRARY_2}}`: {{PURPOSE}}
- `{{LIBRARY_3}}`: {{PURPOSE}}

### Directory Structure

<!-- Show your project organization with clear domain boundaries -->

The backend code is organized {{ORGANIZATION_PATTERN - e.g., "into discrete apps within backend/apps/", "by feature in src/modules/"}}.

```
{{BACKEND_DIR}}/
├── {{MODULE_1}}/        # {{PURPOSE}}
├── {{MODULE_2}}/        # {{PURPOSE}}
└── {{SHARED_UTILS}}/    # {{PURPOSE}}
```

## 3. Frontend

<!-- Describe frontend implementation: framework, UI components, routing, state management, data fetching, testing -->

### Technology Stack

- **Framework**: {{FRAMEWORK_AND_VERSION}}
- **Language**: {{LANGUAGE}}
- **UI Components**: {{UI_LIBRARY - e.g., "Chakra UI v3", "Material-UI", "Custom components"}}
- **Routing**: {{ROUTING_SOLUTION}}
- **State Management**: {{STATE_APPROACH - e.g., "React Context API", "Redux Toolkit", "Zustand"}}
- **Data Fetching**: {{DATA_FETCHING - e.g., "Axios with custom hooks", "React Query", "SWR"}}
- **Testing**: {{TEST_FRAMEWORK}}

### Directory Structure

```
{{FRONTEND_SRC}}/
├── {{PAGES_DIR}}/       # {{PURPOSE}}
├── {{COMPONENTS_DIR}}/  # {{PURPOSE}}
├── {{HOOKS_DIR}}/       # {{PURPOSE}}
├── {{SERVICES_DIR}}/    # {{PURPOSE}}
└── {{CONTEXTS_DIR}}/    # {{PURPOSE}}
```

## 4. {{ADDITIONAL_LAYER - e.g., "Shared Code", "Data Layer", "Services"}}

<!-- Optional section for shared code, additional architectural layers, or service patterns -->

{{DESCRIPTION_OF_LAYER}}

## 5. Infrastructure

<!-- Describe containerization, development environment, CI/CD, web server/proxy, caching, task queues -->

### Development Environment

- **Containerization**: {{CONTAINERIZATION - e.g., "Docker and Docker Compose"}}
- **{{SERVICE_1}}**: {{DESCRIPTION - e.g., "PostgreSQL for data persistence"}}
- **{{SERVICE_2}}**: {{DESCRIPTION - e.g., "Redis for caching and background jobs"}}
- **Web Server / Reverse Proxy**: {{WEB_SERVER - e.g., "Caddy for automatic HTTPS and routing"}}

### CI/CD

- **Continuous Integration**: {{CI_SERVICE - e.g., "GitHub Actions"}}
- **Workflow**: {{CI_DESCRIPTION - e.g., "Runs linters and tests on every push and pull request"}}
- **Quality Gates**: {{QUALITY_ENFORCEMENT}}

### {{ENVIRONMENT_NOTES_OPTIONAL - e.g., "Development Environment (WSL2)"}}

{{ENVIRONMENT_SPECIFIC_DETAILS}}

## 6. Testing Infrastructure

<!-- Dedicate a section to testing - emphasizes importance. Include backend and frontend testing approaches. -->

The project uses modern testing frameworks for both backend and frontend:

### Backend Testing

- **Framework**: {{TEST_FRAMEWORK - e.g., "pytest with pytest-django", "Jest"}}
- **Execution**: {{EXECUTION_CONTEXT - e.g., "Must run via Docker (requires PostgreSQL + Redis)", "npm test"}}
- **Performance**: {{PERFORMANCE_FEATURES - e.g., "Supports --reuse-db and parallel execution (-n auto)"}}
- **Structure**: {{TEST_LOCATION}}
- **Command**: `{{BACKEND_TEST_COMMAND}}`

### Frontend Testing

- **Framework**: {{FRONTEND_TEST_FRAMEWORK}}
- **Environment**: {{TEST_ENVIRONMENT - e.g., "JSDOM with browser API mocking", "Headless Chrome"}}
- **Structure**: {{TEST_ORGANIZATION}}
- **Command**: `{{FRONTEND_TEST_COMMAND}}`

**For testing methodology, quality gates, and test-first protocols**, see:

- [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) - Test-first protocol, quality gates, command patterns
- [Task Processing Workflow](../workflows/3-process-task-loop.md) - Task execution workflow

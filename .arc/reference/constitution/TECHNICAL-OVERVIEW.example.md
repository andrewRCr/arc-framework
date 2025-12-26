# {{PROJECT_NAME}} Technical Overview

*This is an example TECHNICAL-OVERVIEW structure. Replace all content with your project's specifics.*

This document outlines the technical architecture of {{PROJECT_NAME}}, covering frontend, backend, and infrastructure.

## 1. Overview

CineXplorer is a modern full-stack web application. The architecture is composed of:

- A **React/TypeScript frontend** responsible for all UI and user interaction.
- A **Django/Python backend** that serves a RESTful API.
- A **PostgreSQL** database for data persistence.
- A **Redis** cache for rate limiting and future background task processing.
- **Docker** for containerizing all services for consistent development and deployment.
- **Caddy** as a reverse proxy to route traffic to the appropriate service.

## 2. Backend

The backend is a REST API built with Django and Django Ninja.

- **Framework**: Django `5.2` with Django Ninja.
- **Language**: Python `3.x`.
- **Database**: PostgreSQL, configured via environment variables.
- **Authentication**: Authentication is handled by `django-ninja-jwt` using JSON Web Tokens.
  A custom `JWTCookieAuthentication` backend is implemented to manage tokens securely in HTTP-only cookies.
- **API Documentation**: Django Ninja automatically generates an OpenAPI 3 schema and Swagger UI.
  The documentation is available at `/api/docs` with the schema at `/api/openapi.json`.
- **Code Style**: Linting is enforced using `ruff` (configured via `backend/pyproject.toml`).
- **Type Checking**: Pyright-only approach with django-types for Django ORM support
    - **Pyright**: Primary type checker with Python 3.13 support, configured via `backend/pyrightconfig.json`
    - **django-types 0.22.0**: Pyright-compatible Django stubs (forked from django-stubs specifically for Pyright)
    - **Custom Type Stubs**: Located in `backend/stubs/` - mix of supplements and required stubs
        - `django/contrib/auth/` - **Supplements** django-types with explicit `id` field (eliminates reportAttributeAccessIssue)
        - `allauth/` - **Required** (no official stubs) - django-allauth models (EmailAddress, EmailConfirmation)
        - `ninja_jwt/` - **Required** (incomplete official stubs) - JWT token types with zero Any usage
        - `environ/` - **Required** (no official stubs) - django-environ Env class
    - **Stub Maintenance**: Each stub documents version sync with django-types and upgrade procedures.
      The documentation also clarifies supplement vs required status.
    - **Type Safety Goal**: Zero errors with documented acceptable information-level warnings
      (Django ORM limitations)
    - **See**: [Type Safety Strategy](../strategies/project/strategy-type-safety.md) for complete
      Pyright-only approach and patterns
- **Key Libraries**:
    - `django-cors-headers` for managing Cross-Origin Resource Sharing (CORS).
    - `django-debug-toolbar` for debugging during development.
    - `environ` for managing environment variables.
- **Directory Structure**: The backend code is organized into discrete Django `apps` within the
  `backend/apps/` directory with clear domain boundaries.
  Note that `accounts` holds persistent user data/models (User, EmailVerificationToken),
  while `authentication` contains stateless auth flows (JWT handling, serializers, views,
  middleware for login/verification):
    - `accounts`: User authentication models (`User`, `EmailVerificationToken`)
    - `authentication`: Authentication processes (JWT, serializers, views, middleware)
        - `authentication/utils.py`: JWT token management, settings retrieval, cookie handling
    - `core`: Core business models (`Movie`) and cross-domain utilities
        - `core/utils/`: Cross-domain utilities layer (DRY refactoring, Phase 2)
            - `http.py`: HTTP request/response helpers (`get_client_info`, `build_error_response`)
            - `validators.py`: Pydantic field validators (`empty_str_to_none`)
            - `schemas.py`: Generic schema definitions (`PaginatedResponse[T]` with Python 3.13 type params)
        - `core/tests/test_helpers.py`: Cross-domain test utilities (`create_user`, `create_user_and_auth_payload`)
    - `movie`: Movie-related functionality and API endpoints
        - `movie/helpers.py`: Movie enrichment helpers for UserMovieData integration
    - `user_movie_data`: User-movie interaction models and API (`UserMovieData`, watchlist, ratings)

## 3. Frontend

The frontend is a single-page application (SPA) built with React.

- **Framework**: React `19` with Vite for the build tooling.
- **Language**: TypeScript `5.x`.
- **UI Components**: The UI is built using **Chakra UI v3**. This provides a rich set of accessible and composable components.
- **Theme System**: CineXplorer uses a complete theme system combining unified semantic tokens and Chakra UI v3 recipes.
  The adapter layer (ADR-005) integrates 4 major design systems (GitHub Primer, GitLab Pajamas, IBM Carbon,
  Material Design 3) through ~67 unified tokens (layer elevation, border hierarchy, interaction states, status colors,
  button patterns). Recipes codify component patterns (buttons, alerts, badges, forms) with automatic state handling
  and WCAG compliance. Extensible for future CineXplorer-specific theming. All components use semantic tokens exclusively
  (no hardcoded colors). See [Color Token System](../strategies/project/style/strategy-color-tokens.md) and
  [Component Styling Strategy](../strategies/project/style/strategy-component-styling.md) for implementation patterns.
- **Routing**: `react-router-dom v7` is used for all client-side routing.
- **State Management**: Global state, such as the user's authentication status, is managed using React's built-in
  Context API (`AuthContext`). Component-level state is managed with standard React hooks (`useState`, `useReducer`).
  A more complex, unified state management system is in place for the movie filter controls, handling shared state
  between default, minimal, and advanced filter UIs.
- **Data Fetching**: API communication is handled by a service layer (`src/services/`) that uses `axios`.
  Custom hooks like `useApiRequest` provide a consistent, reusable interface for components to fetch
  and mutate data.
- **Advanced Filtering Logic**: The filtering system is a hybrid model. While most filters map to TMDB API
  queries, it also applies custom client-side filtering to correct data inconsistencies from the API
  (e.g., movies with incorrect release dates). To prevent empty spaces in the UI from these removals,
  the application dynamically fills gaps using a pre-fetched buffer of results from subsequent pages.
- **Forms**: `formik` is used to manage form state and validation.
- **Testing**: `vitest` is the testing framework, used for unit and component testing.
  `react-testing-library` is used for rendering components in tests.
- **Directory Structure**: The `frontend/src/` directory is organized by feature and function:
    - `pages/`: Top-level components for each route.
    - `components/`: Reusable UI components.
    - `hooks/`: Custom React hooks.
    - `services/`: Modules for interacting with the backend API.
    - `contexts/`: Global state providers.

## 4. Shared Code

To ensure type safety and consistency between the frontend and backend, a `shared/` directory is used.
This directory contains TypeScript files with type definitions (`api-types.ts`) and shared constants
(`error-codes.ts`). These files can be used by both the frontend and, where applicable, the backend,
facilitating smoother integration.

## 5. Infrastructure

The entire application is designed to be run and deployed using containers.

- **Containerization**: Docker and Docker Compose are used to define and run the multi-container application
  (`backend`, `frontend`, `postgres`, `redis`, `caddy`). Separate `docker-compose.*.yml` files exist for
  different environments (dev, CI, prod).
- **Cache & Task Queue**: **Redis 7.4** serves dual purposes using separate databases:
    - **DB 0**: Django cache backend for rate limiting (Django Ninja throttling - current)
    - **DB 1**: Future Celery broker for background task processing (Backend Modernization PRD - planned)
- **Web Server / Reverse Proxy**: **Caddy** is used as the reverse proxy. It handles routing requests to the
  appropriate service (e.g., `/api/*` to the backend, all other requests to the frontend) and provides
  automatic HTTPS for secure connections.
- **CI/CD**: Continuous integration is set up using **GitHub Actions**. The workflow, defined in
  `.github/workflows/ci.yml`, runs linters and tests on every push and pull request to ensure code quality.
- **Development Environment (WSL2)**: The development environment runs on WSL2 with Docker.
  Container user UID/GID (1001) matches the host user for proper file permissions on mounted volumes.
  Configuration is managed via `infrastructure/.env` which sets `USER_UID` and `USER_GID` build arguments.
  A host Python virtual environment (`.venv-backend/`) provides faster linting/type checking alternatives to Docker commands.

## 6. Service Layer Architecture

The backend uses a layered architecture with class-based services for all business logic:

- **Principle**: Business logic belongs in the service layer, NOT in API endpoints
- **Pattern**: Dependency injection via constructor - enables testability and service composition
- **Repository pattern**: ORM abstraction for data access (e.g., `UserMovieDataRepository`)
- **Service composition**: Services can depend on other services/repositories
- **Factory functions**: Convenient production instantiation while preserving test injection

**Key services** (see `strategy-service-layer.md` for complete inventory):

- `MovieService` - TMDB integration (discovery, search, details)
- `UserMovieDataService` - User movie data CRUD with TMDB enrichment
- `AuthenticationService` - Security-critical auth operations
- `MovieEnrichmentService` - Enriches movie lists with user-specific data

**For complete patterns, decision guides, and implementation details**, see:
[Service Layer Strategy](../strategies/project/strategy-service-layer.md)

## 7. Testing Infrastructure

The project uses modern testing frameworks for both backend and frontend:

### Backend Testing

- **Framework**: pytest with pytest-django plugin (migration complete 2025-10-13, 103/103 tests)
- **Execution**: Must run via Docker (requires PostgreSQL + Redis)
- **Performance**: Supports `--reuse-db` flag and parallel execution (`-n auto`)
- **Structure**: Tests located in `backend/apps/{app}/tests/`
- **Command**: `docker compose -f infrastructure/docker-compose.yml exec backend pytest apps/`

### Frontend Testing

- **Framework**: Vitest with React Testing Library
- **Environment**: JSDOM with browser API mocking
- **Structure**: Co-located tests in `__tests__/` directories
- **Command**: `docker compose -f infrastructure/docker-compose.yml exec frontend npm test`

**For testing methodology, quality gates, and test-first protocols**, see:

- [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) - Test-first protocol, quality gates, command patterns
- [Testing Methodology Strategy](../strategies/project/strategy-testing-methodology.md) - Complete testing
  philosophy and patterns

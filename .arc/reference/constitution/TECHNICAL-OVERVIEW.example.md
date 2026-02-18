# {{PROJECT_NAME}} Technical Overview

This document outlines the technical architecture of {{PROJECT_NAME}} — the technology choices,
component structure, and infrastructure that shape how the project is built and maintained.
Both human contributors and AI agents reference this to make decisions consistent with the
architecture.

## 1. Overview

High-level description of your system's architecture and its major components.

{{ARCHITECTURE_OVERVIEW}}

<!-- List the major building blocks. Examples:
     - Web app: "React frontend, Django API, PostgreSQL database, Redis cache, Docker"
     - CLI tool: "Go binary, SQLite storage, YAML configuration"
     - Library: "TypeScript core, plugin system, test harness"
     - Monorepo: "Shared packages, service A, service B, deploy infrastructure" -->

## 2. Architecture Components

Create a subsection for each major component of your system. For each component, document
the technology choices, key libraries, patterns, and directory structure that someone
needs to understand when working in that area.

### {{COMPONENT_NAME}}

- **Framework**: {{FRAMEWORK_AND_VERSION}}
- **Language**: {{LANGUAGE_AND_VERSION}}
- **Key Libraries**: {{KEY_LIBRARIES}}
- **Code Style**: {{LINTING_AND_FORMATTING}}
- **Directory Structure**: {{DIRECTORY_LAYOUT}}

{{COMPONENT_DETAILS}}

<!-- Add detail proportional to complexity. A simple component might need 5 lines;
     a complex one with specific patterns (auth, state management, data access)
     might need 30-40 lines. Focus on what a contributor needs to implement correctly. -->

### {{ADDITIONAL_COMPONENT}}

- **Framework**: {{FRAMEWORK_AND_VERSION}}
- **Language**: {{LANGUAGE_AND_VERSION}}
- **Key Libraries**: {{KEY_LIBRARIES}}
- **Code Style**: {{LINTING_AND_FORMATTING}}
- **Directory Structure**: {{DIRECTORY_LAYOUT}}

{{COMPONENT_DETAILS}}

<!-- Repeat for each major component. Common patterns:
     - Web app: Backend, Frontend, Shared Code
     - Microservices: Service A, Service B, Shared Libraries
     - CLI: Core, CLI Interface, Configuration
     - Library: Core API, Plugin System, Examples -->

## 3. Infrastructure

How the project is built, run, and deployed. Include development environment setup,
containerization, CI/CD, and any external services.

- **Development Environment**: {{DEV_ENVIRONMENT}}
- **Build System**: {{BUILD_SYSTEM}}
- **CI/CD**: {{CI_CD_SETUP}}
- **Deployment**: {{DEPLOYMENT_APPROACH}}

{{INFRASTRUCTURE_DETAILS}}

<!-- Include whatever is relevant to your project: Docker setup, environment variables,
     reverse proxies, cloud services, database migrations, etc. -->

## 4. Testing Infrastructure

How the project is tested. Include frameworks, execution requirements, and test organization
for each component.

### {{COMPONENT_NAME}} Testing

- **Framework**: {{TEST_FRAMEWORK}}
- **Execution**: {{HOW_TO_RUN_TESTS}}
- **Structure**: {{TEST_ORGANIZATION}}
- **Command**: `{{TEST_COMMAND}}`

<!-- Repeat for each testable component. Reference your testing methodology strategy
     (if you have one) for philosophy and quality gate details. -->

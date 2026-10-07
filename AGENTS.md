# FixHome Mobile — Agent Instructions

This Expo application is an independent Git repository and a UI client of Backend-FixHome.

## Repository context (read first, keep current)

`docs/CONTEXT.md` is the living context of this repository: what it owns, how it links to the other
FixHome repositories, the current state, contracts, settled PO decisions and open risks. Read it
before `docs/AI-TECHNICAL-GUIDE.md` and before touching code.

Any change that alters behaviour, an API or event contract, an enum, an environment variable, a
migration, how the project runs or is verified, or a PO decision must update `docs/CONTEXT.md` in
the same pull request, following its section 0 exactly: real Vietnam time (UTC+7), the exact
`git config user.name`, the branch, and a new top line in section 9. `src/context-doc.test.ts` enforces the
format in the normal test run and in CI; never weaken that test to make a change pass. The
repository is public: never write secrets, credentials, IP addresses or customer data into it.

## Mandatory pre-implementation gate

Before every task, read FIXHOME-DESIGN-SYSTEM.md completely together with
docs/AI-TECHNICAL-GUIDE.md. Follow its cross-platform language, terminology,
design-token, typography, title, component, status, and verification rules.
For UI or user-facing output changes, inspect the matching Web/Mobile behavior.
Preserve this repository's architecture, API contracts, permissions, and tests.
If cross-repository verification is unavailable, explicitly report NOT VERIFIED.

Before doing any task:

0. Read `docs/CONTEXT.md` completely.
1. Read `docs/AI-TECHNICAL-GUIDE.md` and `FIXHOME-DESIGN-SYSTEM.md` completely.
2. Inspect the existing project structure and affected navigator, screen, store, or service.
3. Understand the current Expo/React Navigation/Zustand/API-client architecture.
4. Identify existing TypeScript, React Native, navigation, state, and test conventions.
5. Check `package.json`, `app.json`, Expo compatibility, and relevant dependencies.
6. Search for an existing implementation before creating code.
7. Do not modify unrelated files.
8. Do not restructure or eject/prebuild the project unless explicitly requested.
9. Preserve Backend API contracts, enum values, permissions, and business rules.
10. After implementation, execute the complete review process in the technical guide.

If the technical guide has not been read, implementation must not begin.

## Repository rules

- Use the exact Expo SDK declared in `package.json`; use `npx expo install` for native packages.
- Keep business rules and authoritative authorization in Backend.
- Store tokens only through `expo-secure-store`; do not use AsyncStorage for credentials.
- Keep navigation params typed and preserve role-specific Customer/Technician flows.
- Never call the AI service, a payment gateway or a database directly from the app; AI goes
  through the Backend `/ai/*` routes only.
- Coordinate contract changes with the `backend`, `web`, `ai-service` and `docs` repositories,
  and update `docs/CONTEXT.md` in each affected repository.

## Required verification

Use Node 22.13 or newer. Run `npm run check:expo`, `npm run lint`, `npm run typecheck`, and
`npm test`. Review `git diff` and report unexecuted device/E2E checks as `NOT VERIFIED`.

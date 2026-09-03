# FixHome Mobile — Agent Instructions

Before changing code, read the canonical project documentation:

1. [Project Documentation](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/PROJECT_DOCUMENTATION.md)
2. [AI Development Workflow](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/AI_DEVELOPMENT_WORKFLOW.md)
3. [Current Tasks](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/CURRENT_TASKS.md)
4. [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)

## Mobile Rules

- Use the same Backend API contract and enum values as Frontend.
- Keep business logic in Backend; Mobile is a UI client.
- Store authentication tokens with `expo-secure-store`.
- Never call Gemini or OpenAI directly from the app.
- Use Node 22.13 or newer as declared in `.nvmrc` and `package.json`.
- Run `npm run check:expo` and `npm run typecheck` before reporting completion.

<p align="center">
  <img src="assets/icon.png" alt="FixHome Logo" width="120" />
</p>

<h1 align="center">FixHome — Mobile App</h1>

> Ngữ cảnh hiện hành của repo (luồng, hợp đồng, quyết định, việc đang dở) nằm ở [`docs/CONTEXT.md`](docs/CONTEXT.md); khi file này lệch với code hoặc với CONTEXT.md, CONTEXT.md và code là chuẩn.

<p align="center">
  <strong>React Native (Expo) Mobile App cho nền tảng sửa chữa & bảo trì tại nhà FixHome</strong>
</p>

---

The app serves the Customer and Technician roles. Service Manager and Admin use the web console.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Expo SDK ~57 (managed), React Native 0.86, React 19 |
| Language | TypeScript (strict) |
| State | Zustand 5 |
| Navigation | React Navigation 7 |
| Networking | axios (REST), socket.io-client (chat realtime) |
| Maps | react-native-maps |
| Secure storage | expo-secure-store |
| Tests | Jest (`jest-expo`) |

The UI is light-only (`userInterfaceStyle: "light"`). AI features call only the Backend `/ai/*`
endpoints (backed by the self-hosted ai-service); the app has no Gemini/OpenAI integration.

## Prerequisites

- **Node.js** >= 22.13 (Expo SDK 57; `.nvmrc` pins 22.15.0)
- **npm** >= 9
- **Expo CLI** (`npx expo`)
- **Expo Go** app on your phone (for testing)

## Quick Start

```bash
npm ci
cp .env.example .env   # then set EXPO_PUBLIC_API_BASE_URL (see Environment Variables)
npm start
```

On a physical phone, `EXPO_PUBLIC_API_BASE_URL` must point at the backend's LAN address
(`http://<LAN-IP>:3000/api/v1`). On an Android emulator you may delete the line instead and the app
falls back to `http://10.0.2.2:3000/api/v1`. Restart Metro (`npm start -- --clear`) after changing it.

Scan the QR code with the Expo Go app (the repo has no EAS or dev-build configuration) or press:
- `i` for iOS Simulator
- `a` for Android Emulator
- `w` for Web

## Project Structure

```
├── assets/                # App icons & splash screen
├── src/
│   ├── api/               # Shared axios client (client.ts) + endpoint modules
│   ├── components/        # Shared UI components
│   ├── constants/         # Config, theme, motion
│   ├── hooks/             # Shared React hooks
│   ├── navigation/        # React Navigation setup
│   │   ├── AppNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   ├── CustomerNavigator.tsx
│   │   └── TechnicianNavigator.tsx
│   ├── screens/           # Screen components
│   │   ├── auth/          # Login, register, OTP, password reset
│   │   ├── chat/          # Chat list and thread
│   │   ├── customer/      # Customer screens
│   │   └── technician/    # Technician screens
│   ├── services/          # storage (SecureStore), chat-socket, google-auth, image-for-ai
│   ├── store/             # Zustand stores (auth, badge, ui)
│   ├── types/             # TypeScript types
│   └── utils/             # Formatting, validation, time helpers
├── App.tsx                # Root component
├── index.ts               # Entry point
├── app.json               # Expo config
├── package.json
└── tsconfig.json
```

## Environment Variables

See [.env.example](.env.example) for configuration. The app reads `EXPO_PUBLIC_API_BASE_URL` and
`EXPO_PUBLIC_APP_NAME`. When `EXPO_PUBLIC_API_BASE_URL` is unset, it falls back to
`http://10.0.2.2:3000/api/v1` on the Android emulator and `http://localhost:3000/api/v1` elsewhere
(see `src/constants/config.ts`).

For a physical device or a Backend on the LAN, set
`EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000/api/v1`, keep both devices on the same network, and
restart Metro.

Google sign-in goes through the Backend (`/auth/google/start` then `/auth/google/exchange`); the app
needs no Google client id. On an Android emulator, run `adb reverse tcp:3000 tcp:3000` first so the
Google redirect back to `localhost:3000` reaches the development machine.

## Setup Checks

```bash
npm run check:expo
npm run lint
npm run typecheck
npm test
```

## Related Repositories

- [Backend API](https://github.com/FixHome-SEP490/backend)
- [Web](https://github.com/FixHome-SEP490/web)
- [AI Service](https://github.com/FixHome-SEP490/ai-service)
- [Project Documentation](https://github.com/FixHome-SEP490/docs)

## Engineering Governance

Before any change, read [AGENTS.md](AGENTS.md) and the repository-specific
[AI Technical Guide](docs/AI-TECHNICAL-GUIDE.md). The integration branch is `dev`. The independent
CI workflow runs on `main`, `dev`, `development`, and `develop` with the Node version from `.nvmrc`
and enforces `npm ci`, Expo compatibility, lint, type checking, and Jest tests.

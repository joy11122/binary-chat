# Binary Chat

A privacy-first messaging experience built with Next.js, TypeScript, and Capacitor. Messages can be displayed as UTF-8 binary, with a local five-second reveal interaction.

> **Important:** Binary encoding is a display format, not encryption. The current chat content is a local UI preview. Real-time messaging and audited end-to-end encryption are separate implementation phases.

## Stack

- Next.js 15, React 19, TypeScript
- Tailwind CSS and Lucide icons
- MongoDB Atlas for user records and authentication rate limits
- Twilio Verify for phone-number SMS OTP
- Signed, HTTP-only session cookies using JOSE
- Capacitor 7 native shell configuration

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the values below.
4. Start the app: `npm run dev`.

## Required environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name, e.g. `binary-chat` |
| `SESSION_SECRET` | Random secret of at least 32 characters |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio API auth token |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service SID |

Generate a session secret with:

```bash
openssl rand -base64 32
```

Create a Twilio Verify service and enable SMS in the Twilio console. SMS delivery is provider- and destination-dependent and may incur charges. Do not commit real credentials.

For a Capacitor native shell that loads the deployed Next.js app, set `CAPACITOR_SERVER_URL` to the HTTPS deployment URL before running Capacitor commands. Native packaging and store submission are not yet complete.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs these checks on pushes and pull requests to `main`.

## Current Phase 1.2 scope

- Phone number validation with E.164 normalization (Bangladesh as the default region)
- SMS OTP send and verify endpoints using Twilio Verify
- MongoDB user upsert with a unique phone index
- Seven-day signed HTTP-only session cookie
- Hashed fixed-window OTP rate-limit keys with MongoDB TTL cleanup
- Protected chat home, sign-in page, account lookup and sign-out endpoint

Real-time chat persistence, contact discovery, delivery receipts, push notifications, end-to-end encryption, account deletion and full native builds remain future tasks.

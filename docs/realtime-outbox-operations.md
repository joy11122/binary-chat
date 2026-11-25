# Realtime message delivery recovery

MongoDB message documents are the durable outbox records. New messages store a pending-delivery marker in the same write as their content. The immediate send path and scheduled worker use the same atomic lease.

## Recovery endpoint

- Method/path: `GET /api/internal/realtime-outbox`
- Authentication: `Authorization: Bearer <CRON_SECRET>`
- The endpoint claims up to 50 due messages, publishes `message.created` to Ably, and marks successful deliveries.
- Failures are rescheduled with exponential backoff, capped at 15 minutes.
- A crash after Ably accepts a publish but before MongoDB records success can cause a duplicate event. Clients must deduplicate using the stable message `id` / `clientMessageId`.

## Scheduler setup

The GitHub Actions workflow `.github/workflows/realtime-outbox.yml` runs every five minutes after it is merged to the default branch. Configure these repository settings:

1. Repository variable `BINARY_CHAT_BASE_URL`: production origin only, for example `https://your-production-domain` (no trailing slash).
2. Repository secret `CRON_SECRET`: a long, random secret. Set the same value in the Vercel production environment and redeploy.
3. Use the workflow's manual `workflow_dispatch` trigger once to verify configuration.

GitHub scheduled workflows can be delayed under load; the worker is idempotent and each invocation catches up on pending records. Do not configure an every-minute Vercel Cron expression unless the Vercel plan supports it; Hobby cron is limited to once daily and is not suitable for message delivery recovery.

## Operational checks

- Confirm production `ABLY_API_KEY`, `CRON_SECRET`, and MongoDB connectivity.
- Confirm the `messages_realtime_outbox` index exists.
- Inspect the worker response fields: `attempted`, `published`, and `deferred`.
- Monitor records with `realtimePending: true`; inspect `realtimeAttempts`, `realtimeNextAttemptAt`, and `realtimeLastError` for repeated failures.
- Keep history synchronization enabled. MongoDB history remains the source of truth when realtime events are missed.

This worker covers `message.created`. Durable recovery for read and delivered receipt events remains separate work.

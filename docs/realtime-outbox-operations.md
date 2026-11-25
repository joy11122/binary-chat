# Realtime message delivery recovery

MongoDB message documents are the durable outbox records. New messages store a pending-delivery marker in the same write as their content. The immediate send path and scheduled worker use the same atomic lease.

## Recovery endpoint

- Method/path: `GET /api/internal/realtime-outbox`
- Authentication: `Authorization: Bearer <CRON_SECRET>`
- The endpoint claims up to 50 due message and receipt events, publishes them to Ably, and marks successful publishes.
- Message creation, delivery receipts, and read receipts each have durable pending markers on their MongoDB message documents.
- Delivery/read receipt state and its pending marker are written together; the worker leases each receipt, publishes it, and clears the marker only after success.
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
- Confirm the `messages_realtime_outbox`, `messages_delivery_receipt_outbox`, and `messages_read_receipt_outbox` indexes exist.
- Inspect the worker response fields: `attempted`, `published`, and `deferred`.
- Monitor records with `realtimePending: true`, `deliveryReceiptPending: true`, or `readReceiptPending: true`; inspect their corresponding attempt, next-attempt, and last-error fields for repeated failures.
- Keep history synchronization enabled. MongoDB history remains the source of truth when realtime events are missed.

Ably publish delivery is at-least-once: a crash after provider acceptance but before MongoDB clears a pending marker can produce a duplicate. Clients must deduplicate receipt events by message ID. MongoDB history remains the source of truth.

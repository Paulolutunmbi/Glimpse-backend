# Glimpse Email System

All outgoing email should go through `utils/email/emailService.js`.

## Structure

- `brand.js` stores Glimpse email colors, typography, support contact, app URL, and the logo attachment.
- `components/` contains reusable email-safe pieces such as the header, footer, CTA button, and code block.
- `templates/` renders full HTML and plain text payloads for each email type.
- `templates/registry.js` maps template names to versions and sample preview data.
- `render/renderTemplate.js` is the unit-testable rendering entrypoint.
- `analytics/tracking.js` adds provider-agnostic tracking headers and optional open/click metadata.
- `queue/emailQueue.js` is the integration point for BullMQ or another queue later.
- `rateLimit/emailRateLimiter.js` adds lightweight transactional sending safeguards.
- `styles/` centralizes inline-safe style strings used across templates.
- `emailService.js` owns SMTP setup, error handling, default logo attachment, and template dispatch.

## Logo loading

Emails reference the logo with `cid:glimpse-logo`. `emailService.js` attaches
`Backend/assets/glimpse-logo-light-dark.png` to every email via an absolute
path resolved from `utils/email/brand.js`, so the logo does not depend on
frontend assets, public URLs, or base64 embedding.

## Adding a Template

1. Add a renderer to `templates/index.js` that returns `{ subject, text, html }`.
2. Use `layout()` plus shared components instead of duplicating wrapper HTML.
3. Export a convenience sender from `emailService.js`.
4. Call that sender from controllers or services.

Every template should include a plain text fallback, a clear preheader, and a
footer reason explaining why the recipient received the email.

## Previewing Emails

Run a local render without sending:

```bash
npm run email:preview -- verificationEmail
```

The script writes HTML and text files to `Backend/tmp/email-preview/`.

When the API is running, preview routes are available outside production:

- `GET /dev/email-preview`
- `GET /dev/email-preview/passwordResetEmail`
- `GET /dev/email-preview/passwordResetEmail?format=json`

In production, preview routes remain disabled unless `EMAIL_PREVIEW_ENABLED=true`.

## Tracking Hooks

Tracking is provider-agnostic. Every sent email receives:

- `X-Glimpse-Email-Tracking-Id`
- `X-Glimpse-Email-Template`
- `X-Glimpse-Email-Version`

Optional settings:

- `EMAIL_TRACKING_BASE_URL=https://your-tracking-service.example` appends an open pixel.
- `EMAIL_CLICK_TRACKING_ENABLED=true` appends tracking query parameters to HTTP links.

The app does not store analytics yet; these hooks make it ready for a provider,
webhook, or internal collector.

## Queue Integration

`queue/emailQueue.js` currently sends immediately. Later, BullMQ can be added by
calling `setEmailQueueAdapter()` during app startup and enqueueing the `job.payload`
instead of calling `job.send()`.

## Rate Limits

Transactional email rate limiting is enabled by default in-process:

- `EMAIL_RATE_LIMIT_MAX_PER_RECIPIENT=8`
- `EMAIL_RATE_LIMIT_MAX_GLOBAL=200`
- `EMAIL_RATE_LIMIT_WINDOW_MS=3600000`
- `EMAIL_RATE_LIMIT_ENABLED=false` disables it

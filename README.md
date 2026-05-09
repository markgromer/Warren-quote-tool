# WARREN Quote Tool Hosted App

This folder is the hosted React + Express version of WARREN Quote Tool. It is designed to run on Render and provide an embeddable quote and lead-capture add-on for Wix, Webflow, Squarespace, Shopify, WordPress, and custom sites.

## What Was Preserved

The hosted API mirrors the current WordPress REST behavior:

- `options`
- `addons`
- `price`
- `local_price`
- `coupon_validate`
- `coupon_help`
- `quote_lead`
- `waitlist`
- `onboard`

The backend keeps the same major capabilities:

- Sweep&Go API proxying
- local/manual pricing
- one-time pricing fallback
- service area options
- quote and partial-lead logging
- waitlist capture
- coupon validation
- coupon help lead capture
- SNG onboarding
- email-only lead delivery
- GoHighLevel webhook delivery
- Jobber webhook delivery with HMAC signature
- encrypted connection secrets
- hosted embed code

## Local Setup

```bash
cd hosted
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Open:

```txt
http://localhost:5173
```

The API runs on:

```txt
http://localhost:3000
```

## Render Deploy

This app includes `render.yaml`.

Recommended Render setup:

1. Push the repository to GitHub.
2. In Render, create a Blueprint from this repo.
3. Set root directory to:

```txt
TitanQuoteToolV2/hosted
```

4. Add `APP_URL` after the service is created, for example:

```txt
https://quote.yourdomain.com
```

5. Configure SMTP vars if you want email delivery:

```txt
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
```

6. Configure hosted app admins with a comma-separated list of login emails:

```txt
WARREN_ADMIN_EMAILS
```

Admins can open the dashboard Admin tab to view brands/accounts and manually change plan, billing status, and add-on flags.

## Embed Code

The dashboard generates:

```html
<div id="tqt-widget"></div>
<script src="https://quote.yourdomain.com/widget.js" data-widget-id="wid_xxxxx"></script>
```

For sites with multiple widgets on one page:

```html
<div id="quote-a"></div>
<script src="https://quote.yourdomain.com/widget.js" data-widget-id="wid_xxxxx" data-mount="#quote-a"></script>
```

## Manual Pricing Format

Use one row per price:

```txt
dogs | frequency | per_cleanup | monthly | optional filters
```

Examples:

```txt
1 | once_a_week | 18 | 78
2 | once_a_week | 24 | 104
1 | bi_weekly | 28 | 60.67
1 | one_time | 84 |
2 | once_a_week | 30 | 130 | yard_size=large
2 | once_a_week | 34 | 147.33 | min_sqft=7000
```

Frequency slugs match the plugin:

```txt
seven_times_a_week
six_times_a_week
five_times_a_week
four_times_a_week
three_times_a_week
two_times_a_week
once_a_week
bi_weekly
twice_per_month
every_three_weeks
once_a_month
every_four_weeks
one_time
```

## Current Caveats

This is a full hosted foundation, but a few plugin-specific surfaces still need deeper parity work before replacing the WordPress plugin completely:

- The hosted embed is a new lightweight implementation, not a direct React rendering of every visual nuance in `assets/tqt.js`.
- Yard Mapbox drawing is represented in settings/API shape but not fully reimplemented in the hosted embed yet.
- The old WordPress owner/admin page is replaced by a generic settings editor. It exposes the same settings keys, but it is not yet as guided as the WP admin UI.

The backend structure is ready for those refinements without changing the public embed/API contract.

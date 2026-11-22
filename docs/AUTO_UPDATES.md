# Automatic Hong Kong data and website updates

Data refresh runs daily at 06:15 Hong Kong time (22:15 UTC). Timetables and adult/student fares refresh daily. Sunday runs also refresh bus stops, route alignments, schools and residents' service directories. Other countries load their open-map data on demand and cache it for up to one day.

Downloads retry temporary failures. The job validates the complete refreshed snapshot, runs tests, builds the browser planner and verifies it before committing source data. KMB route-stop data is split into four files below 1 MB each; raw archives and generated application bundles stay out of Git.

## Enable production deployment once

The `Deploy production website` workflow publishes verified `main` changes, and follows successful data-refresh runs. The `workflow_run` trigger is necessary because commits made with the Actions token do not trigger ordinary push workflows.

1. Create a Cloudflare custom API token with **Account / Workers Scripts / Edit** and **Account / Account Settings / Read**, restricted to the account that owns `kmb-monthly-pass-mapper`. Keep the token private.
2. Add it as the GitHub repository Actions secret `CLOUDFLARE_API_TOKEN`.
3. Set the repository variable `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
4. Set the repository variable `CLOUDFLARE_AUTO_DEPLOY` to `true` and dispatch `deploy-production.yml` once to verify it.

The deployment job runs route/fare tests and browser-worker checks before using the token in the final deployment step. It has read-only GitHub permissions and deploys the existing Worker using `wrangler.jsonc`. Deployment remains disabled until explicitly configured. No paid data feed or new data-provider account is required.

Do not upload local Wrangler OAuth credentials to GitHub: their session and refresh tokens are intended for local sign-in, not this deployment workflow.

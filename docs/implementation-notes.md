# Implementation Notes

## What is functional now

- Next.js dashboard UI for insights, provider linking actions, profile context, top workouts, and grounded Q&A.
- FastAPI endpoints for profiles, dashboard analytics, sync runs, Strava OAuth callback, integrations, and questions.
- Supabase Auth-aware frontend with local demo fallback when Supabase env vars are absent.
- Backend Supabase JWT verification when `DEV_AUTH_ENABLED=false`.
- Local SQLite persistence for development.
- Strava OAuth token storage and synchronous activity sync when credentials are configured.
- Canonical activity rebuild with duplicate merging to avoid double-counting TrainerRoad + Strava copies.
- Deterministic insights before AI interpretation.
- OpenAI Responses API adapter with a fallback answer when `OPENAI_API_KEY` is missing.

## Production gaps to close next

- Replace local HMAC-wrapped secrets with KMS, Supabase Vault, or another encryption service.
- Replace local demo fallback with production Supabase env vars in deployed environments.
- Move sync execution out of request/response into Render workers or a queue.
- Complete TrainerRoad browser session linking and activity API discovery using Playwright.
- Add Strava Developer Program setup and rate-limit-aware queued backoff.

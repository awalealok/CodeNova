# INKLOOM AI Frontend Setup

This project includes a Next.js frontend under the `frontend/` directory. The Python backend remains untouched, and the UI is built to work with demo data when a backend endpoint is not yet available.

## Requirements

- Node.js LTS
- npm

## Windows setup

1. Open PowerShell in the repo root.
2. Change into the frontend folder:
   ```powershell
   cd .\inkloom-ai\frontend
   ```
3. Install dependencies:
   ```powershell
   npm install
   ```
4. Create a local environment file if needed:
   ```powershell
   Copy-Item .env.example .env.local
   ```
5. Start the development server:
   ```powershell
   npm run dev
   ```

The app is available on http://localhost:3000.

## Frontend environment

Create a `.env.local` file with the following:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_NAME=INKLOOM AI
NEXT_PUBLIC_DEMO_MODE=true
```

## Available scripts

```bash
npm run dev
npm run build
npm run lint
```

## Missing backend dependencies

The following endpoints are not guaranteed to exist in the current backend and are therefore treated as demo integrations rather than production integrations:

- `/auth/login`
- `/auth/register`
- `/analytics/overview`
- `/analytics/review-activity`
- `/guidelines/upload`
- `/documents/ingest`
- `/facts/create`
- `/lexicon/create`
- `/reviews/approve`

The frontend continues to render all core views using demo data and clearly marks any unavailable backend capability.

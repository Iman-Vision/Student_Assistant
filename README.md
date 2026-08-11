---
title: DocSage
emoji: 📚
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# DocSage 📚

AI-powered study assistant — upload documents, chat with them, and generate flashcards, quizzes, summaries, key points, and simplified explanations.

## Features

- 📤 **Document Upload**: PDF, DOCX, TXT, and images (OCR via EasyOCR) — extracted text persisted in SQLite, survives server restarts
- 💬 **AI Chat**: Ask questions grounded in your uploaded documents, remembers earlier turns in the same conversation
- 🃏 **Flashcards**, 📝 **Quizzes**, 📄 **Summaries**, 📋 **Key Points**, 💡 **Simple Explanations**
- 🔐 **Real auth**: Email magic-link sign-in via Supabase — every user's data (conversations, files) is isolated server-side
- 🗑️ Deleting a conversation/file removes its extracted text and the uploaded file from disk, not just the DB row
- 🧭 Collapsible chat list and tools sidebar (toggle icons in the header)

## Tech Stack

### Backend
- **FastAPI** — API server, also serves the built frontend as static files
- **Groq** (`llama-3.1-8b-instant`) — LLM inference for chat and study tools
- **PyPDF2 / python-docx / EasyOCR** — text extraction from uploads
- **SQLite** — conversations, messages, file metadata + extracted text
- **PyJWT** — verifies Supabase-issued JWTs against Supabase's public JWKS endpoint (no shared secret needed)

### Frontend
- **React 18 + TypeScript + Vite**
- **Tailwind CSS**, **Lucide React** icons
- **Supabase JS** — email magic-link sign-in client-side, attaches the session token to every API call

This is a single deployable unit: `npm run build` produces `frontend/dist`, and FastAPI mounts it as static files. There is no separate frontend server in production.

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- A free [Supabase](https://supabase.com) project
- A free [Groq](https://console.groq.com) API key

### 1. Backend

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

Create `.env` in the repo root (see `.env.example`):
```env
SUPABASE_URL=https://your-project.supabase.co   # Project Settings -> API -> Project URL
GROQ_API_KEY=your_groq_api_key_here
FRONTEND_ORIGIN=http://localhost:5173
```

### 2. Frontend

Create `frontend/.env` (see `frontend/.env.example`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
```

```bash
cd frontend
npm install
npm run dev
```

### 3. Run both

```bash
start.bat
```
or manually: `uvicorn main:app --reload` from `backend/`, and `npm run dev` from `frontend/`.

- Frontend dev server: http://localhost:5173
- Backend API: http://localhost:8000

## Supabase Setup (email sign-in)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Authentication → URL Configuration → set **Site URL** to your app's URL (`http://localhost:5173` for local dev), and add it under **Redirect URLs** too. Add your deployed URL there later as well.
3. Project Settings → API → copy the **Project URL** and the **anon public** key (may be labeled **publishable key** in newer dashboards) into `frontend/.env`.
4. Project Settings → API → copy the **Project URL** again into the root `.env` as `SUPABASE_URL` — that's the only backend auth config needed; it verifies tokens via Supabase's public JWKS endpoint, no secret key required.
5. Sign-in flow: user enters their email in the app → Supabase emails a magic link → clicking it signs them in. No Google/OAuth app setup needed.

## Deploying (free, Docker)

The repo ships with a `Dockerfile` that builds the React frontend and bundles it into the FastAPI image — one container, no separate frontend host needed. This does **not** run on Streamlit Community Cloud (it only runs a single Python `streamlit run` script — no Docker, no static frontend build, no way to keep this React UI intact there). Use a free Docker-capable host instead:

### Hugging Face Spaces (recommended, free)

1. Create a new Space → SDK: **Docker** → **Space hardware: CPU basic (Free)** — don't change this dropdown, the paid tiers are optional upsells, not required. Push this repo to the Space's git remote (or link the GitHub repo).
2. This README already has the Spaces config block at the very top (`sdk: docker`, `app_port: 7860`) — Spaces reads that frontmatter automatically, nothing to add.
3. Settings → Repository secrets (not "Variables", secrets stay hidden) → add `SUPABASE_URL`, `GROQ_API_KEY`, `FRONTEND_ORIGIN` (set to your Space's public URL, e.g. `https://you-docsage.hf.space`).
4. Add that same Space URL to Supabase's Redirect URLs (step 2 in Supabase Setup above).
5. Push — the Space builds the `Dockerfile` and serves the app on port 7860.

**Free-tier caveat:** Spaces' default disk is ephemeral — the SQLite DB and uploaded files are wiped on every rebuild/restart. Fine for demos; for persistent data either enable a Space's persistent storage (paid) or point `backend/database.py` and the upload path at an external free store (e.g. a small Postgres/Supabase table + Supabase Storage bucket).

### Render / Railway free tier (alternative)

Same Dockerfile works unmodified — set the same three env vars, they auto-detect the `Dockerfile` and `EXPOSE 7860`/`$PORT`.

```bash
docker build -t docsage .
docker run -p 8000:7860 \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e GROQ_API_KEY=your_key \
  -e FRONTEND_ORIGIN=http://localhost:8000 \
  docsage
```

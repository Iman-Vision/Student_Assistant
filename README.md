# DocSage 📚

AI-powered study assistant — upload documents, chat with them, and generate flashcards, quizzes, summaries, key points, and simplified explanations.

## Features

- 📤 **Document Upload**: PDF, DOCX, TXT, and images (OCR via EasyOCR)
- 💬 **AI Chat**: Ask questions grounded in your uploaded documents
- 🃏 **Flashcards**, 📝 **Quizzes**, 📄 **Summaries**, 📋 **Key Points**, 💡 **Simple Explanations**
- 🔐 **Real auth**: Google sign-in via Supabase — every user's data (conversations, files) is isolated server-side
- 🗑️ Deleting a conversation/file also removes its uploaded file from disk, not just the DB row

## Tech Stack

### Backend
- **FastAPI** — API server, also serves the built frontend as static files
- **Groq** (`llama3-8b-8192`) — LLM inference for chat and study tools
- **PyPDF2 / python-docx / EasyOCR** — text extraction from uploads
- **SQLite** — conversations, messages, file metadata
- **PyJWT** — verifies Supabase-issued JWTs

### Frontend
- **React 18 + TypeScript + Vite**
- **Tailwind CSS**, **Lucide React** icons
- **Supabase JS** — Google sign-in client-side, attaches the session token to every API call

This is a single deployable unit: `npm run build` produces `frontend/dist`, and FastAPI mounts it as static files. There is no separate frontend server in production.

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- A free [Supabase](https://supabase.com) project (Auth → Providers → enable Google)
- A free [Groq](https://console.groq.com) API key

### 1. Backend

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

Create `.env` in the repo root (see `.env.example`):
```env
SUPABASE_JWT_SECRET=your_supabase_jwt_secret   # Project Settings -> API -> JWT Secret
GROQ_API_KEY=your_groq_api_key_here
FRONTEND_ORIGIN=http://localhost:5173
```

### 2. Frontend

Create `frontend/.env` (see `frontend/.env.example`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
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

## Supabase Setup (Google sign-in)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Authentication → Providers → enable **Google**, add a Google Cloud OAuth client ID/secret (also free).
3. Authentication → URL Configuration → add your deployed URL (and `http://localhost:5173` for local dev) to Redirect URLs.
4. Project Settings → API → copy the **Project URL** and **anon public key** into `frontend/.env`.
5. Project Settings → API → copy the **JWT Secret** into the root `.env` as `SUPABASE_JWT_SECRET`.

## Deploying (free, Docker)

The repo ships with a `Dockerfile` that builds the React frontend and bundles it into the FastAPI image — one container, no separate frontend host needed. This does **not** run on Streamlit Community Cloud (it only runs a single Python `streamlit run` script — no Docker, no static frontend build, no way to keep this React UI intact there). Use a free Docker-capable host instead:

### Hugging Face Spaces (recommended, free)

1. Create a new Space → SDK: **Docker** → point it at this repo (or push the repo to the Space's git remote).
2. Add a Spaces config block to the top of this README (Spaces reads it from README frontmatter) — HF Spaces looks for:
   ```yaml
   ---
   title: DocSage
   emoji: 📚
   sdk: docker
   app_port: 7860
   ---
   ```
3. Settings → Repository secrets → add `SUPABASE_JWT_SECRET`, `GROQ_API_KEY`, `FRONTEND_ORIGIN` (set to your Space's public URL, e.g. `https://you-docsage.hf.space`).
4. Add that same Space URL to Supabase's Redirect URLs (step 3 above).
5. Push — the Space builds the `Dockerfile` and serves the app on port 7860.

**Free-tier caveat:** Spaces' default disk is ephemeral — the SQLite DB and uploaded files are wiped on every rebuild/restart. Fine for demos; for persistent data either enable a Space's persistent storage (paid) or point `backend/database.py` and the upload path at an external free store (e.g. a small Postgres/Supabase table + Supabase Storage bucket).

### Render / Railway free tier (alternative)

Same Dockerfile works unmodified — set the same three env vars, they auto-detect the `Dockerfile` and `EXPOSE 7860`/`$PORT`.

```bash
docker build -t docsage .
docker run -p 8000:7860 \
  -e SUPABASE_JWT_SECRET=your_secret \
  -e GROQ_API_KEY=your_key \
  -e FRONTEND_ORIGIN=http://localhost:8000 \
  docsage
```

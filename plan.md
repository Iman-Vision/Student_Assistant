# Study Assistant: Step-by-Step Build Plan

## Project Overview
A full-stack RAG (Retrieval-Augmented Generation) Q&A system that lets you upload documents, ask questions, and use study tools like flashcards, quizzes, and summaries.

---

## Tech Stack

### Backend
- **FastAPI**: Web framework
- **Uvicorn**: ASGI server
- **LangChain**: For RAG pipelines
- **FAISS**: Vector store
- **Sentence-Transformers**: Embedding model (all-MiniLM-L6-v2)
- **Groq**: LLM inference (fast, free API)
- **PyMuPDF (fitz)**: PDF parsing
- **python-docx**: DOCX parsing
- **EasyOCR**: Image text extraction
- **SQLite**: Simple database for users/conversations

### Frontend
- **React 18 + TypeScript**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Lucide React**: Icons
- **Axios**: API client

### Deployment
- **Docker**: Containerization
- **Hugging Face Spaces**: Hosting

---

## Project Structure (Final)
```
Q-A-system/
├── .gitignore
├── Dockerfile
├── README.md
├── requirements.txt
├── backend/
│   ├── auth.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   └── rag.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── index.css
        └── main.tsx
```

---

## Step 1: Backend Setup

### 1.1 Create Project Root
- Create a new folder `Q-A-system/`
- Open it in VS Code/Trae

### 1.2 Initialize Backend
1. Create `backend/` folder
2. Create `requirements.txt` (paste from our current file)
3. Create `.env` file in project root for GROQ_API_KEY (optional for local dev)
4. Create `backend/models.py`: Define your Pydantic models (if needed)
5. Create `backend/database.py`: Implement SQLite database for users/conversations/files
6. Create `backend/rag.py`: Build RAG system with:
   - File processing (PDF, DOCX, TXT, images)
   - Text splitting
   - Embedding generation
   - Vector store (FAISS)
   - Question answering and study tools
7. Create `backend/auth.py`: Simple demo user auth (no Firebase!)
8. Create `backend/main.py`: Build FastAPI app with all endpoints

### 1.3 Backend Endpoints to Implement
```
GET    /api/health
GET    /api/auth/me
GET    /api/conversations/{email}
POST   /api/conversations
DELETE /api/conversations/{email}/{conv_id}
GET    /api/conversations/{email}/{conv_id}/messages
POST   /api/chat
POST   /api/upload
GET    /api/files/{email}/{conv_id}
DELETE /api/files/{email}/{conv_id}/{filename}
GET    /api/workspace/{email}/{tool}
POST   /api/study
POST   /api/study/grade
```

---

## Step 2: Frontend Setup

### 2.1 Initialize Vite + React + TypeScript
```bash
# From project root
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### 2.2 Install Frontend Dependencies
```bash
cd frontend
npm install axios clsx lucide-react tailwind-merge
npm install -D tailwindcss postcss autoprefixer
```

### 2.3 Set Up Tailwind CSS
1. Initialize Tailwind config:
```bash
npx tailwindcss init -p
```
2. Configure `tailwind.config.js`:
```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--fg)",
        border: "var(--border)",
        muted: "var(--muted)",
        card: "var(--card)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
      }
    },
  },
  plugins: [],
}
```
3. Add Tailwind directives to `frontend/src/index.css`

### 2.4 Build Frontend Components
- Create `frontend/src/api.ts`: Axios client for API calls
- Create `frontend/src/App.tsx`: Full app UI with:
  - Sidebar (modules + chats)
  - Chat view
  - Study tools (flashcards, quiz, summary, etc.)
  - File upload (drag & drop)
  - Dark/light mode toggle

---

## Step 3: Dockerfile
Create a multi-stage `Dockerfile` that:
1. Builds the frontend in a Node container
2. Builds the Python backend with all dependencies
3. Serves both frontend static files and FastAPI app

---

## Step 4: Local Development
To test locally:
1. Install Python dependencies:
```bash
python -m venv venv
# Activate venv (Windows: .\venv\Scripts\activate)
pip install -r requirements.txt
```
2. Build frontend:
```bash
cd frontend
npm install
npm run build
```
3. Run backend:
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
4. Open browser at http://localhost:8000

---

## Step 5: Deployment to Hugging Face
1. Create a new Hugging Face Space (Docker SDK)
2. Add your code to the Space (via git)
3. Add `GROQ_API_KEY` as a secret in Space Settings
4. Push your code and wait for the build to finish!

---

## Important Notes
- **Always start with backend first!** Get your API working before building the frontend
- Test each component as you go (file upload, chat, study tools)
- Use a simple demo user for auth first, no Firebase needed!

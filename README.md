# DocSage 📚

Your AI-powered study assistant with RAG, flashcards, quizzes, and summaries!

## Features

- 📤 **Document Upload**: Support for PDF, DOCX, TXT, and images
- 💬 **AI Chat**: Ask questions about your documents with RAG
- 🃏 **Flashcards**: Auto-generated flashcards from your content
- 📝 **Quizzes**: Interactive quizzes to test your knowledge
- 📄 **Summaries**: Generate comprehensive summaries of your documents
- 🔐 **Firebase Auth**: Secure login with Google
- 🌙 **Dark Mode**: Toggle between light and dark themes

## Tech Stack

### Backend
- **FastAPI**: Web framework
- **LangChain**: RAG pipeline
- **FAISS**: Vector database
- **Groq**: LLM inference
- **Firebase Admin**: Auth verification
- **SQLite**: User/conversation storage

### Frontend
- **React 18 + TypeScript**
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Lucide React**: Icons
- **Firebase**: Client-side auth

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- Firebase project
- Groq API key

### 1. Clone the repo
```bash
cd Student_Assistant
```

### 2. Backend Setup

Create a virtual environment and install dependencies:
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Google Sign-In in Authentication
4. Generate a service account key (Settings → Service Accounts → Generate new private key)
5. Save it as `serviceAccountKey.json` in the root directory
5. Create a web app in Firebase and get your config

### 4. Frontend Setup

Create `frontend/.env`:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Install dependencies:
```bash
cd frontend
npm install
npm run build
```

### 5. Run the app

From the root directory:
```bash
cd backend
uvicorn main:app --reload
```

Then open http://localhost:8000

## Docker

Build and run with Docker:
```bash
docker build -t docsage .
docker run -p 8000:8000 \
  -e GROQ_API_KEY=your_key \
  -v $(pwd)/serviceAccountKey.json:/app/serviceAccountKey.json \
  docsage
```

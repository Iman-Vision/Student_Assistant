import os
import shutil
import uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models import GradeRequest
from database import db
from rag import rag_system
from auth import get_current_user

app = FastAPI(title="DocSage API")

FRONTEND_ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "jpg", "jpeg", "png"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB


def require_conversation_owner(conversation_id: str, user_email: str):
    owner = db.conversation_owner(conversation_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if owner != user_email:
        raise HTTPException(status_code=403, detail="Not your conversation")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    name = current_user["name"]
    db.create_user(email, name)
    conversations = db.get_conversations(email)
    return {
        "email": email,
        "display_name": name,
        "conversations": conversations
    }


@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    return db.get_conversations(current_user["email"])


@app.post("/api/conversations")
async def create_conversation(data: dict, current_user: dict = Depends(get_current_user)):
    title = data.get("title", "New Conversation")
    conv = db.create_conversation(current_user["email"], title)
    return conv


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str, current_user: dict = Depends(get_current_user)):
    require_conversation_owner(conv_id, current_user["email"])
    for file_path in db.file_paths_for_conversation(conv_id):
        Path(file_path).unlink(missing_ok=True)
    db.delete_conversation(current_user["email"], conv_id)
    rag_system.remove_conversation(conv_id)
    return {"status": "success"}


@app.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, current_user: dict = Depends(get_current_user)):
    require_conversation_owner(conv_id, current_user["email"])
    return db.get_messages(conv_id)


@app.post("/api/chat")
async def chat(req: dict, current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    conversation_id = req.get("conversation_id")
    question = req.get("question", "")

    if not conversation_id:
        conv = db.create_conversation(email, question[:50] if question else "New chat")
        conversation_id = str(conv["id"])
    else:
        require_conversation_owner(str(conversation_id), email)

    db.add_message(str(conversation_id), "user", question)
    response = rag_system.chat(str(conversation_id), question)
    db.add_message(str(conversation_id), "assistant", response)

    return {
        "conversation_id": conversation_id,
        "answer": response
    }


@app.post("/api/upload")
async def upload_file(
    conversation_id: str = Query(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    email = current_user["email"]
    require_conversation_owner(conversation_id, email)

    safe_name = Path(file.filename).name
    ext = safe_name.lower().split(".")[-1] if "." in safe_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    file_location = UPLOAD_DIR / f"{uuid.uuid4()}_{safe_name}"
    size = 0
    try:
        with open(file_location, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File too large (max 15MB)")
                buffer.write(chunk)
    except HTTPException:
        file_location.unlink(missing_ok=True)
        raise

    text = rag_system.process_file(str(file_location), safe_name)
    rag_system.add_document_to_vector_store(conversation_id, text)
    db.add_file(email, conversation_id, safe_name, str(file_location))

    return {"filename": safe_name, "status": "processed"}


@app.get("/api/files/{conv_id}")
async def get_files(conv_id: str, current_user: dict = Depends(get_current_user)):
    require_conversation_owner(conv_id, current_user["email"])
    return db.get_files(current_user["email"], conv_id)


@app.delete("/api/files/{conv_id}/{filename}")
async def delete_file(conv_id: str, filename: str, current_user: dict = Depends(get_current_user)):
    require_conversation_owner(conv_id, current_user["email"])
    file_path = db.delete_file(current_user["email"], conv_id, filename)
    if file_path:
        Path(file_path).unlink(missing_ok=True)
    return {"status": "success"}


@app.post("/api/study")
async def study(req: dict, current_user: dict = Depends(get_current_user)):
    tool = req.get("tool")
    conversation_id = req.get("conversation_id")
    topic = req.get("topic")
    require_conversation_owner(str(conversation_id), current_user["email"])

    if tool == "flashcards":
        flashcards = rag_system.generate_flashcards(conversation_id, topic)
        return {"content": flashcards, "format": "flashcards"}
    elif tool == "quiz":
        quiz = rag_system.generate_quiz(conversation_id, topic)
        return {"content": quiz, "format": "quiz"}
    elif tool == "summary":
        summary = rag_system.generate_summary(conversation_id, topic)
        return {"content": summary, "format": "summary"}
    elif tool == "key_points":
        key_points = rag_system.generate_key_points(conversation_id, topic)
        return {"content": key_points, "format": "key_points"}
    elif tool == "explain":
        explanation = rag_system.explain_simply(conversation_id, topic)
        return {"content": explanation, "format": "explain"}
    elif tool == "practice":
        summary = rag_system.generate_summary(conversation_id, topic)
        return {"content": summary, "format": "practice"}
    else:
        raise HTTPException(status_code=400, detail="Invalid tool")


@app.post("/api/study/grade")
async def grade_answer(req: GradeRequest, current_user: dict = Depends(get_current_user)):
    correct = req.user_answer.strip().lower() == req.correct_answer.strip().lower()
    return {"correct": correct}

# Mount static frontend files LAST
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")

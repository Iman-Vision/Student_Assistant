import os
import shutil
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from models import ChatRequest, StudyRequest, GradeRequest
from database import db
from rag import rag_system

app = FastAPI(title="DocSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Demo user
demo_user = {"email": "demo@docsage.com", "name": "Demo User"}


async def get_current_user():
    return demo_user


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
async def get_conversations_demo(current_user: dict = Depends(get_current_user)):
    return db.get_conversations(current_user["email"])


@app.get("/api/conversations/{email}")
async def get_conversations(email: str, current_user: dict = Depends(get_current_user)):
    return db.get_conversations(email)


@app.post("/api/conversations")
async def create_conversation(data: dict, current_user: dict = Depends(get_current_user)):
    title = data.get("title", "New Conversation")
    conv = db.create_conversation(current_user["email"], title)
    return conv


@app.delete("/api/conversations/{email}/{conv_id}")
async def delete_conversation(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    db.delete_conversation(email, conv_id)
    return {"status": "success"}


@app.get("/api/conversations/{email}/{conv_id}/messages")
async def get_messages(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    return db.get_messages(conv_id)


@app.post("/api/chat")
async def chat(req: dict, current_user: dict = Depends(get_current_user)):
    conversation_id = req.get("conversation_id")
    question = req.get("question", "")
    if not conversation_id:
        conv = db.create_conversation(current_user["email"], question[:50] if question else "New chat")
        conversation_id = str(conv["id"])

    db.add_message(str(conversation_id), "user", question)
    response = rag_system.chat(str(conversation_id), question)
    db.add_message(str(conversation_id), "assistant", response)

    return {
        "conversation_id": conversation_id,
        "answer": response
    }


@app.post("/api/upload")
async def upload_file(
    email: str = Query(...),
    conversation_id: str = Query(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    file_location = os.path.join(UPLOAD_DIR, f"{conversation_id}_{file.filename}")
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    text = rag_system.process_file(file_location, file.filename)
    rag_system.add_document_to_vector_store(conversation_id, text)
    db.add_file(email, conversation_id, file.filename, file_location)

    return {"filename": file.filename, "status": "processed"}


@app.get("/api/files/{email}/{conv_id}")
async def get_files(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    return db.get_files(email, conv_id)


@app.delete("/api/files/{email}/{conv_id}/{filename}")
async def delete_file(email: str, conv_id: str, filename: str, current_user: dict = Depends(get_current_user)):
    db.delete_file(email, conv_id, filename)
    return {"status": "success"}


@app.get("/api/workspace/{email}/{tool}")
async def get_workspace(email: str, tool: str, current_user: dict = Depends(get_current_user)):
    return {"tool": tool, "status": "ready"}


@app.post("/api/study")
async def study(req: dict, current_user: dict = Depends(get_current_user)):
    tool = req.get("tool")
    conversation_id = req.get("conversation_id")
    topic = req.get("topic")
    
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
        # For practice, let's just use a simple question/answer for now
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

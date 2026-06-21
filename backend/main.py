import os
import shutil
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from models import ChatRequest, StudyRequest, GradeRequest
from database import db
from rag import rag_system
from auth import get_current_user

app = FastAPI(title="DocSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    db.create_user(current_user["email"], current_user.get("name"))
    return {
        "email": current_user["email"],
        "display_name": current_user.get("name")
    }


@app.get("/api/conversations/{email}")
async def get_conversations(email: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.get_conversations(email)


@app.post("/api/conversations")
async def create_conversation(data: dict, current_user: dict = Depends(get_current_user)):
    title = data.get("title", "New Conversation")
    conv = db.create_conversation(current_user["email"], title)
    return conv


@app.delete("/api/conversations/{email}/{conv_id}")
async def delete_conversation(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete_conversation(email, conv_id)
    return {"status": "success"}


@app.get("/api/conversations/{email}/{conv_id}/messages")
async def get_messages(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.get_messages(conv_id)


@app.post("/api/chat")
async def chat(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    if req.email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    conversation_id = req.conversation_id
    if not conversation_id:
        conv = db.create_conversation(current_user["email"], req.message[:50])
        conversation_id = conv.id

    db.add_message(conversation_id, "user", req.message)
    response = rag_system.chat(conversation_id, req.message)
    db.add_message(conversation_id, "assistant", response)

    return {
        "conversation_id": conversation_id,
        "message": response
    }


@app.post("/api/upload")
async def upload_file(
    email: str,
    conversation_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    file_location = os.path.join(UPLOAD_DIR, f"{conversation_id}_{file.filename}")
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    text = rag_system.process_file(file_location, file.filename)
    rag_system.add_document_to_vector_store(conversation_id, text)
    db.add_file(email, conversation_id, file.filename, file_location)

    return {"filename": file.filename, "status": "processed"}


@app.get("/api/files/{email}/{conv_id}")
async def get_files(email: str, conv_id: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.get_files(email, conv_id)


@app.delete("/api/files/{email}/{conv_id}/{filename}")
async def delete_file(email: str, conv_id: str, filename: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete_file(email, conv_id, filename)
    return {"status": "success"}


@app.get("/api/workspace/{email}/{tool}")
async def get_workspace(email: str, tool: str, current_user: dict = Depends(get_current_user)):
    if email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"tool": tool, "status": "ready"}


@app.post("/api/study")
async def study(req: StudyRequest, current_user: dict = Depends(get_current_user)):
    if req.email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    if req.tool == "flashcards":
        return rag_system.generate_flashcards(req.conversation_id, req.topic)
    elif req.tool == "quiz":
        return rag_system.generate_quiz(req.conversation_id, req.topic)
    elif req.tool == "summary":
        return {"summary": rag_system.generate_summary(req.conversation_id, req.topic)}
    else:
        raise HTTPException(status_code=400, detail="Invalid tool")


@app.post("/api/study/grade")
async def grade_answer(req: GradeRequest, current_user: dict = Depends(get_current_user)):
    if req.email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    correct = req.user_answer.strip().lower() == req.correct_answer.strip().lower()
    return {"correct": correct}

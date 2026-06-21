from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime


class User(BaseModel):
    email: EmailStr
    display_name: Optional[str] = None


class Message(BaseModel):
    id: Optional[str] = None
    role: str
    content: str
    timestamp: Optional[datetime] = None


class Conversation(BaseModel):
    id: Optional[str] = None
    user_email: EmailStr
    title: str
    messages: List[Message] = []
    created_at: Optional[datetime] = None


class ChatRequest(BaseModel):
    email: EmailStr
    conversation_id: Optional[str] = None
    message: str


class StudyRequest(BaseModel):
    email: EmailStr
    conversation_id: str
    tool: str
    topic: Optional[str] = None


class GradeRequest(BaseModel):
    email: EmailStr
    conversation_id: str
    question: str
    user_answer: str
    correct_answer: str

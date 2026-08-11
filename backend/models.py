from pydantic import BaseModel


class GradeRequest(BaseModel):
    conversation_id: str
    question: str
    user_answer: str
    correct_answer: str

import os
import PyPDF2
import docx
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


class RAGSystem:
    def __init__(self):
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.groq_api_key) if self.groq_api_key else None
        self.documents: Dict[str, str] = {}
        self.reader = None

    def extract_text_from_pdf(self, file_path: str) -> str:
        text = ""
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
        return text

    def extract_text_from_docx(self, file_path: str) -> str:
        doc = docx.Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])

    def extract_text_from_txt(self, file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    def extract_text_from_image(self, file_path: str) -> str:
        try:
            if not self.reader:
                import easyocr
                self.reader = easyocr.Reader(['en'], gpu=False)
            result = self.reader.readtext(file_path)
            return "\n".join([text for (bbox, text, prob) in result])
        except Exception as e:
            print(f"Error processing image: {e}")
            return ""

    def process_file(self, file_path: str, filename: str) -> str:
        ext = filename.lower().split('.')[-1]
        if ext == 'pdf':
            return self.extract_text_from_pdf(file_path)
        elif ext == 'docx':
            return self.extract_text_from_docx(file_path)
        elif ext == 'txt':
            return self.extract_text_from_txt(file_path)
        elif ext in ['png', 'jpg', 'jpeg']:
            return self.extract_text_from_image(file_path)
        else:
            return ""

    def add_document_to_vector_store(self, conversation_id: str, text: str):
        if conversation_id not in self.documents:
            self.documents[conversation_id] = text
        else:
            self.documents[conversation_id] += "\n" + text

    def remove_conversation(self, conversation_id: str):
        self.documents.pop(conversation_id, None)

    def _call_groq(self, system_prompt: str, user_prompt: str) -> str:
        if not self.client:
            return "GROQ_API_KEY not set. Please configure your API key."
        
        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="llama3-8b-8192",
                temperature=0.7
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            print(f"Error calling Groq: {e}")
            return f"Error: {str(e)}"

    def chat(self, conversation_id: str, question: str) -> str:
        if conversation_id not in self.documents:
            return "Please upload some documents first to start asking questions!"
        
        context = self.documents[conversation_id]
        system_prompt = "You are a helpful study assistant. Answer the user's question based only on the provided context. If the answer isn't in the context, say so clearly."
        user_prompt = f"Context:\n{context}\n\nQuestion: {question}"
        
        return self._call_groq(system_prompt, user_prompt)

    def generate_flashcards(self, conversation_id: str, topic: Optional[str] = None) -> List[Dict[str, str]]:
        if conversation_id not in self.documents:
            return []
        
        context = self.documents[conversation_id]
        system_prompt = "You are a study assistant. Generate 5 flashcards from the provided context. Return ONLY a JSON array of objects with 'question' and 'answer' fields, no extra text."
        user_prompt = f"Context:\n{context}\n\nGenerate flashcards."
        
        response = self._call_groq(system_prompt, user_prompt)
        try:
            return json.loads(response)
        except:
            # Fallback if JSON parsing fails
            return [{"question": "What is the document about?", "answer": "Please see the document content."}]

    def generate_quiz(self, conversation_id: str, topic: Optional[str] = None) -> List[Dict[str, Any]]:
        if conversation_id not in self.documents:
            return []
        
        context = self.documents[conversation_id]
        system_prompt = "You are a study assistant. Generate a 5-question multiple-choice quiz from the provided context. Return ONLY a JSON array of objects with 'question', 'options' (array of 4 options like ['A) ...', 'B) ...', etc.]), and 'correct_answer' (the letter like 'A') fields, no extra text."
        user_prompt = f"Context:\n{context}\n\nGenerate quiz."
        
        response = self._call_groq(system_prompt, user_prompt)
        try:
            return json.loads(response)
        except:
            return [
                {
                    "question": "Sample question?",
                    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                    "correct_answer": "A"
                }
            ]

    def generate_summary(self, conversation_id: str, topic: Optional[str] = None) -> str:
        if conversation_id not in self.documents:
            return "No document to summarize!"
        
        context = self.documents[conversation_id]
        system_prompt = "You are a study assistant. Generate a comprehensive summary of the provided context."
        user_prompt = f"Context:\n{context}\n\nGenerate summary."
        
        return self._call_groq(system_prompt, user_prompt)

    def generate_key_points(self, conversation_id: str, topic: Optional[str] = None) -> str:
        if conversation_id not in self.documents:
            return "No document to extract key points from!"
        
        context = self.documents[conversation_id]
        system_prompt = "You are a study assistant. Extract the key points from the provided context as a bulleted list."
        user_prompt = f"Context:\n{context}\n\nExtract key points."
        
        return self._call_groq(system_prompt, user_prompt)

    def explain_simply(self, conversation_id: str, topic: Optional[str] = None) -> str:
        if conversation_id not in self.documents:
            return "No document to explain!"
        
        context = self.documents[conversation_id]
        system_prompt = "You are a study assistant. Explain the content of the provided context in simple, easy-to-understand language for a beginner."
        user_prompt = f"Context:\n{context}\n\nExplain simply."
        
        return self._call_groq(system_prompt, user_prompt)


rag_system = RAGSystem()

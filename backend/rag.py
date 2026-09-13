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
        self.reader = None
        self._active_model: Optional[str] = None

    def _resolve_model(self, force_refresh: bool = False) -> str:
        if self._active_model and not force_refresh:
            return self._active_model

        env_model = os.getenv("GROQ_MODEL")
        # List of preferred models in order of quality & capability
        candidates = [
            env_model,
            "groq/compound-mini",
            "qwen/qwen3.8-27b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "groq/compound",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ]
        candidates = [c for c in candidates if c]

        try:
            if self.client:
                available = [m.id for m in self.client.models.list().data]
                for c in candidates:
                    if c in available:
                        self._active_model = c
                        print(f"Active Groq model resolved to: {self._active_model}")
                        return self._active_model
                if available:
                    self._active_model = available[0]
                    print(f"Fallback to first available Groq model: {self._active_model}")
                    return self._active_model
        except Exception as e:
            print(f"Warning: Could not fetch models from Groq API: {e}")

        self._active_model = env_model or "groq/compound-mini"
        return self._active_model

    def _call_completion(self, messages: List[Dict[str, str]], temperature: float = 0.7) -> str:
        if not self.client:
            return "GROQ_API_KEY not set. Please configure your API key."

        model = self._resolve_model()
        try:
            chat_completion = self.client.chat.completions.create(
                messages=messages,
                model=model,
                temperature=temperature
            )
            return chat_completion.choices[0].message.content or ""
        except Exception as e:
            err_msg = str(e)
            if "model_not_found" in err_msg or "404" in err_msg or "does not exist" in err_msg:
                print(f"Model {model} failed with: {err_msg}. Resolving alternate model...")
                model = self._resolve_model(force_refresh=True)
                try:
                    chat_completion = self.client.chat.completions.create(
                        messages=messages,
                        model=model,
                        temperature=temperature
                    )
                    return chat_completion.choices[0].message.content or ""
                except Exception as retry_err:
                    print(f"Retry with {model} also failed: {retry_err}")
                    return f"Error: {str(retry_err)}"

            print(f"Error calling Groq: {e}")
            return f"Error: {str(e)}"

    def _parse_json(self, text: str) -> Any:
        cleaned = text.strip()
        if "```" in cleaned:
            parts = cleaned.split("```")
            for p in parts:
                p_clean = p.strip()
                if p_clean.startswith("json"):
                    p_clean = p_clean[4:].strip()
                if (p_clean.startswith("[") and p_clean.endswith("]")) or (p_clean.startswith("{") and p_clean.endswith("}")):
                    cleaned = p_clean
                    break

        start_sq = cleaned.find('[')
        start_cu = cleaned.find('{')
        starts = [s for s in [start_sq, start_cu] if s != -1]
        start = min(starts) if starts else 0

        end_sq = cleaned.rfind(']')
        end_cu = cleaned.rfind('}')
        ends = [e for e in [end_sq, end_cu] if e != -1]
        end = max(ends) if ends else len(cleaned) - 1

        target = cleaned[start:end+1]
        return json.loads(target)

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

    def _call_groq(self, system_prompt: str, user_prompt: str) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        return self._call_completion(messages)

    def chat(self, context: str, question: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        if not context:
            return "Please upload some documents first to start asking questions!"
        if not self.client:
            return "GROQ_API_KEY not set. Please configure your API key."

        system_prompt = (
            "You are a helpful study assistant. Answer the user's questions based only on the "
            f"following context. If the answer isn't in the context, say so clearly.\n\nContext:\n{context}"
        )
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": question})

        return self._call_completion(messages)

    def generate_flashcards(self, context: str, topic: Optional[str] = None) -> List[Dict[str, str]]:
        if not context:
            return []

        system_prompt = "You are a study assistant. Generate 5 flashcards from the provided context. Return ONLY a JSON array of objects with 'question' and 'answer' fields, no extra text."
        user_prompt = f"Context:\n{context}\n\nGenerate flashcards."

        response = self._call_groq(system_prompt, user_prompt)
        try:
            return self._parse_json(response)
        except Exception as e:
            print(f"Error parsing flashcards JSON: {e}, raw response: {response}")
            return [{"question": "What is the document about?", "answer": "Please see the document content."}]

    def generate_quiz(self, context: str, topic: Optional[str] = None) -> List[Dict[str, Any]]:
        if not context:
            return []

        system_prompt = "You are a study assistant. Generate a 5-question multiple-choice quiz from the provided context. Return ONLY a JSON array of objects with 'question', 'options' (array of 4 options like ['A) ...', 'B) ...', etc.]), and 'correct_answer' (the letter like 'A') fields, no extra text."
        user_prompt = f"Context:\n{context}\n\nGenerate quiz."

        response = self._call_groq(system_prompt, user_prompt)
        try:
            return self._parse_json(response)
        except Exception as e:
            print(f"Error parsing quiz JSON: {e}, raw response: {response}")
            return [
                {
                    "question": "Sample question?",
                    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                    "correct_answer": "A"
                }
            ]

    def generate_summary(self, context: str, topic: Optional[str] = None) -> str:
        if not context:
            return "No document to summarize!"

        system_prompt = "You are a study assistant. Generate a comprehensive summary of the provided context."
        user_prompt = f"Context:\n{context}\n\nGenerate summary."

        return self._call_groq(system_prompt, user_prompt)

    def generate_key_points(self, context: str, topic: Optional[str] = None) -> str:
        if not context:
            return "No document to extract key points from!"

        system_prompt = "You are a study assistant. Extract the key points from the provided context as a bulleted list."
        user_prompt = f"Context:\n{context}\n\nExtract key points."

        return self._call_groq(system_prompt, user_prompt)

    def explain_simply(self, context: str, topic: Optional[str] = None) -> str:
        if not context:
            return "No document to explain!"

        system_prompt = "You are a study assistant. Explain the content of the provided context in simple, easy-to-understand language for a beginner."
        user_prompt = f"Context:\n{context}\n\nExplain simply."

        return self._call_groq(system_prompt, user_prompt)


rag_system = RAGSystem()

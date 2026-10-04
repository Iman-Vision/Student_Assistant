import json
import os
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import docx
import numpy as np
import PyPDF2
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

INDEX_PATH = DATA_DIR / "faiss.index"
META_PATH  = DATA_DIR / "faiss_meta.pkl"

CHUNK_SIZE    = 500
CHUNK_OVERLAP = 100
TOP_K         = 5



def _load_faiss():
    import faiss
    return faiss


def _load_encoder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


class RAGSystem:
    def __init__(self):
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.groq_api_key) if self.groq_api_key else None
        self.reader = None
        self._active_model: Optional[str] = None

        self._encoder = None
        self._faiss_index = None
        self._chunks: List[str] = []
        self._chunk_meta: List[Dict] = []

        self._load_index()



    def _get_encoder(self):
        if self._encoder is None:
            print("Loading sentence-transformer model…")
            self._encoder = _load_encoder()
        return self._encoder

    def _init_index(self, dim: int):
        faiss = _load_faiss()
        return faiss.IndexFlatIP(dim)

    def _embed(self, texts: List[str]) -> np.ndarray:
        enc = self._get_encoder()
        vecs = enc.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return vecs.astype("float32")

    def _load_index(self):
        """Load persisted FAISS index + metadata from disk (survives Docker restarts)."""
        try:
            faiss = _load_faiss()
            if INDEX_PATH.exists() and META_PATH.exists():
                self._faiss_index = faiss.read_index(str(INDEX_PATH))
                with open(META_PATH, "rb") as f:
                    payload = pickle.load(f)
                self._chunks     = payload["chunks"]
                self._chunk_meta = payload["meta"]
                print(f"FAISS index loaded: {self._faiss_index.ntotal} vectors from {INDEX_PATH}")
        except Exception as e:
            print(f"Could not load FAISS index (will rebuild on next upload): {e}")
            self._faiss_index = None
            self._chunks = []
            self._chunk_meta = []

    def _save_index(self):
        """Persist the FAISS index + metadata to disk."""
        try:
            faiss = _load_faiss()
            faiss.write_index(self._faiss_index, str(INDEX_PATH))
            with open(META_PATH, "wb") as f:
                pickle.dump({"chunks": self._chunks, "meta": self._chunk_meta}, f)
            print(f"FAISS index saved: {self._faiss_index.ntotal} vectors → {INDEX_PATH}")
        except Exception as e:
            print(f"Warning: could not save FAISS index: {e}")



    def index_document(self, text: str, conversation_id: str, filename: str):
        """Chunk a document and add it to the persistent FAISS index."""
        if not text.strip():
            return
        try:
            chunks = self._chunk_text(text)
            vecs   = self._embed(chunks)
            dim    = vecs.shape[1]

            if self._faiss_index is None:
                self._faiss_index = self._init_index(dim)

            self._faiss_index.add(vecs)
            start = len(self._chunks)
            self._chunks.extend(chunks)
            self._chunk_meta.extend(
                {"conversation_id": conversation_id, "filename": filename, "chunk_idx": start + i}
                for i in range(len(chunks))
            )
            self._save_index()
            print(f"Indexed {len(chunks)} chunks from '{filename}' (conv: {conversation_id})")
        except Exception as e:
            print(f"FAISS indexing error for '{filename}': {e}")

    def remove_document(self, conversation_id: str, filename: str):
        """Remove all chunks for a given file from the in-memory index, then re-save."""
        if self._faiss_index is None or not self._chunks:
            return
        try:
            keep_mask   = [
                m["conversation_id"] != conversation_id or m["filename"] != filename
                for m in self._chunk_meta
            ]
            kept_chunks = [c for c, k in zip(self._chunks, keep_mask) if k]
            kept_meta   = [m for m, k in zip(self._chunk_meta, keep_mask) if k]

            if not kept_chunks:
                self._faiss_index = None
                self._chunks = []
                self._chunk_meta = []
                if INDEX_PATH.exists():
                    INDEX_PATH.unlink()
                if META_PATH.exists():
                    META_PATH.unlink()
                return


            vecs = self._embed(kept_chunks)
            dim  = vecs.shape[1]
            self._faiss_index = self._init_index(dim)
            self._faiss_index.add(vecs)
            self._chunks     = kept_chunks
            self._chunk_meta = kept_meta
            for i, m in enumerate(self._chunk_meta):
                m["chunk_idx"] = i
            self._save_index()
            print(f"Removed chunks for '{filename}' from FAISS index.")
        except Exception as e:
            print(f"FAISS remove error: {e}")

    def retrieve(self, query: str, conversation_id: str, k: int = TOP_K) -> str:
        """Retrieve the top-k most relevant chunks for a query within a conversation."""
        if self._faiss_index is None or self._faiss_index.ntotal == 0:
            return ""
        try:
            q_vec    = self._embed([query])
            search_k = min(k * 10, self._faiss_index.ntotal)
            scores, indices = self._faiss_index.search(q_vec, search_k)

            results: List[Tuple[float, str]] = []
            for score, idx in zip(scores[0], indices[0]):
                if idx < 0 or idx >= len(self._chunk_meta):
                    continue
                meta = self._chunk_meta[idx]
                if meta["conversation_id"] == conversation_id:
                    results.append((float(score), self._chunks[idx]))
                    if len(results) >= k:
                        break

            if not results:
                return ""
            return "\n\n---\n\n".join(chunk for _, chunk in results)
        except Exception as e:
            print(f"FAISS retrieve error: {e}")
            return ""



    @staticmethod
    def _chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
        chunks = []
        start  = 0
        while start < len(text):
            end = start + size
            chunks.append(text[start:end])
            start += size - overlap
        return [c.strip() for c in chunks if c.strip()]



    def _resolve_model(self, force_refresh: bool = False) -> str:
        if self._active_model and not force_refresh:
            return self._active_model

        env_model = os.getenv("GROQ_MODEL")

        candidates = [
            env_model,
            "llama-3.3-70b-versatile",
            "groq/compound-mini",
            "qwen/qwen3.8-27b",
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
            {"role": "user",   "content": user_prompt}
        ]
        return self._call_completion(messages)



    def chat(
        self,
        context: str,
        question: str,
        history: Optional[List[Dict[str, str]]] = None,
        conversation_id: Optional[str] = None,
    ) -> str:
        if not context and (not conversation_id or self._faiss_index is None):
            return "Please upload some documents first to start asking questions!"
        if not self.client:
            return "GROQ_API_KEY not set. Please configure your API key."


        if conversation_id and self._faiss_index and self._faiss_index.ntotal > 0:
            retrieved = self.retrieve(question, conversation_id)
            effective_context = retrieved if retrieved else context
        else:
            effective_context = context

        system_prompt = (
            "You are a helpful study assistant. Answer the user's questions based only on the "
            "following context. If the answer isn't in the context, say so clearly.\n\n"
            "Formatting Guidelines:\n"
            "- When comparing items, listing structured data, or summarizing specs/metrics, format them using clean Markdown tables with header rows.\n"
            "- When asked to draw or display a chart, graph, workflow, or diagram, use Mermaid code blocks (```mermaid ... ```) such as pie charts, xychart-beta (bar/line charts), flowchart, or sequenceDiagram, or clean Markdown tables.\n\n"
            f"Context:\n{effective_context}"
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
        user_prompt   = f"Context:\n{context}\n\nGenerate flashcards."

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
        user_prompt   = f"Context:\n{context}\n\nGenerate quiz."

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
        user_prompt   = f"Context:\n{context}\n\nGenerate summary."
        return self._call_groq(system_prompt, user_prompt)

    def generate_key_points(self, context: str, topic: Optional[str] = None) -> str:
        if not context:
            return "No document to extract key points from!"

        system_prompt = "You are a study assistant. Extract the key points from the provided context as a bulleted list."
        user_prompt   = f"Context:\n{context}\n\nExtract key points."
        return self._call_groq(system_prompt, user_prompt)

    def explain_simply(self, context: str, topic: Optional[str] = None) -> str:
        if not context:
            return "No document to explain!"

        system_prompt = "You are a study assistant. Explain the content of the provided context in simple, easy-to-understand language for a beginner."
        user_prompt   = f"Context:\n{context}\n\nExplain simply."
        return self._call_groq(system_prompt, user_prompt)


rag_system = RAGSystem()

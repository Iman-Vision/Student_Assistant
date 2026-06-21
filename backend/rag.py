import os
import tempfile
import fitz
import docx
import easyocr
import numpy as np
from typing import List, Dict, Any, Optional
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from dotenv import load_dotenv

load_dotenv()


class RAGSystem:
    def __init__(self):
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.vector_stores: Dict[str, FAISS] = {}
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        self.llm = ChatGroq(
            model_name="llama-3.1-70b-versatile",
            temperature=0.7,
            groq_api_key=self.groq_api_key
        )
        self.reader = easyocr.Reader(['en'], gpu=False)

    def extract_text_from_pdf(self, file_path: str) -> str:
        doc = fitz.open(file_path)
        text = ""
        for page in doc:
            text += page.get_text()
        return text

    def extract_text_from_docx(self, file_path: str) -> str:
        doc = docx.Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])

    def extract_text_from_txt(self, file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    def extract_text_from_image(self, file_path: str) -> str:
        result = self.reader.readtext(file_path)
        return "\n".join([text for (bbox, text, prob) in result])

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
        chunks = self.text_splitter.split_text(text)
        if conversation_id not in self.vector_stores:
            self.vector_stores[conversation_id] = FAISS.from_texts(
                chunks,
                embedding=self.embeddings
            )
        else:
            self.vector_stores[conversation_id].add_texts(chunks)

    def get_qa_chain(self, conversation_id: str) -> Optional[RetrievalQA]:
        if conversation_id not in self.vector_stores:
            return None

        prompt_template = """Use the following pieces of context to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer.

        {context}

        Question: {question}
        Helpful Answer:"""

        prompt = PromptTemplate(
            template=prompt_template,
            input_variables=["context", "question"]
        )

        return RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.vector_stores[conversation_id].as_retriever(search_kwargs={"k": 4}),
            chain_type_kwargs={"prompt": prompt}
        )

    def chat(self, conversation_id: str, question: str) -> str:
        qa_chain = self.get_qa_chain(conversation_id)
        if qa_chain:
            result = qa_chain.invoke({"query": question})
            return result["result"]
        else:
            return "Please upload some documents first to start asking questions!"

    def generate_flashcards(self, conversation_id: str, topic: Optional[str] = None) -> List[Dict[str, str]]:
        prompt = """Generate 5 flashcards based on the provided context. Each flashcard should have a 'question' and 'answer' field.
        Format the output as a JSON array of objects with 'question' and 'answer' keys.
        Example: [{"question": "What is X?", "answer": "Y"}]
        """
        if conversation_id in self.vector_stores:
            docs = self.vector_stores[conversation_id].similarity_search(topic or "key concepts", k=5)
            context = "\n".join([doc.page_content for doc in docs])
            full_prompt = f"{prompt}\n\nContext: {context}"
        else:
            full_prompt = f"{prompt}\n\nTopic: {topic if topic else 'general study'}"

        try:
            response = self.llm.invoke(full_prompt)
            import json
            return json.loads(response.content)
        except Exception:
            return [
                {"question": "Sample Question 1?", "answer": "Sample Answer 1"},
                {"question": "Sample Question 2?", "answer": "Sample Answer 2"}
            ]

    def generate_quiz(self, conversation_id: str, topic: Optional[str] = None) -> List[Dict[str, Any]]:
        prompt = """Generate a 5-question multiple-choice quiz based on the provided context. Each question should have:
        - 'question': The question text
        - 'options': Array of 4 options (A, B, C, D)
        - 'correct_answer': The correct option (A, B, C, or D)
        Format the output as a JSON array.
        """
        if conversation_id in self.vector_stores:
            docs = self.vector_stores[conversation_id].similarity_search(topic or "key concepts", k=5)
            context = "\n".join([doc.page_content for doc in docs])
            full_prompt = f"{prompt}\n\nContext: {context}"
        else:
            full_prompt = f"{prompt}\n\nTopic: {topic if topic else 'general study'}"

        try:
            response = self.llm.invoke(full_prompt)
            import json
            return json.loads(response.content)
        except Exception:
            return [
                {
                    "question": "Sample Quiz Question?",
                    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                    "correct_answer": "A"
                }
            ]

    def generate_summary(self, conversation_id: str, topic: Optional[str] = None) -> str:
        prompt = """Generate a comprehensive summary of the provided context. Include key points, main ideas, and important concepts."""
        if conversation_id in self.vector_stores:
            docs = self.vector_stores[conversation_id].similarity_search(topic or "summary", k=10)
            context = "\n".join([doc.page_content for doc in docs])
            full_prompt = f"{prompt}\n\nContext: {context}"
        else:
            full_prompt = f"{prompt}\n\nTopic: {topic if topic else 'general study'}"

        response = self.llm.invoke(full_prompt)
        return response.content


rag_system = RAGSystem()

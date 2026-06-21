import sqlite3
import uuid
from datetime import datetime
from typing import List, Optional
from models import Conversation, Message


class Database:
    def __init__(self, db_path: str = "docsage.db"):
        self.db_path = db_path
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                display_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
        """)

        conn.commit()
        conn.close()

    def create_user(self, email: str, display_name: Optional[str] = None):
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO users (email, display_name) VALUES (?, ?)",
                (email, display_name)
            )
            conn.commit()
        finally:
            conn.close()

    def get_conversations(self, user_email: str) -> List[Conversation]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM conversations WHERE user_email = ? ORDER BY created_at DESC",
            (user_email,)
        )
        rows = cursor.fetchall()
        conn.close()

        convs = []
        for row in rows:
            convs.append(
                Conversation(
                    id=row["id"],
                    user_email=row["user_email"],
                    title=row["title"],
                    created_at=datetime.fromisoformat(row["created_at"])
                )
            )
        return convs

    def create_conversation(self, user_email: str, title: str) -> Conversation:
        conv_id = str(uuid.uuid4())
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (id, user_email, title) VALUES (?, ?, ?)",
            (conv_id, user_email, title)
        )
        conn.commit()
        conn.close()

        return Conversation(id=conv_id, user_email=user_email, title=title)

    def delete_conversation(self, user_email: str, conversation_id: str):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM conversations WHERE id = ? AND user_email = ?",
            (conversation_id, user_email)
        )
        conn.commit()
        conn.close()

    def get_messages(self, conversation_id: str) -> List[Message]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
            (conversation_id,)
        )
        rows = cursor.fetchall()
        conn.close()

        msgs = []
        for row in rows:
            msgs.append(
                Message(
                    id=row["id"],
                    role=row["role"],
                    content=row["content"],
                    timestamp=datetime.fromisoformat(row["timestamp"])
                )
            )
        return msgs

    def add_message(self, conversation_id: str, role: str, content: str) -> Message:
        msg_id = str(uuid.uuid4())
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
            (msg_id, conversation_id, role, content)
        )
        conn.commit()
        conn.close()

        return Message(id=msg_id, role=role, content=content, timestamp=datetime.now())

    def add_file(self, user_email: str, conversation_id: str, filename: str, file_path: str):
        file_id = str(uuid.uuid4())
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO files (id, user_email, conversation_id, filename, file_path) VALUES (?, ?, ?, ?, ?)",
            (file_id, user_email, conversation_id, filename, file_path)
        )
        conn.commit()
        conn.close()

    def get_files(self, user_email: str, conversation_id: str) -> List[dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM files WHERE user_email = ? AND conversation_id = ? ORDER BY uploaded_at DESC",
            (user_email, conversation_id)
        )
        rows = cursor.fetchall()
        conn.close()

        files = []
        for row in rows:
            files.append({
                "id": row["id"],
                "filename": row["filename"],
                "uploaded_at": row["uploaded_at"]
            })
        return files

    def delete_file(self, user_email: str, conversation_id: str, filename: str):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM files WHERE user_email = ? AND conversation_id = ? AND filename = ?",
            (user_email, conversation_id, filename)
        )
        conn.commit()
        conn.close()


db = Database()

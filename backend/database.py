import sqlite3
import uuid
from datetime import datetime
from typing import List, Optional


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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
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
                conversation_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content TEXT DEFAULT '',
                chunks INTEGER DEFAULT 0,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
        """)

        cursor.execute("PRAGMA table_info(files)")
        existing_columns = {row["name"] for row in cursor.fetchall()}
        if "content" not in existing_columns:
            cursor.execute("ALTER TABLE files ADD COLUMN content TEXT DEFAULT ''")

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

    def get_conversations(self, user_email: str) -> List[dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE user_email = ? ORDER BY created_at DESC",
            (user_email,)
        )
        rows = cursor.fetchall()
        conn.close()

        convs = []
        for row in rows:
            convs.append({
                "id": row["id"],
                "title": row["title"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            })
        return convs

    def create_conversation(self, user_email: str, title: str) -> dict:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (user_email, title) VALUES (?, ?)",
            (user_email, title)
        )
        conv_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return {"id": conv_id, "title": title, "created_at": datetime.now().isoformat(), "updated_at": datetime.now().isoformat()}

    def delete_conversation(self, user_email: str, conversation_id: str):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM messages WHERE conversation_id = ?",
            (int(conversation_id),)
        )
        cursor.execute(
            "DELETE FROM files WHERE conversation_id = ? AND user_email = ?",
            (int(conversation_id), user_email)
        )
        cursor.execute(
            "DELETE FROM conversations WHERE id = ? AND user_email = ?",
            (int(conversation_id), user_email)
        )
        conn.commit()
        conn.close()

    def conversation_owner(self, conversation_id: str) -> Optional[str]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_email FROM conversations WHERE id = ?",
            (int(conversation_id),)
        )
        row = cursor.fetchone()
        conn.close()
        return row["user_email"] if row else None

    def get_messages(self, conversation_id: str) -> dict:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
            (int(conversation_id),)
        )
        rows = cursor.fetchall()
        conn.close()

        msgs = []
        for row in rows:
            msgs.append({
                "role": row["role"],
                "content": row["content"]
            })
        return {"messages": msgs}

    def add_message(self, conversation_id: str, role: str, content: str):
        msg_id = str(uuid.uuid4())
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
            (msg_id, int(conversation_id), role, content)
        )
        conn.commit()
        conn.close()

    def add_file(self, user_email: str, conversation_id: str, filename: str, file_path: str, content: str = ""):
        file_id = str(uuid.uuid4())
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO files (id, user_email, conversation_id, filename, file_path, content, chunks) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_id, user_email, int(conversation_id), filename, file_path, content, 1)
        )
        conn.commit()
        conn.close()

    def files_missing_content(self) -> List[dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, filename, file_path FROM files WHERE content IS NULL OR content = ''")
        rows = cursor.fetchall()
        conn.close()
        return [{"id": row["id"], "filename": row["filename"], "file_path": row["file_path"]} for row in rows]

    def update_file_content(self, file_id: str, content: str):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE files SET content = ? WHERE id = ?", (content, file_id))
        conn.commit()
        conn.close()

    def get_document_text(self, conversation_id: str) -> str:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT content FROM files WHERE conversation_id = ? ORDER BY uploaded_at ASC",
            (int(conversation_id),)
        )
        rows = cursor.fetchall()
        conn.close()
        return "\n".join(row["content"] for row in rows if row["content"])

    def get_files(self, user_email: str, conversation_id: str) -> dict:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT filename, chunks, uploaded_at FROM files WHERE user_email = ? AND conversation_id = ? ORDER BY uploaded_at DESC",
            (user_email, int(conversation_id))
        )
        rows = cursor.fetchall()
        conn.close()

        files = []
        total_chunks = 0
        for row in rows:
            files.append({
                "filename": row["filename"],
                "chunks": row["chunks"],
                "uploaded_at": row["uploaded_at"]
            })
            total_chunks += row["chunks"]
        return {"files": files, "total_chunks": total_chunks}

    def delete_file(self, user_email: str, conversation_id: str, filename: str) -> Optional[str]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT file_path FROM files WHERE user_email = ? AND conversation_id = ? AND filename = ?",
            (user_email, int(conversation_id), filename)
        )
        row = cursor.fetchone()
        cursor.execute(
            "DELETE FROM files WHERE user_email = ? AND conversation_id = ? AND filename = ?",
            (user_email, int(conversation_id), filename)
        )
        conn.commit()
        conn.close()
        return row["file_path"] if row else None

    def file_paths_for_conversation(self, conversation_id: str) -> List[str]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT file_path FROM files WHERE conversation_id = ?",
            (int(conversation_id),)
        )
        rows = cursor.fetchall()
        conn.close()
        return [row["file_path"] for row in rows]


db = Database()

import os
from fastapi import HTTPException, Header, Depends
from firebase_admin import credentials, initialize_app, auth
from dotenv import load_dotenv

load_dotenv()

try:
    cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json"))
    initialize_app(cred)
except Exception:
    pass


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.split(" ")[1]
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
import os
import jwt
from fastapi import Header, HTTPException

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")


async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email claim")

    name = (payload.get("user_metadata") or {}).get("full_name") or email.split("@")[0]
    return {"email": email, "name": name}

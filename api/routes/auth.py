"""Akun: GET /auth/me dan POST /auth/logout.

Daftar, masuk, dan penyegaran token dilakukan frontend langsung ke Supabase Auth; API hanya
memverifikasi access token (lihat core/auth.py)."""

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from core.auth import CurrentUser, current_user
from core.session import clear_session_cookie

router = APIRouter(prefix="/auth", tags=["auth"])


class MeOut(BaseModel):
    id: str
    email: str
    role: str  # 'user' | 'admin'


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser = Depends(current_user)) -> MeOut:
    return MeOut(id=user.id, email=user.email, role=user.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    """Lupakan cookie sesi latihan di browser ini (sesi & progresnya tetap milik akun).
    Token Supabase dicabut frontend lewat supabase.auth.signOut()."""
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_session_cookie(response)
    return response

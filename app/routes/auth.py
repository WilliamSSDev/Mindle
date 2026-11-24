from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.auth import (
    ALGORITHM,
    SECRET_KEY,
    authenticate_user,
    bcrypt_context,
    create_token,
)
from app.dependencies import get_session, verify_token
from app.models import User
from app.schemas import UserLogin, UserRegister, UserResponse
from app.utils import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_token_cookies(
    response: Response, access_token: str, refresh_token: str
) -> None:
    for name, token in (
        ("access_token", access_token),
        ("refresh_token", refresh_token),
    ):
        response.set_cookie(
            key=name,
            value=token,
            httponly=True,
            secure=False,  # Local development uses HTTP.
            samesite="lax",
            path="/",
        )


@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    user_data: UserRegister,
    session: Session = Depends(get_session),
):
    existing_user = session.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already registered.",
        )

    user = User(
        name=user_data.name,
        email=user_data.email,
        password=bcrypt_context.hash(user_data.password),
        admin=user_data.email == "admin@example.com",
    )
    session.add(user)
    session.commit()
    return user


@router.post("/login")
@limiter.limit("5/minute")
async def login_user(
    request: Request,
    credentials: UserLogin,
    session: Session = Depends(get_session),
):
    user = authenticate_user(credentials.email, credentials.password, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    access_token = create_token(user.id)
    refresh_token = create_token(user.id, timedelta(days=7))
    response = JSONResponse(
        content={"message": "Login successful", "bearer_token": access_token}
    )
    _set_token_cookies(response, access_token, refresh_token)
    return response


@router.post("/login-form")
async def login_with_form(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = authenticate_user(form_data.username, form_data.password, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    access_token = create_token(user.id)
    refresh_token = create_token(user.id, timedelta(days=7))
    _set_token_cookies(response, access_token, refresh_token)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer ",
    }


@router.post("/refresh")
@limiter.limit("5/minute")
async def refresh_access_token(
    response: Response,
    request: Request,
    session: Session = Depends(get_session),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh token missing."
        )

    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token"
        )

    user = session.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    access_token = create_token(user.id, timedelta(minutes=30))
    response.set_cookie(key="access_token", value=access_token, httponly=True)
    return {"access_token": access_token, "authenticated": True}


@router.post("/protected")
async def check_authentication(
    request: Request, current_user: User = Depends(verify_token)
):
    if not request.cookies.get("access_token"):
        return {"error": "not authenticated", "authenticated": False}
    return {"message": "you are authenticated", "authenticated": True}


@router.post("/logout")
async def logout_user(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}

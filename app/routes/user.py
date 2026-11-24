from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.DTOs.UserResponseDTO import UserResponseDTO
from app.dependencies import get_session, verify_token
from app.models import User

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/me", response_model=UserResponseDTO)
async def get_current_user(current_user: User = Depends(verify_token)):
    return UserResponseDTO(
        id=current_user.id,
        nome=current_user.name,
        email=current_user.email,
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    if not current_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )

    user = session.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    if user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin users cannot be deleted.",
        )

    session.delete(user)
    session.commit()
    return {"message": f"Deleted user {user.id} from database."}

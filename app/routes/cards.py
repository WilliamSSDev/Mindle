import csv
import io
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_session, verify_token
from app.models import Card, Difficulty, ReviewLog, User, get_next_review
from app.schemas import Card as CardCreate
from app.services.deck_service import get_owned_deck
from app.services.review_stats import (
    get_correct_today,
    get_current_streak,
    get_reviewed_days,
    get_studied_today,
)
from app.utils import sanitize_card_content

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cards", tags=["cards"])


def _clean_anki_content(content: str) -> str:
    content = re.sub(r"\[sound:[^\]]+\]", "", content)
    content = content.replace("<div>", "").replace("</div>", "\n")
    content = re.sub(r"<[^>]+>", "", content).strip()
    return sanitize_card_content(content)


@router.post("/update_card")
def review_card(
    difficulty: Difficulty,
    card_id: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    card = session.query(Card).filter_by(id=card_id).first()

    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card was not found",
        )

    if card.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized to modify this card.",
        )

    now_utc = datetime.now(timezone.utc)
    card.review_count += 1
    card.last_reviewed = now_utc
    card.next_review = get_next_review(difficulty)
    card.difficulty = difficulty.value

    log_entry = ReviewLog(
        user_id=current_user.id,
        card_id=card_id,
        rating=difficulty.value,
    )
    session.add(log_entry)

    try:
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to save card review")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao salvar os dados no servidor.",
        )

    return {
        "message": "Card updated successfully.",
        "stats": {"current_streak": current_user.current_streak},
    }


@router.post("/import_anki")
async def import_anki_cards(
    file: UploadFile = File(...),
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.endswith((".txt", ".csv")):
        raise HTTPException(status_code=400, detail="Formato de arquivo inválido.")

    try:
        contents = await file.read()
        text_content = contents.decode("utf-8")
        buffer = io.StringIO(text_content)
        reader = csv.reader(buffer, delimiter="\t")

        cards_to_import = []
        now_utc = datetime.now(timezone.utc)

        for row in reader:
            if len(row) < 2 or row[0].startswith("#"):
                continue

            front_content = _clean_anki_content(row[0])
            back_content = _clean_anki_content(row[1])
            if not front_content and not back_content:
                continue

            # Preserve the existing import destination; validate it once per file.
            if not cards_to_import:
                get_owned_deck(1, current_user.id, session)

            card = Card(
                front_content=front_content,
                back_content=back_content,
                user_id=current_user.id,
                created_at=now_utc,
                next_review=now_utc,
                last_reviewed=now_utc,
                difficulty=Difficulty.MEDIUM.value,
                interval=0,
                review_count=0,
                deck_id=1,
            )
            cards_to_import.append(card)

        if not cards_to_import:
            raise HTTPException(status_code=400, detail="Nenhum card válido após a limpeza.")

        session.add_all(cards_to_import)
        session.commit()

        return {"message": f"{len(cards_to_import)} cartas limpas e importadas com sucesso!"}

    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        logger.exception("Failed to import Anki cards")
        raise HTTPException(status_code=500, detail="Erro interno ao processar o arquivo.")


@router.post("/add_card")
def create_card(
    card_data: CardCreate,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    deck_id = card_data.deck_id
    if deck_id is not None:
        get_owned_deck(deck_id, current_user.id, session)

    front_content = sanitize_card_content(card_data.front_content)
    back_content = sanitize_card_content(card_data.back_content)
    if not front_content or not back_content:
        raise HTTPException(status_code=400, detail="Front e back são obrigatórios.")

    new_card = Card(
        front_content=front_content,
        back_content=back_content,
        next_review=datetime.now(timezone.utc),
        last_reviewed=datetime.now(timezone.utc),
        difficulty=Difficulty.EASY,
        interval=1,
        user_id=current_user.id,
        deck_id=deck_id,
    )

    session.add(new_card)
    session.commit()
    session.refresh(new_card)
    return {"message": "Flashcard criado com sucesso.", "card": new_card}


@router.get("/reviews_period")
async def get_review_activity(
    days_period: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    review_logs = await get_reviewed_days(days_period, session, current_user.id)

    review_counts: dict = {}
    try:
        for review_log in review_logs:
            review_date = review_log.reviewed_at.date()
            review_counts[review_date] = review_counts.get(review_date, 0) + 1
    except TypeError:
        logger.exception("Failed to process review logs")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao processar os logs de revisão.",
        )

    return review_counts


@router.get("/me")
async def get_card_stats(
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
) -> dict:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou não autenticado.",
        )

    try:
        total_cards = session.query(Card).filter(Card.user_id == current_user.id).count()

        studied_today = await get_studied_today(session, current_user.id)
        correct_answers_today = await get_correct_today(session, user_id=current_user.id)
        current_streak = await get_current_streak(session, current_user.id)

    except Exception:
        logger.exception("Failed to load card statistics")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar as estatísticas no servidor.",
        )

    return {
        "total_cards": total_cards,
        "studied_today": studied_today or 0,
        "correct_today": correct_answers_today or 0,
        "current_streak": current_streak or 0,
    }


@router.get("/pick_card")
def pick_card(
    deck_id: int | None = None,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    query = session.query(Card).filter_by(user_id=current_user.id)
    if deck_id is not None:
        query = query.filter(Card.deck_id == deck_id)
    cards = query.all()

    if not cards:
        raise HTTPException(404, detail="No cards were found")

    due_cards = [card for card in cards if card.next_review <= datetime.utcnow()]

    if not due_cards:
        return {
            "message": "No cards to review were found",
            "total_cards": len(cards),
            "card": None,
            "cards_to_review": 0,
        }

    next_card = min(due_cards, key=lambda card: card.next_review)

    return {
        "message": "successful",
        "total_cards": len(cards),
        "card": next_card,
        "cards_to_review": len(due_cards),
    }


@router.get("/{amount}")
def list_cards(
    amount: int,
    deck_id: int | None = None,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    query = session.query(Card).filter_by(user_id=current_user.id)
    if deck_id is not None:
        query = query.filter(Card.deck_id == deck_id)
    cards = query.all()

    if not cards:
        raise HTTPException(404, detail="No cards found")

    return {"cards": cards[:amount]}


@router.delete("/delete_card/{card_id}")
def delete_card(
    card_id: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    card = session.query(Card).filter_by(id=card_id).first()

    if not card:
        raise HTTPException(404, "Card was not found")

    if card.user_id != current_user.id:
        raise HTTPException(403, "Cant delete a card you do not own.")

    session.query(ReviewLog).filter(ReviewLog.card_id == card.id).delete(
        synchronize_session=False
    )
    session.delete(card)
    session.commit()

    return {"message": "Card has been deleted."}

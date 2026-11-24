from datetime import datetime, time, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Card, Deck, ReviewLog
from app.schemas import DeckResponse


def get_owned_deck(deck_id: int, user_id: int, session: Session) -> Deck:
    deck = session.query(Deck).filter(
        Deck.id == deck_id, Deck.user_id == user_id
    ).first()
    if not deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Deck não encontrado."
        )
    return deck


def serialize_deck(deck: Deck, session: Session, user_id: int) -> DeckResponse:
    cards = session.query(Card).filter(Card.deck_id == deck.id).all()
    today = datetime.combine(datetime.now(timezone.utc).date(), time.min)
    studied_card_ids = {
        review.card_id
        for review in session.query(ReviewLog).filter(
            ReviewLog.user_id == user_id,
            ReviewLog.reviewed_at >= today,
            ReviewLog.card_id.in_([card.id for card in cards]) if cards else False,
        ).all()
    }
    pending_cards = sum(
        1 for card in cards
        if card.next_review and card.next_review <= datetime.utcnow()
    )
    return DeckResponse(
        id=deck.id,
        name=deck.name,
        description=deck.description,
        total_cards=len(cards),
        pending_cards=pending_cards,
        studied_cards=len(studied_card_ids),
    )

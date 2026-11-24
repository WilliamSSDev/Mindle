from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_session, verify_token
from app.models import Card, Deck, User
from app.schemas import DeckCreate, DeckResponse
from app.services.deck_service import get_owned_deck, serialize_deck

router = APIRouter(prefix="/decks", tags=["decks"])


@router.post("/create", response_model=DeckResponse, status_code=status.HTTP_201_CREATED)
def create_deck(
    deck_data: DeckCreate,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    name = deck_data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome do deck é obrigatório.")

    deck = Deck(name=name, description=deck_data.description, user_id=current_user.id)
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return serialize_deck(deck, session, current_user.id)


@router.get("", response_model=list[DeckResponse])
def list_decks(
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    decks = (
        session.query(Deck)
        .filter(Deck.user_id == current_user.id)
        .order_by(Deck.created_at.desc())
        .all()
    )
    return [serialize_deck(deck, session, current_user.id) for deck in decks]


@router.get("/{deck_id}", response_model=DeckResponse)
def get_deck(
    deck_id: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    deck = get_owned_deck(deck_id, current_user.id, session)
    return serialize_deck(deck, session, current_user.id)


@router.get("/{deck_id}/cards")
def list_deck_cards(
    deck_id: int,
    current_user: User = Depends(verify_token),
    session: Session = Depends(get_session),
):
    deck = get_owned_deck(deck_id, current_user.id, session)
    cards = (
        session.query(Card)
        .filter(Card.deck_id == deck.id)
        .order_by(Card.created_at.desc())
        .all()
    )
    return {"deck": serialize_deck(deck, session, current_user.id), "cards": cards}

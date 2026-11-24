r"""Route regression checks using an isolated SQLite database.

Run with: .\venv\Scripts\python.exe -m unittest discover -s tests -v
"""

import asyncio
import io
import inspect
import json
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

# Set before importing the app so these checks never connect to the real database.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "route-test-secret"
os.environ["ALGORITHM"] = "HS256"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "30"

from fastapi import HTTPException, Request, Response, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.routing import Match

from app.main import app
from app.auth import create_token
from app.models import Base, Card, Deck, Difficulty, ReviewLog, User
from app.routes.auth import login_user, refresh_access_token
from app.routes.cards import (
    create_card,
    delete_card,
    import_anki_cards,
    list_cards,
    pick_card,
    review_card,
)
from app.routes.decks import get_deck
from app.routes.user import delete_user, get_current_user
from app.schemas import Card as CardCreate
from app.schemas import UserLogin


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User("Owner", "owner@example.com", "unused")
        self.other_user = User("Other", "other@example.com", "unused")
        self.session.add_all([self.user, self.other_user])
        self.session.flush()
        self.deck = Deck(name="Owned deck", user_id=self.user.id)
        self.session.add(self.deck)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def create_card(self, front="Question", back="Answer"):
        return create_card(
            CardCreate(
                front_content=front, back_content=back, deck_id=self.deck.id
            ),
            self.user,
            self.session,
        )["card"]

    def assert_http_error(self, status_code, function, *args):
        with self.assertRaises(HTTPException) as error:
            function(*args)
        self.assertEqual(error.exception.status_code, status_code)

    def test_card_creation_sanitizes_and_lists_owned_cards(self):
        card = self.create_card('<b onclick="bad()">Question</b>', "Answer")
        self.assertEqual(card.front_content, "<b>Question</b>")
        self.assertEqual(card.user_id, self.user.id)
        result = list_cards(10, self.deck.id, self.user, self.session)
        self.assertEqual([item.id for item in result["cards"]], [card.id])
        self.assert_http_error(
            404, list_cards, 10, None, self.other_user, self.session
        )

    def test_text_only_card_schema_defaults_to_no_deck(self):
        card_data = CardCreate(front_content="Question", back_content="Answer")
        self.assertIsNone(card_data.deck_id)
        self.assertNotIn("audio", CardCreate.model_fields)
        card = create_card(card_data, self.user, self.session)["card"]
        self.assertIsNone(card.deck_id)

    def test_deck_lookup_rejects_another_users_deck(self):
        self.assert_http_error(
            404, get_deck, self.deck.id, self.other_user, self.session
        )
        self.assert_http_error(
            404,
            create_card,
            CardCreate(front_content="Q", back_content="A", deck_id=self.deck.id),
            self.other_user,
            self.session,
        )

    def test_review_schedules_card_and_records_log(self):
        card = self.create_card()
        result = review_card(Difficulty.EASY, card.id, self.user, self.session)
        self.assertEqual(card.review_count, 1)
        self.assertGreater(card.next_review, datetime.utcnow() + timedelta(days=3))
        self.assertEqual(self.session.query(ReviewLog).count(), 1)
        self.assertIn("current_streak", result["stats"])

    def test_review_and_delete_reject_another_users_card(self):
        card = self.create_card()
        self.assert_http_error(
            401, review_card, Difficulty.EASY, card.id, self.other_user, self.session
        )
        self.assert_http_error(
            403, delete_card, card.id, self.other_user, self.session
        )
        self.assertEqual(self.session.query(ReviewLog).count(), 0)
        self.assertEqual(self.session.query(Card).count(), 1)

    def test_delete_removes_card_and_review_logs(self):
        card = self.create_card()
        review_card(Difficulty.EASY, card.id, self.user, self.session)
        delete_card(card.id, self.user, self.session)
        self.assertEqual(self.session.query(Card).count(), 0)
        self.assertEqual(self.session.query(ReviewLog).count(), 0)

    def test_pick_card_raises_404_for_empty_collection(self):
        self.assert_http_error(404, pick_card, None, self.user, self.session)

    def test_pick_card_selects_earliest_due_card(self):
        first = self.create_card("First")
        second = self.create_card("Second")
        first.next_review = datetime.utcnow() - timedelta(days=1)
        second.next_review = datetime.utcnow() - timedelta(days=2)
        self.session.commit()
        result = pick_card(None, self.user, self.session)
        self.assertEqual(result["card"].id, second.id)
        self.assertEqual(result["cards_to_review"], 2)

    def test_import_cleans_and_persists_card_content(self):
        upload = UploadFile(
            file=io.BytesIO(b"<div>Q & A</div>[sound:a.mp3]\t<b>Answer</b>\n"),
            filename="cards.txt",
        )
        asyncio.run(import_anki_cards(upload, self.user, self.session))
        card = self.session.query(Card).one()
        self.assertEqual(card.front_content, "Q &amp; A")
        self.assertEqual(card.back_content, "Answer")
        self.assertEqual(card.user_id, self.user.id)

    def test_import_preserves_validation_status_codes(self):
        for contents, user, expected_status in (
            (b"# comment\ninvalid row\n", self.user, 400),
            (b"Question\tAnswer\n", self.other_user, 404),
        ):
            with self.subTest(expected_status=expected_status):
                upload = UploadFile(file=io.BytesIO(contents), filename="cards.txt")
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(import_anki_cards(upload, user, self.session))
                self.assertEqual(error.exception.status_code, expected_status)
                self.assertEqual(self.session.query(Card).count(), 0)

    def test_user_profile_preserves_response_fields(self):
        profile = asyncio.run(get_current_user(self.user))
        self.assertEqual(
            profile.model_dump(),
            {"id": self.user.id, "nome": "Owner", "email": "owner@example.com"},
        )

    def test_login_preserves_response_and_sets_both_cookies(self):
        request = Request({"type": "http", "headers": []})
        with patch("app.routes.auth.authenticate_user", return_value=self.user):
            response = asyncio.run(inspect.unwrap(login_user)(
                request,
                UserLogin(email=self.user.email, password="unused"),
                self.session,
            ))
        self.assertEqual(json.loads(response.body)["message"], "Login successful")
        self.assertIn("bearer_token", json.loads(response.body))
        cookies = response.headers.getlist("set-cookie")
        self.assertEqual(len(cookies), 2)
        self.assertTrue(any(cookie.startswith("access_token=") for cookie in cookies))
        self.assertTrue(any(cookie.startswith("refresh_token=") for cookie in cookies))
        self.assertTrue(all("HttpOnly" in cookie for cookie in cookies))

    def test_refresh_rejects_missing_invalid_and_unknown_user_tokens(self):
        for token in (None, "invalid", create_token(999), create_token("invalid-id")):
            with self.subTest(token_type="missing" if token is None else "invalid"):
                headers = [] if token is None else [
                    (b"cookie", f"refresh_token={token}".encode())
                ]
                request = Request({"type": "http", "headers": headers})
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(inspect.unwrap(refresh_access_token)(
                        Response(), request, self.session
                    ))
                self.assertEqual(error.exception.status_code, 401)

    def test_delete_user_requires_admin(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(delete_user(self.other_user.id, self.user, self.session))
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(self.session.query(User).count(), 2)

    def test_routes_and_request_schemas_remain_registered(self):
        schema = app.openapi()
        self.assertEqual(len(schema["paths"]), 20)
        for path, method, model in (
            ("/auth/login", "post", "UserLogin"),
            ("/auth/register", "post", "UserRegister"),
            ("/cards/add_card", "post", "Card"),
        ):
            request_schema = schema["paths"][path][method]["requestBody"][
                "content"
            ]["application/json"]["schema"]
            self.assertEqual(request_schema["$ref"], f"#/components/schemas/{model}")
        for path, endpoint in (
            ("/cards/10", "list_cards"),
            ("/cards/me", "get_card_stats"),
            ("/cards/pick_card", "pick_card"),
        ):
            scope = {"type": "http", "path": path, "method": "GET"}
            route = next(
                route for route in app.routes if route.matches(scope)[0] == Match.FULL
            )
            self.assertEqual(route.name, endpoint)


if __name__ == "__main__":
    unittest.main()

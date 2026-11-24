import assert from "node:assert/strict"
import { test } from "node:test"
import { createService, ApiError } from "../frontend/mindle/js/service.js"
import { escapeHtml, percent, activityDays, dateKey } from "../frontend/mindle/js/format.js"

const preview = () => createService({ preview: true, origin: "http://localhost", port: "", fetcher: () => { throw new Error("Preview must never contact the backend") } })

test("preview creates decks and cards entirely in memory", async () => {
    const service = preview()
    const before = await service.overview()
    const deck = await service.createDeck("My words", "A little practice")
    const { card } = await service.createCard({ front_content: "bonjour", back_content: "hello", deck_id: deck.id })
    assert.equal((await service.deck(deck.id)).cards[0].id, card.id)
    assert.equal((await service.overview()).stats.total_cards, before.stats.total_cards + 1)
    assert.equal((await preview().overview()).decks.length, before.decks.length)
})

test("preview reviews update counters and scheduling; deletion cleans up", async () => {
    const service = preview()
    const deck = await service.createDeck("Review test", "")
    const { card } = await service.createCard({ front_content: "Q", back_content: "A", deck_id: deck.id })
    assert.equal((await service.nextCard(deck.id)).card.id, card.id)
    const before = await service.overview()
    await service.reviewCard(card.id, "easy")
    assert.equal((await service.nextCard(deck.id)).card, null)
    const after = await service.overview()
    assert.equal(after.stats.studied_today, before.stats.studied_today + 1)
    assert.equal(after.stats.correct_today, before.stats.correct_today + 1)
    assert.equal((await service.deck(deck.id)).deck.pending_cards, 0)
    await service.deleteCard(card.id)
    assert.equal((await service.deck(deck.id)).cards.length, 0)
})

test("preview rejects missing decks and unsupported ratings", async () => {
    const service = preview()
    await assert.rejects(service.deck(999), error => error.status === 404)
    await assert.rejects(service.reviewCard(1, "unknown"), error => error.status === 422)
})

test("live writes retain existing backend endpoint, JSON and cookie contracts", async () => {
    const calls = []
    const service = createService({ origin: "http://localhost:8000", port: "8000", fetcher: async (url, options) => {
        calls.push({ url, ...options })
        return { ok: true, json: async () => ({}) }
    } })
    const payload = { front_content: "Q", back_content: "A", deck_id: 2 }
    await service.createCard(payload)
    await service.createDeck("Deck", "Description")
    await service.reviewCard(7, "medium")
    await service.deleteCard(7)
    assert.equal(calls[0].url, "http://localhost:8000/cards/add_card")
    assert.deepEqual(JSON.parse(calls[0].body), payload)
    assert.equal(calls[1].url, "http://localhost:8000/decks/create")
    assert.equal(calls[2].url, "http://localhost:8000/cards/update_card?difficulty=medium&card_id=7")
    assert.equal(calls[3].method, "DELETE")
    assert.ok(calls.every(call => call.credentials === "include"))
})

test("expired sessions refresh before loading live workspace data", async () => {
    const calls = []
    const service = createService({ origin: "http://localhost", port: "", fetcher: async url => {
        calls.push(url)
        const expired = url.endsWith("/auth/protected")
        return { ok: !expired, status: expired ? 401 : 200, json: async () => ({}) }
    } })
    await service.overview()
    assert.equal(calls[1], "http://localhost/auth/refresh")
    assert.ok(calls.includes("http://localhost/user/me"))
    assert.ok(calls.includes("http://localhost/cards/reviews_period?days_period=35"))
})

test("API validation errors stay readable and empty review queues finish normally", async () => {
    const service = createService({ origin: "http://localhost", port: "", fetcher: async () => ({
        ok: false, status: 404, json: async () => ({ detail: "No cards were found" }),
    }) })
    assert.equal((await service.nextCard(2)).card, null)
    await assert.rejects(service.createDeck("x", ""), error => error instanceof ApiError && error.message === "No cards were found")
})

test("display helpers escape untrusted text and handle zero totals", () => {
    assert.equal(escapeHtml('<img src=x onerror="bad()">'), "&lt;img src=x onerror=&quot;bad()&quot;&gt;")
    assert.equal(percent(10, 0), 0)
    assert.equal(percent(30, 20), 100)
})

test("activity includes missing days as zero and uses local calendar dates", () => {
    const today = new Date(2026, 10, 23, 12)
    const days = activityDays({ "2026-11-22": 8 }, 3, today)
    assert.deepEqual(days.map(day => day.count), [0, 8, 0])
    assert.equal(dateKey(days[0].date), "2026-11-21")
})

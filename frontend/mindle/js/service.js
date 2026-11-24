import { createPreviewData } from "./preview-data.js"
import { dateKey } from "./format.js"

export class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status }
}

export function createService({ preview = false, fetcher = fetch, origin = window.location.origin, port = window.location.port } = {}) {
    const base = port === "5500" ? "http://localhost:8000" : origin
    const data = preview ? createPreviewData() : null

    async function request(path, options = {}) {
        const response = await fetcher(`${base}${path}`, { credentials: "include", ...options })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
            const detail = typeof result.detail === "string" ? result.detail : "Please check your input and try again."
            throw new ApiError(detail, response.status)
        }
        return result
    }
    const post = (path, payload) => request(path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    })
    const findDeck = id => {
        const deck = data.decks.find(deck => deck.id === Number(id))
        if (!deck) throw new ApiError("Deck not found.", 404)
        return deck
    }

    return {
        async overview() {
            if (preview) return structuredClone(data)
            try { await request("/auth/protected", { method: "POST" }) }
            catch (error) {
                if (error.status !== 401) throw error
                await request("/auth/refresh", { method: "POST" })
            }
            const [user, decks, stats, activity] = await Promise.all([
                request("/user/me"), request("/decks"), request("/cards/me"), request("/cards/reviews_period?days_period=35"),
            ])
            return { user, decks, stats, activity }
        },
        async deck(id) {
            return preview ? structuredClone({ deck: findDeck(id), cards: data.cards.filter(card => card.deck_id === Number(id)) })
                : request(`/decks/${encodeURIComponent(id)}/cards`)
        },
        async createDeck(name, description) {
            if (!preview) return post("/decks/create", { name, description })
            const deck = { id: Math.max(0, ...data.decks.map(deck => deck.id)) + 1, name, description, total_cards: 0, pending_cards: 0, studied_cards: 0 }
            data.decks.push(deck)
            return structuredClone(deck)
        },
        async createCard(payload) {
            if (!preview) return post("/cards/add_card", payload)
            const deck = findDeck(payload.deck_id)
            const card = { ...payload, id: Math.max(0, ...data.cards.map(card => card.id)) + 1, next_review: new Date().toISOString(), review_count: 0 }
            data.cards.push(card)
            deck.total_cards += 1
            deck.pending_cards += 1
            data.stats.total_cards += 1
            return { card }
        },
        async nextCard(id) {
            if (!preview) {
                try { return await request(`/cards/pick_card?deck_id=${encodeURIComponent(id)}`) }
                catch (error) { if (error.status === 404) return { card: null, cards_to_review: 0 }; throw error }
            }
            findDeck(id)
            const due = data.cards.filter(card => card.deck_id === Number(id) && new Date(card.next_review) <= new Date())
                .sort((left, right) => new Date(left.next_review) - new Date(right.next_review))
            return structuredClone({ card: due[0] || null, cards_to_review: due.length })
        },
        async reviewCard(id, difficulty) {
            if (!preview) return request(`/cards/update_card?difficulty=${encodeURIComponent(difficulty)}&card_id=${encodeURIComponent(id)}`, { method: "POST" })
            const card = data.cards.find(card => card.id === Number(id))
            if (!card) throw new ApiError("Card not found.", 404)
            const delay = { hard: 0, medium: 10000, good: 86400000, easy: 345600000 }[difficulty]
            if (delay === undefined) throw new ApiError("Unknown rating.", 422)
            card.review_count += 1
            card.next_review = new Date(Date.now() + delay).toISOString()
            data.stats.studied_today += 1
            if (difficulty !== "hard") data.stats.correct_today += 1
            const today = dateKey(new Date())
            data.activity[today] = (data.activity[today] || 0) + 1
            if (delay > 0) findDeck(card.deck_id).pending_cards = Math.max(0, findDeck(card.deck_id).pending_cards - 1)
            return { message: "Review recorded." }
        },
        async deleteCard(id) {
            if (!preview) return request(`/cards/delete_card/${encodeURIComponent(id)}`, { method: "DELETE" })
            const card = data.cards.find(card => card.id === Number(id))
            if (!card) throw new ApiError("Card not found.", 404)
            const deck = findDeck(card.deck_id)
            deck.total_cards = Math.max(0, deck.total_cards - 1)
            if (new Date(card.next_review) <= new Date()) deck.pending_cards = Math.max(0, deck.pending_cards - 1)
            data.cards = data.cards.filter(card => card.id !== Number(id))
            data.stats.total_cards -= 1
        },
        async logout() { if (!preview) await request("/auth/logout", { method: "POST" }) },
    }
}

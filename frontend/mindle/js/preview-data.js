import { activityDays } from "./format.js"

// Explicit, in-memory design-preview data. Never sent to the backend.
export function createPreviewData() {
    const definitions = [
        ["Everyday French", "Useful words for a life beyond the textbook.", 128, 16, 12],
        ["Expressions in context", "The things native speakers actually say.", 86, 8, 0],
        ["Product & design", "Ideas, frameworks, and better questions.", 214, 0, 0],
        ["Japanese foundations", "A solid start to everyday conversations.", 340, 0, 0],
        ["Books worth remembering", "Keep the ideas. Not just the highlights.", 302, 0, 0],
        ["Science of learning", "Understand how understanding happens.", 214, 0, 0],
    ]
    const decks = definitions.map(([name, description, total_cards, pending_cards, studied_cards], index) => ({
        id: index + 1, name, description, total_cards, pending_cards, studied_cards,
    }))
    const examples = [
        ["prendre le temps", "to take the time"],
        ["ralentir", "to slow down"],
        ["le quotidien", "everyday life"],
        ["avoir le coup de foudre", "to fall in love at first sight"],
        ["au fur et à mesure", "as you go along"],
        ["ça vaut le coup", "it’s worth it"],
    ]
    const due = new Date(Date.now() - 3600000).toISOString()
    const later = new Date(Date.now() + 86400000 * 4).toISOString()
    const cards = examples.map(([front_content, back_content], index) => ({
        id: index + 1, deck_id: 1, front_content, back_content,
        next_review: index < 3 ? due : later, review_count: 0,
    }))
    cards.push({ id: 7, deck_id: 2, front_content: "prendre du recul", back_content: "to take a step back", next_review: due, review_count: 0 })
    const activity = Object.fromEntries(activityDays({}, 35).map((day, index) => [day.key, [0, 8, 0, 12, 18, 6, 0, 14, 0, 20][index % 10]]))
    const lastWeek = [8, 12, 8, 12, 16, 6, 12]
    activityDays({}, 7).forEach((day, index) => { activity[day.key] = lastWeek[index] })
    return {
        user: { id: 1, nome: "Alex Morgan", email: "alex@example.com" },
        decks, cards, activity,
        stats: { total_cards: 1284, studied_today: 12, correct_today: 11, current_streak: 12 },
    }
}

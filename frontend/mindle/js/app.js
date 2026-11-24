import { createService } from "./service.js"
import { fillIcons } from "./icons.js"
import { dashboard, library, deckDetail, editor, reviewView, emptyState } from "./views.js"
import { escapeHtml, number, percent, sanitizeHtml, plainText } from "./format.js"
import { createSpeechPlayer } from "../../assets/js/speech.js"

const $ = selector => document.querySelector(selector)
const main = $("#main")
const preview = new URLSearchParams(location.search).get("preview") === "1"
const service = createService({ preview })
const speech = createSpeechPlayer()
const state = { user: {}, decks: [], stats: {}, activity: {}, search: "", dueOnly: false, layout: "grid" }
const draft = { front: "", back: "", deckId: "", dirty: false }
let routeVersion = 0
let currentHash = ""
let currentDeck = null
let review = null
let session = { deckId: null, completed: 0 }
let busy = false
let voiceURI = ""
let editorSelection = null

function toast(message, error = false) {
    const node = document.createElement("div")
    node.className = `toast${error ? " error" : ""}`
    node.textContent = message
    $("#toasts").append(node)
    setTimeout(() => node.remove(), 4500)
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem("mindle-theme", theme) } catch { /* Storage is optional. */ }
}

function updateShell() {
    const name = state.user.nome || state.user.name || "Your workspace"
    document.querySelectorAll("[data-user-name]").forEach(node => { node.textContent = name })
    document.querySelectorAll("[data-initials]").forEach(node => {
        node.textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
    })
    $("#top-streak").textContent = `${number(state.stats.current_streak)} day streak`
    $("#daily-caption").textContent = `${number(state.stats.studied_today)} of 20 daily reviews`
    $("#daily-progress").style.width = `${percent(state.stats.studied_today, 20)}%`
    $("#preview-label").hidden = !preview
}

async function refreshOverview() {
    Object.assign(state, await service.overview())
    updateShell()
}

function chooseVoice() {
    const voices = speech.getVoices()
    return voices.find(voice => voice.voiceURI === voiceURI)
        || voices.find(voice => voice.lang.toLowerCase() === navigator.language.toLowerCase())
        || voices.find(voice => voice.default)
        || voices[0]
}

function refreshVoices() {
    const select = $("#speech-voice")
    const voices = speech.getVoices()
    const selected = chooseVoice()
    if (selected) voiceURI = selected.voiceURI
    if (select) {
        select.replaceChildren(...voices.map(voice => {
            const option = document.createElement("option")
            option.value = voice.voiceURI
            option.textContent = `${voice.name} · ${voice.lang}`
            return option
        }))
        select.value = voiceURI
        select.disabled = !voices.length
    }
    const status = $("#speech-status")
    if (status) status.textContent = !speech.supported ? "Speech is unavailable in this browser."
        : voices.length ? "Reads on your device. No audio files are created or stored."
            : "No local voice available. Install a speech voice on your device or try another browser."
    document.querySelectorAll('[data-action^="speak-"]').forEach(button => {
        button.disabled = !voices.length
        button.title = voices.length ? "Read using a local voice" : "No local speech voice available on this device"
    })
}

function readText(text) {
    try {
        const voice = chooseVoice()
        if (!voice) throw new Error("No local voice is available on this device.")
        speech.speak(text, voice.voiceURI, message => toast(message, true))
    } catch (error) { toast(error.message, true) }
}

function rememberDraft() {
    if (!$("#front-editor")) return
    draft.front = sanitizeHtml($("#front-editor").innerHTML)
    draft.back = sanitizeHtml($("#back-editor").innerHTML)
    draft.deckId = $("#card-deck").value
}

async function renderRoute({ captureDraft = true } = {}) {
    const nextHash = location.hash || "#dashboard"
    if (currentHash.startsWith("#create") && !nextHash.startsWith("#create") && draft.dirty) {
        if (!confirm("Leave this editor? Your unsaved draft will stay here until you reload the page.")) {
            history.replaceState(null, "", currentHash)
            return
        }
    }
    if (captureDraft) rememberDraft()
    speech.stop()
    const routeChanged = currentHash !== nextHash
    currentHash = nextHash
    const [page, id] = nextHash.slice(1).split("/")
    const version = ++routeVersion
    main.setAttribute("aria-busy", "true")
    document.body.classList.remove("sidebar-open")
    $(".sidebar-scrim").hidden = true
    document.querySelectorAll("[data-nav]").forEach(link => {
        const active = link.dataset.nav === (["deck", "review"].includes(page) ? "decks" : page)
        link.classList.toggle("active", active)
        if (active) link.setAttribute("aria-current", "page")
        else link.removeAttribute("aria-current")
    })
    try {
        let html
        if (page === "dashboard") html = dashboard(state)
        else if (page === "decks") html = library(state)
        else if (page === "create") {
            if (id && (routeChanged || !draft.deckId) && state.decks.some(deck => deck.id === Number(id))) draft.deckId = id
            html = editor(state, draft)
        } else if (page === "deck") {
            const result = await service.deck(id)
            if (version !== routeVersion) return
            currentDeck = result.deck
            html = deckDetail(result.deck, result.cards, preview)
        } else if (page === "review") {
            const deck = state.decks.find(deck => deck.id === Number(id))
            if (!deck) throw new Error("This deck could not be found.")
            if (session.deckId !== deck.id) session = { deckId: deck.id, completed: 0 }
            const result = await service.nextCard(id)
            if (version !== routeVersion) return
            review = result
            currentDeck = deck
            html = reviewView(deck, result, session)
        } else html = emptyState("A little detour.", "This page isn’t part of the first design release.", '<a class="button primary" href="#dashboard">Back to dashboard</a>')
        if (version !== routeVersion) return
        main.innerHTML = html
        document.title = `Mindle — ${page === "deck" || page === "review" ? currentDeck.name : { dashboard: "Dashboard", decks: "Deck library", create: "Create a flashcard" }[page] || "Your workspace"}`
        refreshVoices()
        fillIcons(main)
    } catch (error) {
        if (version !== routeVersion) return
        showError(error)
    } finally {
        if (version === routeVersion) main.setAttribute("aria-busy", "false")
    }
}

function showError(error) {
    if (error.status === 401) {
        main.innerHTML = emptyState("Your learning space is waiting.", "Sign in to open your cards, or explore the new design with sample content.", '<a class="button primary" href="../login_page.html">Sign in</a> <a class="button secondary" href="?preview=1#dashboard">Explore design preview</a>')
    } else {
        main.innerHTML = emptyState("Let’s try that again.", error.message || "Your workspace could not be loaded.", '<button class="button primary" data-action="retry">Try again</button> <a class="button secondary" href="?preview=1#dashboard">Explore design preview</a>')
    }
}

function openDeckDialog() {
    $("#deck-error").textContent = ""
    $("#deck-form").reset()
    $("#deck-dialog").showModal()
    $("#deck-name").focus()
}

async function saveCard() {
    if (busy) return
    rememberDraft()
    if (!draft.deckId) { toast("Choose a deck for your card.", true); $("#card-deck").focus(); return }
    if (!plainText(draft.front) || !plainText(draft.back)) { toast("Add a front and a back to your card.", true); return }
    busy = true
    speech.stop()
    const button = $("#save-card")
    button.disabled = true
    button.textContent = "Saving…"
    try {
        await service.createCard({ front_content: draft.front, back_content: draft.back, deck_id: Number(draft.deckId) })
        const another = $("#create-another").checked
        draft.front = ""
        draft.back = ""
        draft.dirty = false
        await refreshOverview()
        toast(preview ? "Card created in this preview. Nothing was sent to your account." : "A new thought, ready to stay. Card saved.")
        if (another) { await renderRoute({ captureDraft: false }); $("#front-editor").focus() }
        else {
            $("#front-editor").innerHTML = ""
            $("#back-editor").innerHTML = ""
            location.hash = `#deck/${draft.deckId}`
        }
    } catch (error) { toast(error.message, true) }
    finally {
        busy = false
        if (button.isConnected) { button.disabled = false; button.innerHTML = 'Save card <kbd>Ctrl ↵</kbd>' }
    }
}

async function rateCard(difficulty) {
    if (busy || !review?.card || $("#review-ratings")?.hidden) return
    busy = true
    speech.stop()
    const buttons = [...main.querySelectorAll(".rating-button")]
    buttons.forEach(button => { button.disabled = true })
    try {
        await service.reviewCard(review.card.id, difficulty)
        session.completed += 1
        await refreshOverview()
        await renderRoute()
    } catch (error) { toast(error.message, true) }
    finally { busy = false; buttons.forEach(button => { button.disabled = false }) }
}

function account() {
    $("#account-content").innerHTML = `<div class="preview-side"><strong>${escapeHtml(state.user.nome || state.user.name || "Your workspace")}</strong><p class="muted">${escapeHtml(state.user.email || "")}</p></div><p class="muted">${preview ? "You’re exploring sample content. Changes stay in memory and reset when you reload." : "Your personal learning space. Profile editing is coming in a later release."}</p><div class="modal-actions">${preview ? '<a class="button primary" href="../login_page.html">Sign in to your account</a>' : '<button class="button secondary" data-action="logout">Sign out</button>'}</div>`
    $("#account-dialog").showModal()
}

async function handleAction(action, button) {
    if (action === "new-deck") return openDeckDialog()
    if (action === "account") return account()
    if (action === "theme") return setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light")
    if (action === "sidebar") {
        if (matchMedia("(max-width: 850px)").matches) {
            document.body.classList.remove("sidebar-collapsed")
            const open = document.body.classList.toggle("sidebar-open")
            $(".sidebar-scrim").hidden = !open
            document.querySelectorAll('[data-action="sidebar"]').forEach(button => button.setAttribute("aria-expanded", String(open)))
        } else {
            const collapsed = document.body.classList.toggle("sidebar-collapsed")
            document.querySelectorAll('[data-action="sidebar"]').forEach(button => button.setAttribute("aria-expanded", String(!collapsed)))
        }
        return
    }
    if (action === "retry") return bootstrap()
    if (action === "start-next") {
        const deck = state.decks.find(deck => deck.pending_cards > 0)
        if (deck) location.hash = `#review/${deck.id}`
        else { toast("All caught up. Create a card or explore your decks."); location.hash = "#decks" }
        return
    }
    if (action === "view-grid" || action === "view-list") { state.layout = action.slice(5); return renderRoute() }
    if (action === "filter-all" || action === "filter-due") { state.dueOnly = action === "filter-due"; return renderRoute() }
    if (action === "save-card") return saveCard()
    if (action === "preview-card") {
        rememberDraft()
        $("#preview-content").innerHTML = `<div class="preview-side"><small>Front</small>${sanitizeHtml(draft.front) || '<span class="muted">Your question will appear here.</span>'}</div><div class="preview-side"><small>Back</small>${sanitizeHtml(draft.back) || '<span class="muted">Your answer will appear here.</span>'}</div>`
        return $("#preview-dialog").showModal()
    }
    if (action === "stop-speech") return speech.stop()
    if (action === "speak-front" || action === "speak-back") return readText($(`#${action.slice(6)}-editor`).innerText)
    if (action === "speak-review") return readText($("#review-question").innerText)
    if (action === "reveal") {
        speech.stop()
        if (!$("#review-answer")) return
        $("#review-answer").hidden = false
        $("#review-ratings").hidden = false
        $("#reveal-actions").hidden = true
        return
    }
    if (action === "rate") return rateCard(button.dataset.rating)
    if (action === "delete-card") {
        if (busy || !confirm("Delete this flashcard? This cannot be undone.")) return
        busy = true
        button.disabled = true
        try { await service.deleteCard(button.dataset.id); await refreshOverview(); await renderRoute(); toast("Card deleted.") }
        finally { busy = false; button.disabled = false }
        return
    }
    if (action === "logout") { speech.stop(); await service.logout(); location.href = "../login_page.html" }
}

document.addEventListener("click", event => {
    const close = event.target.closest("[data-close]")
    if (close) return document.getElementById(close.dataset.close).close()
    if (event.target.tagName === "DIALOG") {
        const rect = event.target.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close()
    }
    const button = event.target.closest("[data-action]")
    if (button) handleAction(button.dataset.action, button).catch(error => toast(error.message, true))
    const format = event.target.closest("[data-format]")
    if (format) {
        const target = $(`#${format.closest("[data-editor]").dataset.editor}-editor`)
        target.focus()
        if (editorSelection && target.contains(editorSelection.commonAncestorContainer)) {
            const selection = getSelection()
            selection.removeAllRanges()
            selection.addRange(editorSelection)
        }
        document.execCommand(format.dataset.format, false)
    }
})
document.addEventListener("selectionchange", () => {
    const selection = getSelection()
    if (selection.rangeCount && selection.anchorNode?.parentElement?.closest(".editor-surface")) editorSelection = selection.getRangeAt(0).cloneRange()
})
document.addEventListener("mousedown", event => {
    if (event.target.closest("[data-format]")) event.preventDefault()
})
document.addEventListener("input", event => {
    if (event.target.closest(".editor-surface")) {
        draft.dirty = true
        rememberDraft()
        $("#save-status").textContent = "Unsaved changes"
    }
    if (event.target.id === "deck-search") {
        const input = event.target
        const cursor = input.selectionStart
        state.search = input.value
        main.innerHTML = library(state)
        const replacement = $("#deck-search")
        replacement.focus()
        replacement.setSelectionRange(cursor, cursor)
    }
})
document.addEventListener("change", event => {
    if (event.target.id === "speech-voice") { speech.stop(); voiceURI = event.target.value }
    if (event.target.id === "card-deck") { draft.deckId = event.target.value; draft.dirty = true }
})
$("#global-search").addEventListener("submit", event => {
    event.preventDefault()
    state.search = new FormData(event.target).get("query").trim()
    if (location.hash === "#decks") renderRoute()
    else location.hash = "#decks"
})
$("#deck-form").addEventListener("submit", async event => {
    event.preventDefault()
    const name = $("#deck-name").value.trim()
    if (!name) { $("#deck-error").textContent = "Give your deck a name."; return }
    const button = event.target.querySelector('[type="submit"]')
    if (button.disabled) return
    button.disabled = true
    $("#deck-error").textContent = ""
    try {
        const deck = await service.createDeck(name, $("#deck-description").value.trim())
        await refreshOverview()
        $("#deck-dialog").close()
        toast(preview ? "Deck created in this preview. Reloading resets it." : "A new home for your next discovery. Deck created.")
        if (currentHash.startsWith("#create")) { rememberDraft(); draft.deckId = String(deck.id); await renderRoute({ captureDraft: false }) }
        else location.hash = `#deck/${deck.id}`
    } catch (error) { $("#deck-error").textContent = error.message }
    finally { button.disabled = false }
})
document.addEventListener("keydown", event => {
    if (event.key === "Escape") speech.stop()
    if (document.querySelector("dialog[open]")) return
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && currentHash.startsWith("#create")) { event.preventDefault(); saveCard(); return }
    if (event.target.isContentEditable || event.target.closest("input, textarea, select, button")) return
    if (event.key === "/") { event.preventDefault(); $("#global-search input").focus() }
    if (!currentHash.startsWith("#review")) return
    if (event.code === "Space") { event.preventDefault(); handleAction("reveal") }
    if (["1", "2", "3", "4"].includes(event.key)) rateCard(["hard", "medium", "good", "easy"][Number(event.key) - 1])
})
window.addEventListener("hashchange", renderRoute)
window.addEventListener("pagehide", speech.stop)
window.addEventListener("beforeunload", event => {
    if (draft.dirty) { event.preventDefault(); event.returnValue = "" }
})
document.addEventListener("visibilitychange", () => { if (document.hidden) speech.stop() })
window.speechSynthesis?.addEventListener("voiceschanged", refreshVoices)

async function bootstrap() {
    main.setAttribute("aria-busy", "true")
    try { await refreshOverview(); await renderRoute() }
    catch (error) { showError(error); main.setAttribute("aria-busy", "false") }
}

fillIcons()
try { setTheme(localStorage.getItem("mindle-theme") || "dark") } catch { setTheme("dark") }
bootstrap()

import assert from "node:assert/strict"
import { test } from "node:test"

import { createSpeechPlayer } from "../frontend/assets/js/speech.js"

function setup() {
    const localVoice = { voiceURI: "local-pt", lang: "pt-BR", localService: true }
    const remoteVoice = { voiceURI: "remote-en", lang: "en-US", localService: false }
    const utterances = []
    let voices = [remoteVoice, localVoice]
    let cancellations = 0
    const host = {
        speechSynthesis: {
            getVoices: () => voices,
            cancel: () => { cancellations += 1 },
            speak: utterance => { utterances.push(utterance) },
        },
        SpeechSynthesisUtterance: class {
            constructor(text) { this.text = text }
        },
    }
    return {
        player: createSpeechPlayer(host),
        host,
        localVoice,
        utterances,
        setVoices: value => { voices = value },
        get cancellations() { return cancellations },
    }
}

test("only exposes voices explicitly reported as local", () => {
    const { player, localVoice, setVoices } = setup()
    assert.deepEqual(player.getVoices(), [localVoice])
    setVoices([{ voiceURI: "unknown" }, { voiceURI: "remote", localService: false }])
    assert.deepEqual(player.getVoices(), [])
})

test("never falls back to a remote or stale voice", () => {
    const { player, utterances, setVoices } = setup()
    assert.throws(() => player.speak("Hello", "remote-en"))
    setVoices([])
    assert.throws(() => player.speak("Hello", "local-pt"))
    assert.equal(utterances.length, 0)
})

test("supports local voices that become available after initial load", () => {
    const { player, localVoice, setVoices, utterances } = setup()
    setVoices([])
    assert.deepEqual(player.getVoices(), [])
    setVoices([localVoice])
    player.speak("Hello", "local-pt")
    assert.equal(utterances[0].voice, localVoice)
    assert.equal(utterances[0].lang, "pt-BR")
})

test("normalizes text and replaces previous playback instead of queuing it", () => {
    const context = setup()
    context.player.speak("  First\n question  ", "local-pt")
    context.player.speak("Answer", "local-pt")
    assert.equal(context.cancellations, 2)
    assert.equal(context.utterances[0].text, "First question")
    assert.equal(context.utterances[1].text, "Answer")
})

test("rejects empty card content", () => {
    const { player, utterances } = setup()
    assert.throws(() => player.speak(" \n ", "local-pt"))
    assert.equal(utterances.length, 0)
})

test("reports playback failures but ignores canceled or superseded speech", () => {
    const { player, utterances } = setup()
    const errors = []
    player.speak("Question", "local-pt", message => errors.push(message))
    player.speak("Answer", "local-pt", message => errors.push(message))
    utterances[0].onerror({ error: "synthesis-failed" })
    assert.equal(errors.length, 0)
    utterances[1].onerror({ error: "synthesis-failed" })
    assert.equal(errors.length, 1)
    player.speak("Again", "local-pt", message => errors.push(message))
    player.stop()
    utterances[2].onerror({ error: "canceled" })
    assert.equal(errors.length, 1)
})

test("unsupported browsers remain usable without speech", () => {
    const player = createSpeechPlayer({})
    assert.equal(player.supported, false)
    assert.deepEqual(player.getVoices(), [])
    assert.doesNotThrow(() => player.stop())
    assert.throws(() => player.speak("Hello", "any-voice"))
})

test("page controls initialize without the dashboard and read only the visible side", async t => {
    const context = setup()
    const oldWindow = globalThis.window
    const oldDocument = globalThis.document
    t.after(() => {
        globalThis.window = oldWindow
        globalThis.document = oldDocument
    })
    const voiceListeners = []
    context.host.addEventListener = () => {}
    context.host.speechSynthesis.addEventListener = (_, listener) => {
        voiceListeners.push(listener)
    }
    function element() {
        const handlers = {}
        return {
            disabled: true,
            value: "",
            addEventListener: (event, handler) => { handlers[event] = handler },
            click: () => handlers.click(),
            replaceChildren: () => {},
            append: () => {},
        }
    }
    function toolbar(count) {
        const select = element()
        const buttons = Array.from({ length: count }, element)
        const stop = element()
        const status = element()
        return {
            buttons, select, stop, status,
            querySelector: selector => ({
                "[data-speech-voice]": select,
                "[data-speech-stop]": stop,
                "[data-speech-status]": status,
            })[selector],
            querySelectorAll: () => buttons,
        }
    }
    const review = toolbar(1)
    const editor = toolbar(2)
    let flipped = false
    const nodes = {
        "review-speech-controls": review,
        "editor-speech-controls": editor,
        "card-inner": { classList: { contains: () => flipped } },
        "review-front-content": { innerText: "Visible question" },
        "review-back-content": { innerText: "Hidden answer" },
        "front-content": { innerText: "Editor question" },
        "back-content": { innerText: "Editor answer" },
    }
    globalThis.window = context.host
    globalThis.document = {
        documentElement: { lang: "pt-BR" },
        getElementById: id => nodes[id],
        createElement: element,
        addEventListener: () => {},
    }
    context.setVoices([])
    await import("../frontend/assets/js/speech-init.js?v=2")
    assert.equal(review.buttons[0].disabled, true)
    assert.equal(editor.buttons[0].disabled, true)
    assert.match(review.status.textContent, /Nenhuma voz local/)

    context.setVoices([context.localVoice])
    voiceListeners.forEach(listener => listener())
    assert.equal(review.buttons[0].disabled, false)
    assert.equal(editor.buttons[0].disabled, false)
    review.buttons[0].click()
    flipped = true
    review.buttons[0].click()
    editor.buttons[0].click()
    editor.buttons[1].click()
    assert.deepEqual(context.utterances.map(utterance => utterance.text), [
        "Visible question", "Hidden answer", "Editor question", "Editor answer",
    ])
})

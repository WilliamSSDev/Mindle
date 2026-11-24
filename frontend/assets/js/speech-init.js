import { createSpeechPlayer, mountSpeechControls } from "./speech.js?v=2"

// Initialize independently of dashboard authentication, charts and API requests.
export const speechPlayer = createSpeechPlayer()

function getText(id) {
    const element = document.getElementById(id)
    return element?.innerText || ""
}

mountSpeechControls({
    container: document.getElementById("review-speech-controls"),
    sources: [{
        getText: () => getText(
            document.getElementById("card-inner")?.classList.contains("is-flipped")
                ? "review-back-content"
                : "review-front-content"
        ),
    }],
    player: speechPlayer,
})

mountSpeechControls({
    container: document.getElementById("editor-speech-controls"),
    sources: [
        { getText: () => getText("front-content") },
        { getText: () => getText("back-content") },
    ],
    player: speechPlayer,
})

window.addEventListener("pagehide", speechPlayer.stop)
document.addEventListener("visibilitychange", () => {
    if (document.hidden) speechPlayer.stop()
})

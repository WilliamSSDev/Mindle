// Only use voices supplied by a local speech service. Never fall back to a
// remote voice, an upload, or an audio-file API.
export function createSpeechPlayer(host = window) {
    const synthesis = host.speechSynthesis
    const supported = Boolean(synthesis && host.SpeechSynthesisUtterance)
    let currentUtterance = null

    function getVoices() {
        return supported
            ? synthesis.getVoices().filter(voice => voice.localService === true)
            : []
    }

    function stop() {
        currentUtterance = null
        if (supported) synthesis.cancel()
    }

    function speak(text, voiceURI, onError = () => {}) {
        const voice = getVoices().find(voice => voice.voiceURI === voiceURI)
        if (!voice) throw new Error("Selecione uma voz local disponível.")
        const content = text.replace(/\s+/g, " ").trim()
        if (!content) throw new Error("Não há texto para ouvir.")

        stop()
        const utterance = new host.SpeechSynthesisUtterance(content)
        utterance.voice = voice
        utterance.lang = voice.lang
        utterance.onend = () => {
            if (currentUtterance === utterance) currentUtterance = null
        }
        utterance.onerror = event => {
            if (currentUtterance !== utterance) return
            currentUtterance = null
            if (!["canceled", "interrupted"].includes(event.error)) {
                onError("Não foi possível reproduzir a fala com esta voz.")
            }
        }
        currentUtterance = utterance
        try {
            synthesis.speak(utterance)
        } catch (error) {
            currentUtterance = null
            throw error
        }
    }

    return { supported, getVoices, speak, stop }
}


export function mountSpeechControls({ container, sources, player, onError }) {
    if (!container) return
    const select = container.querySelector("[data-speech-voice]")
    const buttons = [...container.querySelectorAll("[data-speech-source]")]
    const stop = container.querySelector("[data-speech-stop]")
    const status = container.querySelector("[data-speech-status]")
    const reportError = message => {
        status.textContent = message
        onError?.(message)
    }

    sources.forEach(({ getText }, index) => {
        const button = buttons[index]
        button.addEventListener("click", () => {
            try {
                player.speak(getText(), select.value, reportError)
            } catch (error) {
                reportError(error.message)
            }
        })
    })

    stop.addEventListener("click", player.stop)
    select.addEventListener("change", player.stop)

    function refreshVoices() {
        const previousVoice = select.value
        const voices = player.getVoices()
        const language = document.documentElement.lang.toLowerCase()
        select.replaceChildren()
        for (const voice of voices) {
            const option = document.createElement("option")
            option.value = voice.voiceURI
            option.textContent = `${voice.name} (${voice.lang})`
            select.append(option)
        }
        const preferred = voices.find(voice => voice.voiceURI === previousVoice)
            || voices.find(voice => voice.lang.toLowerCase() === language)
            || voices.find(voice => voice.lang.split("-")[0] === language.split("-")[0])
            || voices.find(voice => voice.default)
            || voices[0]
        if (preferred) select.value = preferred.voiceURI
        const unavailable = voices.length === 0
        select.disabled = unavailable
        buttons.forEach(button => { button.disabled = unavailable })
        stop.disabled = unavailable
        status.textContent = !player.supported
            ? "Este navegador não oferece leitura em voz alta."
            : unavailable
                ? "Nenhuma voz local disponível. Instale uma voz no dispositivo ou tente outro navegador."
                : "Leitura no dispositivo, sem salvar arquivos de áudio."
    }

    if (player.supported) {
        window.speechSynthesis.addEventListener("voiceschanged", refreshVoices)
    }
    refreshVoices()
}

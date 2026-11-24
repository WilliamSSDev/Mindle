// Dependency-free Chrome smoke check. Uses a temporary static server and profile;
// no live API requests or account credentials are needed.
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join, extname, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../frontend/", import.meta.url))
const chrome = process.env.MINDLE_CHROME || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find(existsSync)
if (!chrome) throw new Error("Set MINDLE_CHROME to a Chrome or Chromium executable.")
const output = await mkdtemp(join(tmpdir(), "mindle-browser-"))
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
        const file = resolve(root, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`)
        if (!file.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return }
        const contents = await readFile(file)
        response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }).end(contents)
    } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, "127.0.0.1", done))
const base = `http://127.0.0.1:${server.address().port}`
let browser
let socket
try {
    browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${join(output, "profile")}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] })
    const debugUrl = await new Promise((done, reject) => {
        let output = ""
        const timeout = setTimeout(() => reject(new Error("Chrome did not start within 20 seconds.")), 20000)
        browser.once("error", error => { clearTimeout(timeout); reject(error) })
        browser.stderr.on("data", chunk => {
            output += chunk.toString()
            const match = output.match(/DevTools listening on (ws:\/\/\S+)/)
            if (match) { clearTimeout(timeout); done(match[1]) }
        })
    })
    const endpoint = new URL(debugUrl)
    const targets = await fetch(`http://${endpoint.host}/json/list`).then(response => response.json())
    socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl)
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
    let sequence = 0
    const pending = new Map()
    const errors = []
    const apiRequests = []
    socket.onmessage = event => {
        const message = JSON.parse(event.data)
        if (message.id) {
            const task = pending.get(message.id)
            if (!task) return
            pending.delete(message.id)
            clearTimeout(task.timeout)
            message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.done(message.result)
        }
        if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
        if (message.method === "Network.requestWillBeSent" && /\/(auth|cards|decks)\//.test(message.params.request.url)) apiRequests.push(message.params.request.url)
    }
    function command(method, params = {}) {
        return new Promise((done, reject) => {
            const id = ++sequence
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 30000)
            pending.set(id, { done, reject, timeout })
            socket.send(JSON.stringify({ id, method, params }))
        })
    }
    async function evaluate(expression) {
        const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
        return result.result.value
    }
    async function until(expression) {
        for (let index = 0; index < 60; index++) {
            if (await evaluate(expression)) return
            await new Promise(done => setTimeout(done, 100))
        }
        throw new Error(`Page condition did not become true: ${expression}`)
    }
    async function capture(name) {
        await evaluate('document.querySelector("#toasts").replaceChildren(); new Promise(done => setTimeout(done, 250))')
        const { data } = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
        await writeFile(join(output, `${name}.png`), Buffer.from(data, "base64"))
    }
    await command("Page.enable")
    await command("Runtime.enable")
    await command("Network.enable")
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await command("Page.navigate", { url: `${base}/?preview=1#dashboard` })
    await until('document.querySelector(".dashboard-grid") && document.querySelector("#main").getAttribute("aria-busy") === "false"')
    await capture("dashboard-desktop")
    await evaluate('location.hash = "#decks"')
    await until('document.querySelectorAll(".deck-card").length === 6')
    await capture("decks-grid")
    await evaluate('document.querySelector("[data-action=view-list]").click()')
    await until('document.querySelectorAll("tbody tr").length === 6')
    await evaluate('document.querySelector("[data-action=new-deck]").click(); document.querySelector("#deck-name").value = "Browser test deck"; document.querySelector("#deck-description").value = "Created in preview"; document.querySelector("#deck-form").requestSubmit()')
    await until('document.querySelector("h1")?.textContent === "Browser test deck"')
    await evaluate('location.hash = "#create/7"')
    await until('document.querySelector("#card-deck")?.value === "7"')
    await evaluate('document.querySelector("#front-editor").innerHTML = "<b>Bonjour</b>"; document.querySelector("#back-editor").textContent = "Hello"; document.querySelector("#front-editor").dispatchEvent(new Event("input", {bubbles:true}))')
    await capture("create-card")
    await evaluate('document.querySelector("[data-action=preview-card]").click()')
    assert.equal(await evaluate('document.querySelector("#preview-dialog").open'), true)
    await evaluate('document.querySelector("#preview-dialog").close(); document.querySelector("#save-card").click()')
    await until('document.querySelector("#front-editor")?.textContent === "" && document.querySelector("#save-card")?.disabled === false')
    await evaluate('location.hash = "#review/7"')
    await until('document.querySelector("#review-question")?.textContent === "Bonjour"')
    await evaluate('document.querySelector("[data-action=reveal]").click()')
    assert.equal(await evaluate('document.querySelector("#review-answer").hidden'), false)
    await capture("review-answer")
    await evaluate('document.querySelector("[data-rating=easy]").click()')
    await until('document.querySelector(".empty-state h2")?.textContent.includes("well earned")')
    await evaluate('location.hash = "#dashboard"')
    await until('Boolean(document.querySelector(".dashboard-grid"))')
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await capture("dashboard-mobile")
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "Mobile page must not overflow horizontally")
    await evaluate('location.hash = "#create/7"')
    await until('Boolean(document.querySelector("#front-editor"))')
    await capture("create-card-mobile")
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "Mobile editor must not overflow horizontally")
    await evaluate('document.querySelector(".mobile-menu").click()')
    assert.equal(await evaluate('document.body.classList.contains("sidebar-open")'), true)
    assert.deepEqual(apiRequests, [], "Preview must make no backend API requests")
    assert.deepEqual(errors, [], "Browser must have no uncaught JavaScript errors")
    console.log("PASS: dashboard, grid/list, create-deck dialog, editor, save, review, mobile navigation; zero backend requests.")
    console.log(`Screenshots: ${output}`)
} finally {
    socket?.close()
    browser?.kill()
    server.close()
}

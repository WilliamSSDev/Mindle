export function escapeHtml(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character])
}

export const number = value => new Intl.NumberFormat("en").format(Number(value) || 0)
export const percent = (part, total) => total > 0 ? Math.min(100, Math.round(part / total * 100)) : 0

export function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function activityDays(activity = {}, count = 7, today = new Date()) {
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(today)
        date.setDate(date.getDate() - count + 1 + index)
        return { date, key: dateKey(date), count: activity[dateKey(date)] || 0 }
    })
}

export function sanitizeHtml(value = "") {
    const template = document.createElement("template")
    template.innerHTML = value
    const allowed = new Set(["B", "BR", "EM", "I", "LI", "OL", "P", "STRONG", "U", "UL"])
    for (const node of [...template.content.querySelectorAll("*")]) {
        if (!allowed.has(node.tagName)) node.replaceWith(document.createTextNode(node.textContent || ""))
        else for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name)
    }
    return template.innerHTML.trim()
}

export function plainText(html = "") {
    const template = document.createElement("template")
    template.innerHTML = html
    return template.content.textContent.trim()
}

export function reviewDate(value) {
    if (!value) return "Not scheduled"
    // The existing API returns UTC timestamps without an offset.
    const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
    return date <= new Date() ? "Today" : date.toLocaleDateString("en", { month: "short", day: "numeric" })
}

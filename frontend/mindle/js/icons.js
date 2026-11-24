// A small, shared SVG vocabulary. No icon font, package or network dependency.
const paths = {
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    decks: '<path d="M7 3h14v15M3 7h14v14H3z"/>',
    book: '<path d="m3 6 8-2 10 2v15l-10-2-8 2zm8-2v15"/>',
    folder: '<path d="M3 7h7l2 2h9l-3 10H2zM3 7V5h7l2 2h8v2"/>',
    chart: '<path d="M4 20V10m8 10V4m8 16V7"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 6 0 0 1 16 0v4"/>',
    video: '<rect x="3" y="5" width="18" height="14"/><path d="m10 9 5 3-5 3z"/>',
    flame: '<path d="M12 3c2 5-3 5-2 9 3-1 4-3 4-5 6 5 7 9 3 13-4 4-11 1-11-4 0-4 3-6 6-13z"/>',
    panel: '<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16m8-12-4 4 4 4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
    sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
}

export function icon(name) {
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`
}

export function fillIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach(node => { node.innerHTML = icon(node.dataset.icon) })
}

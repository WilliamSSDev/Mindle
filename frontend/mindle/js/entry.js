// Keep old bookmarks and authentication redirects working while retaining any
// selected route or explicit preview flag. No backend redirect is needed.
const destination = new URL("mindle/index.html", window.location.href)
destination.search = window.location.search
destination.hash = window.location.hash
window.location.replace(destination)

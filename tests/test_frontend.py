import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


class PageParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.references = []
        self.elements = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        for name in ("src", "href"):
            if attrs.get(name):
                self.references.append(attrs[name])


def local_reference(parent, reference):
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path:
        return None
    base = FRONTEND if url.path.startswith("/") else parent.parent
    return (base / unquote(url.path).lstrip("/")).resolve()


class FrontendTests(unittest.TestCase):
    def test_every_local_page_asset_and_link_exists(self):
        for page in FRONTEND.rglob("*.html"):
            parser = PageParser(page.read_text(encoding="utf-8"))
            for reference in parser.references:
                target = local_reference(page, reference)
                if target is not None:
                    with self.subTest(page=page.name, reference=reference):
                        self.assertTrue(target.is_file(), str(target))

    def test_all_stylesheets_and_scripts_are_reachable_from_pages(self):
        visited = set()
        pending = list(FRONTEND.rglob("*.html"))
        while pending:
            file = pending.pop().resolve()
            if file in visited:
                continue
            visited.add(file)
            source = file.read_text(encoding="utf-8")
            if file.suffix == ".html":
                references = PageParser(source).references
            elif file.suffix == ".js":
                references = re.findall(r'''\b(?:from\s*|import\s*)["']([^"']+)["']''', source)
            elif file.suffix == ".css":
                references = re.findall(r'''url\(\s*["']?([^\s"')]+)''', source)
            else:
                continue
            for reference in references:
                target = local_reference(file, reference)
                if target is not None:
                    self.assertTrue(target.is_file(), f"{file}: {reference}")
                    pending.append(target)
        assets = {
            path.resolve() for path in FRONTEND.rglob("*")
            if path.suffix in {".css", ".js"}
        }
        self.assertEqual(assets - visited, set())

    def test_speech_controls_and_styles_are_in_both_pages(self):
        for name in ("legacy-dashboard.html", "add_card.html"):
            with self.subTest(page=name):
                parser = PageParser((FRONTEND / name).read_text(encoding="utf-8"))
                ids = {attrs.get("id") for _, attrs in parser.elements}
                self.assertIn("editor-speech-controls", ids)
                self.assertIn("review-speech-controls", ids)
                self.assertIn("assets/css/speech.css?v=2", parser.references)
                self.assertIn("assets/js/speech-init.js?v=2", parser.references)
                buttons = [
                    attrs for tag, attrs in parser.elements
                    if tag == "button" and "data-speech-source" in attrs
                ]
                self.assertEqual(len(buttons), 3)
                self.assertTrue(all(attrs.get("type") == "button" for attrs in buttons))


if __name__ == "__main__":
    unittest.main()

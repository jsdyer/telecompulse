"""Check the Oxford coverage example and survey offers in Chrome."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright


def main():
    directory = Path(__file__).resolve().parents[1] / "dist"
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=directory))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch(channel="chrome")
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"http://127.0.0.1:{server.server_port}/?example=oxford")
            page.locator("#oxford-note").wait_for()
            assert "1211012" in page.locator("#place option:checked").inner_text()
            assert "Gigabit" in page.locator("#stats").inner_text()
            page.locator("#report-details summary").click()
            page.locator("#report-year").select_option("2024")
            page.get_by_text("Starlink", exact=True).wait_for()
            assert "Wedgeport" in page.locator("#report-rows").inner_text()
            page.locator("#report-year").select_option("2025")
            page.get_by_text("Xplore", exact=True).wait_for()
            assert "City Wide" in page.locator("#report-rows").inner_text()
            page.locator("#metric").select_option("lte")
            page.locator("#oxford-note").wait_for(state="hidden")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()

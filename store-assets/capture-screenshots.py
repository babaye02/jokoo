#!/usr/bin/env python3
"""
Capture les screenshots pour App Store & Play Store depuis le preview web.

Prérequis :
    pip install playwright
    playwright install chromium

Usage :
    # Démarrer le backend + expo (depuis le repo racine)
    sudo supervisorctl restart backend expo

    # Lancer ce script
    python3 store-assets/capture-screenshots.py

Ce script :
1. Se connecte comme Aïda Client (ambassadrice avec 5 filleuls verified)
2. Navigue vers 10 écrans clés
3. Sauvegarde des PNG à la résolution iPhone 15 Pro Max (1290×2796)
4. Copie les screenshots en 1080×2400 pour Google Play (proportion identique)
"""
import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

OUTPUT_IOS = Path(__file__).parent / "screenshots" / "ios-6.7"
OUTPUT_ANDROID = Path(__file__).parent / "screenshots" / "android"
OUTPUT_IOS.mkdir(parents=True, exist_ok=True)
OUTPUT_ANDROID.mkdir(parents=True, exist_ok=True)

BASE = os.environ.get("STORE_SCREENSHOT_URL", "http://localhost:3000")
EMAIL = os.environ.get("STORE_SCREENSHOT_EMAIL", "client@jokoo.sn")
PASSWORD = os.environ.get("STORE_SCREENSHOT_PASSWORD", "Passw0rd!")

# CSS px, avec DPR=3 → 1290×2796 physiques (iPhone 15 Pro Max)
CSS_W, CSS_H = 430, 932
DEVICE_SCALE_FACTOR = 3.0  # → 1290×2796

# Écrans à capturer avec description marketing (pour overlay ultérieur)
SCREENS = [
    ("00-welcome", "/", "Tous vos services. En un tap.", 3000),
    ("01-home", "/", "Découvrez les meilleurs prestataires", 5000, True),  # after login
    ("02-search", "/recherche", "Recherchez ce dont vous avez besoin", 5000, True),
    ("03-mobility", "/mobility", "Covoiturage & Livraison partout au Sénégal", 5000, True),
    ("04-family", "/family", "Jokoo Family : babysitting & tutorat", 5000, True),
    ("05-ambassador", "/ambassador/dashboard", "Devenez Jokoo Partner", 5000, True),
    ("06-profile", "/(tabs)/profile", "Votre profil, vos réservations", 5000, True),
    ("07-notifications", "/(tabs)/notifications", "Notifications en temps réel", 5000, True),
    ("08-leaderboard", "/ambassador/leaderboard", "Classement des ambassadeurs", 5000, True),
    ("09-provider", "/providers", "Trouvez le prestataire idéal", 5000, True),
]


async def login(page):
    await page.goto(f"{BASE}/login")
    await page.wait_for_selector("input", timeout=15000)
    await page.wait_for_timeout(2000)
    inputs = await page.locator("input").all()
    if len(inputs) >= 2:
        await inputs[0].fill(EMAIL)
        await inputs[1].fill(PASSWORD)
        await page.get_by_text("Se connecter", exact=True).last.click()
        await page.wait_for_timeout(5000)


async def capture_ios(page, filename, path, delay_ms, need_login):
    if need_login:
        await login(page)
    await page.goto(f"{BASE}{path}")
    await page.wait_for_selector("#root", timeout=15000)
    await page.wait_for_function(
        "() => document.querySelector('#root') && document.querySelector('#root').innerText.length > 10",
        timeout=20000,
    )
    await page.wait_for_timeout(delay_ms)
    out = OUTPUT_IOS / f"{filename}.png"
    await page.screenshot(path=str(out), full_page=False, type="png")
    print(f"  ✅ iOS {out.name}")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": CSS_W, "height": CSS_H},
            device_scale_factor=DEVICE_SCALE_FACTOR,
            is_mobile=True,
            has_touch=True,
        )
        page = await ctx.new_page()
        print(f"📱 Capture iOS 6.7\" (1290×2796) — {len(SCREENS)} écrans")
        for spec in SCREENS:
            fname = spec[0]
            path = spec[1]
            delay = spec[3]
            need_login = spec[4] if len(spec) > 4 else False
            try:
                await capture_ios(page, fname, path, delay, need_login)
            except Exception as e:
                print(f"  ❌ {fname}: {e}")
        await ctx.close()
        # Duplicate for Android at 1080×2400
        print(f"\n📱 Génération des versions Android (1080×2400)")
        ctx = await browser.new_context(
            viewport={"width": 360, "height": 800},  # Android standard
            device_scale_factor=3.0,  # → 1080×2400
            is_mobile=True,
            has_touch=True,
        )
        page = await ctx.new_page()
        for spec in SCREENS:
            fname = spec[0]
            path = spec[1]
            delay = spec[3]
            need_login = spec[4] if len(spec) > 4 else False
            try:
                if need_login:
                    await login(page)
                await page.goto(f"{BASE}{path}")
                await page.wait_for_selector("#root", timeout=15000)
                await page.wait_for_function(
                    "() => document.querySelector('#root') && document.querySelector('#root').innerText.length > 10",
                    timeout=20000,
                )
                await page.wait_for_timeout(delay)
                out = OUTPUT_ANDROID / f"{fname}.png"
                await page.screenshot(path=str(out), full_page=False, type="png")
                print(f"  ✅ Android {out.name}")
            except Exception as e:
                print(f"  ❌ Android {fname}: {e}")
        await browser.close()
    print("\n🎉 Terminé !")
    print(f"   iOS : {OUTPUT_IOS}")
    print(f"   Android : {OUTPUT_ANDROID}")


if __name__ == "__main__":
    asyncio.run(main())

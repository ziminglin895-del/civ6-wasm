# -*- coding: utf-8 -*-
"""
Verification suite for live deployed GitHub Pages Civ 6 WASM.
Tests status codes, asset presence, and payload sizes.
"""
import time
import urllib.request
import json
import ssl

def test_live_deployment():
    ctx = ssl.create_default_context()
    base_url = "https://ziminglin895-del.github.io/civ6-wasm"
    
    endpoints = [
        ("/", 200, "Sid Meier's Civilization VI"),
        ("/index.html", 200, "秦始皇"),
        ("/style.css", 200, "Civilization VI Authentic Gold"),
        ("/three.min.js", 200, "THREE"),
        ("/OrbitControls.js", 200, "OrbitControls"),
        ("/civ6_boot_bundle.js", 200, "CIV6_BOOT_BUNDLE"),
        ("/civ6_engine.js", 200, "Civ6Engine"),
        ("/civ6_network.js", 200, "Civ6NetworkManager"),
        ("/assets/arx/Civ6Logo.png", 200, None),
        ("/assets/arx/Civ_LEADER_QIN.png", 200, None),
        ("/assets/arx/Civ_LEADER_TRAJAN.png", 200, None),
        ("/assets/arx/BackgroundARX.png", 200, None),
        ("/assets/audio/civ6_theme.ogg", 200, None),
    ]

    print("=== LIVE GITHUB PAGES DEPLOYMENT VERIFICATION ===")
    results = []
    for path, expected_status, expected_text in endpoints:
        url = f"{base_url}{path}?_t={int(time.time())}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                status = resp.status
                body = resp.read()
                size = len(body)
                passed = (status == expected_status)
                if expected_text and passed:
                    text = body.decode("utf-8", errors="ignore")
                    passed = expected_text in text
                results.append((path, status, size, passed))
                print(f"[{'PASS' if passed else 'FAIL'}] {path} -> HTTP {status}, Size: {size} bytes")
        except Exception as e:
            results.append((path, "ERR", str(e), False))
            print(f"[FAIL] {path} -> Error: {e}")

    all_passed = all(r[3] for r in results)
    print("=================================================")
    print(f"Summary: {sum(1 for r in results if r[3])}/{len(results)} endpoints passed.")
    assert all_passed, "Not all live endpoints passed verification"

if __name__ == "__main__":
    test_live_deployment()

# -*- coding: utf-8 -*-
"""
Automated End-to-End Tests for Civilization VI WASM/Web-Native Multiplayer System
"""

import os
import sys
import time
import json
import urllib.request
import asyncio
import threading
import pytest
import websockets

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

from rea_extractor import Civ6REAExtractor
from game_engine import Civ6GameEngine
from multiplayer_server import Civ6HTTPHandler, ws_handler, ROOM_MANAGER, ThreadingHTTPServer


def test_rea_asset_extraction():
    """Verifies that REA successfully parsed official Civ 6 XML rules and datasets."""
    extractor = Civ6REAExtractor()
    bundle = extractor.build_boot_bundle()

    assert bundle["version"] == "1.0.0-wasm"
    assert len(bundle["technologies"]) >= 50
    assert len(bundle["civics"]) >= 40
    assert len(bundle["units"]) >= 50
    assert len(bundle["civilizations"]) >= 30

    # Verify key official Civ 6 technologies exist
    tech_ids = [t["id"] for t in bundle["technologies"]]
    assert "TECH_ANIMAL_HUSBANDRY" in tech_ids
    assert "TECH_ARCHERY" in tech_ids
    assert "TECH_BRONZE_WORKING" in tech_ids

    # Verify official units exist
    unit_ids = [u["id"] for u in bundle["units"]]
    assert "UNIT_SETTLER" in unit_ids
    assert "UNIT_WARRIOR" in unit_ids


def test_game_engine_core_mechanics():
    """Verifies 4X turn resolution, hexagonal movement, and city founding."""
    engine = Civ6GameEngine(map_width=16, map_height=12, seed=123)

    # 1. Add Players (豪哥 & 对象)
    p1 = engine.add_player("haige", "豪哥 (China)", civ_id="CIVILIZATION_CHINA", color="#e74c3c")
    p2 = engine.add_player("partner", "对象 (Rome)", civ_id="CIVILIZATION_ROME", color="#3498db")

    assert len(engine.players) == 2
    assert len(engine.units) == 4  # 2 Settlers + 2 Warriors

    # 2. Find Haige's Settler
    settler = [u for u in engine.units.values() if u["owner"] == "haige" and u["type"] == "UNIT_SETTLER"][0]
    sq, sr = settler["q"], settler["r"]

    # 3. Found City
    res_city = engine.found_city("haige", settler["id"], "长安 (Chang'an)")
    assert res_city["success"] is True
    assert len(engine.cities) == 1
    assert engine.map_tiles[f"{sq},{sr}"]["owner"] == "haige"

    # Settler consumed
    assert settler["id"] not in engine.units

    # 4. Turn Resolution (Both players end turn)
    res_p1 = engine.set_player_ready("haige", True)
    assert res_p1["turn_advanced"] is False

    res_p2 = engine.set_player_ready("partner", True)
    assert res_p2["turn_advanced"] is True
    assert res_p2["current_turn"] == 2
    assert engine.turn_number == 2


def test_multiplayer_http_endpoints():
    """Verifies HTTP static file serving and API status discovery."""
    test_port = 8092
    server = ThreadingHTTPServer(("127.0.0.1", test_port), Civ6HTTPHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)

    try:
        base_url = f"http://127.0.0.1:{test_port}"

        # 1. Test GET /
        with urllib.request.urlopen(f"{base_url}/") as resp:
            assert resp.status == 200
            html = resp.read().decode("utf-8")
            assert "文明6 · 网页联机版" in html
            assert "civ6_engine.js" in html

        # 2. Test GET /api/status
        with urllib.request.urlopen(f"{base_url}/api/status") as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["status"] == "online"
            assert "network" in data
            assert "default_invite_link" in data

        # 3. Test GET /static/civ6_boot_bundle.json
        with urllib.request.urlopen(f"{base_url}/static/civ6_boot_bundle.json") as resp:
            assert resp.status == 200
            bundle = json.loads(resp.read().decode("utf-8"))
            assert "technologies" in bundle
            assert len(bundle["technologies"]) >= 50

        # 4. Test root-relative assets (/style.css, /civ6_engine.js, /assets/arx/Civ6Logo.png)
        with urllib.request.urlopen(f"{base_url}/style.css") as resp:
            assert resp.status == 200
            assert "Civilization VI" in resp.read().decode("utf-8")

        with urllib.request.urlopen(f"{base_url}/civ6_engine.js") as resp:
            assert resp.status == 200
            assert "Civ6Engine" in resp.read().decode("utf-8")

        with urllib.request.urlopen(f"{base_url}/assets/arx/Civ6Logo.png") as resp:
            assert resp.status == 200
            assert len(resp.read()) > 1000

    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.anyio
async def test_websocket_multiplayer_relay():
    """Verifies real-time WebSocket room creation, player join, and turn broadcast."""
    ws_port = 8094
    stop_event = asyncio.Event()

    server = await websockets.serve(ws_handler, "127.0.0.1", ws_port)

    try:
        room_id = f"test_{int(time.time())}"

        # Client 1: 豪哥 joins room
        async with websockets.connect(f"ws://127.0.0.1:{ws_port}") as ws1:
            await ws1.send(json.dumps({
                "type": "JOIN_ROOM",
                "room_id": room_id,
                "player_id": "p_haige",
                "player_name": "豪哥",
                "civ_id": "CIVILIZATION_CHINA"
            }))
            resp1 = await ws1.recv()
            data1 = json.loads(resp1)
            assert data1["type"] == "ROOM_STATE"
            assert data1["state"]["turn"] == 1

            # Client 2: 对象 joins room
            async with websockets.connect(f"ws://127.0.0.1:{ws_port}") as ws2:
                await ws2.send(json.dumps({
                    "type": "JOIN_ROOM",
                    "room_id": room_id,
                    "player_id": "p_partner",
                    "player_name": "对象",
                    "civ_id": "CIVILIZATION_ROME"
                }))
                resp2 = await ws2.recv()
                data2 = json.loads(resp2)
                assert data2["type"] == "ROOM_STATE"

                # Client 1 should receive PLAYER_JOINED broadcast
                resp1_join = await ws1.recv()
                data1_join = json.loads(resp1_join)
                assert data1_join["type"] == "PLAYER_JOINED"
                assert data1_join["player_name"] == "对象"

                # Player 1 sends END_TURN -> receives first ready status
                await ws1.send(json.dumps({"type": "END_TURN"}))
                resp1_ready = await ws1.recv()
                data1_ready = json.loads(resp1_ready)
                assert data1_ready["type"] == "TURN_STATUS"
                assert data1_ready["turn_advanced"] is False

                # Player 2 sends END_TURN -> all players ready, turn advances
                await ws2.send(json.dumps({"type": "END_TURN"}))
                resp1_advanced = await ws1.recv()
                data1_advanced = json.loads(resp1_advanced)
                assert data1_advanced["type"] == "TURN_STATUS"
                assert data1_advanced["turn_advanced"] is True
                assert data1_advanced["current_turn"] == 2

    finally:
        server.close()
        await server.wait_closed()

# -*- coding: utf-8 -*-
"""
Civilization VI WASM/Web-Native Multiplayer Server
Dual-channel HTTP Static File Server & High-Performance WebSocket Game Room Relay.
Allows players (e.g. 豪哥 and his remote girlfriend) to connect via web links and play multiplayer Civ 6 in browser.
"""

import os
import sys
import json
import time
import mimetypes
import asyncio
import threading
from typing import Dict, Any, Set, Tuple, Optional
from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import psutil
import websockets

from game_engine import Civ6GameEngine

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(CURRENT_DIR, "static")

# Global Game Room Manager
class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Civ6GameEngine] = {}
        self.connections: Dict[str, Set[Any]] = {}  # room_id -> set of websocket connections
        self.player_map: Dict[Any, Tuple[str, str]] = {}  # ws -> (room_id, player_id)

    def get_or_create_room(self, room_id: str) -> Civ6GameEngine:
        if room_id not in self.rooms:
            self.rooms[room_id] = Civ6GameEngine(map_width=20, map_height=14)
            self.connections[room_id] = set()
        return self.rooms[room_id]

ROOM_MANAGER = RoomManager()


def get_network_ips() -> Dict[str, str]:
    results = {}
    try:
        for iface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family.name == "AF_INET" and not addr.address.startswith("127."):
                    lower_name = iface.lower()
                    if "radmin" in lower_name or "26." in addr.address:
                        results["radmin_vpn"] = addr.address
                    elif "wlan" in lower_name or "wi-fi" in lower_name:
                        results["wifi_lan"] = addr.address
                    else:
                        results[iface] = addr.address
    except Exception:
        pass
    return results


class Civ6HTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep logs clean
        if "/static/" in args[0] or "/api/" in args[0]:
            return
        super().log_message(format, *args)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            self._serve_file(os.path.join(STATIC_DIR, "index.html"), "text/html")
        elif path.startswith("/static/"):
            rel_path = path[len("/static/"):]
            safe_path = os.path.normpath(os.path.join(STATIC_DIR, rel_path))
            if safe_path.startswith(STATIC_DIR) and os.path.isfile(safe_path):
                mime, _ = mimetypes.guess_type(safe_path)
                self._serve_file(safe_path, mime or "application/octet-stream")
            else:
                self.send_error(HTTPStatus.NOT_FOUND, "Static file not found")
        elif path == "/api/status":
            ips = get_network_ips()
            data = {
                "status": "online",
                "game_mode": "Civilization VI WASM/Web-Native Multiplayer",
                "rooms_count": len(ROOM_MANAGER.rooms),
                "network": ips,
                "default_invite_link": f"http://{ips.get('radmin_vpn', ips.get('wifi_lan', '127.0.0.1'))}:8088/?room=1001"
            }
            self._send_json(data)
        elif path == "/api/rooms":
            data = {
                rid: {
                    "turn": r.turn_number,
                    "players": [p["name"] for p in r.players.values()]
                } for rid, r in ROOM_MANAGER.rooms.items()
            }
            self._send_json(data)
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def _serve_file(self, filepath: str, mime_type: str):
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8" if "text" in mime_type or "javascript" in mime_type else mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))

    def _send_json(self, data: Any):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


# WebSocket Room Relay Handler
async def ws_handler(websocket):
    current_room_id = None
    current_player_id = None

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "JOIN_ROOM":
                room_id = str(msg.get("room_id", "1001"))
                player_id = str(msg.get("player_id", f"player_{int(time.time()*1000)%10000}"))
                player_name = str(msg.get("player_name", "文明领袖"))
                civ_id = str(msg.get("civ_id", "CIVILIZATION_CHINA"))
                color = str(msg.get("color", "#e74c3c"))

                current_room_id = room_id
                current_player_id = player_id

                engine = ROOM_MANAGER.get_or_create_room(room_id)
                ROOM_MANAGER.connections[room_id].add(websocket)

                engine.add_player(player_id, player_name, civ_id, color)

                # Send initial game state to this client
                init_payload = {
                    "type": "ROOM_STATE",
                    "room_id": room_id,
                    "player_id": player_id,
                    "state": engine.get_full_state()
                }
                await websocket.send(json.dumps(init_payload, ensure_ascii=False))

                # Broadcast player joined to room
                join_announce = {
                    "type": "PLAYER_JOINED",
                    "player_id": player_id,
                    "player_name": player_name,
                    "state": engine.get_full_state()
                }
                await broadcast_to_room(room_id, join_announce, exclude=websocket)

            elif msg_type == "MOVE_UNIT" and current_room_id:
                engine = ROOM_MANAGER.rooms.get(current_room_id)
                if engine:
                    res = engine.move_unit(
                        player_id=current_player_id,
                        unit_id=msg.get("unit_id"),
                        target_q=int(msg.get("q")),
                        target_r=int(msg.get("r"))
                    )
                    if res.get("success"):
                        sync_msg = {
                            "type": "STATE_UPDATE",
                            "action": "MOVE_UNIT",
                            "state": engine.get_full_state()
                        }
                        await broadcast_to_room(current_room_id, sync_msg)
                    else:
                        await websocket.send(json.dumps({"type": "ERROR", "message": res.get("error")}))

            elif msg_type == "FOUND_CITY" and current_room_id:
                engine = ROOM_MANAGER.rooms.get(current_room_id)
                if engine:
                    res = engine.found_city(
                        player_id=current_player_id,
                        unit_id=msg.get("unit_id"),
                        city_name=msg.get("city_name")
                    )
                    if res.get("success"):
                        sync_msg = {
                            "type": "STATE_UPDATE",
                            "action": "FOUND_CITY",
                            "state": engine.get_full_state()
                        }
                        await broadcast_to_room(current_room_id, sync_msg)

            elif msg_type == "END_TURN" and current_room_id:
                engine = ROOM_MANAGER.rooms.get(current_room_id)
                if engine:
                    res = engine.set_player_ready(current_player_id, True)
                    sync_msg = {
                        "type": "TURN_STATUS",
                        "player_id": current_player_id,
                        "turn_advanced": res.get("turn_advanced", False),
                        "current_turn": res.get("current_turn"),
                        "state": engine.get_full_state()
                    }
                    await broadcast_to_room(current_room_id, sync_msg)

            elif msg_type == "CHAT" and current_room_id:
                chat_msg = {
                    "type": "CHAT",
                    "sender": msg.get("sender", "玩家"),
                    "text": msg.get("text", ""),
                    "timestamp": time.strftime("%H:%M:%S")
                }
                await broadcast_to_room(current_room_id, chat_msg)

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if current_room_id and websocket in ROOM_MANAGER.connections.get(current_room_id, set()):
            ROOM_MANAGER.connections[current_room_id].remove(websocket)


async def broadcast_to_room(room_id: str, message_dict: dict, exclude=None):
    connections = ROOM_MANAGER.connections.get(room_id, set())
    if not connections:
        return
    msg_str = json.dumps(message_dict, ensure_ascii=False)
    for ws in list(connections):
        if ws != exclude:
            try:
                await ws.send(msg_str)
            except Exception:
                pass


def run_http_server(host: str = "0.0.0.0", port: int = 8088):
    server = ThreadingHTTPServer((host, port), Civ6HTTPHandler)
    server.serve_forever()


async def run_ws_server(host: str = "0.0.0.0", port: int = 8089):
    async with websockets.serve(ws_handler, host, port):
        await asyncio.Future()  # run forever


def start_all_services(http_port: int = 8088, ws_port: int = 8089):
    t_http = threading.Thread(target=run_http_server, args=("0.0.0.0", http_port), daemon=True)
    t_http.start()

    ips = get_network_ips()
    print("=" * 65)
    print("🏛️ Civilization VI WASM/Web 原生多人联机中继服务已启动！")
    print(f"   本地控制台地址:   http://127.0.0.1:{http_port}")
    if "radmin_vpn" in ips:
        print(f"   异地对象联机地址: http://{ips['radmin_vpn']}:{http_port}/?room=1001")
    if "wifi_lan" in ips:
        print(f"   局域网联机地址:   http://{ips['wifi_lan']}:{http_port}/?room=1001")
    print("=" * 65)

    asyncio.run(run_ws_server("0.0.0.0", ws_port))


if __name__ == "__main__":
    start_all_services()

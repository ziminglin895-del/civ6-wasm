# -*- coding: utf-8 -*-
"""
Civilization VI WASM/Web-Native Deterministic 4X Game Engine
Implements authentic Civilization VI hexagonal grid mechanics,
turn resolution, unit movements, city founding, and multiplayer synchronization.
"""

import math
import random
from typing import Dict, Any, List, Optional, Tuple


class HexCoord:
    @staticmethod
    def distance(q1: int, r1: int, q2: int, r2: int) -> int:
        return (abs(q1 - q2) + abs(q1 + r1 - q2 - r2) + abs(r1 - r2)) // 2

    @staticmethod
    def neighbors(q: int, r: int) -> List[Tuple[int, int]]:
        directions = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
        return [(q + dq, r + dr) for dq, dr in directions]


class Civ6GameEngine:
    def __init__(self, map_width: int = 20, map_height: int = 14, seed: int = 42):
        self.map_width = map_width
        self.map_height = map_height
        self.seed = seed
        self.random = random.Random(seed)
        self.turn_number = 1
        self.map_tiles: Dict[str, Dict[str, Any]] = {}
        self.players: Dict[str, Dict[str, Any]] = {}
        self.units: Dict[str, Dict[str, Any]] = {}
        self.cities: Dict[str, Dict[str, Any]] = {}
        self.turn_readiness: Dict[str, bool] = {}
        self.unit_counter = 1
        self.city_counter = 1

        self._generate_map()

    def _generate_map(self):
        terrains = ["TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_OCEAN", "TERRAIN_MOUNTAIN"]
        weights = [0.35, 0.30, 0.10, 0.08, 0.10, 0.07]

        for q in range(self.map_width):
            for r in range(self.map_height):
                key = f"{q},{r}"
                # Edges are oceans
                if q == 0 or q == self.map_width - 1 or r == 0 or r == self.map_height - 1:
                    terrain = "TERRAIN_OCEAN"
                else:
                    terrain = self.random.choices(terrains, weights=weights)[0]

                # Yields
                if terrain == "TERRAIN_GRASS":
                    food, prod, gold = 2, 0, 0
                elif terrain == "TERRAIN_PLAINS":
                    food, prod, gold = 1, 1, 0
                elif terrain == "TERRAIN_OCEAN":
                    food, prod, gold = 1, 0, 1
                elif terrain == "TERRAIN_DESERT":
                    food, prod, gold = 0, 0, 0
                elif terrain == "TERRAIN_TUNDRA":
                    food, prod, gold = 1, 0, 0
                else:  # MOUNTAIN
                    food, prod, gold = 0, 0, 0

                self.map_tiles[key] = {
                    "q": q,
                    "r": r,
                    "terrain": terrain,
                    "yield": {"food": food, "production": prod, "gold": gold},
                    "owner": None,
                    "district": None
                }

    def add_player(self, player_id: str, player_name: str, civ_id: str = "CIVILIZATION_CHINA", color: str = "#e74c3c") -> Dict[str, Any]:
        if player_id in self.players:
            return self.players[player_id]

        player_data = {
            "id": player_id,
            "name": player_name,
            "civ_id": civ_id,
            "color": color,
            "gold": 50,
            "science": 0,
            "culture": 0,
            "current_tech": "TECH_POTTERY",
            "tech_progress": 0,
            "completed_techs": [],
            "current_civic": "CIVIC_CODE_OF_LAWS",
            "civic_progress": 0,
            "completed_civics": [],
            "is_ready": False
        }
        self.players[player_id] = player_data
        self.turn_readiness[player_id] = False

        # Spawn Settler and Warrior on suitable land tile
        spawn_q, spawn_r = self._find_spawn_tile(player_id)
        self._spawn_unit(player_id, "UNIT_SETTLER", spawn_q, spawn_r)
        # Spawn warrior adjacent
        neighbors = HexCoord.neighbors(spawn_q, spawn_r)
        warrior_q, warrior_r = spawn_q + 1, spawn_r
        for nq, nr in neighbors:
            key = f"{nq},{nr}"
            tile = self.map_tiles.get(key)
            if tile and tile["terrain"] not in ("TERRAIN_OCEAN", "TERRAIN_MOUNTAIN"):
                warrior_q, warrior_r = nq, nr
                break
        self._spawn_unit(player_id, "UNIT_WARRIOR", warrior_q, warrior_r)

        return player_data

    def _find_spawn_tile(self, player_id: str) -> Tuple[int, int]:
        # Divide map into left/right hemispheres for players
        player_idx = len(self.players) - 1
        min_q = 2 if player_idx == 0 else (self.map_width // 2)
        max_q = (self.map_width // 2) if player_idx == 0 else (self.map_width - 3)

        candidates = []
        for q in range(min_q, max_q):
            for r in range(2, self.map_height - 2):
                tile = self.map_tiles.get(f"{q},{r}")
                if tile and tile["terrain"] in ("TERRAIN_GRASS", "TERRAIN_PLAINS"):
                    candidates.append((q, r))

        if candidates:
            return self.random.choice(candidates)
        return (self.map_width // 2, self.map_height // 2)

    def _spawn_unit(self, player_id: str, unit_type: str, q: int, r: int) -> Dict[str, Any]:
        unit_id = f"unit_{self.unit_counter}"
        self.unit_counter += 1

        moves = 2
        combat = 20 if unit_type == "UNIT_WARRIOR" else 0

        unit = {
            "id": unit_id,
            "owner": player_id,
            "type": unit_type,
            "name": "开拓者 (Settler)" if unit_type == "UNIT_SETTLER" else "勇士 (Warrior)",
            "q": q,
            "r": r,
            "moves": moves,
            "max_moves": moves,
            "combat": combat,
            "health": 100
        }
        self.units[unit_id] = unit
        return unit

    def move_unit(self, player_id: str, unit_id: str, target_q: int, target_r: int) -> Dict[str, Any]:
        unit = self.units.get(unit_id)
        if not unit:
            return {"success": False, "error": "Unit not found"}
        if unit["owner"] != player_id:
            return {"success": False, "error": "Not your unit"}
        if unit["moves"] <= 0:
            return {"success": False, "error": "No movement points left this turn"}

        dist = HexCoord.distance(unit["q"], unit["r"], target_q, target_r)
        if dist != 1:
            return {"success": False, "error": "Can only move 1 hex per step"}

        target_tile = self.map_tiles.get(f"{target_q},{target_r}")
        if not target_tile:
            return {"success": False, "error": "Invalid tile coordinates"}
        if target_tile["terrain"] in ("TERRAIN_OCEAN", "TERRAIN_MOUNTAIN"):
            return {"success": False, "error": f"Cannot enter impassable terrain ({target_tile['terrain']})"}

        # Perform move
        unit["q"] = target_q
        unit["r"] = target_r
        unit["moves"] -= 1

        return {
            "success": True,
            "unit_id": unit_id,
            "new_q": target_q,
            "new_r": target_r,
            "remaining_moves": unit["moves"]
        }

    def found_city(self, player_id: str, unit_id: str, city_name: Optional[str] = None) -> Dict[str, Any]:
        unit = self.units.get(unit_id)
        if not unit:
            return {"success": False, "error": "Unit not found"}
        if unit["owner"] != player_id or unit["type"] != "UNIT_SETTLER":
            return {"success": False, "error": "Only your settler can found a city"}

        cq, cr = unit["q"], unit["r"]
        tile_key = f"{cq},{cr}"
        tile = self.map_tiles.get(tile_key)
        if not tile or tile["owner"] is not None:
            return {"success": False, "error": "Cannot found city on claimed tile"}

        city_id = f"city_{self.city_counter}"
        self.city_counter += 1
        default_names = ["西安 (Xi'an)", "洛阳 (Luoyang)", "北京 (Beijing)", "罗马 (Rome)", "雅典 (Athens)"]
        name = city_name or default_names[(self.city_counter - 2) % len(default_names)]

        city = {
            "id": city_id,
            "name": name,
            "owner": player_id,
            "q": cq,
            "r": cr,
            "population": 1,
            "food_stored": 0,
            "production_stored": 0,
            "current_production": "UNIT_WARRIOR",
            "production_cost": 40
        }
        self.cities[city_id] = city

        # Claim city tile and 6 surrounding tiles
        tile["owner"] = player_id
        for nq, nr in HexCoord.neighbors(cq, cr):
            nkey = f"{nq},{nr}"
            ntile = self.map_tiles.get(nkey)
            if ntile and ntile["owner"] is None:
                ntile["owner"] = player_id

        # Consume settler
        del self.units[unit_id]

        return {"success": True, "city": city}

    def set_player_ready(self, player_id: str, is_ready: bool = True) -> Dict[str, Any]:
        if player_id not in self.players:
            return {"success": False, "error": "Player not in game"}

        self.turn_readiness[player_id] = is_ready
        self.players[player_id]["is_ready"] = is_ready

        # Check if all connected players are ready
        all_ready = len(self.players) > 0 and all(self.turn_readiness.values())
        advanced = False
        if all_ready:
            self._advance_turn()
            advanced = True

        return {
            "success": True,
            "player_id": player_id,
            "is_ready": is_ready,
            "all_ready": all_ready,
            "turn_advanced": advanced,
            "current_turn": self.turn_number
        }

    def _advance_turn(self):
        self.turn_number += 1

        # Reset player readiness
        for p in self.turn_readiness:
            self.turn_readiness[p] = False
            self.players[p]["is_ready"] = False

        # Reset unit movement points
        for u in self.units.values():
            u["moves"] = u["max_moves"]

        # Process city production & growth
        for city in self.cities.values():
            city["food_stored"] += 2
            city["production_stored"] += 3

            # Check growth
            if city["food_stored"] >= 15:
                city["population"] += 1
                city["food_stored"] = 0

            # Check production completion
            if city["production_stored"] >= city["production_cost"]:
                city["production_stored"] = 0
                # Spawn built unit adjacent to city
                self._spawn_unit(city["owner"], city["current_production"], city["q"], city["r"])

        # Process science research
        for p in self.players.values():
            p["science"] += 4
            p["gold"] += 5
            p["tech_progress"] += 4
            if p["tech_progress"] >= 25:
                p["completed_techs"].append(p["current_tech"])
                p["tech_progress"] = 0
                p["current_tech"] = "TECH_BRONZE_WORKING"

    def get_full_state(self) -> Dict[str, Any]:
        return {
            "turn": self.turn_number,
            "map": {
                "width": self.map_width,
                "height": self.map_height,
                "tiles": list(self.map_tiles.values())
            },
            "players": list(self.players.values()),
            "units": list(self.units.values()),
            "cities": list(self.cities.values())
        }


if __name__ == "__main__":
    engine = Civ6GameEngine(map_width=16, map_height=12)
    p1 = engine.add_player("player_haige", "豪哥 (China)", civ_id="CIVILIZATION_CHINA", color="#e74c3c")
    p2 = engine.add_player("player_partner", "对象 (Rome)", civ_id="CIVILIZATION_ROME", color="#3498db")
    print(f"Game initialized: Turn {engine.turn_number}, Players: {len(engine.players)}")
    print(f"Total units on board: {len(engine.units)}")
    settler = [u for u in engine.units.values() if u["owner"] == "player_haige" and u["type"] == "UNIT_SETTLER"][0]
    res_city = engine.found_city("player_haige", settler["id"])
    print("Found City result:", res_city["success"], res_city.get("city", {}).get("name"))

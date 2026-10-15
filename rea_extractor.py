# -*- coding: utf-8 -*-
"""
Civilization VI REA Asset & Rule Extractor for WASM/Web Runtime
Extracts official Civilization VI gameplay data, tech trees, units, and terrains
from the local installation into browser-ready boot packages.
"""

import os
import sys
import json
import xml.etree.ElementTree as ET
from typing import Dict, Any, List

GAME_ROOT = r"D:\Desktop\游戏中心\wenming"
DATA_DIR = os.path.join(GAME_ROOT, r"Base\Assets\Gameplay\Data")
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


class Civ6REAExtractor:
    def __init__(self, data_dir: str = DATA_DIR, output_dir: str = OUTPUT_DIR):
        self.data_dir = data_dir
        self.output_dir = output_dir

    def extract_technologies(self) -> List[Dict[str, Any]]:
        tech_path = os.path.join(self.data_dir, "Technologies.xml")
        if not os.path.exists(tech_path):
            return []

        tree = ET.parse(tech_path)
        root = tree.getroot()
        techs = []

        # Find all <Row> under Technologies
        tech_table = root.find("Technologies")
        if tech_table is not None:
            for row in tech_table.findall("Row"):
                tech_type = row.attrib.get("TechnologyType")
                cost = int(row.attrib.get("Cost", "25"))
                era = row.attrib.get("EraType", "ERA_ANCIENT")
                name = row.attrib.get("Name", tech_type)
                techs.append({
                    "id": tech_type,
                    "name": name.replace("LOC_TECH_", "").replace("_NAME", "").title().replace("_", " "),
                    "cost": cost,
                    "era": era.replace("ERA_", "").title()
                })
        return techs

    def extract_civics(self) -> List[Dict[str, Any]]:
        civic_path = os.path.join(self.data_dir, "Civics.xml")
        if not os.path.exists(civic_path):
            return []

        tree = ET.parse(civic_path)
        root = tree.getroot()
        civics = []

        civic_table = root.find("Civics")
        if civic_table is not None:
            for row in civic_table.findall("Row"):
                civic_type = row.attrib.get("CivicType")
                cost = int(row.attrib.get("Cost", "20"))
                era = row.attrib.get("EraType", "ERA_ANCIENT")
                name = row.attrib.get("Name", civic_type)
                civics.append({
                    "id": civic_type,
                    "name": name.replace("LOC_CIVIC_", "").replace("_NAME", "").title().replace("_", " "),
                    "cost": cost,
                    "era": era.replace("ERA_", "").title()
                })
        return civics

    def extract_units(self) -> List[Dict[str, Any]]:
        units_path = os.path.join(self.data_dir, "Units.xml")
        if not os.path.exists(units_path):
            return []

        tree = ET.parse(units_path)
        root = tree.getroot()
        units = []

        units_table = root.find("Units")
        if units_table is not None:
            for row in units_table.findall("Row"):
                unit_type = row.attrib.get("UnitType")
                cost = int(row.attrib.get("Cost", "40"))
                moves = int(row.attrib.get("BaseMoves", "2"))
                combat = int(row.attrib.get("Combat", "0"))
                domain = row.attrib.get("Domain", "DOMAIN_LAND")
                formation = row.attrib.get("FormationClass", "FORMATION_CLASS_LAND_COMBAT")
                name = row.attrib.get("Name", unit_type)
                units.append({
                    "id": unit_type,
                    "name": name.replace("LOC_UNIT_", "").replace("_NAME", "").title().replace("_", " "),
                    "cost": cost,
                    "moves": moves,
                    "combat": combat,
                    "domain": domain.replace("DOMAIN_", "").title(),
                    "formation": formation
                })
        return units

    def extract_civilizations(self) -> List[Dict[str, Any]]:
        civs_path = os.path.join(self.data_dir, "Civilizations.xml")
        if not os.path.exists(civs_path):
            return []

        tree = ET.parse(civs_path)
        root = tree.getroot()
        civs = []

        civ_table = root.find("Civilizations")
        if civ_table is not None:
            for row in civ_table.findall("Row"):
                civ_type = row.attrib.get("CivilizationType")
                name = row.attrib.get("Name", civ_type)
                desc = row.attrib.get("Description", "")
                if civ_type and "BARBARIAN" not in civ_type:
                    civs.append({
                        "id": civ_type,
                        "name": name.replace("LOC_CIVILIZATION_", "").replace("_NAME", "").title().replace("_", " "),
                        "desc": desc
                    })
        return civs

    def build_boot_bundle(self) -> Dict[str, Any]:
        techs = self.extract_technologies()
        civics = self.extract_civics()
        units = self.extract_units()
        civs = self.extract_civilizations()

        bundle = {
            "version": "1.0.0-wasm",
            "source": "Sid Meier's Civilization VI Official GameData",
            "timestamp": "2026-10-15",
            "technologies": techs,
            "civics": civics,
            "units": units,
            "civilizations": civs,
            "terrains": [
                {"id": "TERRAIN_GRASS", "name": "草原 (Grassland)", "yield": {"food": 2, "prod": 0, "gold": 0}, "color": "#4caf50"},
                {"id": "TERRAIN_PLAINS", "name": "平原 (Plains)", "yield": {"food": 1, "prod": 1, "gold": 0}, "color": "#8bc34a"},
                {"id": "TERRAIN_DESERT", "name": "沙漠 (Desert)", "yield": {"food": 0, "prod": 0, "gold": 0}, "color": "#e0c068"},
                {"id": "TERRAIN_TUNDRA", "name": "冻土 (Tundra)", "yield": {"food": 1, "prod": 0, "gold": 0}, "color": "#90a4ae"},
                {"id": "TERRAIN_OCEAN", "name": "海洋 (Ocean)", "yield": {"food": 1, "prod": 0, "gold": 1}, "color": "#1976d2"},
                {"id": "TERRAIN_MOUNTAIN", "name": "山脉 (Mountain)", "yield": {"food": 0, "prod": 0, "gold": 0}, "color": "#607d8b"}
            ]
        }

        # Write to static directory for direct Web fetch
        static_out = os.path.join(self.output_dir, "static", "civ6_boot_bundle.json")
        with open(static_out, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, indent=2)

        return bundle


if __name__ == "__main__":
    extractor = Civ6REAExtractor()
    bundle = extractor.build_boot_bundle()
    print("=== Civ6 REA Asset Extraction Finished ===")
    print(f"Technologies extracted: {len(bundle['technologies'])}")
    print(f"Civics extracted: {len(bundle['civics'])}")
    print(f"Units extracted: {len(bundle['units'])}")
    print(f"Civilizations extracted: {len(bundle['civilizations'])}")

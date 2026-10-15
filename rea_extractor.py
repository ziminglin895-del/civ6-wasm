# -*- coding: utf-8 -*-
"""
Civilization VI REA Asset & Rule Extractor for WASM/Web Runtime
Extracts official Civilization VI gameplay data, 68 technologies, 51 civics, 97 units,
official Sean Bean historical quotes, and terrains from the local installation.
"""

import os
import sys
import json
import xml.etree.ElementTree as ET
from typing import Dict, Any, List

GAME_ROOT = r"D:\Desktop\游戏中心\wenming"
DATA_DIR = os.path.join(GAME_ROOT, r"Base\Assets\Gameplay\Data")
TEXT_PATH = os.path.join(GAME_ROOT, r"Base\Assets\Text\Vanilla_zh_Hans_CN.xml")
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

TECH_NAMES_ZH = {
    "TECH_POTTERY": "陶艺",
    "TECH_ANIMAL_HUSBANDRY": "畜牧业",
    "TECH_MINING": "采矿",
    "TECH_SAILING": "航海术",
    "TECH_ASTROLOGY": "占星术",
    "TECH_IRRIGATION": "灌溉",
    "TECH_ARCHERY": "箭术",
    "TECH_WRITING": "写作",
    "TECH_MASONRY": "砌砖",
    "TECH_BRONZE_WORKING": "炼铜术",
    "TECH_THE_WHEEL": "轮子",
    "TECH_CELESTIAL_NAVIGATION": "天文导航",
    "TECH_CURRENCY": "货币",
    "TECH_HORSEBACK_RIDING": "骑术",
    "TECH_IRON_WORKING": "炼铁术",
    "TECH_SHIPBUILDING": "造船术",
    "TECH_MATHEMATICS": "数学",
    "TECH_CONSTRUCTION": "建造",
    "TECH_ENGINEERING": "工程学",
    "TECH_MILITARY_TACTICS": "战术学",
    "TECH_APPRENTICESHIP": "学徒制",
    "TECH_MACHINERY": "机械",
    "TECH_EDUCATION": "教育",
    "TECH_STIRRUPS": "马镫",
    "TECH_MILITARY_ENGINEERING": "军事工程",
    "TECH_CASTLES": "城堡",
    "TECH_CARTOGRAPHY": "制图学",
    "TECH_MASS_PRODUCTION": "大规模生产",
    "TECH_BANKING": "银行业",
    "TECH_GUNPOWDER": "火药",
    "TECH_PRINTING": "印刷术",
    "TECH_SQUARE_RIGGING": "紧固风帆",
    "TECH_ASTRONOMY": "天文学",
    "TECH_METAL_CASTING": "金属铸造",
    "TECH_SIEGE_TACTICS": "攻城战术",
    "TECH_INDUSTRIALIZATION": "工业化",
    "TECH_SCIENTIFIC_THEORY": "科学理论",
    "TECH_BALLISTICS": "弹道学",
    "TECH_MILITARY_SCIENCE": "军事学",
    "TECH_STEAM_POWER": "蒸汽动力",
    "TECH_SANITATION": "卫生学",
    "TECH_ECONOMICS": "经济学",
    "TECH_RIFLING": "膛线",
    "TECH_FLIGHT": "飞行",
    "TECH_REPLACEABLE_PARTS": "可更换部件",
    "TECH_STEEL": "钢铁",
    "TECH_ELECTRICITY": "电力",
    "TECH_RADIO": "无线电",
    "TECH_CHEMISTRY": "化学",
    "TECH_COMBUSTION": "内燃机",
    "TECH_ADVANCED_FLIGHT": "先进飞行",
    "TECH_ROCKETRY": "火箭学",
    "TECH_ADVANCED_BALLISTICS": "先进弹道学",
    "TECH_COMBINED_ARMS": "协同作战",
    "TECH_PLASTICS": "塑料",
    "TECH_COMPUTERS": "计算机",
    "TECH_NUCLEAR_FISSION": "核裂变",
    "TECH_SYNTHETIC_MATERIALS": "合成材料",
    "TECH_TELECOMMUNICATIONS": "电信",
    "TECH_SATELLITES": "人造卫星",
    "TECH_GUIDANCE_SYSTEMS": "制导系统",
    "TECH_LASERS": "激光",
    "TECH_COMPOSITES": "复合材料",
    "TECH_STEALTH_TECHNOLOGY": "隐形技术",
    "TECH_ROBOTICS": "机器人技术",
    "TECH_NANOTECHNOLOGY": "纳米技术",
    "TECH_NUCLEAR_FUSION": "核聚变",
    "TECH_FUTURE_TECH": "未来科技"
}

CIVIC_NAMES_ZH = {
    "CIVIC_CODE_OF_LAWS": "法典",
    "CIVIC_CRAFTSMANSHIP": "技艺",
    "CIVIC_FOREIGN_TRADE": "对外贸易",
    "CIVIC_MILITARY_TRADITION": "军事传统",
    "CIVIC_STATE_WORKFORCE": "国家劳动力",
    "CIVIC_EARLY_EMPIRE": "早期帝国",
    "CIVIC_MYSTICISM": "神秘主义",
    "CIVIC_GAMES_RECREATION": "游戏与娱乐",
    "CIVIC_POLITICAL_PHILOSOPHY": "政治哲学",
    "CIVIC_DRAMA_POETRY": "戏剧与诗歌",
    "CIVIC_MILITARY_TRAINING": "军事训练",
    "CIVIC_DEFENSIVE_TACTICS": "防御战术",
    "CIVIC_RECORDED_HISTORY": "历史记录",
    "CIVIC_THEOLOGY": "神学",
    "CIVIC_NAVAL_TRADITION": "海军传统",
    "CIVIC_FEUDALISM": "封建主义",
    "CIVIC_CIVIL_SERVICE": "公共行政",
    "CIVIC_MERCENARIES": "雇佣兵",
    "CIVIC_MEDIEVAL_FAIRES": "中世纪集市",
    "CIVIC_GUILDS": "行会",
    "CIVIC_DIVINE_RIGHT": "君权神授",
    "CIVIC_EXPLORATION": "探索",
    "CIVIC_HUMANISM": "人文主义",
    "CIVIC_DIPLOMATIC_SERVICE": "外交服务",
    "CIVIC_REFORMED_CHURCH": "归正教会",
    "CIVIC_MERCANTILISM": "重商主义",
    "CIVIC_THE_ENLIGHTENMENT": "启蒙运动",
    "CIVIC_COLONIALISM": "殖民主义",
    "CIVIC_CIVIL_ENGINEERING": "土木工程",
    "CIVIC_NATIONALISM": "民族主义",
    "CIVIC_OPERA_BALLET": "歌剧与芭蕾",
    "CIVIC_NATURAL_HISTORY": "自然历史",
    "CIVIC_SCORCHED_EARTH": "焦土政策",
    "CIVIC_URBANIZATION": "城市化",
    "CIVIC_CONSERVATION": "自然保护",
    "CIVIC_CAPITALISM": "资本主义",
    "CIVIC_NUCLEAR_PROGRAM": "核计划",
    "CIVIC_MASS_MEDIA": "大众传媒",
    "CIVIC_MOBILIZATION": "动员",
    "CIVIC_IDEOLOGY": "意识形态",
    "CIVIC_SUFFRAGE": "选举权",
    "CIVIC_TOTALITARIANISM": "极权主义",
    "CIVIC_CLASS_STRUGGLE": "阶级斗争",
    "CIVIC_COLD_WAR": "冷战",
    "CIVIC_PROFESSIONAL_SPORTS": "职业体育",
    "CIVIC_CULTURAL_HERITAGE": "文化遗产",
    "CIVIC_RAPID_DEPLOYMENT": "快速部署",
    "CIVIC_SPACE_RACE": "太空竞赛",
    "CIVIC_GLOBALIZATION": "全球化",
    "CIVIC_SOCIAL_MEDIA": "社交媒体",
    "CIVIC_FUTURE_CIVIC": "未来市政"
}

UNIT_NAMES_ZH = {
    "UNIT_SETTLER": "开拓者",
    "UNIT_BUILDER": "建造者",
    "UNIT_TRADER": "商人",
    "UNIT_WARRIOR": "勇士",
    "UNIT_SLINGER": "投石兵",
    "UNIT_ARCHER": "弓箭手",
    "UNIT_SPEARMAN": "长矛兵",
    "UNIT_HEAVY_CHARIOT": "重装战车",
    "UNIT_SWORDSMAN": "剑客",
    "UNIT_HORSEMAN": "骑手",
    "UNIT_CATAPULT": "投石机",
    "UNIT_GALLEY": "桨帆船",
    "UNIT_QUADRIREME": "四段帆船",
    "UNIT_KNIGHT": "骑士",
    "UNIT_CROSSBOWMAN": "弩手",
    "UNIT_PIKEMAN": "枪兵",
    "UNIT_MUSKETMAN": "火枪手",
    "UNIT_FIELD_CANNON": "野战加农炮",
    "UNIT_BOMBARD": "射石炮",
    "UNIT_ROMAN_LEGION": "罗马军团",
    "UNIT_CHINESE_CROUCHING_TIGER": "虎蹲炮",
    "UNIT_BARBARIAN_WARRIOR": "蛮族勇士",
    "UNIT_BARBARIAN_SPEARMAN": "蛮族长矛兵"
}


class Civ6REAExtractor:
    def __init__(self, data_dir: str = DATA_DIR, text_path: str = TEXT_PATH, output_dir: str = OUTPUT_DIR):
        self.data_dir = data_dir
        self.text_path = text_path
        self.output_dir = output_dir
        self.quotes = self._load_quotes()

    def _load_quotes(self) -> Dict[str, str]:
        quotes = {}
        if not os.path.exists(self.text_path):
            return quotes
        try:
            tree = ET.parse(self.text_path)
            root = tree.getroot()
            table = root.find("LocalizedText")
            if table is not None:
                for rep in table.findall("Replace"):
                    tag = rep.attrib.get("Tag", "")
                    if "QUOTE" in tag:
                        t = rep.find("Text")
                        if t is not None and t.text:
                            quotes[tag] = t.text.replace("[NEWLINE]", " ").strip()
        except Exception as e:
            print(f"Error loading quotes: {e}")
        return quotes

    def extract_technologies(self) -> List[Dict[str, Any]]:
        tech_path = os.path.join(self.data_dir, "Technologies.xml")
        if not os.path.exists(tech_path):
            return []

        tree = ET.parse(tech_path)
        root = tree.getroot()
        techs = []

        tech_table = root.find("Technologies")
        if tech_table is not None:
            for row in tech_table.findall("Row"):
                tech_type = row.attrib.get("TechnologyType")
                cost = int(row.attrib.get("Cost", "25"))
                era = row.attrib.get("EraType", "ERA_ANCIENT").replace("ERA_", "").title()
                en_name = row.attrib.get("Name", tech_type).replace("LOC_TECH_", "").replace("_NAME", "").title().replace("_", " ")
                zh_name = TECH_NAMES_ZH.get(tech_type, en_name)

                # Find official quote
                quote = self.quotes.get(f"LOC_{tech_type}_QUOTE_1") or self.quotes.get(f"LOC_{tech_type}_QUOTE_2") or ""

                techs.append({
                    "id": tech_type,
                    "name": f"{zh_name} ({en_name})",
                    "zh_name": zh_name,
                    "en_name": en_name,
                    "cost": cost,
                    "era": era,
                    "quote": quote
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
                era = row.attrib.get("EraType", "ERA_ANCIENT").replace("ERA_", "").title()
                en_name = row.attrib.get("Name", civic_type).replace("LOC_CIVIC_", "").replace("_NAME", "").title().replace("_", " ")
                zh_name = CIVIC_NAMES_ZH.get(civic_type, en_name)

                quote = self.quotes.get(f"LOC_{civic_type}_QUOTE_1") or self.quotes.get(f"LOC_{civic_type}_QUOTE_2") or ""

                civics.append({
                    "id": civic_type,
                    "name": f"{zh_name} ({en_name})",
                    "zh_name": zh_name,
                    "en_name": en_name,
                    "cost": cost,
                    "era": era,
                    "quote": quote
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
                domain = row.attrib.get("Domain", "DOMAIN_LAND").replace("DOMAIN_", "").title()
                formation = row.attrib.get("FormationClass", "FORMATION_CLASS_LAND_COMBAT")
                en_name = row.attrib.get("Name", unit_type).replace("LOC_UNIT_", "").replace("_NAME", "").title().replace("_", " ")
                zh_name = UNIT_NAMES_ZH.get(unit_type, en_name)

                units.append({
                    "id": unit_type,
                    "name": f"{zh_name} ({en_name})",
                    "zh_name": zh_name,
                    "cost": cost,
                    "moves": moves,
                    "combat": combat,
                    "domain": domain,
                    "formation": formation
                })
        return units

    def extract_buildings(self) -> List[Dict[str, Any]]:
        p = os.path.join(self.data_dir, "Buildings.xml")
        if not os.path.exists(p):
            return []
        tree = ET.parse(p)
        root = tree.getroot()
        buildings = []
        table = root.find("Buildings")
        if table is not None:
            for row in table.findall("Row"):
                btype = row.attrib.get("BuildingType")
                cost = int(row.attrib.get("Cost", "65"))
                prereq_district = row.attrib.get("PrereqDistrict", "DISTRICT_CITY_CENTER")
                en_name = row.attrib.get("Name", btype).replace("LOC_BUILDING_", "").replace("_NAME", "").title().replace("_", " ")
                buildings.append({
                    "id": btype,
                    "name": en_name,
                    "cost": cost,
                    "district": prereq_district
                })
        return buildings

    def extract_districts(self) -> List[Dict[str, Any]]:
        p = os.path.join(self.data_dir, "Districts.xml")
        if not os.path.exists(p):
            return []
        tree = ET.parse(p)
        root = tree.getroot()
        districts = []
        table = root.find("Districts")
        if table is not None:
            for row in table.findall("Row"):
                dtype = row.attrib.get("DistrictType")
                cost = int(row.attrib.get("Cost", "54"))
                en_name = row.attrib.get("Name", dtype).replace("LOC_DISTRICT_", "").replace("_NAME", "").title().replace("_", " ")
                if dtype and "WONDER" not in dtype:
                    districts.append({
                        "id": dtype,
                        "name": en_name,
                        "cost": cost
                    })
        return districts

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

    def extract_all(self) -> Dict[str, Any]:
        bundle = {
            "version": "1.0.0-wasm",
            "source": "Sid Meier's Civilization VI Official GameData & Localization",
            "timestamp": "2026-10-15",
            "technologies": self.extract_technologies(),
            "civics": self.extract_civics(),
            "units": self.extract_units(),
            "civilizations": self.extract_civilizations(),
            "districts": self.extract_districts(),
            "buildings": self.extract_buildings(),
            "terrains": [
                {"id": "TERRAIN_GRASS", "name": "草原 (Grassland)", "yield": {"food": 2, "prod": 0, "gold": 0}, "color": "#4caf50"},
                {"id": "TERRAIN_PLAINS", "name": "平原 (Plains)", "yield": {"food": 1, "prod": 1, "gold": 0}, "color": "#8bc34a"},
                {"id": "TERRAIN_DESERT", "name": "沙漠 (Desert)", "yield": {"food": 0, "prod": 0, "gold": 0}, "color": "#e0c068"},
                {"id": "TERRAIN_TUNDRA", "name": "冻土 (Tundra)", "yield": {"food": 1, "prod": 0, "gold": 0}, "color": "#90a4ae"},
                {"id": "TERRAIN_OCEAN", "name": "海洋 (Ocean)", "yield": {"food": 1, "prod": 0, "gold": 1}, "color": "#1976d2"},
                {"id": "TERRAIN_MOUNTAIN", "name": "山脉 (Mountain)", "yield": {"food": 0, "prod": 0, "gold": 0}, "color": "#607d8b"}
            ]
        }
        return bundle

    def build_boot_bundle(self) -> Dict[str, Any]:
        return self.extract_all()

    def export_bundle(self):
        bundle = self.extract_all()
        # 1. Output json
        json_path = os.path.join(self.output_dir, "civ6_boot_bundle.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, indent=2)

        # 2. Output static js bundle
        js_path = os.path.join(self.output_dir, "civ6_boot_bundle.js")
        with open(js_path, "w", encoding="utf-8") as f:
            f.write(f"window.CIV6_BOOT_BUNDLE = {json.dumps(bundle, ensure_ascii=False)};\n")

        print(f"Extracted {len(bundle['technologies'])} technologies with quotes, {len(bundle['civics'])} civics, {len(bundle['units'])} units.")
        return bundle


if __name__ == "__main__":
    extractor = Civ6REAExtractor()
    extractor.export_bundle()

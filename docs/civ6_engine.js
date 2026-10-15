// Civilization VI WASM/Web-Native Client Engine
// High-DPI 60FPS 3D Isometric Hexagonal Map Renderer with Integrated 4X Deterministic Engine
// Zero-Server Standalone Mode & Multiplayer WebSocket Relay Mode

class Civ6Engine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.hexRadius = 46;
    this.panX = 220;
    this.panY = 160;
    this.scale = 1.0;
    this.gameState = null;
    this.myPlayerId = "player_haige";
    this.selectedUnit = null;
    this.selectedCity = null;
    this.hoveredHex = null;
    this.isStandalone = true;

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.hasDragged = false;
    this.animTime = 0;

    // Palette calibrated against Civilization VI terrain palettes
    this.terrainColors = {
      "TERRAIN_GRASS": { top1: "#347928", top2: "#2d6a22", wall: "#1b4314", name: "草原" },
      "TERRAIN_PLAINS": { top1: "#7e883b", top2: "#68722b", wall: "#464d1c", name: "平原" },
      "TERRAIN_DESERT": { top1: "#c99a3e", top2: "#b5872f", wall: "#7e5a1b", name: "沙漠" },
      "TERRAIN_TUNDRA": { top1: "#6d7f8d", top2: "#5b6b77", wall: "#3d4850", name: "冻土" },
      "TERRAIN_OCEAN": { top1: "#1b4f72", top2: "#154360", wall: "#0e2d42", name: "深海" },
      "TERRAIN_MOUNTAIN": { top1: "#5d6d7e", top2: "#4a5764", wall: "#2c3e50", name: "崇山峻岭" }
    };

    this.initEvents();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.startRenderLoop();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  hexToPixel(q, r, elevation = 0) {
    const size = this.hexRadius * this.scale;
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + this.panX;
    const y = size * (3 / 2 * r) + this.panY - elevation * (12 * this.scale);
    return { x, y };
  }

  pixelToHex(x, y) {
    const size = this.hexRadius * this.scale;
    const px = (x - this.panX) / size;
    const py = (y - this.panY) / size;
    const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py);
    const r = (2 / 3 * py);
    return this.hexRound(q, r);
  }

  hexRound(q, r) {
    let s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }
    return { q: rq, r: rr };
  }

  initEvents() {
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.hasDragged = false;
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.dragStart.x;
        this.panY = e.clientY - this.dragStart.y;
        this.hasDragged = true;
      } else {
        const rect = this.canvas.getBoundingClientRect();
        const hex = this.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
        this.hoveredHex = hex;
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        if (!this.hasDragged && e.button === 0) {
          const rect = this.canvas.getBoundingClientRect();
          this.handleHexClick(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const newScale = Math.max(0.45, Math.min(2.4, this.scale * zoomFactor));
      // Zoom toward cursor
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;
    }, { passive: false });
  }

  handleHexClick(screenX, screenY) {
    if (!this.gameState) return;
    const { q, r } = this.pixelToHex(screenX, screenY);

    // 1. Check City click
    const clickedCity = this.gameState.cities.find(c => c.q === q && c.r === r);
    if (clickedCity) {
      this.selectedCity = clickedCity;
      this.openCityModal(clickedCity);
      return;
    }

    // 2. Check Unit click
    const clickedUnit = this.gameState.units.find(u => u.q === q && u.r === r && u.owner === this.myPlayerId);
    if (clickedUnit) {
      this.selectedUnit = clickedUnit;
      this.updateUnitCard(clickedUnit);
      return;
    }

    // 3. Move selected unit
    if (this.selectedUnit) {
      const dist = (Math.abs(this.selectedUnit.q - q) + Math.abs(this.selectedUnit.q + this.selectedUnit.r - q - r) + Math.abs(this.selectedUnit.r - r)) / 2;
      if (dist === 1 && this.selectedUnit.moves > 0) {
        if (this.isStandalone) {
          this.localMoveUnit(this.selectedUnit.id, q, r);
        } else if (window.networkManager) {
          window.networkManager.sendMoveUnit(this.selectedUnit.id, q, r);
        }
        return;
      }
    }

    // Unselect
    this.selectedUnit = null;
    const unitCard = document.getElementById("unit-card");
    if (unitCard) unitCard.style.display = "none";
  }

  openCityModal(city) {
    const modal = document.getElementById("city-modal");
    const titleEl = document.getElementById("city-modal-title");
    if (modal && titleEl) {
      const owner = this.gameState.players.find(p => p.id === city.owner);
      const ownerName = owner ? owner.name : "未知文明";
      titleEl.innerText = `${city.name} · 人口: ${city.population} · 隶属: ${ownerName}`;
      modal.style.display = "flex";
    }
  }

  updateUnitCard(unit) {
    const card = document.getElementById("unit-card");
    if (!card) return;
    const nameEl = document.getElementById("selected-unit-name");
    const movesEl = document.getElementById("selected-unit-moves");
    const foundBtn = document.getElementById("btn-found-city");

    card.style.display = "block";
    if (nameEl) nameEl.innerText = unit.name;
    if (movesEl) movesEl.innerText = `移动力: ${unit.moves}/${unit.max_moves}`;

    if (foundBtn) {
      foundBtn.style.display = (unit.type === "UNIT_SETTLER") ? "inline-block" : "none";
    }
  }

  // ==========================================
  // Client-Side Deterministic 4X Game Engine
  // ==========================================
  initLocalSoloGame() {
    this.isStandalone = true;
    this.myPlayerId = "player_haige";

    const w = 22;
    const h = 14;
    const tiles = [];

    for (let q = 0; q < w; q++) {
      for (let r = 0; r < h; r++) {
        let terrain = "TERRAIN_GRASS";
        let elevation = 1;
        let isHill = false;
        let resource = null;

        // Sea perimeter
        if (q <= 1 || q >= w - 2 || r <= 1 || r >= h - 2) {
          terrain = "TERRAIN_OCEAN";
          elevation = 0;
          if (Math.random() < 0.2) resource = "🐟 鱼群";
        } else {
          const rand = Math.random();
          if (rand < 0.35) {
            terrain = "TERRAIN_GRASS";
            elevation = 1;
            if (Math.random() < 0.25) resource = "🌾 丰饶麦田";
            if (Math.random() < 0.15) resource = "🐴 野马群";
          } else if (rand < 0.65) {
            terrain = "TERRAIN_PLAINS";
            elevation = 1;
            if (Math.random() < 0.2) isHill = true;
            if (Math.random() < 0.2) resource = "⛏️ 铜矿";
          } else if (rand < 0.78) {
            terrain = "TERRAIN_DESERT";
            elevation = 1;
            if (Math.random() < 0.15) resource = "🧣 丝绸贸易路线";
          } else if (rand < 0.88) {
            terrain = "TERRAIN_MOUNTAIN";
            elevation = 3;
          } else {
            terrain = "TERRAIN_TUNDRA";
            elevation = 1;
            if (Math.random() < 0.15) resource = "💎 稀世水钻";
          }
        }

        tiles.push({
          q: q,
          r: r,
          terrain: terrain,
          elevation: elevation,
          isHill: isHill,
          resource: resource,
          district: null,
          owner: null,
          yield: {
            food: terrain === "TERRAIN_GRASS" ? 2 : (terrain === "TERRAIN_OCEAN" ? 1 : 0),
            production: terrain === "TERRAIN_PLAINS" ? 1 : (isHill ? 2 : 0),
            gold: resource ? 2 : 0
          }
        });
      }
    }

    this.gameState = {
      turn: 1,
      map: { width: w, height: h, tiles: tiles },
      players: [
        {
          id: "player_haige",
          name: "豪哥 (秦始皇)",
          civ_id: "CIVILIZATION_CHINA",
          color: "#e74c3c",
          gold: 60,
          science: 4,
          culture: 2,
          faith: 1,
          current_tech: "陶艺 (Pottery)",
          tech_progress: 10,
          tech_cost: 25,
          completed_techs: ["采矿 (Mining)"],
          current_civic: "法典 (Code of Laws)",
          civic_progress: 8,
          civic_cost: 20,
          is_ready: false
        },
        {
          id: "player_ai_rome",
          name: "图拉真 (罗马帝国)",
          civ_id: "CIVILIZATION_ROME",
          color: "#8e44ad",
          gold: 50,
          science: 4,
          culture: 2,
          faith: 0,
          current_tech: "箭术 (Archery)",
          tech_progress: 0,
          tech_cost: 50,
          completed_techs: [],
          is_ready: true,
          relation: "和平"
        },
        {
          id: "player_ai_cleo",
          name: "克利奥帕特拉 (埃及)",
          civ_id: "CIVILIZATION_EGYPT",
          color: "#f39c12",
          gold: 70,
          science: 3,
          culture: 3,
          faith: 2,
          current_tech: "灌溉 (Irrigation)",
          tech_progress: 0,
          tech_cost: 50,
          is_ready: true,
          relation: "和平"
        },
        {
          id: "player_ai_gandhi",
          name: "甘地 (印度)",
          civ_id: "CIVILIZATION_INDIA",
          color: "#27ae60",
          gold: 40,
          science: 3,
          culture: 2,
          faith: 4,
          current_tech: "占星术 (Astrology)",
          tech_progress: 0,
          tech_cost: 50,
          is_ready: true,
          relation: "和平"
        }
      ],
      units: [
        { id: "u_settler_1", owner: "player_haige", type: "UNIT_SETTLER", name: "大秦开拓者", q: 5, r: 5, moves: 2, max_moves: 2, hp: 100 },
        { id: "u_warrior_1", owner: "player_haige", type: "UNIT_WARRIOR", name: "大秦勇士", q: 6, r: 5, moves: 2, max_moves: 2, hp: 100 },
        { id: "u_rome_settler", owner: "player_ai_rome", type: "UNIT_SETTLER", name: "罗马移民队", q: 15, r: 8, moves: 2, max_moves: 2, hp: 100 },
        { id: "u_rome_legion", owner: "player_ai_rome", type: "UNIT_WARRIOR", name: "罗马军团步兵", q: 14, r: 8, moves: 2, max_moves: 2, hp: 100 },
        { id: "u_cleo_settler", owner: "player_ai_cleo", type: "UNIT_SETTLER", name: "尼罗河移民", q: 8, r: 10, moves: 2, max_moves: 2, hp: 100 },
        { id: "u_gandhi_settler", owner: "player_ai_gandhi", type: "UNIT_SETTLER", name: "孔雀开拓队", q: 16, r: 3, moves: 2, max_moves: 2, hp: 100 }
      ],
      cities: []
    };

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
      window.networkManager.appendChat("system", "🏛️ 【文明6 原生 4X 独立引擎】战局已初始化完毕！中国秦始皇、罗马图拉真、埃及克利奥帕特拉、印度甘地共聚大陆！");
    }
  }

  localMoveUnit(unitId, targetQ, targetR) {
    const unit = this.gameState.units.find(u => u.id === unitId);
    if (!unit || unit.moves <= 0) return;

    const tile = this.gameState.map.tiles.find(t => t.q === targetQ && t.r === targetR);
    if (!tile || tile.terrain === "TERRAIN_OCEAN" || tile.terrain === "TERRAIN_MOUNTAIN") {
      if (window.networkManager) {
        window.networkManager.appendChat("system", "⚠️ 无法移动：海洋或高耸山脉不可直接穿行！");
      }
      return;
    }

    unit.q = targetQ;
    unit.r = targetR;
    unit.moves -= 1;
    this.updateUnitCard(unit);

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
    }
  }

  localFoundCity(unitId) {
    const unitIndex = this.gameState.units.findIndex(u => u.id === unitId);
    if (unitIndex === -1) return;
    const unit = this.gameState.units[unitIndex];

    const cityNames = {
      "player_haige": ["西安 (Xi'an)", "咸阳 (Xianyang)", "洛阳 (Luoyang)", "北京 (Beijing)"],
      "player_ai_rome": ["罗马 (Rome)", "安提阿 (Antioch)", "拉文纳 (Ravenna)"],
      "player_ai_cleo": ["拉美西斯 (Ra-Kedet)", "亚历山大 (Alexandria)"],
      "player_ai_gandhi": ["德里 (Delhi)", "瓦拉纳西 (Varanasi)"]
    };

    const existingCount = this.gameState.cities.filter(c => c.owner === unit.owner).length;
    const nameList = cityNames[unit.owner] || ["未知首府"];
    const cityName = nameList[existingCount % nameList.length];

    const cityId = "c_" + Date.now();
    const city = {
      id: cityId,
      name: cityName,
      owner: unit.owner,
      q: unit.q,
      r: unit.r,
      population: 1,
      production_current: "UNIT_WARRIOR",
      production_progress: 0,
      production_cost: 40,
      buildings: ["宫殿 (Palace)"]
    };
    this.gameState.cities.push(city);

    // Claim 1-ring territory
    const neighbors = [
      { q: unit.q, r: unit.r },
      { q: unit.q + 1, r: unit.r },
      { q: unit.q - 1, r: unit.r },
      { q: unit.q, r: unit.r + 1 },
      { q: unit.q, r: unit.r - 1 },
      { q: unit.q + 1, r: unit.r - 1 },
      { q: unit.q - 1, r: unit.r + 1 }
    ];

    for (const n of neighbors) {
      const tile = this.gameState.map.tiles.find(t => t.q === n.q && t.r === n.r);
      if (tile && !tile.owner) {
        tile.owner = unit.owner;
      }
    }

    // Remove settler
    this.gameState.units.splice(unitIndex, 1);
    this.selectedUnit = null;
    const unitCard = document.getElementById("unit-card");
    if (unitCard) unitCard.style.display = "none";

    if (window.networkManager) {
      window.networkManager.appendChat("system", `🏛️ 宏伟城市【${cityName}】已奠基！领土边界与城市生产线正式启动！`);
      window.networkManager.updateHUD(this.gameState);
    }
  }

  localSetCityProduction(cityId, buildTarget) {
    const city = this.gameState.cities.find(c => c.id === cityId);
    if (!city) return;

    const costs = {
      "UNIT_WARRIOR": 40,
      "UNIT_SLINGER": 35,
      "UNIT_SETTLER": 80,
      "UNIT_BUILDER": 50,
      "BUILDING_MONUMENT": 60,
      "BUILDING_GRANARY": 65,
      "BUILDING_WATER_MILL": 80,
      "DISTRICT_CAMPUS": 54,
      "DISTRICT_HOLY_SITE": 54,
      "DISTRICT_COMMERCIAL_HUB": 54
    };

    city.production_current = buildTarget;
    city.production_progress = 0;
    city.production_cost = costs[buildTarget] || 50;

    if (window.networkManager) {
      window.networkManager.appendChat("system", `⚙️ 【${city.name}】已调整当前生产目标为：${buildTarget} (需求: ${city.production_cost} 锤)`);
    }

    const cityModal = document.getElementById("city-modal");
    if (cityModal) cityModal.style.display = "none";
  }

  localAdvanceTurn() {
    this.gameState.turn += 1;

    // 1. Refresh movement
    for (const u of this.gameState.units) {
      u.moves = u.max_moves;
    }

    // 2. City Production accumulation
    for (const city of this.gameState.cities) {
      const prodPerTurn = 4 + (city.population * 2);
      city.production_progress += prodPerTurn;

      if (city.production_progress >= city.production_cost) {
        city.production_progress = 0;
        const target = city.production_current;

        if (target.startsWith("UNIT_")) {
          // Spawn unit adjacent
          const emptyTile = this.gameState.map.tiles.find(t =>
            Math.abs(t.q - city.q) <= 1 && Math.abs(t.r - city.r) <= 1 &&
            t.terrain !== "TERRAIN_OCEAN" && t.terrain !== "TERRAIN_MOUNTAIN" &&
            !this.gameState.units.some(u => u.q === t.q && u.r === t.r)
          );
          const spawnQ = emptyTile ? emptyTile.q : city.q;
          const spawnR = emptyTile ? emptyTile.r : city.r;

          const newUnit = {
            id: "u_" + Date.now(),
            owner: city.owner,
            type: target,
            name: target === "UNIT_WARRIOR" ? "新征勇士" : (target === "UNIT_SLINGER" ? "新训投石兵" : (target === "UNIT_SETTLER" ? "新开拓者" : "建造工匠")),
            q: spawnQ,
            r: spawnR,
            moves: 2,
            max_moves: 2,
            hp: 100
          };
          this.gameState.units.push(newUnit);
          if (window.networkManager) {
            window.networkManager.appendChat("system", `🛡️ 【${city.name}】成功训练并部署了新单位：${newUnit.name}！`);
          }
        } else if (target.startsWith("BUILDING_")) {
          city.buildings.push(target);
          if (window.networkManager) {
            window.networkManager.appendChat("system", `🏛️ 【${city.name}】成功落成市政建筑：${target}！城市文化与产出显著提升！`);
          }
        } else if (target.startsWith("DISTRICT_")) {
          const tile = this.gameState.map.tiles.find(t => t.q === city.q && t.r === city.r);
          if (tile) tile.district = target;
          if (window.networkManager) {
            window.networkManager.appendChat("system", `📐 【${city.name}】规划的专业区域【${target}】已落成！`);
          }
        }
      }
    }

    // 3. Accumulate Player yields
    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (me) {
      me.gold += 5;
      me.science += 4;
      me.tech_progress += 4;
      me.culture += 2;
      me.civic_progress += 2;

      // Check tech completed
      if (me.tech_progress >= me.tech_cost) {
        me.completed_techs.push(me.current_tech);
        if (window.networkManager) {
          window.networkManager.appendChat("system", `🧪 【科技研发成功】大秦帝国已掌握【${me.current_tech}】！全军战力与国力大增！`);
        }
        // Advance to next tech
        me.tech_progress = 0;
        me.current_tech = "箭术 (Archery)";
        me.tech_cost = 50;
      }
    }

    // 4. AI Turns
    for (const player of this.gameState.players) {
      if (player.id === this.myPlayerId) continue;

      // AI Settler auto foundation
      const aiSettler = this.gameState.units.find(u => u.owner === player.id && u.type === "UNIT_SETTLER");
      if (aiSettler) {
        this.localFoundCity(aiSettler.id);
      }

      // AI Warriors patrol
      const aiWarriors = this.gameState.units.filter(u => u.owner === player.id && u.type === "UNIT_WARRIOR");
      for (const w of aiWarriors) {
        const dq = Math.floor(Math.random() * 3) - 1;
        const dr = Math.floor(Math.random() * 3) - 1;
        if (dq !== 0 || dr !== 0) {
          const t = this.gameState.map.tiles.find(tile => tile.q === w.q + dq && tile.r === w.r + dr);
          if (t && t.terrain !== "TERRAIN_OCEAN" && t.terrain !== "TERRAIN_MOUNTAIN") {
            w.q += dq;
            w.r += dr;
          }
        }
      }
    }

    if (window.networkManager) {
      window.networkManager.appendChat("system", `⚡ 全球回合交割完成：第 ${this.gameState.turn} 回合开始！各文明科技树与城邦产出已入账！`);
      window.networkManager.updateHUD(this.gameState);
    }
  }

  startRenderLoop() {
    const render = (time) => {
      this.animTime = time * 0.002;
      this.draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  // ==========================================
  // Isometric 3D Hex Shading & Render Pipeline
  // ==========================================
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    if (!this.gameState || !this.gameState.map) {
      ctx.fillStyle = "#dfbe74";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("正在载入文明6原版地图与高精 3D 渲染管线...", this.displayWidth / 2, this.displayHeight / 2);
      return;
    }

    // 1. Sort tiles by row/elevation for proper isometric 3D occlusion
    const sortedTiles = [...this.gameState.map.tiles].sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r;
      return a.elevation - b.elevation;
    });

    // 2. Draw Hex Columns
    for (const tile of sortedTiles) {
      this.draw3DHexTile(tile);
    }

    // 3. Draw Territory Borders
    this.drawBorders();

    // 4. Draw Districts & Cities
    for (const city of this.gameState.cities) {
      const tile = this.gameState.map.tiles.find(t => t.q === city.q && t.r === city.r);
      const elevation = tile ? tile.elevation : 1;
      const { x, y } = this.hexToPixel(city.q, city.r, elevation);
      this.draw3DCity(x, y, city);
    }

    // 5. Draw Units
    for (const unit of this.gameState.units) {
      const tile = this.gameState.map.tiles.find(t => t.q === unit.q && t.r === unit.r);
      const elevation = tile ? tile.elevation : 1;
      const { x, y } = this.hexToPixel(unit.q, unit.r, elevation);
      const isSelected = this.selectedUnit && this.selectedUnit.id === unit.id;
      this.draw3DUnit(x, y, unit, isSelected);
    }

    // 6. Draw Hover Reticle
    if (this.hoveredHex) {
      const hoverTile = this.gameState.map.tiles.find(t => t.q === this.hoveredHex.q && t.r === this.hoveredHex.r);
      if (hoverTile) {
        const { x, y } = this.hexToPixel(hoverTile.q, hoverTile.r, hoverTile.elevation);
        this.drawHexPolygon(x, y, this.hexRadius * this.scale, "rgba(223, 190, 116, 0.35)", "#f0cf7e", 2);
      }
    }
  }

  draw3DHexTile(tile) {
    const ctx = this.ctx;
    const elevation = tile.elevation || 1;
    const size = this.hexRadius * this.scale;
    const { x, y } = this.hexToPixel(tile.q, tile.r, elevation);
    const pal = this.terrainColors[tile.terrain] || this.terrainColors["TERRAIN_GRASS"];

    // A. If elevation > 0, draw extruded 3D bevel walls
    if (elevation > 0 && tile.terrain !== "TERRAIN_OCEAN") {
      const wallHeight = elevation * (12 * this.scale);
      this.drawExtrudedWalls(x, y, size, wallHeight, pal.wall);
    }

    // B. Top Hex Face
    const grad = ctx.createLinearGradient(x - size, y - size, x + size, y + size);
    grad.addColorStop(0, pal.top1);
    grad.addColorStop(1, pal.top2);

    this.drawHexPolygon(x, y, size, grad, "rgba(10, 15, 22, 0.6)", 1);

    // C. Special Terrain Details
    if (tile.terrain === "TERRAIN_OCEAN") {
      // Shimmering ocean wave lines
      ctx.strokeStyle = "rgba(127, 219, 255, 0.25)";
      ctx.lineWidth = 1.5;
      const waveOffset = Math.sin(this.animTime + tile.q * 0.8 + tile.r * 0.5) * 4;
      ctx.beginPath();
      ctx.arc(x + waveOffset, y - 4, size * 0.35, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else if (tile.terrain === "TERRAIN_MOUNTAIN") {
      // 3D Snow-capped mountain peak
      this.drawMountainPeak(x, y, size);
    } else if (tile.terrain === "TERRAIN_GRASS" || tile.terrain === "TERRAIN_PLAINS") {
      // Trees cluster
      this.drawTreeCluster(x, y, size, tile.terrain === "TERRAIN_GRASS" ? "#1e5118" : "#515a1f");
    }

    // D. Resource Indicator
    if (tile.resource) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.beginPath();
      ctx.arc(x, y + size * 0.35, 11 * this.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#dfbe74";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `${Math.max(10, 11 * this.scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tile.resource.split(" ")[0], x, y + size * 0.35);
    }

    // E. Specialized District
    if (tile.district) {
      this.drawDistrictBadge(x, y, size, tile.district);
    }
  }

  drawHexPolygon(x, y, radius, fillColor, strokeColor, lineWidth) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + (Math.PI / 6);
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  drawExtrudedWalls(x, y, radius, wallHeight, wallColor) {
    const ctx = this.ctx;
    // Vertices of top hex
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + (Math.PI / 6);
      pts.push({
        x: x + radius * Math.cos(angle),
        y: y + radius * Math.sin(angle)
      });
    }

    // Draw bottom front faces (pts 1->2, 2->3, 3->4)
    ctx.fillStyle = wallColor;
    const frontFaces = [
      [1, 2],
      [2, 3],
      [3, 4]
    ];

    for (const [p1Idx, p2Idx] of frontFaces) {
      const p1 = pts[p1Idx];
      const p2 = pts[p2Idx];

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y + wallHeight);
      ctx.lineTo(p1.x, p1.y + wallHeight);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawMountainPeak(x, y, size) {
    const ctx = this.ctx;
    const peakHeight = 22 * this.scale;

    // Rock base
    ctx.beginPath();
    ctx.moveTo(x - size * 0.45, y + size * 0.2);
    ctx.lineTo(x, y - peakHeight);
    ctx.lineTo(x + size * 0.45, y + size * 0.2);
    ctx.closePath();
    ctx.fillStyle = "#34495e";
    ctx.fill();

    // Shaded side
    ctx.beginPath();
    ctx.moveTo(x, y - peakHeight);
    ctx.lineTo(x + size * 0.45, y + size * 0.2);
    ctx.lineTo(x, y + size * 0.15);
    ctx.closePath();
    ctx.fillStyle = "#2c3e50";
    ctx.fill();

    // Snowcap
    ctx.beginPath();
    ctx.moveTo(x - size * 0.18, y - peakHeight * 0.4);
    ctx.lineTo(x, y - peakHeight);
    ctx.lineTo(x + size * 0.18, y - peakHeight * 0.4);
    ctx.lineTo(x, y - peakHeight * 0.3);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  drawTreeCluster(x, y, size, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const offsets = [
      { dx: -size * 0.25, dy: -size * 0.1 },
      { dx: size * 0.2, dy: -size * 0.2 },
      { dx: 0, dy: size * 0.15 }
    ];
    for (const off of offsets) {
      ctx.beginPath();
      ctx.arc(x + off.dx, y + off.dy, 4 * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawDistrictBadge(x, y, size, districtType) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(41, 128, 185, 0.85)";
    ctx.beginPath();
    ctx.arc(x, y - size * 0.3, 10 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `${Math.max(9, 10 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(districtType === "DISTRICT_CAMPUS" ? "🔬" : "⛩️", x, y - size * 0.3);
  }

  drawBorders() {
    const ctx = this.ctx;
    for (const tile of this.gameState.map.tiles) {
      if (!tile.owner) continue;
      const owner = this.gameState.players.find(p => p.id === tile.owner);
      const color = owner ? owner.color : "#c6a254";

      const { x, y } = this.hexToPixel(tile.q, tile.r, tile.elevation);
      this.drawHexPolygon(x, y, this.hexRadius * this.scale * 0.94, null, color, 2.5);
    }
  }

  draw3DCity(x, y, city) {
    const ctx = this.ctx;
    const isMine = city.owner === this.myPlayerId;

    // Fortress keep base
    ctx.fillStyle = "rgba(20, 24, 33, 0.92)";
    ctx.strokeStyle = isMine ? "#dfbe74" : "#9b59b6";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 18 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // City icon
    ctx.font = `${Math.max(12, 14 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏛️", x, y - 5);

    // City Banner Plate
    const bannerW = 90 * this.scale;
    const bannerH = 18 * this.scale;
    const bannerX = x - bannerW / 2;
    const bannerY = y - 32 * this.scale;

    ctx.fillStyle = "rgba(7, 10, 15, 0.92)";
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 4 * this.scale);
    ctx.fill();
    ctx.strokeStyle = isMine ? "#c6a254" : "#8899ac";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Population Circle
    ctx.fillStyle = isMine ? "#e74c3c" : "#8e44ad";
    ctx.beginPath();
    ctx.arc(bannerX + 9 * this.scale, bannerY + bannerH / 2, 7 * this.scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(8, 9 * this.scale)}px sans-serif`;
    ctx.fillText(`${city.population}`, bannerX + 9 * this.scale, bannerY + bannerH / 2);

    // City Name
    ctx.fillStyle = "#dfbe74";
    ctx.font = `bold ${Math.max(9, 10 * this.scale)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(city.name.split(" ")[0], bannerX + 20 * this.scale, bannerY + bannerH / 2 + 1);
  }

  draw3DUnit(x, y, unit, isSelected) {
    const ctx = this.ctx;
    const isMine = unit.owner === this.myPlayerId;
    const owner = this.gameState.players.find(p => p.id === unit.owner);
    const badgeColor = owner ? owner.color : (isMine ? "#e74c3c" : "#8e44ad");

    // Selection Glowing Aura
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y - 4, 25 * this.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#00d2ff";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Token drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 16 * this.scale, 8 * this.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3D Miniature Base
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(x, y - 4, 15 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Unit Emoji Symbol
    let symbol = "⚔️";
    if (unit.type === "UNIT_SETTLER") symbol = "🏕️";
    else if (unit.type === "UNIT_SLINGER") symbol = "🏹";
    else if (unit.type === "UNIT_BUILDER") symbol = "🔨";

    ctx.font = `${Math.max(12, 14 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, x, y - 4);

    // Movement pips
    const pipColor = unit.moves > 0 ? "#2ecc71" : "#e74c3c";
    ctx.fillStyle = pipColor;
    ctx.beginPath();
    ctx.arc(x + 10 * this.scale, y - 12 * this.scale, 3.5 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

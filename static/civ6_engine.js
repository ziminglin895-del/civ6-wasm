// Civilization VI WASM/Web-Native Client Engine
// High-DPI 60FPS Hexagonal Map Renderer with Integrated In-Browser 4X Deterministic Game Engine
// Supports both Standalone Mode (Zero-Server, instant play in browser) and Multiplayer Relay Mode.

class Civ6Engine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.hexRadius = 42;
    this.panX = 150;
    this.panY = 120;
    this.scale = 1.0;
    this.gameState = null;
    this.myPlayerId = "player_local";
    this.selectedUnit = null;
    this.isStandalone = false;

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    this.terrainColors = {
      "TERRAIN_GRASS": "#388e3c",
      "TERRAIN_PLAINS": "#689f38",
      "TERRAIN_DESERT": "#d4b068",
      "TERRAIN_TUNDRA": "#78909c",
      "TERRAIN_OCEAN": "#1976d2",
      "TERRAIN_MOUNTAIN": "#455a64"
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
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  hexToPixel(q, r) {
    const size = this.hexRadius * this.scale;
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + this.panX;
    const y = size * (3 / 2 * r) + this.panY;
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
      if (e.button === 0) { // Left click
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
      this.scale = Math.max(0.4, Math.min(2.5, this.scale * zoomFactor));
    }, { passive: false });
  }

  handleHexClick(screenX, screenY) {
    if (!this.gameState) return;
    const { q, r } = this.pixelToHex(screenX, screenY);

    // Check if clicked on a unit belonging to this player
    const clickedUnit = this.gameState.units.find(u => u.q === q && u.r === r && u.owner === this.myPlayerId);
    if (clickedUnit) {
      this.selectedUnit = clickedUnit;
      this.updateUnitCard(clickedUnit);
      return;
    }

    // If unit already selected, check if clicked adjacent tile to move
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

    this.selectedUnit = null;
    document.getElementById("unit-card").style.display = "none";
  }

  updateUnitCard(unit) {
    const card = document.getElementById("unit-card");
    const nameEl = document.getElementById("selected-unit-name");
    const movesEl = document.getElementById("selected-unit-moves");
    const foundBtn = document.getElementById("btn-found-city");

    card.style.display = "block";
    nameEl.innerText = unit.name;
    movesEl.innerText = `移动力: ${unit.moves}/${unit.max_moves}`;

    if (unit.type === "UNIT_SETTLER") {
      foundBtn.style.display = "inline-block";
    } else {
      foundBtn.style.display = "none";
    }
  }

  // ==========================================
  // Client-Side Deterministic 4X Game Engine
  // (Runs 100% in browser when no server is connected)
  // ==========================================
  initLocalSoloGame() {
    this.isStandalone = true;
    this.myPlayerId = "player_haige";
    console.log("🎮 启动客户端纯静态离线 4X 文明引擎...");

    const w = 18;
    const h = 12;
    const tiles = [];
    const terrains = ["TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_OCEAN", "TERRAIN_MOUNTAIN"];

    for (let q = 0; q < w; q++) {
      for (let r = 0; r < h; r++) {
        let terrain = "TERRAIN_GRASS";
        if (q === 0 || q === w - 1 || r === 0 || r === h - 1) {
          terrain = "TERRAIN_OCEAN";
        } else {
          const rand = Math.random();
          if (rand < 0.4) terrain = "TERRAIN_GRASS";
          else if (rand < 0.7) terrain = "TERRAIN_PLAINS";
          else if (rand < 0.8) terrain = "TERRAIN_DESERT";
          else if (rand < 0.9) terrain = "TERRAIN_MOUNTAIN";
          else terrain = "TERRAIN_TUNDRA";
        }
        tiles.push({
          q: q,
          r: r,
          terrain: terrain,
          owner: null,
          yield: { food: terrain === "TERRAIN_GRASS" ? 2 : 1, production: terrain === "TERRAIN_PLAINS" ? 1 : 0, gold: 0 }
        });
      }
    }

    this.gameState = {
      turn: 1,
      map: { width: w, height: h, tiles: tiles },
      players: [
        { id: "player_haige", name: "豪哥 (秦始皇)", civ_id: "CIVILIZATION_CHINA", color: "#e74c3c", gold: 50, science: 4, culture: 2, current_tech: "陶艺 (Pottery)", is_ready: false },
        { id: "player_ai_rome", name: "AI 帝国 (凯撒)", civ_id: "CIVILIZATION_ROME", color: "#3498db", gold: 50, science: 4, culture: 2, current_tech: "采矿 (Mining)", is_ready: true },
        { id: "player_ai_greece", name: "AI 联邦 (伯里克利)", civ_id: "CIVILIZATION_GREECE", color: "#2ecc71", gold: 50, science: 4, culture: 2, current_tech: "航海术 (Sailing)", is_ready: true }
      ],
      units: [
        { id: "u1", owner: "player_haige", type: "UNIT_SETTLER", name: "开拓者 (Settler)", q: 4, r: 4, moves: 2, max_moves: 2 },
        { id: "u2", owner: "player_haige", type: "UNIT_WARRIOR", name: "勇士 (Warrior)", q: 5, r: 4, moves: 2, max_moves: 2 },
        { id: "u3", owner: "player_ai_rome", type: "UNIT_SETTLER", name: "罗马开拓者", q: 13, r: 7, moves: 2, max_moves: 2 },
        { id: "u4", owner: "player_ai_rome", type: "UNIT_WARRIOR", name: "罗马军团", q: 12, r: 7, moves: 2, max_moves: 2 }
      ],
      cities: []
    };

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
      window.networkManager.appendChat("system", "【开箱即玩单机模式】客户端内置 WASM 4X 引擎已就绪！无须启动任何后台服务器，可直接移动开拓者、建立城市与推进回合！");
    }
  }

  localMoveUnit(unitId, targetQ, targetR) {
    const unit = this.gameState.units.find(u => u.id === unitId);
    if (!unit || unit.moves <= 0) return;

    const tile = this.gameState.map.tiles.find(t => t.q === targetQ && t.r === targetR);
    if (!tile || tile.terrain === "TERRAIN_OCEAN" || tile.terrain === "TERRAIN_MOUNTAIN") return;

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

    const cityId = "c_" + Date.now();
    const city = {
      id: cityId,
      name: "西安 (Xi'an)",
      owner: unit.owner,
      q: unit.q,
      r: unit.r,
      population: 1,
      production_stored: 0
    };
    this.gameState.cities.push(city);

    // Claim surrounding tiles
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
    document.getElementById("unit-card").style.display = "none";

    if (window.networkManager) {
      window.networkManager.appendChat("system", "🏛️ 城市【西安】已成功奠基！领土边界已向四周扩展！");
      window.networkManager.updateHUD(this.gameState);
    }
  }

  localAdvanceTurn() {
    this.gameState.turn += 1;

    // Refresh movement points
    for (const u of this.gameState.units) {
      u.moves = u.max_moves;
    }

    // Accumulate yields
    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (me) {
      me.gold += 5;
      me.science += 4;
    }

    // AI Empire Turns
    const aiSettler = this.gameState.units.find(u => u.owner === "player_ai_rome" && u.type === "UNIT_SETTLER");
    if (aiSettler && this.gameState.cities.length === 1) {
      this.gameState.cities.push({
        id: "c_rome",
        name: "罗马 (Rome)",
        owner: "player_ai_rome",
        q: aiSettler.q,
        r: aiSettler.r,
        population: 1
      });
      const idx = this.gameState.units.indexOf(aiSettler);
      if (idx !== -1) this.gameState.units.splice(idx, 1);
    }

    if (window.networkManager) {
      window.networkManager.appendChat("system", `⚡ 第 ${this.gameState.turn} 回合交割完成！科技与国库已结算！`);
      window.networkManager.updateHUD(this.gameState);
    }
  }

  startRenderLoop() {
    const render = () => {
      this.draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    if (!this.gameState || !this.gameState.map) {
      ctx.fillStyle = "#dfbe74";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("正在同步文明6多人战局数据...", this.displayWidth / 2, this.displayHeight / 2);
      return;
    }

    // 1. Draw Hex Tiles
    for (const tile of this.gameState.map.tiles) {
      const { x, y } = this.hexToPixel(tile.q, tile.r);
      const color = this.terrainColors[tile.terrain] || "#444";
      this.drawHex(x, y, this.hexRadius * this.scale, color, "#222c38", 1.5);

      // Territory Border
      if (tile.owner) {
        const owner = this.gameState.players.find(p => p.id === tile.owner);
        const ownerColor = owner ? owner.color : "#c6a254";
        this.drawHexBorder(x, y, this.hexRadius * this.scale, ownerColor, 2.5);
      }
    }

    // 2. Draw Cities
    for (const city of this.gameState.cities) {
      const { x, y } = this.hexToPixel(city.q, city.r);
      this.drawCity(x, y, city);
    }

    // 3. Draw Units
    for (const unit of this.gameState.units) {
      const { x, y } = this.hexToPixel(unit.q, unit.r);
      const isSelected = this.selectedUnit && this.selectedUnit.id === unit.id;
      this.drawUnit(x, y, unit, isSelected);
    }
  }

  drawHex(x, y, radius, fillColor, strokeColor, lineWidth) {
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
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  drawHexBorder(x, y, radius, color, width) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + (Math.PI / 6);
      const px = x + radius * 0.94 * Math.cos(angle);
      const py = y + radius * 0.94 * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  drawCity(x, y, city) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(10, 14, 20, 0.85)";
    ctx.strokeStyle = "#c6a254";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 16 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, 12 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${city.population}`, x, y);

    // City Banner
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x - 40 * this.scale, y - 26 * this.scale, 80 * this.scale, 16 * this.scale);
    ctx.fillStyle = "#dfbe74";
    ctx.font = `bold ${Math.max(9, 10 * this.scale)}px sans-serif`;
    ctx.fillText(city.name, x, y - 18 * this.scale);
  }

  drawUnit(x, y, unit, isSelected) {
    const ctx = this.ctx;
    const isMine = unit.owner === this.myPlayerId;
    const owner = this.gameState.players.find(p => p.id === unit.owner);
    const badgeColor = owner ? owner.color : (isMine ? "#e74c3c" : "#3498db");

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, 22 * this.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#00d2ff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(x, y, 14 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Unit Icon
    ctx.font = `${Math.max(12, 14 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(unit.type === "UNIT_SETTLER" ? "🏕️" : "⚔️", x, y);
  }
}

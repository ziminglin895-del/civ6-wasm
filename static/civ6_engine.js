// Civilization VI WASM/Web-Native Client Engine
// High-DPI 60FPS 3D Isometric Hex Map Engine with 3-State Fog of War, Procedural Audio, Combat & Minimap
// Authentic Sid Meier's Civilization VI Experience

class Civ6AudioEngine {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playStep() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playCombat() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Metal clank
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    // Drum thump
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(180, now);
    thump.frequency.exponentialRampToValueAtTime(45, now + 0.22);
    thumpGain.gain.setValueAtTime(0.6, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    thump.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thump.start(now);
    thump.stop(now + 0.22);
  }

  playCityFounded() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.25, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.35);
    });
  }

  playTechFanfare() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [392.00, 440.00, 523.25, 659.25, 783.99]; // G4, A4, C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.35, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.5);
    });
  }

  playTurnAdvance() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Deep timpani roll
    const timpani = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    timpani.type = "sine";
    timpani.frequency.setValueAtTime(95, now);
    timpani.frequency.exponentialRampToValueAtTime(55, now + 0.25);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    timpani.connect(gain);
    gain.connect(this.ctx.destination);
    timpani.start(now);
    timpani.stop(now + 0.25);
  }
}

class Civ6Engine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.audio = new Civ6AudioEngine();

    this.hexRadius = 48;
    this.panX = 260;
    this.panY = 180;
    this.scale = 1.0;
    this.gameState = null;
    this.myPlayerId = "player_haige";
    this.selectedUnit = null;
    this.selectedCity = null;
    this.hoveredHex = null;
    this.showYields = true;
    this.isStandalone = true;

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.hasDragged = false;
    this.animTime = 0;
    this.damageFloats = []; // { x, y, text, life, maxLife }

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
    this.initMinimap();
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

  initMinimap() {
    this.minimapCanvas = document.getElementById("minimap-canvas");
    if (!this.minimapCanvas) return;
    this.minimapCtx = this.minimapCanvas.getContext("2d");

    this.minimapCanvas.addEventListener("click", (e) => {
      if (!this.gameState || !this.gameState.map) return;
      const rect = this.minimapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const normX = clickX / rect.width;
      const normY = clickY / rect.height;

      const targetQ = Math.floor(normX * this.gameState.map.width);
      const targetR = Math.floor(normY * this.gameState.map.height);
      const targetPixel = this.hexToPixel(targetQ, targetR, 0);

      this.panX = this.displayWidth / 2 - (targetPixel.x - this.panX);
      this.panY = this.displayHeight / 2 - (targetPixel.y - this.panY);
    });
  }

  hexToPixel(q, r, elevation = 0) {
    const size = this.hexRadius * this.scale;
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + this.panX;
    const y = size * (3 / 2 * r) + this.panY - elevation * (14 * this.scale);
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

  hexDist(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  initEvents() {
    // Disable right-click context menu on canvas
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        // Left button: drag or select
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.hasDragged = false;
      } else if (e.button === 2) {
        // Right button: direct move or attack command!
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        this.handleRightClick(e.clientX - rect.left, e.clientY - rect.top);
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
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;
    }, { passive: false });

    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "w" || e.key === "ArrowUp") this.panY += 40;
      else if (e.key === "s" || e.key === "ArrowDown") this.panY -= 40;
      else if (e.key === "a" || e.key === "ArrowLeft") this.panX += 40;
      else if (e.key === "d" || e.key === "ArrowRight") this.panX -= 40;
      else if (e.key === "y" || e.key === "Y") {
        this.showYields = !this.showYields;
      } else if (e.key === "Enter") {
        if (window.networkManager) window.networkManager.sendEndTurn();
      } else if (e.key === " ") {
        if (this.selectedUnit) {
          this.selectedUnit.moves = 0;
          this.updateUnitCard(this.selectedUnit);
        }
      }
    });
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

    // 2. Check Unit click (belonging to current player)
    const clickedUnit = this.gameState.units.find(u => u.q === q && u.r === r && u.owner === this.myPlayerId);
    if (clickedUnit) {
      this.selectedUnit = clickedUnit;
      this.updateUnitCard(clickedUnit);
      this.audio.playStep();
      return;
    }

    // 3. If unit selected, check left click move
    if (this.selectedUnit) {
      this.executeUnitAction(this.selectedUnit, q, r);
      return;
    }

    // Unselect
    this.selectedUnit = null;
    const unitCard = document.getElementById("unit-card");
    if (unitCard) unitCard.style.display = "none";
  }

  handleRightClick(screenX, screenY) {
    if (!this.gameState || !this.selectedUnit) return;
    const { q, r } = this.pixelToHex(screenX, screenY);
    this.executeUnitAction(this.selectedUnit, q, r);
  }

  executeUnitAction(unit, targetQ, targetR) {
    if (!unit || unit.moves <= 0) return;
    const dist = this.hexDist(unit.q, unit.r, targetQ, targetR);
    if (dist !== 1) return;

    const tile = this.gameState.map.tiles.find(t => t.q === targetQ && t.r === targetR);
    if (!tile || tile.terrain === "TERRAIN_OCEAN" || tile.terrain === "TERRAIN_MOUNTAIN") {
      if (window.networkManager) {
        window.networkManager.appendChat("system", "⚠️ 无法行军：海洋或险峻高山不可直接穿行！");
      }
      return;
    }

    // Check if target tile has enemy unit (Combat!)
    const enemyUnit = this.gameState.units.find(u => u.q === targetQ && u.r === targetR && u.owner !== unit.owner);
    if (enemyUnit) {
      this.executeCombat(unit, enemyUnit, tile);
      return;
    }

    // Peaceful move
    unit.q = targetQ;
    unit.r = targetR;
    unit.moves -= 1;
    this.audio.playStep();
    this.updateVisibility();
    this.updateUnitCard(unit);

    // Check if stepped on Barbarian Camp
    if (tile.district === "DISTRICT_BARBARIAN_CAMP") {
      tile.district = null;
      const me = this.gameState.players.find(p => p.id === this.myPlayerId);
      if (me) me.gold += 50;
      this.audio.playCityFounded();
      this.spawnDamageFloat(targetQ, targetR, "+50 金币！");
      if (window.networkManager) {
        window.networkManager.appendChat("system", "🔥 摧毁蛮族前哨营地！收缴 50 国库金币并清剿蛮患！");
        window.networkManager.updateHUD(this.gameState);
      }
    }

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
    }
  }

  executeCombat(attacker, defender, tile) {
    attacker.moves = 0;
    this.audio.playCombat();

    const attackerCS = attacker.combat || 20;
    const defenderCS = defender.combat || 20;

    // Civ 6 Authentic Logarithmic Combat Formula
    const baseDamage = 30 * Math.exp((attackerCS - defenderCS) * 0.04);
    const dealt = Math.min(100, Math.round(baseDamage * (0.8 + Math.random() * 0.4)));
    const counterBase = 30 * Math.exp((defenderCS - attackerCS) * 0.04);
    const taken = Math.min(100, Math.round(counterBase * (0.8 + Math.random() * 0.4)));

    defender.hp = Math.max(0, defender.hp - dealt);
    attacker.hp = Math.max(0, attacker.hp - taken);

    this.spawnDamageFloat(defender.q, defender.r, `-${dealt} HP`);

    if (defender.hp <= 0) {
      // Defender destroyed! Attacker takes tile
      const defIdx = this.gameState.units.indexOf(defender);
      if (defIdx !== -1) this.gameState.units.splice(defIdx, 1);
      attacker.q = tile.q;
      attacker.r = tile.r;
      this.updateVisibility();

      if (window.networkManager) {
        window.networkManager.appendChat("system", `⚔️ 【战斗捷报】我军【${attacker.name}】彻底歼灭了敌军【${defender.name}】并进驻阵地！`);
      }
    } else {
      if (window.networkManager) {
        window.networkManager.appendChat("system", `⚔️ 【交锋激战】我军对【${defender.name}】造成 ${dealt} 点伤害，自身承受 ${taken} 点反击伤害！`);
      }
    }

    if (attacker.hp <= 0) {
      const attIdx = this.gameState.units.indexOf(attacker);
      if (attIdx !== -1) this.gameState.units.splice(attIdx, 1);
      this.selectedUnit = null;
      document.getElementById("unit-card").style.display = "none";
      if (window.networkManager) {
        window.networkManager.appendChat("system", `💀 我方单位【${attacker.name}】在浴血奋战中阵亡！`);
      }
    } else {
      this.updateUnitCard(attacker);
    }

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
    }
  }

  spawnDamageFloat(q, r, text) {
    const { x, y } = this.hexToPixel(q, r, 1);
    this.damageFloats.push({
      x: x,
      y: y - 20,
      text: text,
      life: 60,
      maxLife: 60
    });
  }

  updateVisibility() {
    if (!this.gameState || !this.gameState.map) return;

    // Reset visibility
    for (const t of this.gameState.map.tiles) {
      t.visible = false;
    }

    // Units vision (radius 2)
    for (const u of this.gameState.units) {
      if (u.owner === this.myPlayerId) {
        for (const t of this.gameState.map.tiles) {
          if (this.hexDist(u.q, u.r, t.q, t.r) <= 2) {
            t.visible = true;
            t.explored = true;
          }
        }
      }
    }

    // Cities vision (radius 3)
    for (const c of this.gameState.cities) {
      if (c.owner === this.myPlayerId) {
        for (const t of this.gameState.map.tiles) {
          if (this.hexDist(c.q, c.r, t.q, t.r) <= 3) {
            t.visible = true;
            t.explored = true;
          }
        }
      }
    }
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
    if (nameEl) nameEl.innerText = `${unit.name} (${unit.hp || 100} HP)`;
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
            if (Math.random() < 0.15) resource = "🧣 丝绸商路";
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
          explored: false,
          visible: false,
          yield: {
            food: terrain === "TERRAIN_GRASS" ? 2 : (terrain === "TERRAIN_OCEAN" ? 1 : 0),
            production: terrain === "TERRAIN_PLAINS" ? 1 : (isHill ? 2 : 0),
            gold: resource ? 2 : 0
          }
        });
      }
    }

    // Set 2 Barbarian Outposts
    const camp1 = tiles.find(t => t.q === 10 && t.r === 3 && t.terrain !== "TERRAIN_OCEAN");
    if (camp1) camp1.district = "DISTRICT_BARBARIAN_CAMP";
    const camp2 = tiles.find(t => t.q === 8 && t.r === 11 && t.terrain !== "TERRAIN_OCEAN");
    if (camp2) camp2.district = "DISTRICT_BARBARIAN_CAMP";

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
          completed_civics: [],
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
          id: "player_ai_barbarian",
          name: "蛮族游牧部落",
          civ_id: "CIVILIZATION_BARBARIAN",
          color: "#c0392b",
          gold: 0,
          science: 0,
          culture: 0,
          is_ready: true
        }
      ],
      units: [
        { id: "u_settler_1", owner: "player_haige", type: "UNIT_SETTLER", name: "大秦开拓者", q: 5, r: 5, moves: 2, max_moves: 2, hp: 100, combat: 0 },
        { id: "u_warrior_1", owner: "player_haige", type: "UNIT_WARRIOR", name: "大秦勇士", q: 6, r: 5, moves: 2, max_moves: 2, hp: 100, combat: 20 },
        { id: "u_rome_settler", owner: "player_ai_rome", type: "UNIT_SETTLER", name: "罗马移民队", q: 16, r: 8, moves: 2, max_moves: 2, hp: 100, combat: 0 },
        { id: "u_rome_legion", owner: "player_ai_rome", type: "UNIT_WARRIOR", name: "罗马军团步兵", q: 15, r: 8, moves: 2, max_moves: 2, hp: 100, combat: 20 },
        { id: "u_barb_1", owner: "player_ai_barbarian", type: "UNIT_WARRIOR", name: "蛮族勇士", q: 10, r: 4, moves: 2, max_moves: 2, hp: 100, combat: 20 },
        { id: "u_barb_2", owner: "player_ai_barbarian", type: "UNIT_WARRIOR", name: "蛮族枪兵", q: 8, r: 10, moves: 2, max_moves: 2, hp: 100, combat: 20 }
      ],
      cities: []
    };

    this.updateVisibility();

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
      window.networkManager.appendChat("system", "🏛️ 【文明6 战争迷雾与 4X 引擎】战局已建立！请派遣勇士探索未知大陆，驱散战争迷雾，建立第一座首府！");
    }
  }

  localFoundCity(unitId) {
    const unitIndex = this.gameState.units.findIndex(u => u.id === unitId);
    if (unitIndex === -1) return;
    const unit = this.gameState.units[unitIndex];

    const cityNames = {
      "player_haige": ["西安 (Xi'an)", "咸阳 (Xianyang)", "洛阳 (Luoyang)", "北京 (Beijing)"],
      "player_ai_rome": ["罗马 (Rome)", "安提阿 (Antioch)", "拉文纳 (Ravenna)"],
      "player_ai_cleo": ["亚历山大 (Alexandria)", "底比斯 (Thebes)"]
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

    // Territory claim
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

    this.gameState.units.splice(unitIndex, 1);
    this.selectedUnit = null;
    const unitCard = document.getElementById("unit-card");
    if (unitCard) unitCard.style.display = "none";

    this.audio.playCityFounded();
    this.updateVisibility();

    if (window.networkManager) {
      window.networkManager.appendChat("system", `🏛️ 宏伟城市【${cityName}】已奠基！领土边界向四周开拓！`);
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
    this.audio.playTurnAdvance();

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
            hp: 100,
            combat: target === "UNIT_WARRIOR" ? 20 : (target === "UNIT_SLINGER" ? 15 : 0)
          };
          this.gameState.units.push(newUnit);
          this.updateVisibility();
          if (window.networkManager) {
            window.networkManager.appendChat("system", `🛡️ 【${city.name}】成功训练并部署了新单位：${newUnit.name}！`);
          }
        } else if (target.startsWith("BUILDING_")) {
          city.buildings.push(target);
          if (window.networkManager) {
            window.networkManager.appendChat("system", `🏛️ 【${city.name}】成功落成建筑：${target}！`);
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
        this.triggerBreakthrough("TECH", me.current_tech);
        me.tech_progress = 0;
        me.current_tech = "箭术 (Archery)";
        me.tech_cost = 50;
      }

      // Check civic completed
      if (me.civic_progress >= me.civic_cost) {
        me.completed_civics = me.completed_civics || [];
        me.completed_civics.push(me.current_civic);
        this.triggerBreakthrough("CIVIC", me.current_civic);
        me.civic_progress = 0;
        me.current_civic = "对外贸易 (Foreign Trade)";
        me.civic_cost = 40;
      }
    }

    // 4. AI Turns
    for (const player of this.gameState.players) {
      if (player.id === this.myPlayerId) continue;

      const aiSettler = this.gameState.units.find(u => u.owner === player.id && u.type === "UNIT_SETTLER");
      if (aiSettler) {
        this.localFoundCity(aiSettler.id);
      }

      const aiWarriors = this.gameState.units.filter(u => u.owner === player.id && u.type === "UNIT_WARRIOR");
      for (const w of aiWarriors) {
        const dq = Math.floor(Math.random() * 3) - 1;
        const dr = Math.floor(Math.random() * 3) - 1;
        if (dq !== 0 || dr !== 0) {
          const t = this.gameState.map.tiles.find(tile => tile.q === w.q + dq && tile.r === w.r + dr);
          if (t && t.terrain !== "TERRAIN_OCEAN" && t.terrain !== "TERRAIN_MOUNTAIN") {
            const hasFriendly = this.gameState.units.some(other => other.q === t.q && other.r === t.r && other.owner === player.id);
            if (!hasFriendly) {
              w.q += dq;
              w.r += dr;
            }
          }
        }
      }
    }

    this.updateVisibility();

    if (window.networkManager) {
      window.networkManager.appendChat("system", `⚡ 全球回合交割完成：第 ${this.gameState.turn} 回合开始！各文明科技树与城邦产出已入账！`);
      window.networkManager.updateHUD(this.gameState);
    }
  }

  triggerBreakthrough(type, itemName) {
    this.audio.playTechFanfare();
    const modal = document.getElementById("breakthrough-modal");
    const titleEl = document.getElementById("breakthrough-title");
    const typeEl = document.getElementById("breakthrough-type");
    const quoteEl = document.getElementById("breakthrough-quote");
    const unlocksEl = document.getElementById("breakthrough-unlocks");

    if (!modal) return;

    const bundle = window.CIV6_BOOT_BUNDLE;
    let quote = "“从来没有人弄湿黏土后就不管了，就像粘土可以变成砖块以此发家致富。” ——普鲁塔克";
    let unlocks = ["🌾 解锁：粮仓", "🌊 解锁：水磨"];

    if (bundle) {
      if (type === "TECH" && bundle.technologies) {
        const found = bundle.technologies.find(t => itemName.includes(t.name) || itemName.includes(t.zh_name));
        if (found && found.quote) quote = `“${found.quote}”`;
      } else if (type === "CIVIC" && bundle.civics) {
        const found = bundle.civics.find(c => itemName.includes(c.name) || itemName.includes(c.zh_name));
        if (found && found.quote) quote = `“${found.quote}”`;
        unlocks = ["📜 解锁政策：纪律（对蛮族战力+5）", "⚖️ 解锁方针：城市规划（全城+1锤）"];
      }
    }

    if (titleEl) titleEl.innerText = itemName;
    if (typeEl) typeEl.innerText = type === "TECH" ? "科技研发完成 · RESEARCH COMPLETE" : "社会市政突破 · CIVIC ADVANCEMENT";
    if (quoteEl) quoteEl.innerText = quote;
    if (unlocksEl) {
      unlocksEl.innerHTML = unlocks.map(u => `<span class="unlock-tag">${u}</span>`).join("");
    }

    modal.style.display = "block";
  }

  startRenderLoop() {
    const render = (time) => {
      this.animTime = time * 0.002;
      this.draw();
      this.drawMinimap();
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

    // 1. Sort tiles by row/elevation
    const sortedTiles = [...this.gameState.map.tiles].sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r;
      return a.elevation - b.elevation;
    });

    // 2. Draw Hex Columns
    for (const tile of sortedTiles) {
      this.draw3DHexTile(tile);
    }

    // 3. Draw Territory Borders (only visible or explored)
    this.drawBorders();

    // 4. Draw Districts & Cities
    for (const city of this.gameState.cities) {
      const tile = this.gameState.map.tiles.find(t => t.q === city.q && t.r === city.r);
      if (!tile || !tile.explored) continue;
      const elevation = tile.elevation || 1;
      const { x, y } = this.hexToPixel(city.q, city.r, elevation);
      this.draw3DCity(x, y, city, tile.visible);
    }

    // 5. Draw Units (ONLY if tile is currently VISIBLE in line of sight)
    for (const unit of this.gameState.units) {
      const tile = this.gameState.map.tiles.find(t => t.q === unit.q && t.r === unit.r);
      if (!tile) continue;
      // Friendly units always visible; foreign units ONLY visible if tile.visible!
      if (unit.owner !== this.myPlayerId && !tile.visible) continue;

      const elevation = tile.elevation || 1;
      const { x, y } = this.hexToPixel(unit.q, unit.r, elevation);
      const isSelected = this.selectedUnit && this.selectedUnit.id === unit.id;
      this.draw3DUnit(x, y, unit, isSelected);
    }

    // 6. Draw Hover Reticle
    if (this.hoveredHex) {
      const hoverTile = this.gameState.map.tiles.find(t => t.q === this.hoveredHex.q && t.r === this.hoveredHex.r);
      if (hoverTile && hoverTile.explored) {
        const { x, y } = this.hexToPixel(hoverTile.q, hoverTile.r, hoverTile.elevation);
        this.drawHexPolygon(x, y, this.hexRadius * this.scale, "rgba(223, 190, 116, 0.3)", "#f0cf7e", 2);
      }
    }

    // 7. Draw Floating Combat Damage Numbers
    for (let i = this.damageFloats.length - 1; i >= 0; i--) {
      const d = this.damageFloats[i];
      d.y -= 0.6;
      d.life -= 1;
      const alpha = d.life / d.maxLife;

      ctx.save();
      ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(14, 16 * this.scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.strokeText(d.text, d.x, d.y);
      ctx.fillText(d.text, d.x, d.y);
      ctx.restore();

      if (d.life <= 0) {
        this.damageFloats.splice(i, 1);
      }
    }
  }

  draw3DHexTile(tile) {
    const ctx = this.ctx;
    const elevation = tile.elevation || 1;
    const size = this.hexRadius * this.scale;
    const { x, y } = this.hexToPixel(tile.q, tile.r, elevation);

    // ==========================================
    // 3-State Fog of War (Authentic Civ 6)
    // ==========================================
    if (!tile.explored) {
      // STATE 0: Unexplored (Vintage Cartographic Parchment)
      this.drawParchmentUnexploredHex(x, y, size, tile.q, tile.r);
      return;
    }

    const isFogged = !tile.visible; // STATE 1: Explored but out of sight (Sepia Fog of War)
    const pal = this.terrainColors[tile.terrain] || this.terrainColors["TERRAIN_GRASS"];

    // A. Extruded 3D walls
    if (elevation > 0 && tile.terrain !== "TERRAIN_OCEAN") {
      const wallHeight = elevation * (14 * this.scale);
      const wallColor = isFogged ? "#5a4d38" : pal.wall;
      this.drawExtrudedWalls(x, y, size, wallHeight, wallColor);
    }

    // B. Top Hex Face
    const grad = ctx.createLinearGradient(x - size, y - size, x + size, y + size);
    if (isFogged) {
      // Sepia pen-and-ink parchment wash
      grad.addColorStop(0, "#7d6e4d");
      grad.addColorStop(1, "#5f5338");
    } else {
      grad.addColorStop(0, pal.top1);
      grad.addColorStop(1, pal.top2);
    }

    this.drawHexPolygon(x, y, size, grad, isFogged ? "rgba(40, 30, 15, 0.6)" : "rgba(10, 15, 22, 0.6)", 1);

    // C. Special Terrain Details
    if (!isFogged) {
      if (tile.terrain === "TERRAIN_OCEAN") {
        ctx.strokeStyle = "rgba(127, 219, 255, 0.28)";
        ctx.lineWidth = 1.5;
        const waveOffset = Math.sin(this.animTime + tile.q * 0.8 + tile.r * 0.5) * 4;
        ctx.beginPath();
        ctx.arc(x + waveOffset, y - 4, size * 0.35, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
      } else if (tile.terrain === "TERRAIN_MOUNTAIN") {
        this.drawMountainPeak(x, y, size);
      } else if (tile.terrain === "TERRAIN_GRASS" || tile.terrain === "TERRAIN_PLAINS") {
        this.drawTreeCluster(x, y, size, tile.terrain === "TERRAIN_GRASS" ? "#1e5118" : "#515a1f");
      }

      // Barbarian Outpost
      if (tile.district === "DISTRICT_BARBARIAN_CAMP") {
        ctx.font = `${Math.max(14, 16 * this.scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🏕️", x, y - 2);
      }

      // Resource Indicator
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

      // Yield Pips Overlay (Food/Production/Gold)
      if (this.showYields && tile.yield) {
        this.drawYieldPips(x, y, size, tile.yield);
      }
    }
  }

  drawParchmentUnexploredHex(x, y, size, q, r) {
    const ctx = this.ctx;
    // Vintage cartographic paper tone
    ctx.fillStyle = "#bfab80";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + (Math.PI / 6);
      const px = x + size * Math.cos(angle);
      const py = y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(90, 75, 50, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle hand-drawn contour hatch line
    if ((q + r) % 2 === 0) {
      ctx.beginPath();
      ctx.moveTo(x - size * 0.3, y - size * 0.2);
      ctx.lineTo(x + size * 0.3, y + size * 0.2);
      ctx.strokeStyle = "rgba(70, 55, 35, 0.2)";
      ctx.stroke();
    }
  }

  drawYieldPips(x, y, size, yld) {
    const ctx = this.ctx;
    const pipsX = x;
    const pipsY = y - size * 0.3;

    ctx.font = `${Math.max(9, 10 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let yieldStr = "";
    if (yld.food > 0) yieldStr += `🌾${yld.food} `;
    if (yld.production > 0) yieldStr += `⚙️${yld.production} `;
    if (yld.gold > 0) yieldStr += `🪙${yld.gold}`;

    if (yieldStr) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(pipsX - 22 * this.scale, pipsY - 6 * this.scale, 44 * this.scale, 12 * this.scale);
      ctx.fillStyle = "#fff";
      ctx.fillText(yieldStr.trim(), pipsX, pipsY);
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
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + (Math.PI / 6);
      pts.push({
        x: x + radius * Math.cos(angle),
        y: y + radius * Math.sin(angle)
      });
    }

    ctx.fillStyle = wallColor;
    const frontFaces = [[1, 2], [2, 3], [3, 4]];

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

    ctx.beginPath();
    ctx.moveTo(x - size * 0.45, y + size * 0.2);
    ctx.lineTo(x, y - peakHeight);
    ctx.lineTo(x + size * 0.45, y + size * 0.2);
    ctx.closePath();
    ctx.fillStyle = "#34495e";
    ctx.fill();

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

  drawBorders() {
    const ctx = this.ctx;
    for (const tile of this.gameState.map.tiles) {
      if (!tile.owner || !tile.explored) continue;
      const owner = this.gameState.players.find(p => p.id === tile.owner);
      const color = owner ? owner.color : "#c6a254";

      const { x, y } = this.hexToPixel(tile.q, tile.r, tile.elevation);
      this.drawHexPolygon(x, y, this.hexRadius * this.scale * 0.94, null, color, 2.5);
    }
  }

  draw3DCity(x, y, city, isVisible) {
    const ctx = this.ctx;
    const isMine = city.owner === this.myPlayerId;

    ctx.fillStyle = isVisible ? "rgba(20, 24, 33, 0.92)" : "rgba(45, 38, 28, 0.85)";
    ctx.strokeStyle = isMine ? "#dfbe74" : "#9b59b6";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 18 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = `${Math.max(12, 14 * this.scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏛️", x, y - 5);

    // City Banner Plate
    const bannerW = 92 * this.scale;
    const bannerH = 18 * this.scale;
    const bannerX = x - bannerW / 2;
    const bannerY = y - 32 * this.scale;

    ctx.fillStyle = isVisible ? "rgba(7, 10, 15, 0.92)" : "rgba(35, 28, 18, 0.9)";
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

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y - 4, 25 * this.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#00d2ff";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 16 * this.scale, 8 * this.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(x, y - 4, 15 * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

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

    // HP Mini Bar (if damaged)
    if (unit.hp && unit.hp < 100) {
      const barW = 24 * this.scale;
      const barH = 3 * this.scale;
      const barX = x - barW / 2;
      const barY = y + 12 * this.scale;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = unit.hp > 50 ? "#2ecc71" : (unit.hp > 25 ? "#f1c40f" : "#e74c3c");
      ctx.fillRect(barX, barY, barW * (unit.hp / 100), barH);
    }
  }

  drawMinimap() {
    if (!this.minimapCtx || !this.gameState || !this.gameState.map) return;
    const mctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    mctx.fillStyle = "#0a0f18";
    mctx.fillRect(0, 0, w, h);

    const mapW = this.gameState.map.width;
    const mapH = this.gameState.map.height;
    const tileW = w / mapW;
    const tileH = h / mapH;

    for (const t of this.gameState.map.tiles) {
      const tx = t.q * tileW;
      const ty = t.r * tileH;

      if (!t.explored) {
        mctx.fillStyle = "#3a3020";
      } else {
        if (t.terrain === "TERRAIN_OCEAN") mctx.fillStyle = "#1b4f72";
        else if (t.terrain === "TERRAIN_MOUNTAIN") mctx.fillStyle = "#5d6d7e";
        else if (t.terrain === "TERRAIN_DESERT") mctx.fillStyle = "#c99a3e";
        else if (t.terrain === "TERRAIN_TUNDRA") mctx.fillStyle = "#6d7f8d";
        else mctx.fillStyle = "#347928";
      }
      mctx.fillRect(tx, ty, tileW + 0.5, tileH + 0.5);

      if (t.owner) {
        const owner = this.gameState.players.find(p => p.id === t.owner);
        mctx.fillStyle = owner ? owner.color : "#dfbe74";
        mctx.fillRect(tx, ty, tileW, tileH);
      }
    }

    // Draw cities on minimap
    for (const c of this.gameState.cities) {
      const cx = c.q * tileW;
      const cy = c.r * tileH;
      mctx.fillStyle = "#fff";
      mctx.beginPath();
      mctx.arc(cx + tileW / 2, cy + tileH / 2, 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
  }
}

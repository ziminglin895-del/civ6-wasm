// Civilization VI WASM/Web-Native 3D WebGL Engine
// True 3D Perspective Camera, PBR Shading, Dynamic Shadows, 3D Hex Geometry, Procedural Miniatures & Orbit Controls
// Authentic Sid Meier's Civilization VI Full 3D Experience

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
    const notes = [261.63, 329.63, 392.00, 523.25];
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
    const notes = [392.00, 440.00, 523.25, 659.25, 783.99];
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
    this.audio = new Civ6AudioEngine();

    this.hexRadius = 14;
    this.scale = 1.0;
    this.gameState = null;
    this.myPlayerId = "player_haige";
    this.selectedUnit = null;
    this.selectedCity = null;
    this.hoveredHex = null;
    this.showYields = true;
    this.isStandalone = true;
    this.animTime = 0;

    // 3D Scene Objects
    this.tileMeshes = new Map(); // key `${q},${r}` -> Group/Mesh
    this.unitMeshes = new Map(); // unit.id -> Group
    this.cityMeshes = new Map(); // city.id -> Group
    this.cloudMeshes = new Map(); // key `${q},${r}` -> Mesh
    this.damageFloats = [];
    this.loadedModels = {};

    // Authentic Civilization VI PBR Textures
    const texLoader = new THREE.TextureLoader();
    const loadTileTex = (name, rep = 2) => {
      const t = texLoader.load(`./assets/textures/${name}.png`);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      return t;
    };

    const grassTex = loadTileTex("terrain_grass", 2);
    const plainsTex = loadTileTex("terrain_plains", 2);
    const desertTex = loadTileTex("terrain_desert", 2);
    const tundraTex = loadTileTex("terrain_tundra", 2);
    const oceanTex = loadTileTex("terrain_ocean", 3);
    const mountainTex = loadTileTex("terrain_mountain", 1.5);
    const hillsTex = loadTileTex("terrain_grass_hills", 2);
    this.oceanTex = oceanTex;

    // Colors & Materials matching Civilization VI PBR Pipeline
    this.materials = {
      "TERRAIN_GRASS": new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.75, metalness: 0.05 }),
      "TERRAIN_PLAINS": new THREE.MeshStandardMaterial({ map: plainsTex, roughness: 0.8, metalness: 0.05 }),
      "TERRAIN_DESERT": new THREE.MeshStandardMaterial({ map: desertTex, roughness: 0.9, metalness: 0.0 }),
      "TERRAIN_TUNDRA": new THREE.MeshStandardMaterial({ map: tundraTex, roughness: 0.7, metalness: 0.1 }),
      "TERRAIN_OCEAN": new THREE.MeshStandardMaterial({ map: oceanTex, color: 0x1a6fa0, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.88 }),
      "TERRAIN_MOUNTAIN": new THREE.MeshStandardMaterial({ map: mountainTex, roughness: 0.85, metalness: 0.15 }),
      "TERRAIN_HILLS": new THREE.MeshStandardMaterial({ map: hillsTex, roughness: 0.8, metalness: 0.05 }),
      "FOG_EXPLORED": new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 0.95, metalness: 0.0 }),
      "SNOW": new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.1 }),
      "WOOD": new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }),
      "LEAVES": new THREE.MeshStandardMaterial({ color: 0x24581c, roughness: 0.7 }),
      "STONE": new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.1 }),
      "GOLD": new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.7 }),
      "WALL_BORDER": new THREE.MeshBasicMaterial({ color: 0xc6a254, wireframe: false }),
      "RIVER": new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 })
    };

    this.initThree();
    this.initEvents();
    this.initMinimap();
    this.initGLTFModels();
    this.startRenderLoop();
  }

  initThree() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    // 1. WebGL Renderer with Shadows & Antialiasing
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. 3D Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b12);

    // 3. Perspective 3D Camera at Civ 6 Isometric Angle
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    this.camera.position.set(220, 240, 280);

    // 4. OrbitControls for smooth 360 orbit, tilt, and zoom
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2.15;
      this.controls.minDistance = 40;
      this.controls.maxDistance = 650;
      this.controls.target.set(220, 0, 140);
    }

    // 5. Cinematic 3D Lighting
    const ambientLight = new THREE.AmbientLight(0xdde8f5, 0.65);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
    sunLight.position.set(160, 280, 180);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 800;
    const d = 300;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x7ec0ee, 0x3d3224, 0.4);
    this.scene.add(hemiLight);

    // 6. Raycaster for picking 3D Hexes & Units
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 7. Dynamic Selection Reticle
    this.selectionBracket = this.createSelectionRing();
    this.selectionBracket.visible = false;
    this.scene.add(this.selectionBracket);

    window.addEventListener("resize", () => this.onResize());
  }

  createSelectionRing() {
    const group = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(this.hexRadius * 0.75, this.hexRadius * 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    return group;
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  hexToWorld3D(q, r, elevation = 0) {
    const R = this.hexRadius;
    const x = R * Math.sqrt(3) * (q + r / 2);
    const z = R * (3 / 2) * r;
    const y = elevation;
    return new THREE.Vector3(x, y, z);
  }

  world3DToHex(worldPos) {
    const R = this.hexRadius;
    const q = (Math.sqrt(3) / 3 * worldPos.x - 1 / 3 * worldPos.z) / R;
    const r = (2 / 3 * worldPos.z) / R;
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
    if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff) rr = -rq - rs;
    return { q: rq, r: rr };
  }

  hexDist(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  initEvents() {
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.handleHover();
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener("mouseup", (e) => {
      if (!this.mouseDownPos) return;
      const dx = Math.abs(e.clientX - this.mouseDownPos.x);
      const dy = Math.abs(e.clientY - this.mouseDownPos.y);
      if (dx < 6 && dy < 6) {
        if (e.button === 0) {
          this.handleClick();
        } else if (e.button === 2) {
          this.handleRightClick();
        }
      }
    });

    // Keyboard controls
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "w" || e.key === "ArrowUp") this.panCamera(0, -1);
      else if (e.key === "s" || e.key === "ArrowDown") this.panCamera(0, 1);
      else if (e.key === "a" || e.key === "ArrowLeft") this.panCamera(-1, 0);
      else if (e.key === "d" || e.key === "ArrowRight") this.panCamera(1, 0);
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

  panCamera(dx, dz) {
    const step = 20;
    this.camera.position.x += dx * step;
    this.camera.position.z += dz * step;
    if (this.controls) {
      this.controls.target.x += dx * step;
      this.controls.target.z += dz * step;
    }
  }

  handleHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Array.from(this.tileMeshes.values()).map(g => g.children[0]).filter(Boolean);
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const topObj = intersects[0].object;
      const hex = topObj.userData.hex;
      if (hex) {
        this.hoveredHex = hex;
      }
    }
  }

  handleClick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Array.from(this.tileMeshes.values()).map(g => g.children[0]).filter(Boolean);
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hitHex = intersects[0].object.userData.hex;
      if (!hitHex) return;

      // 1. Check City
      const clickedCity = this.gameState.cities.find(c => c.q === hitHex.q && c.r === hitHex.r);
      if (clickedCity) {
        this.selectedCity = clickedCity;
        this.openCityModal(clickedCity);
        return;
      }

      // 2. Check Unit
      const clickedUnit = this.gameState.units.find(u => u.q === hitHex.q && u.r === hitHex.r && u.owner === this.myPlayerId);
      if (clickedUnit) {
        this.selectedUnit = clickedUnit;
        this.updateUnitCard(clickedUnit);
        this.audio.playStep();
        return;
      }

      // 3. Move/Attack if unit selected
      if (this.selectedUnit) {
        this.executeUnitAction(this.selectedUnit, hitHex.q, hitHex.r);
        return;
      }

      // Deselect
      this.selectedUnit = null;
      this.selectionBracket.visible = false;
      const card = document.getElementById("unit-card");
      if (card) card.style.display = "none";
    }
  }

  handleRightClick() {
    if (!this.selectedUnit) return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Array.from(this.tileMeshes.values()).map(g => g.children[0]).filter(Boolean);
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const hitHex = intersects[0].object.userData.hex;
      if (hitHex) {
        this.executeUnitAction(this.selectedUnit, hitHex.q, hitHex.r);
      }
    }
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

    const enemyUnit = this.gameState.units.find(u => u.q === targetQ && u.r === targetR && u.owner !== unit.owner);
    if (enemyUnit) {
      this.executeCombat(unit, enemyUnit, tile);
      return;
    }

    // Move unit
    unit.q = targetQ;
    unit.r = targetR;
    unit.moves -= 1;
    this.audio.playStep();
    this.updateVisibility();
    this.updateUnitCard(unit);

    if (tile.district === "DISTRICT_BARBARIAN_CAMP") {
      tile.district = null;
      const me = this.gameState.players.find(p => p.id === this.myPlayerId);
      if (me) me.gold += 50;
      this.audio.playCityFounded();
      if (window.networkManager) {
        window.networkManager.appendChat("system", "🔥 摧毁蛮族前哨营地！收缴 50 国库金币并清剿蛮患！");
        window.networkManager.updateHUD(this.gameState);
      }
    }

    this.rebuildUnits3D();
    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
    }
  }

  executeCombat(attacker, defender, tile) {
    attacker.moves = 0;
    this.audio.playCombat();

    const attackerCS = attacker.combat || 20;
    const defenderCS = defender.combat || 20;

    const baseDamage = 30 * Math.exp((attackerCS - defenderCS) * 0.04);
    const dealt = Math.min(100, Math.round(baseDamage * (0.8 + Math.random() * 0.4)));
    const counterBase = 30 * Math.exp((defenderCS - attackerCS) * 0.04);
    const taken = Math.min(100, Math.round(counterBase * (0.8 + Math.random() * 0.4)));

    defender.hp = Math.max(0, defender.hp - dealt);
    attacker.hp = Math.max(0, attacker.hp - taken);

    if (defender.hp <= 0) {
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
      this.selectionBracket.visible = false;
      const card = document.getElementById("unit-card");
      if (card) card.style.display = "none";
      if (window.networkManager) {
        window.networkManager.appendChat("system", `💀 我方单位【${attacker.name}】在浴血奋战中阵亡！`);
      }
    } else {
      this.updateUnitCard(attacker);
    }

    this.rebuildUnits3D();
    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
    }
  }

  updateVisibility() {
    if (!this.gameState || !this.gameState.map) return;
    for (const t of this.gameState.map.tiles) {
      t.visible = false;
    }
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
    this.updateFogOfWar3D();
  }

  updateFogOfWar3D() {
    for (const tile of this.gameState.map.tiles) {
      const key = `${tile.q},${tile.r}`;
      const group = this.tileMeshes.get(key);
      const cloud = this.cloudMeshes.get(key);
      if (!group) continue;

      if (!tile.explored) {
        group.visible = false;
        if (cloud) cloud.visible = true;
      } else {
        group.visible = true;
        if (cloud) cloud.visible = false;

        // Apply sepia/dim material if explored but out of sight
        const topMesh = group.children[0];
        if (topMesh && topMesh.material) {
          topMesh.material = tile.visible ? (this.materials[tile.terrain] || this.materials["TERRAIN_GRASS"]) : this.materials["FOG_EXPLORED"];
        }
      }
  initGLTFModels() {
    this.loadedModels = {};
    if (typeof THREE.GLTFLoader !== "undefined") {
      const gltfLoader = new THREE.GLTFLoader();
      const modelFiles = {
        "UNIT_WARRIOR": "./assets/models/warrior.gltf",
        "UNIT_SETTLER": "./assets/models/settler.gltf",
        "UNIT_ARCHER": "./assets/models/archer.gltf",
        "UNIT_SCOUT": "./assets/models/scout.gltf",
        "CITY": "./assets/models/city_building.gltf"
      };

      for (const [key, path] of Object.entries(modelFiles)) {
        gltfLoader.load(
          path,
          (gltf) => {
            this.loadedModels[key] = gltf.scene;
            if (key === "CITY") {
              this.rebuildCities3D();
            } else {
              this.rebuildUnits3D();
            }
          },
          undefined,
          (err) => {
            console.warn(`[Civ6 Engine] Model ${key} fallback:`, err);
          }
        );
      }
    }
  }

  createUnitBanner(unit, owner) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const ownerColor = (owner && owner.color) || "#e74c3c";
    const hp = unit.hp !== undefined ? unit.hp : 100;
    const maxHp = 100;
    const moves = unit.moves !== undefined ? unit.moves : 2;

    // 1. Health Bar Background
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(18, 22, 32, 0.92)";
    ctx.strokeStyle = "#c6a254";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(50, 16, 190, 22, 6);
    ctx.fill();
    ctx.stroke();

    // 2. Health Bar Fill
    const hpWidth = Math.max(0, (hp / maxHp) * 184);
    ctx.fillStyle = hp > 65 ? "#2ecc71" : (hp > 30 ? "#f39c12" : "#e74c3c");
    ctx.beginPath();
    ctx.roundRect(53, 19, hpWidth, 16, 4);
    ctx.fill();

    // 3. Circular Civ Emblem Shield (Outer Gold Ring)
    ctx.beginPath();
    ctx.arc(45, 64, 38, 0, Math.PI * 2);
    ctx.fillStyle = "#c6a254";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffeaa7";
    ctx.stroke();

    // 4. Inner Civ Colored Disc
    ctx.beginPath();
    ctx.arc(45, 64, 32, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor;
    ctx.fill();

    // 5. Unit Symbol
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let icon = "⚔️";
    if (unit.type === "UNIT_SETTLER") icon = "🏕️";
    else if (unit.type === "UNIT_ARCHER") icon = "🏹";
    else if (unit.type === "UNIT_SCOUT") icon = "🐕";
    else if (unit.type === "UNIT_BUILDER") icon = "🔨";
    else if (unit.type === "UNIT_SLINGER") icon = "🎯";
    ctx.fillText(icon, 45, 64);

    // 6. Unit Name Plaque
    ctx.fillStyle = "rgba(10, 15, 24, 0.92)";
    ctx.strokeStyle = "#dfbe74";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(90, 48, 150, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#dfbe74";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(unit.name || "文明单位", 100, 68);

    // 7. Movement Pip Indicator
    ctx.beginPath();
    ctx.arc(224, 64, 8, 0, Math.PI * 2);
    ctx.fillStyle = moves > 0 ? "#2ecc71" : "#7f8c8d";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    const bannerTex = new THREE.CanvasTexture(canvas);
    bannerTex.needsUpdate = true;
    const bannerMat = new THREE.SpriteMaterial({ map: bannerTex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(bannerMat);
    sprite.scale.set(18, 9, 1);
    return sprite;
  }

  createCityBanner(city, owner) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const ownerColor = (owner && owner.color) || "#8b0000";
    const pop = city.population || 1;
    const defense = 20;

    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Plaque background
    ctx.fillStyle = "rgba(12, 18, 28, 0.95)";
    ctx.strokeStyle = "#c6a254";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(20, 24, 344, 80, 10);
    ctx.fill();
    ctx.stroke();

    // Civ colored header stripe
    ctx.fillStyle = ownerColor;
    ctx.beginPath();
    ctx.roundRect(24, 28, 336, 16, [8, 8, 0, 0]);
    ctx.fill();

    // Population Circle
    ctx.beginPath();
    ctx.arc(58, 64, 26, 0, Math.PI * 2);
    ctx.fillStyle = "#c6a254";
    ctx.fill();
    ctx.strokeStyle = "#ffeaa7";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#0c121c";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${pop}`, 58, 64);

    // City Name
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(city.name || "帝国城市", 98, 62);

    // Production Subtitle
    ctx.fillStyle = "#dfbe74";
    ctx.font = "14px sans-serif";
    const prodText = city.currentProduction ? `⚙️ ${city.currentProduction}` : "⚙️ 待选生产项目";
    ctx.fillText(prodText, 98, 86);

    // Defense Strength Shield
    ctx.beginPath();
    ctx.arc(330, 64, 22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40, 50, 70, 0.9)";
    ctx.strokeStyle = "#8899ac";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🛡️${defense}`, 330, 65);

    const cityTex = new THREE.CanvasTexture(canvas);
    cityTex.needsUpdate = true;
    const cityMat = new THREE.SpriteMaterial({ map: cityTex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(cityMat);
    sprite.scale.set(24, 8, 1);
    return sprite;
  }

  // ==========================================
  // 3D Procedural Map Generation & Meshes
  // ==========================================
  buildMap3D() {
    // Clear previous meshes
    this.tileMeshes.forEach(g => this.scene.remove(g));
    this.tileMeshes.clear();
    this.cloudMeshes.forEach(c => this.scene.remove(c));
    this.cloudMeshes.clear();

    const R = this.hexRadius;

    for (const tile of this.gameState.map.tiles) {
      const key = `${tile.q},${tile.r}`;
      const group = new THREE.Group();
      const pos = this.hexToWorld3D(tile.q, tile.r, 0);

      let height = 5;
      let elevationY = 2.5;
      let mat = this.materials[tile.terrain] || this.materials["TERRAIN_GRASS"];

      if (tile.terrain === "TERRAIN_OCEAN") {
        height = 2;
        elevationY = 0;
      } else if (tile.terrain === "TERRAIN_MOUNTAIN") {
        height = 14;
        elevationY = 7;
      } else if (tile.isHill) {
        height = 7;
        elevationY = 3.5;
        mat = this.materials["TERRAIN_HILLS"] || mat;
      }

      const geo = new THREE.CylinderGeometry(R, R, height, 6);
      const hexMesh = new THREE.Mesh(geo, mat);
      hexMesh.position.set(0, elevationY, 0);
      hexMesh.receiveShadow = true;
      hexMesh.castShadow = tile.terrain !== "TERRAIN_OCEAN";
      hexMesh.userData = { hex: tile };
      group.add(hexMesh);

      // Mountain Snowcap Cone
      if (tile.terrain === "TERRAIN_MOUNTAIN") {
        const peakGeo = new THREE.ConeGeometry(R * 0.75, 12, 6);
        const peakMesh = new THREE.Mesh(peakGeo, this.materials["SNOW"]);
        peakMesh.position.set(0, height + 5, 0);
        peakMesh.castShadow = true;
        group.add(peakMesh);
      }

      // Trees on Grasslands/Plains/Forest
      if ((tile.terrain === "TERRAIN_GRASS" || tile.terrain === "TERRAIN_PLAINS" || tile.feature === "FEATURE_FOREST") && !tile.isHill) {
        const treeCount = tile.feature === "FEATURE_FOREST" ? 5 : Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < treeCount; i++) {
          const treeGroup = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 5), this.materials["WOOD"]);
          trunk.position.y = 1.5;
          trunk.castShadow = true;
          treeGroup.add(trunk);

          const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), this.materials["LEAVES"]);
          foliage.position.y = 3.5;
          foliage.castShadow = true;
          treeGroup.add(foliage);

          const angle = Math.random() * Math.PI * 2;
          const rad = Math.random() * (R * 0.45);
          treeGroup.position.set(Math.cos(angle) * rad, height, Math.sin(angle) * rad);
          group.add(treeGroup);
        }
      }

      // River Ribbon Edge Mesh
      if (tile.hasRiver) {
        const riverGeo = new THREE.BoxGeometry(R * 0.9, 0.6, 1.8);
        const riverMesh = new THREE.Mesh(riverGeo, this.materials["RIVER"]);
        riverMesh.position.set(0, height + 0.3, R * 0.75);
        group.add(riverMesh);
      }

      // Barbarian Camp Tent
      if (tile.district === "DISTRICT_BARBARIAN_CAMP") {
        const tent = new THREE.Mesh(new THREE.ConeGeometry(4, 5, 5), new THREE.MeshStandardMaterial({ color: 0x8b0000 }));
        tent.position.set(0, height + 2.5, 0);
        tent.castShadow = true;
        group.add(tent);
      }

      group.position.set(pos.x, 0, pos.z);
      this.scene.add(group);
      this.tileMeshes.set(key, group);

      // Cloud dome for unexplored fog of war
      const cloudGeo = new THREE.DodecahedronGeometry(R * 1.1, 1);
      const cloudMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.9, transparent: true, opacity: 0.85 });
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(pos.x, 8, pos.z);
      this.scene.add(cloud);
      this.cloudMeshes.set(key, cloud);
    }

    this.updateFogOfWar3D();
  }

  rebuildCities3D() {
    this.cityMeshes.forEach(m => this.scene.remove(m));
    this.cityMeshes.clear();

    for (const city of this.gameState.cities) {
      const tile = this.gameState.map.tiles.find(t => t.q === city.q && t.r === city.r);
      if (!tile || !tile.explored) continue;

      const pos = this.hexToWorld3D(city.q, city.r, 0);
      const elevation = tile.terrain === "TERRAIN_MOUNTAIN" ? 14 : (tile.isHill ? 7 : 5);
      const owner = this.gameState.players.find(p => p.id === city.owner);
      const isMine = city.owner === this.myPlayerId;

      const cityGroup = new THREE.Group();

      let rendered3DBuilding = false;
      if (this.loadedModels && this.loadedModels["CITY"]) {
        try {
          const bldClone = this.loadedModels["CITY"].clone(true);
          bldClone.scale.set(1.3, 1.3, 1.3);
          bldClone.position.set(0, elevation + 0.5, 0);
          bldClone.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          cityGroup.add(bldClone);
          rendered3DBuilding = true;
        } catch (e) {
          console.warn("[Civ6 Engine] glTF city fallback:", e);
        }
      }

      if (!rendered3DBuilding) {
        // Stone Wall Keep
        const keep = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, 6, 8), this.materials["STONE"]);
        keep.position.y = elevation + 3;
        keep.castShadow = true;
        cityGroup.add(keep);

        // 4 Corner Towers with roofs
        const towerOffsets = [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]];
        const roofMat = new THREE.MeshStandardMaterial({ color: isMine ? 0xb71c1c : 0x4a148c });

        for (const [tx, tz] of towerOffsets) {
          const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 8, 6), this.materials["STONE"]);
          tower.position.set(tx, elevation + 4, tz);
          tower.castShadow = true;
          cityGroup.add(tower);

          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 6), roofMat);
          roof.position.set(tx, elevation + 9.5, tz);
          roof.castShadow = true;
          cityGroup.add(roof);
        }
      }

      // Add Authentic Floating City Banner Plaque
      const cityBanner = this.createCityBanner(city, owner);
      cityBanner.position.set(0, elevation + 15, 0);
      cityGroup.add(cityBanner);

      cityGroup.position.set(pos.x, 0, pos.z);
      cityGroup.userData = { city: city };
      this.scene.add(cityGroup);
      this.cityMeshes.set(city.id, cityGroup);
    }
  }

  rebuildUnits3D() {
    this.unitMeshes.forEach(m => this.scene.remove(m));
    this.unitMeshes.clear();

    for (const unit of this.gameState.units) {
      const tile = this.gameState.map.tiles.find(t => t.q === unit.q && t.r === unit.r);
      if (!tile) continue;
      if (unit.owner !== this.myPlayerId && !tile.visible) continue;

      const pos = this.hexToWorld3D(unit.q, unit.r, 0);
      const elevation = tile.terrain === "TERRAIN_MOUNTAIN" ? 14 : (tile.isHill ? 7 : 5);

      const unitGroup = new THREE.Group();

      // Miniature Pedestal
      const owner = this.gameState.players.find(p => p.id === unit.owner);
      const ownerHex = owner ? parseInt(owner.color.replace("#", "0x")) : 0xe74c3c;
      const baseMat = new THREE.MeshStandardMaterial({ color: ownerHex, roughness: 0.4, metalness: 0.5 });

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 1.2, 16), baseMat);
      pedestal.position.y = elevation + 0.6;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      unitGroup.add(pedestal);

      // Golden Rim Ring
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.35, 8, 24), this.materials["GOLD"]);
      rim.position.y = elevation + 1.2;
      rim.rotation.x = Math.PI / 2;
      unitGroup.add(rim);

      // 3D glTF Model or Procedural Miniature Figurine
      let rendered3DModel = false;
      if (this.loadedModels && this.loadedModels[unit.type]) {
        try {
          const modelClone = this.loadedModels[unit.type].clone(true);
          modelClone.scale.set(0.6, 0.6, 0.6);
          modelClone.position.set(0, elevation + 1.2, 0);
          modelClone.rotation.y = Math.PI / 4;
          modelClone.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          unitGroup.add(modelClone);
          rendered3DModel = true;
        } catch (e) {
          console.warn("[Civ6 Engine] glTF clone fallback:", e);
        }
      }

      if (!rendered3DModel) {
        // High-fidelity procedural figurine fallback
        let figurine;
        if (unit.type === "UNIT_SETTLER") {
          figurine = new THREE.Group();
          const cart = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 4), this.materials["WOOD"]);
          cart.position.y = elevation + 2.2;
          figurine.add(cart);
          const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 8, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
          canopy.rotation.z = Math.PI / 2;
          canopy.rotation.y = Math.PI / 2;
          canopy.position.y = elevation + 3.2;
          figurine.add(canopy);
        } else {
          figurine = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 3.5, 8), this.materials["STONE"]);
          body.position.y = elevation + 2.8;
          body.castShadow = true;
          figurine.add(body);

          const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), this.materials["GOLD"]);
          head.position.y = elevation + 5.0;
          head.castShadow = true;
          figurine.add(head);

          const shield = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 1.6), baseMat);
          shield.position.set(-1.6, elevation + 3.2, 0);
          figurine.add(shield);

          const sword = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 0.4), this.materials["GOLD"]);
          sword.position.set(1.5, elevation + 3.8, 0.5);
          sword.rotation.z = -0.3;
          figurine.add(sword);
        }
        unitGroup.add(figurine);
      }

      // Add Authentic Floating Unit Banner Sprite
      const bannerSprite = this.createUnitBanner(unit, owner);
      bannerSprite.position.set(0, elevation + 10.5, 0);
      unitGroup.add(bannerSprite);

      unitGroup.position.set(pos.x, 0, pos.z);
      unitGroup.userData = { unit: unit, baseElevation: elevation };

      this.scene.add(unitGroup);
      this.unitMeshes.set(unit.id, unitGroup);
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
        let isHill = false;
        let resource = null;

        if (q <= 1 || q >= w - 2 || r <= 1 || r >= h - 2) {
          terrain = "TERRAIN_OCEAN";
          if (Math.random() < 0.2) resource = "🐟 鱼群";
        } else {
          const rand = Math.random();
          if (rand < 0.35) {
            terrain = "TERRAIN_GRASS";
            if (Math.random() < 0.25) resource = "🌾 丰饶麦田";
            if (Math.random() < 0.15) resource = "🐴 野马群";
          } else if (rand < 0.65) {
            terrain = "TERRAIN_PLAINS";
            if (Math.random() < 0.2) isHill = true;
            if (Math.random() < 0.2) resource = "⛏️ 铜矿";
          } else if (rand < 0.78) {
            terrain = "TERRAIN_DESERT";
            if (Math.random() < 0.15) resource = "🧣 丝绸商路";
          } else if (rand < 0.88) {
            terrain = "TERRAIN_MOUNTAIN";
          } else {
            terrain = "TERRAIN_TUNDRA";
            if (Math.random() < 0.15) resource = "💎 稀世水钻";
          }
        }

        tiles.push({
          q: q,
          r: r,
          terrain: terrain,
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
        { id: "u_barb_2", owner: "player_ai_barbarian", type: "UNIT_WARRIOR", name: "蛮族长矛兵", q: 8, r: 10, moves: 2, max_moves: 2, hp: 100, combat: 20 }
      ],
      cities: []
    };

    this.buildMap3D();
    this.updateVisibility();
    this.rebuildCities3D();
    this.rebuildUnits3D();

    if (window.networkManager) {
      window.networkManager.updateHUD(this.gameState);
      window.networkManager.appendChat("system", "🌐 【文明6 3D WebGL 引擎已启动】全视角 3D 摄像机与物理阴影就绪！右键旋转、滚轮缩放、右键指挥行军！");
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
    this.selectionBracket.visible = false;
    const unitCard = document.getElementById("unit-card");
    if (unitCard) unitCard.style.display = "none";

    this.audio.playCityFounded();
    this.updateVisibility();
    this.rebuildCities3D();
    this.rebuildUnits3D();

    if (window.networkManager) {
      window.networkManager.appendChat("system", `🏛️ 宏伟城市【${cityName}】奠基！领土边界扩展！`);
      window.networkManager.updateHUD(this.gameState);
    }
  }

  localSetCityProduction(cityId, buildTarget) {
    const city = this.gameState.cities.find(c => c.id === cityId);
    if (!city) return;

    const costs = {
      "UNIT_WARRIOR": 40, "UNIT_SLINGER": 35, "UNIT_SETTLER": 80, "UNIT_BUILDER": 50,
      "BUILDING_MONUMENT": 60, "BUILDING_GRANARY": 65, "BUILDING_WATER_MILL": 80,
      "DISTRICT_CAMPUS": 54, "DISTRICT_HOLY_SITE": 54, "DISTRICT_COMMERCIAL_HUB": 54
    };

    city.production_current = buildTarget;
    city.production_progress = 0;
    city.production_cost = costs[buildTarget] || 50;

    if (window.networkManager) {
      window.networkManager.appendChat("system", `⚙️ 【${city.name}】调整生产目标：${buildTarget} (需求: ${city.production_cost} 锤)`);
    }

    const cityModal = document.getElementById("city-modal");
    if (cityModal) cityModal.style.display = "none";
  }

  localAdvanceTurn() {
    this.gameState.turn += 1;
    this.audio.playTurnAdvance();

    for (const u of this.gameState.units) {
      u.moves = u.max_moves;
    }

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
          if (window.networkManager) {
            window.networkManager.appendChat("system", `🛡️ 【${city.name}】成功训练并部署了新单位：${newUnit.name}！`);
          }
        }
      }
    }

    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (me) {
      me.gold += 5;
      me.science += 4;
      me.tech_progress += 4;
      me.culture += 2;
      me.civic_progress += 2;

      if (me.tech_progress >= me.tech_cost) {
        me.completed_techs.push(me.current_tech);
        this.triggerBreakthrough("TECH", me.current_tech);
        me.tech_progress = 0;
        me.current_tech = "箭术 (Archery)";
        me.tech_cost = 50;
      }

      if (me.civic_progress >= me.civic_cost) {
        me.completed_civics = me.completed_civics || [];
        me.completed_civics.push(me.current_civic);
        this.triggerBreakthrough("CIVIC", me.current_civic);
        me.civic_progress = 0;
        me.current_civic = "对外贸易 (Foreign Trade)";
        me.civic_cost = 40;
      }
    }

    // AI movement
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
    this.rebuildCities3D();
    this.rebuildUnits3D();

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

    // Update selection bracket position
    if (this.selectionBracket) {
      const tile = this.gameState.map.tiles.find(t => t.q === unit.q && t.r === unit.r);
      const elevation = tile && tile.terrain === "TERRAIN_MOUNTAIN" ? 14 : (tile && tile.isHill ? 7 : 5);
      const pos = this.hexToWorld3D(unit.q, unit.r, elevation + 0.2);
      this.selectionBracket.position.set(pos.x, pos.y, pos.z);
      this.selectionBracket.visible = true;
    }
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
      const worldPos = this.hexToWorld3D(targetQ, targetR, 0);

      this.camera.position.x = worldPos.x;
      this.camera.position.z = worldPos.z + 120;
      if (this.controls) {
        this.controls.target.set(worldPos.x, 0, worldPos.z);
      }
    });
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

    for (const c of this.gameState.cities) {
      const cx = c.q * tileW;
      const cy = c.r * tileH;
      mctx.fillStyle = "#fff";
      mctx.beginPath();
      mctx.arc(cx + tileW / 2, cy + tileH / 2, 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  startRenderLoop() {
    const render = (time) => {
      this.animTime = time * 0.001;

      if (this.controls) {
        this.controls.update();
      }

      // Idle breathing animations for 3D unit figurines
      this.unitMeshes.forEach((mesh) => {
        mesh.position.y = Math.sin(this.animTime * 3 + mesh.position.x) * 0.4;
      });

      // Rotate selection bracket
      if (this.selectionBracket && this.selectionBracket.visible) {
        this.selectionBracket.rotation.y = this.animTime * 1.5;
      }

      this.renderer.render(this.scene, this.camera);
      this.drawMinimap();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}

// Civilization VI WASM/Web-Native Multiplayer & Standalone Network Manager
// Fully integrated with Civ 6 official game assets, 68 technologies, leader diplomacy & orchestral BGM

class Civ6NetworkManager {
  constructor(engine) {
    this.engine = engine;
    this.ws = null;

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    this.roomId = params.get("room") || "1001";
    const roomEl = document.getElementById("room-id-display");
    if (roomEl) roomEl.innerText = `#${this.roomId}`;

    // Force solo mode if param exists or running on static hosting (e.g. GitHub Pages)
    this.forceSolo = params.get("mode") === "solo" || window.location.hostname.endsWith("github.io");

    // Player Identity
    let storedId = localStorage.getItem("civ6_player_id");
    if (!storedId) {
      storedId = "player_" + Math.floor(Math.random() * 89999 + 10000);
      localStorage.setItem("civ6_player_id", storedId);
    }
    this.playerId = storedId;
    this.engine.myPlayerId = this.playerId;

    // Detect if Host or Partner
    const isInvite = params.has("room") && params.get("from") === "invite";
    this.playerName = isInvite ? "对象 (Partner)" : "豪哥 (China)";
    this.civId = isInvite ? "CIVILIZATION_ROME" : "CIVILIZATION_CHINA";
    this.playerColor = isInvite ? "#3498db" : "#e74c3c";

    this.initUI();

    if (this.forceSolo) {
      this.engine.initLocalSoloGame();
    } else {
      this.initWebSocket();
    }
  }

  initWebSocket() {
    const wsHost = window.location.hostname || "127.0.0.1";
    const wsPort = 8089;
    const wsUrl = `ws://${wsHost}:${wsPort}`;

    console.log("Connecting to Civ6 Gateway:", wsUrl);

    let connectionTimeout = setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket 连接超时，自动降级至客户端内置 4X 独立引擎 (开箱即玩模式)");
        this.engine.initLocalSoloGame();
      }
    }, 1500);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.appendChat("system", "🌐 已连接至文明6局域网/Radmin 联机对战中继网关！");
        this.ws.send(JSON.stringify({
          type: "JOIN_ROOM",
          room_id: this.roomId,
          player_id: this.playerId,
          player_name: this.playerName,
          civ_id: this.civId,
          color: this.playerColor
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (err) {
          console.error("Message parse error:", err);
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        if (!this.engine.gameState) {
          this.engine.initLocalSoloGame();
        }
      };

      this.ws.onclose = () => {
        if (!this.engine.isStandalone) {
          this.appendChat("system", "联机中继连接已断开，正在尝试重连...");
          setTimeout(() => this.initWebSocket(), 4000);
        }
      };
    } catch (e) {
      clearTimeout(connectionTimeout);
      this.engine.initLocalSoloGame();
    }
  }

  handleServerMessage(msg) {
    if (msg.type === "ROOM_STATE" || msg.type === "STATE_UPDATE") {
      this.engine.gameState = msg.state;
      this.updateHUD(msg.state);
    } else if (msg.type === "PLAYER_JOINED") {
      this.appendChat("system", `【玩家加入】${msg.player_name} 已经进入战局房间！`);
      this.engine.gameState = msg.state;
      this.updateHUD(msg.state);
    } else if (msg.type === "TURN_STATUS") {
      if (msg.turn_advanced) {
        this.appendChat("system", `⚡ 全员就绪，战局已推进至 第 ${msg.current_turn} 回合！`);
      }
      this.engine.gameState = msg.state;
      this.updateHUD(msg.state);
    } else if (msg.type === "CHAT") {
      this.appendChat(msg.sender, msg.text, msg.timestamp);
    } else if (msg.type === "ERROR") {
      alert(`指令错误: ${msg.message}`);
    }
  }

  updateHUD(state) {
    if (!state) return;
    const turnEl = document.getElementById("turn-display");
    if (turnEl) turnEl.innerText = `第 ${state.turn} 回合`;

    const me = state.players.find(p => p.id === this.playerId || p.id === "player_haige");
    if (me) {
      const goldEl = document.getElementById("gold-display");
      if (goldEl) goldEl.innerText = me.gold;

      const sciEl = document.getElementById("science-display");
      if (sciEl) sciEl.innerText = me.science.toFixed(1);

      const culEl = document.getElementById("culture-display");
      if (culEl) culEl.innerText = (me.culture || 2).toFixed(1);

      const faithEl = document.getElementById("faith-display");
      if (faithEl) faithEl.innerText = (me.faith || 1).toFixed(1);

      const techEl = document.getElementById("current-tech-name");
      if (techEl) techEl.innerText = me.current_tech;

      const techProgressEl = document.getElementById("tech-progress-bar");
      if (techProgressEl && me.tech_cost) {
        const pct = Math.min(100, Math.round((me.tech_progress / me.tech_cost) * 100));
        techProgressEl.style.width = `${pct}%`;
      }

      const civicEl = document.getElementById("current-civic-name");
      if (civicEl) civicEl.innerText = me.current_civic || "法典 (Code of Laws)";

      const civicProgressEl = document.getElementById("civic-progress-bar");
      if (civicProgressEl && me.civic_cost) {
        const pct = Math.min(100, Math.round(((me.civic_progress || 0) / me.civic_cost) * 100));
        civicProgressEl.style.width = `${pct}%`;
      }
    }

    // Update readiness pill
    const readinessHud = document.getElementById("readiness-hud");
    if (readinessHud) {
      readinessHud.innerHTML = state.players.map(p => `
        <span class="player-dot ${p.is_ready ? 'ready' : ''}">
          ${p.name}: ${p.is_ready ? '就绪' : '决策中'}
        </span>
      `).join("");
    }
  }

  sendMoveUnit(unitId, q, r) {
    if (this.engine.isStandalone) {
      this.engine.localMoveUnit(unitId, q, r);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "MOVE_UNIT",
        unit_id: unitId,
        q: q,
        r: r
      }));
    }
  }

  sendFoundCity(unitId) {
    if (this.engine.isStandalone) {
      this.engine.localFoundCity(unitId);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "FOUND_CITY",
        unit_id: unitId
      }));
    }
  }

  sendEndTurn() {
    if (this.engine.isStandalone) {
      this.engine.localAdvanceTurn();
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "END_TURN"
      }));
    }
  }

  sendChat(text) {
    if (!text.trim()) return;
    if (this.engine.isStandalone) {
      this.appendChat("豪哥", text, new Date().toLocaleTimeString());
      setTimeout(() => {
        const responses = [
          "罗马愿与大秦共同捍卫大陆和平！",
          "埃及尼罗河的商队已备足香料，愿与你开展贸易协定！",
          "为了世界的永恒和平，请务必克制军队扩张！"
        ];
        const randomResp = responses[Math.floor(Math.random() * responses.length)];
        this.appendChat("AI 领袖信使", randomResp, new Date().toLocaleTimeString());
      }, 1000);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "CHAT",
        sender: this.playerName,
        text: text.trim()
      }));
    }
  }

  appendChat(sender, text, timeStr) {
    const container = document.getElementById("chat-messages");
    if (!container) return;
    const div = document.createElement("div");
    if (sender === "system") {
      div.className = "chat-system";
      div.innerText = text;
    } else {
      div.className = "chat-bubble";
      div.innerHTML = `<b>${sender}</b> <span style="font-size:10px; opacity:0.6;">${timeStr || ""}</span><br>${text}`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  initUI() {
    // 1. End Turn Button
    const endTurnBtn = document.getElementById("btn-end-turn");
    if (endTurnBtn) {
      endTurnBtn.addEventListener("click", () => this.sendEndTurn());
    }

    // 2. Found City Button
    const foundBtn = document.getElementById("btn-found-city");
    if (foundBtn) {
      foundBtn.addEventListener("click", () => {
        if (this.engine.selectedUnit) {
          this.sendFoundCity(this.engine.selectedUnit.id);
        }
      });
    }

    // 3. Unit Skip Button
    const skipBtn = document.getElementById("btn-unit-skip");
    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        if (this.engine.selectedUnit) {
          this.engine.selectedUnit.moves = 0;
          this.engine.updateUnitCard(this.engine.selectedUnit);
          this.appendChat("system", `🛑 单位【${this.engine.selectedUnit.name}】已原地休整防守。`);
        }
      });
    }

    // 4. Unit Delete Button
    const delBtn = document.getElementById("btn-unit-delete");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        if (this.engine.selectedUnit && confirm(`确定要解散单位【${this.engine.selectedUnit.name}】并回收军费吗？`)) {
          const idx = this.engine.gameState.units.findIndex(u => u.id === this.engine.selectedUnit.id);
          if (idx !== -1) {
            this.engine.gameState.units.splice(idx, 1);
            this.engine.selectedUnit = null;
            document.getElementById("unit-card").style.display = "none";
            const me = this.engine.gameState.players.find(p => p.id === this.engine.myPlayerId);
            if (me) me.gold += 20;
            this.updateHUD(this.engine.gameState);
            this.appendChat("system", "🗑️ 单位已解散，回收 20 国库金币。");
          }
        }
      });
    }

    // 5. Audio Toggle
    const musicBtn = document.getElementById("btn-toggle-music");
    const audioEl = document.getElementById("civ6-audio");
    if (musicBtn && audioEl) {
      musicBtn.addEventListener("click", () => {
        if (audioEl.paused) {
          audioEl.play().then(() => {
            musicBtn.innerHTML = `<span>🔊</span> 原版交响乐 (播放中)`;
            this.appendChat("system", "🎵 正在播放文明6官方管弦交响原声大碟《Ancient Era》！");
          }).catch(err => {
            console.warn("Audio autoplay blocked:", err);
          });
        } else {
          audioEl.pause();
          musicBtn.innerHTML = `<span>🔇</span> 原版原声 (已静音)`;
        }
      });
    }

    // 6. City Production Modal Controls
    const cityModal = document.getElementById("city-modal");
    const closeCityBtn = document.getElementById("btn-close-city");
    if (closeCityBtn && cityModal) {
      closeCityBtn.addEventListener("click", () => {
        cityModal.style.display = "none";
      });
    }

    document.querySelectorAll(".prod-item").forEach(item => {
      item.addEventListener("click", () => {
        const buildTarget = item.getAttribute("data-build");
        if (this.engine.selectedCity) {
          this.engine.localSetCityProduction(this.engine.selectedCity.id, buildTarget);
        } else if (this.engine.gameState && this.engine.gameState.cities.length > 0) {
          const myCity = this.engine.gameState.cities.find(c => c.owner === this.engine.myPlayerId);
          if (myCity) {
            this.engine.localSetCityProduction(myCity.id, buildTarget);
          }
        }
      });
    });

    // 7. Tech Tree Modal Controls
    const techModal = document.getElementById("tech-modal");
    const cardActiveTech = document.getElementById("card-active-tech");
    const closeTechBtn = document.getElementById("btn-close-tech");
    const techContainer = document.getElementById("tech-tree-container");

    const renderTechTree = () => {
      if (!techContainer) return;
      const bundle = window.CIV6_BOOT_BUNDLE;
      if (!bundle || !bundle.technologies) return;

      const me = this.engine.gameState ? this.engine.gameState.players.find(p => p.id === this.engine.myPlayerId) : null;
      const currentTech = me ? me.current_tech : "陶艺 (Pottery)";
      const completedTechs = (me && me.completed_techs) || [];

      techContainer.innerHTML = bundle.technologies.map(t => {
        const isCurrent = currentTech.includes(t.name);
        const isDone = completedTechs.some(done => done.includes(t.name));
        return `
          <div class="tech-item-card ${isDone ? 'completed' : ''}" data-tech="${t.name} (${t.id})">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <b style="color: ${isCurrent ? '#00d2ff' : (isDone ? '#2ecc71' : '#dfbe74')}; font-size:12px;">${t.name}</b>
              <span style="font-size:10px; color:#8899ac;">${t.era}</span>
            </div>
            <div style="font-size:11px; color:#cbd5e1;">🔬 研发消耗: ${t.cost} 科技值</div>
            <div style="font-size:10px; color:${isDone ? '#2ecc71' : (isCurrent ? '#00d2ff' : '#8899ac')}; margin-top:4px;">
              ${isDone ? '✔ 已掌握' : (isCurrent ? '⚡ 正在研发中...' : '点击选定研发')}
            </div>
          </div>
        `;
      }).join("");

      techContainer.querySelectorAll(".tech-item-card").forEach(card => {
        card.addEventListener("click", () => {
          const techName = card.getAttribute("data-tech");
          if (me) {
            me.current_tech = techName;
            me.tech_progress = 0;
            const found = bundle.technologies.find(item => techName.includes(item.name));
            me.tech_cost = found ? found.cost : 50;
            this.updateHUD(this.engine.gameState);
            this.appendChat("system", `🔬 帝国已调整科技攻坚研发方向：【${techName}】！`);
            renderTechTree();
          }
        });
      });
    };

    if (cardActiveTech && techModal) {
      cardActiveTech.addEventListener("click", () => {
        renderTechTree();
        techModal.style.display = "flex";
      });
    }

    if (closeTechBtn && techModal) {
      closeTechBtn.addEventListener("click", () => {
        techModal.style.display = "none";
      });
    }

    // 8. Civic Tree Modal Controls (51 Civics)
    const civicModal = document.getElementById("civic-modal");
    const cardActiveCivic = document.getElementById("card-active-civic");
    const closeCivicBtn = document.getElementById("btn-close-civic");
    const civicContainer = document.getElementById("civic-tree-container");

    const renderCivicTree = () => {
      if (!civicContainer) return;
      const bundle = window.CIV6_BOOT_BUNDLE;
      if (!bundle || !bundle.civics) return;

      const me = this.engine.gameState ? this.engine.gameState.players.find(p => p.id === this.engine.myPlayerId) : null;
      const currentCivic = me ? me.current_civic : "法典 (Code of Laws)";
      const completedCivics = (me && me.completed_civics) || [];

      civicContainer.innerHTML = bundle.civics.map(c => {
        const isCurrent = currentCivic && (currentCivic.includes(c.name) || currentCivic.includes(c.zh_name));
        const isDone = completedCivics.some(done => done.includes(c.name) || done.includes(c.zh_name));
        return `
          <div class="tech-item-card ${isDone ? 'completed' : ''}" data-civic="${c.zh_name || c.name} (${c.id})">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <b style="color: ${isCurrent ? '#a569bd' : (isDone ? '#2ecc71' : '#dfbe74')}; font-size:12px;">${c.zh_name || c.name}</b>
              <span style="font-size:10px; color:#8899ac;">${c.era}</span>
            </div>
            <div style="font-size:11px; color:#cbd5e1;">📜 市政消耗: ${c.cost} 文化值</div>
            <div style="font-size:10px; color:${isDone ? '#2ecc71' : (isCurrent ? '#a569bd' : '#8899ac')}; margin-top:4px;">
              ${isDone ? '✔ 已掌握' : (isCurrent ? '⚡ 正在推行中...' : '点击选定推行')}
            </div>
          </div>
        `;
      }).join("");

      civicContainer.querySelectorAll(".tech-item-card").forEach(card => {
        card.addEventListener("click", () => {
          const civicName = card.getAttribute("data-civic");
          if (me) {
            me.current_civic = civicName;
            me.civic_progress = 0;
            const found = bundle.civics.find(item => civicName.includes(item.name) || civicName.includes(item.zh_name));
            me.civic_cost = found ? found.cost : 40;
            this.updateHUD(this.engine.gameState);
            this.appendChat("system", `📜 帝国已调整社会市政推行方向：【${civicName}】！`);
            renderCivicTree();
          }
        });
      });
    };

    if (cardActiveCivic && civicModal) {
      cardActiveCivic.addEventListener("click", () => {
        renderCivicTree();
        civicModal.style.display = "flex";
      });
    }

    if (closeCivicBtn && civicModal) {
      closeCivicBtn.addEventListener("click", () => {
        civicModal.style.display = "none";
      });
    }

    // 9. Breakthrough Modal Controls
    const closeBreakBtn = document.getElementById("btn-close-breakthrough");
    const breakModal = document.getElementById("breakthrough-modal");
    if (closeBreakBtn && breakModal) {
      closeBreakBtn.addEventListener("click", () => {
        breakModal.style.display = "none";
      });
    }

    // 10. Yields Toggle Button
    const yieldsBtn = document.getElementById("btn-toggle-yields");
    if (yieldsBtn) {
      yieldsBtn.addEventListener("click", () => {
        this.engine.showYields = !this.engine.showYields;
        yieldsBtn.innerHTML = this.engine.showYields ? `<span>🌾</span> 产出已开启` : `<span>🌾</span> 产出已隐藏`;
      });
    }

    // 11. Diplomacy Modal Controls
    const diploModal = document.getElementById("diplo-modal");
    const diploPortrait = document.getElementById("diplo-portrait");
    const diploTitle = document.getElementById("diplo-leader-title");
    const diploText = document.getElementById("diplo-text");
    const closeDiploBtn = document.getElementById("btn-close-diplo");

    const leadersData = {
      "TRAJAN": {
        name: "图拉真 (罗马帝国)",
        img: "./assets/arx/Civ_LEADER_TRAJAN.png",
        quote: "“罗马军团的威名响彻整个已知世界。条条大路通罗马，我们愿同大秦签署互不侵犯友好协约与通商道路！”"
      },
      "CLEOPATRA": {
        name: "克利奥帕特拉 (埃及)",
        img: "./assets/arx/Civ_LEADER_CLEOPATRA.png",
        quote: "“尼罗河的洪水滋养着金字塔与方尖碑。大秦雄主，若你拥有强大的军势护佑商队，埃及将永远是你的知心盟友。”"
      },
      "GANDHI": {
        name: "莫罕达斯·甘地 (印度)",
        img: "./assets/arx/Civ_LEADER_GANDHI.png",
        quote: "“没有通往和平的路，和平本身就是路。但若有任何人试图践踏印度领土，我们的威慑之力将焚尽来犯之敌。”"
      }
    };

    const openDiplo = (leaderKey) => {
      const l = leadersData[leaderKey];
      if (!l || !diploModal) return;
      if (diploPortrait) diploPortrait.src = l.img;
      if (diploTitle) diploTitle.innerText = l.name;
      if (diploText) diploText.innerText = l.quote;
      diploModal.style.display = "flex";
    };

    const entryTrajan = document.getElementById("leader-entry-trajan");
    if (entryTrajan) entryTrajan.addEventListener("click", () => openDiplo("TRAJAN"));

    const entryCleo = document.getElementById("leader-entry-cleo");
    if (entryCleo) entryCleo.addEventListener("click", () => openDiplo("CLEOPATRA"));

    const entryGandhi = document.getElementById("leader-entry-gandhi");
    if (entryGandhi) entryGandhi.addEventListener("click", () => openDiplo("GANDHI"));

    if (closeDiploBtn && diploModal) {
      closeDiploBtn.addEventListener("click", () => {
        diploModal.style.display = "none";
      });
    }

    const btnDiploFriend = document.getElementById("btn-diplo-friend");
    if (btnDiploFriend) {
      btnDiploFriend.addEventListener("click", () => {
        this.appendChat("system", "🤝 外交盛事：你与领袖达成了【宣布友好】宣言！边境开放，两国商路繁荣！");
        if (diploModal) diploModal.style.display = "none";
      });
    }

    const btnDiploTrade = document.getElementById("btn-diplo-trade");
    if (btnDiploTrade) {
      btnDiploTrade.addEventListener("click", () => {
        const me = this.engine.gameState ? this.engine.gameState.players.find(p => p.id === this.engine.myPlayerId) : null;
        if (me) {
          me.gold += 30;
          this.updateHUD(this.engine.gameState);
        }
        this.appendChat("system", "🪙 丝绸之路贸易协定签订成功！双方互通关税，国库入账 +30 金币！");
        if (diploModal) diploModal.style.display = "none";
      });
    }

    const btnDiploWar = document.getElementById("btn-diplo-war");
    if (btnDiploWar) {
      btnDiploWar.addEventListener("click", () => {
        this.appendChat("system", "⚔️ 【正式宣战】你已向对方宣战！战鼓雷鸣，全军进入紧急战备状态！");
        if (diploModal) diploModal.style.display = "none";
      });
    }

    // 9. Chat Send
    const chatInput = document.getElementById("chat-input");
    const btnSend = document.getElementById("btn-send-chat");
    const doSend = () => {
      if (chatInput) {
        this.sendChat(chatInput.value);
        chatInput.value = "";
      }
    };
    if (btnSend) btnSend.addEventListener("click", doSend);
    if (chatInput) {
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSend();
      });
    }

    // 10. Copy Invite Link
    const copyBtn = document.getElementById("btn-copy-invite");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const shareUrl = window.location.href.split("?")[0] + `?room=${this.roomId}&from=invite`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert(`已复制开箱即玩链接到剪贴板！\n${shareUrl}\n\n无论是手机浏览器还是电脑浏览器，直接打开即可联机开玩！`);
        } catch (err) {
          prompt("请手动复制链接分享给好友：", shareUrl);
        }
      });
    }

    // 11. Drawer Tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        const targetTab = document.getElementById(`tab-${tabId}`);
        if (targetTab) targetTab.classList.add("active");
      });
    });
  }
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  const engine = new Civ6Engine("civ-canvas");
  window.networkManager = new Civ6NetworkManager(engine);
});

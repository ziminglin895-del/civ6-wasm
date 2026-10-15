// Civilization VI WASM/Web-Native Multiplayer & Standalone Network Manager
class Civ6NetworkManager {
  constructor(engine) {
    this.engine = engine;
    this.ws = null;

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    this.roomId = params.get("room") || "1001";
    document.getElementById("room-id-display").innerText = `#${this.roomId}`;

    // Force solo mode if param exists
    this.forceSolo = params.get("mode") === "solo";

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

    console.log("Connecting to Civ6 Relay:", wsUrl);

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
        this.appendChat("system", "已连接至局域网/Radmin 联机对战中继服务！");
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
    document.getElementById("turn-display").innerText = `第 ${state.turn} 回合`;

    const me = state.players.find(p => p.id === this.playerId || p.id === "player_haige");
    if (me) {
      document.getElementById("gold-display").innerText = me.gold;
      document.getElementById("science-display").innerText = `+${me.science}`;
      document.getElementById("current-tech-name").innerText = me.current_tech;
    }

    // Update readiness pill
    const readinessHud = document.getElementById("readiness-hud");
    readinessHud.innerHTML = state.players.map(p => `
      <span class="player-dot ${p.is_ready ? 'ready' : ''}">
        ${p.name}: ${p.is_ready ? '已就绪' : '思考中...'}
      </span>
    `).join("");

    // Update Player list
    const playerList = document.getElementById("player-list");
    playerList.innerHTML = state.players.map(p => `
      <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px;">
        <span style="color: ${p.color}; font-weight: bold;">●</span> ${p.name}
        <span style="float: right; color: #dfbe74;">💰 ${p.gold}</span>
      </div>
    `).join("");
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
        this.appendChat("AI 凯撒", "罗马随时准备与你展开贸易协定！", new Date().toLocaleTimeString());
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
    // End Turn Button
    document.getElementById("btn-end-turn").addEventListener("click", () => {
      this.sendEndTurn();
    });

    // Found City Button
    document.getElementById("btn-found-city").addEventListener("click", () => {
      if (this.engine.selectedUnit) {
        this.sendFoundCity(this.engine.selectedUnit.id);
        document.getElementById("unit-card").style.display = "none";
      }
    });

    // Chat Send
    const chatInput = document.getElementById("chat-input");
    const btnSend = document.getElementById("btn-send-chat");
    const doSend = () => {
      this.sendChat(chatInput.value);
      chatInput.value = "";
    };
    btnSend.addEventListener("click", doSend);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSend();
    });

    // Copy Invite Link
    document.getElementById("btn-copy-invite").addEventListener("click", async () => {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        const radmin = (data.network && data.network.radmin_vpn) || (data.network && data.network.wifi_lan) || window.location.hostname;
        const inviteUrl = `http://${radmin}:8088/?room=${this.roomId}&from=invite`;
        await navigator.clipboard.writeText(inviteUrl);
        alert(`已复制开黑链接到剪贴板！\n${inviteUrl}\n\n朋友在异地电脑或手机浏览器打开即可秒玩！`);
      } catch (err) {
        const fallbackUrl = `${window.location.origin}/?room=${this.roomId}&from=invite`;
        navigator.clipboard.writeText(fallbackUrl);
        alert(`已复制开黑链接:\n${fallbackUrl}`);
      }
    });

    // Drawer Tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(`tab-${tabId}`).classList.add("active");
      });
    });
  }
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  const engine = new Civ6Engine("civ-canvas");
  window.networkManager = new Civ6NetworkManager(engine);
});

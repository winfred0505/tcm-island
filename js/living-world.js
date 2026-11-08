/**
 * living-world.js
 * 管理中藥島的生活感系統：NPC 居民狀態機、散步與對話、海灘撿貝殼、背包以物易物交易鏈
 */

export class LivingWorldManager {
  constructor(app) {
    this.app = app;
    this.backpackKey = "tcm_island_backpack_v1";
    this.visitedKey = "tcm_island_visited_v1";
    this.activeNpc = null;
    this.activeNpcMesh = null;
    this.activeAnimal = null;
    this.activeAnimalMesh = null;
    this.dialogueIndex = 0;
    this.audioCtx = null;

    // 初始化背包資料 (預設 3 顆貝殼)
    this.backpack = this.loadBackpack();
    this.visited = this.loadVisited();

    // 貝殼重生追蹤表
    this.shells = [];
    this.shellCooldowns = new Map();
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
  }

  playChime(type = "pickup") {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (type === "pickup") {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === "trade") {
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(554.37, now + 0.1); // C#5
        osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio autoplay policy
    }
  }

  loadBackpack() {
    try {
      const data = localStorage.getItem(this.backpackKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn("無法讀取背包資料:", e);
    }
    return {
      "🐚 海灘貝殼": 3
    };
  }

  saveBackpack() {
    try {
      localStorage.setItem(this.backpackKey, JSON.stringify(this.backpack));
      this.updateBackpackUI();
    } catch (e) {
      console.warn("無法儲存背包資料:", e);
    }
  }

  clearBackpack() {
    this.backpack = { "🐚 海灘貝殼": 3 };
    this.saveBackpack();
  }

  loadVisited() {
    try {
      const data = localStorage.getItem(this.visitedKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn("無法讀取探索進度:", e);
    }
    return ["island-center"];
  }

  saveVisited() {
    try {
      localStorage.setItem(this.visitedKey, JSON.stringify(this.visited));
      this.updatePassportUI();
    } catch (e) {
      console.warn("無法儲存探索進度:", e);
    }
  }

  markVisited(islandId) {
    if (!this.visited.includes(islandId)) {
      this.visited.push(islandId);
      this.saveVisited();
      this.playChime("trade");
    }
  }

  updateBackpackUI() {
    const countEl = document.getElementById("backpack-count");
    if (countEl) {
      let total = 0;
      for (const k in this.backpack) {
        total += this.backpack[k];
      }
      countEl.textContent = total;
    }

    const grid = document.getElementById("backpack-grid-items");
    if (!grid) return;
    grid.innerHTML = "";

    const keys = Object.keys(this.backpack);
    if (keys.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--muted);">背包目前是空的喔！快去海灘撿貝殼吧。</div>`;
      return;
    }

    keys.forEach(itemName => {
      const qty = this.backpack[itemName];
      if (qty <= 0) return;
      const icon = itemName.slice(0, 2);
      const name = itemName.slice(2).trim();

      const itemCard = document.createElement("div");
      itemCard.className = "backpack-item";
      itemCard.innerHTML = `
        <div class="backpack-item-icon">${icon}</div>
        <div class="backpack-item-name">${name}</div>
        <div class="backpack-item-qty">數量：${qty}</div>
      `;
      grid.appendChild(itemCard);
    });
  }

  updatePassportUI() {
    const passportCountEl = document.getElementById("passport-count");
    if (passportCountEl) {
      passportCountEl.textContent = `${this.visited.length}/5`;
    }

    const grid = document.getElementById("passport-grid-items");
    if (!grid || !this.app.data) return;
    grid.innerHTML = "";

    this.app.data.islands.forEach(isl => {
      const isVisited = this.visited.includes(isl.id);
      const stamp = document.createElement("div");
      stamp.className = `passport-stamp-card ${isVisited ? "visited" : ""}`;
      stamp.innerHTML = `
        <div class="passport-stamp-icon">${isVisited ? "💮" : "⭕"}</div>
        <div class="passport-stamp-name">${isl.name}</div>
        <div style="font-size:11px; color:${isVisited ? 'var(--primary)' : 'var(--muted)'}; margin-top:4px;">
          ${isVisited ? "✓ 已登陸探索" : "尚未造訪"}
        </div>
      `;
      stamp.addEventListener("click", () => {
        this.app.ui.closeAllModals();
        this.app.sceneManager.focusIsland(isl.id);
      });
      grid.appendChild(stamp);
    });
  }

  // 撿拾貝殼
  pickupShell(shellMesh) {
    if (this.shellCooldowns.has(shellMesh.uuid)) {
      return;
    }

    // 拾取 +1
    this.backpack["🐚 海灘貝殼"] = (this.backpack["🐚 海灘貝殼"] || 0) + 1;
    this.saveBackpack();
    this.playChime("pickup");

    // 隱藏該貝殼並進入 20 秒冷卻重生
    shellMesh.visible = false;
    this.shellCooldowns.set(shellMesh.uuid, Date.now() + 20000);

    // 飄出 +1 提示泡泡
    this.showFloatingNotice("+1 🐚 撿到海灘貝殼！", shellMesh.position);
  }

  updateShellCooldowns() {
    const now = Date.now();
    this.shells.forEach(shell => {
      if (!shell.visible && this.shellCooldowns.has(shell.uuid)) {
        if (now >= this.shellCooldowns.get(shell.uuid)) {
          shell.visible = true;
          this.shellCooldowns.delete(shell.uuid);
        }
      }
    });
  }

  showFloatingNotice(text, pos3D) {
    const layer = document.getElementById("speech-bubble-layer");
    if (!layer) return;

    const tip = document.createElement("div");
    tip.className = "speech-bubble";
    tip.style.border = "2px solid var(--success)";
    tip.style.color = "var(--success)";
    tip.style.fontWeight = "bold";
    tip.innerHTML = text;

    const screenPos = this.app.sceneManager.toScreenPosition(pos3D);
    tip.style.left = `${screenPos.x}px`;
    tip.style.top = `${screenPos.y - 20}px`;
    layer.appendChild(tip);

    setTimeout(() => {
      tip.style.transition = "transform 0.8s ease, opacity 0.8s ease";
      tip.style.transform = "translate(-50%, -160%)";
      tip.style.opacity = "0";
      setTimeout(() => tip.remove(), 800);
    }, 1000);
  }

  // 開啟 NPC 對話泡泡
  openNpcDialogue(npcData, npcMesh) {
    this.activeNpc = npcData;
    this.activeNpcMesh = npcMesh;
    this.dialogueIndex = 0;
    this.renderBubble(npcData, npcMesh.position, "npc");
  }

  // 開啟動物對話泡泡
  openAnimalDialogue(animalData, animalMesh) {
    this.activeAnimal = animalData;
    this.activeAnimalMesh = animalMesh;
    this.renderBubble(animalData, animalMesh.position, "animal");
  }

  renderBubble(data, pos3D, type = "npc") {
    const layer = document.getElementById("speech-bubble-layer");
    if (!layer) return;
    layer.innerHTML = "";

    const bubble = document.createElement("div");
    bubble.className = "speech-bubble";
    bubble.id = "active-speech-bubble";

    let headerHtml = "";
    let textHtml = "";
    let actionsHtml = "";

    if (type === "npc") {
      const dialogue = data.dialogues[this.dialogueIndex % data.dialogues.length];
      headerHtml = `
        <div class="speech-header">
          <div>
            <span class="speech-speaker">${data.name}</span>
            <span class="speech-title">・${data.title}</span>
          </div>
          <button class="speech-close" id="btn-bubble-close" aria-label="關閉">✕</button>
        </div>
      `;
      textHtml = `<div class="speech-text">${dialogue}</div>`;

      actionsHtml = `
        <div class="speech-actions">
          <button class="btn" id="btn-bubble-more">💬 再聊聊</button>
          ${data.trade ? `<button class="btn btn-accent" id="btn-bubble-trade">🔁 交易</button>` : ""}
        </div>
      `;
    } else {
      headerHtml = `
        <div class="speech-header">
          <div>
            <span class="speech-speaker">${data.icon} ${data.name}</span>
            <span class="speech-title">・${data.location}</span>
          </div>
          <button class="speech-close" id="btn-bubble-close" aria-label="關閉">✕</button>
        </div>
      `;
      textHtml = `<div class="speech-text">${data.dialogue}</div>`;
      actionsHtml = `
        <div class="speech-actions">
          <button class="btn btn-primary" id="btn-bubble-pet">🐾 摸摸牠</button>
        </div>
      `;
    }

    bubble.innerHTML = headerHtml + textHtml + actionsHtml;
    layer.appendChild(bubble);

    // 計算定位
    this.updateBubblePosition(pos3D);

    // 綁定事件
    const closeBtn = document.getElementById("btn-bubble-close");
    if (closeBtn) closeBtn.onclick = () => this.closeBubble();

    const moreBtn = document.getElementById("btn-bubble-more");
    if (moreBtn && type === "npc") {
      moreBtn.onclick = () => {
        this.dialogueIndex++;
        const nextText = data.dialogues[this.dialogueIndex % data.dialogues.length];
        const textEl = bubble.querySelector(".speech-text");
        if (textEl) textEl.textContent = nextText;
      };
    }

    const tradeBtn = document.getElementById("btn-bubble-trade");
    if (tradeBtn && data.trade) {
      tradeBtn.onclick = () => this.handleTrade(data);
    }

    const petBtn = document.getElementById("btn-bubble-pet");
    if (petBtn) {
      petBtn.onclick = () => {
        const textEl = bubble.querySelector(".speech-text");
        if (textEl) textEl.textContent = `（${data.name} 開心地搖了搖身體，發出舒服的聲音！）`;
        this.playChime("pickup");
      };
    }
  }

  handleTrade(npcData) {
    const trade = npcData.trade;
    const haveCount = this.backpack[trade.costItem] || 0;

    if (haveCount < trade.costCount) {
      alert(`物品不足喔！\n換取「${trade.giveItem}」需要：${trade.costCount} 個「${trade.costItem}」。\n您目前只有 ${haveCount} 個。\n提示：可在海灘撿貝殼或與其他島民交換！`);
      return;
    }

    // 扣除並給予
    this.backpack[trade.costItem] -= trade.costCount;
    if (this.backpack[trade.costItem] === 0) {
      delete this.backpack[trade.costItem];
    }
    this.backpack[trade.giveItem] = (this.backpack[trade.giveItem] || 0) + trade.giveCount;
    this.saveBackpack();
    this.playChime("trade");

    const textEl = document.querySelector("#active-speech-bubble .speech-text");
    if (textEl) {
      textEl.innerHTML = `<strong>交易成功！</strong><br>您獲得了 <strong>${trade.giveItem}</strong>！謝謝您的交流！`;
    }
  }

  closeBubble() {
    const layer = document.getElementById("speech-bubble-layer");
    if (layer) layer.innerHTML = "";
    this.activeNpc = null;
    this.activeNpcMesh = null;
    this.activeAnimal = null;
    this.activeAnimalMesh = null;
  }

  updateBubblePosition(pos3D) {
    const bubble = document.getElementById("active-speech-bubble");
    if (!bubble) return;
    const screenPos = this.app.sceneManager.toScreenPosition(pos3D);
    bubble.style.left = `${screenPos.x}px`;
    bubble.style.top = `${screenPos.y - 15}px`;
  }
}

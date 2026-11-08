/**
 * ui.js
 * 負責中藥島的使用者介面交互：浮動標籤投影、抽屜面板、搜尋、地點清單、小嚮導問答、護照、小測驗與接關碼
 */

export class UIManager {
  constructor(app) {
    this.app = app;
    this.labelsContainer = document.getElementById("island-labels-layer");
    this.drawer = document.getElementById("island-drawer");
    this.backdrop = document.getElementById("drawer-backdrop");
    this.currentIslandId = null;

    // 主題與時鐘狀態
    this.themeMode = "auto"; // "晨光", "海霧", "夜海", "auto"
    this.userPreferredTheme = localStorage.getItem("tcm_island_theme_mode") || "auto";

    this.initUI();
  }

  initUI() {
    this.setupThemeAndClock();
    this.setupIslandLabels();
    this.setupModals();
    this.setupDrawer();
    this.setupFallbackList();
  }

  /**
   * 建立 3D 浮動標籤 (HTML 疊層)
   */
  setupIslandLabels() {
    if (!this.app.data || !this.app.data.islands) return;
    this.labelsContainer.innerHTML = "";

    this.app.data.islands.forEach(isl => {
      const pin = document.createElement("div");
      pin.className = "island-label-pin";
      pin.id = `label-pin-${isl.id}`;
      pin.setAttribute("role", "button");
      pin.setAttribute("tabindex", "0");
      pin.setAttribute("aria-label", `探索 ${isl.name}`);

      pin.innerHTML = `
        <div class="island-label-bubble">
          <div class="island-label-num">${isl.order === 0 ? "★" : isl.order}</div>
          <div class="island-label-title">${isl.name}</div>
          <div class="island-label-tag">${isl.badge || isl.category}</div>
        </div>
        <div class="island-label-stem">
          <div class="island-label-dot"></div>
        </div>
      `;

      pin.addEventListener("click", () => {
        this.app.sceneManager.focusIsland(isl.id);
      });

      pin.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.app.sceneManager.focusIsland(isl.id);
        }
      });

      this.labelsContainer.appendChild(pin);
    });
  }

  /**
   * 每幀更新浮動標籤的螢幕像素位置
   */
  updateLabelsPosition() {
    if (!this.app.data || !this.app.data.islands) return;

    this.app.data.islands.forEach(isl => {
      const pin = document.getElementById(`label-pin-${isl.id}`);
      if (!pin) return;

      const pos3D = this.app.sceneManager.islandCenters.get(isl.id);
      if (!pos3D) return;

      // 標籤放置於島嶼中心上方 (高懸於上空，避免遮擋地面居民與建築物)
      const elevatedPos = pos3D.clone();
      elevatedPos.y += (isl.id === "island-center" ? 14.5 : 10.5);

      const screenPos = this.app.sceneManager.toScreenPosition(elevatedPos);

      // 當開場運鏡或標籤超出背面時隱藏
      if (!screenPos.visible || this.app.sceneManager.isCinemaActive) {
        pin.style.opacity = "0";
        pin.style.pointerEvents = "none";
      } else {
        pin.style.opacity = "1";
        pin.style.pointerEvents = "auto";
        pin.style.left = `${screenPos.x}px`;
        pin.style.top = `${screenPos.y}px`;
      }
    });

    // 若有活動對話泡泡，同步更新
    if (this.app.livingWorld.activeNpc || this.app.livingWorld.activeAnimal) {
      const activeObj = this.app.livingWorld.activeNpc || this.app.livingWorld.activeAnimal;
      // 找到對應的三維 Mesh
      let mesh = null;
      if (this.app.livingWorld.activeNpc) {
        mesh = this.app.sceneManager.npcs.find(n => n.userData.data.id === activeObj.id);
      } else {
        mesh = this.app.sceneManager.animals.find(a => a.userData.data.id === activeObj.id);
      }
      if (mesh) {
        this.app.livingWorld.updateBubblePosition(mesh.position);
      }
    }
  }

  /**
   * 主題切換與日夜即時時鐘
   */
  setupThemeAndClock() {
    const pills = document.querySelectorAll(".theme-pill");
    pills.forEach(pill => {
      pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        const theme = pill.dataset.theme;
        this.userPreferredTheme = theme;
        localStorage.setItem("tcm_island_theme_mode", theme);
        this.applyTheme(theme);
      });
    });

    // 啟動定時器同步時鐘與自動日夜循環
    this.updateClockTick();
    setInterval(() => this.updateClockTick(), 1000);

    // 套用初始偏好
    this.applyTheme(this.userPreferredTheme);
  }

  updateClockTick() {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    let period = "白天";
    let icon = "☀️";
    let timeOfDay = "day";
    let matchedTheme = "晨光";

    if (hours >= 6 && hours < 16) {
      period = "白天";
      icon = "☀️";
      timeOfDay = "day";
      matchedTheme = "晨光";
    } else if ((hours >= 16 && hours < 19) || (hours >= 5 && hours < 6)) {
      period = "黃昏";
      icon = "🌇";
      timeOfDay = "dusk";
      matchedTheme = "海霧";
    } else {
      period = "夜晚";
      icon = "🌙";
      timeOfDay = "night";
      matchedTheme = "夜海";
    }

    const clockTimeEl = document.getElementById("clock-time");
    const clockIconEl = document.getElementById("clock-icon");
    if (clockTimeEl) clockTimeEl.textContent = `${period} ${timeStr}`;
    if (clockIconEl) clockIconEl.textContent = icon;

    // 若處於自動模式，依照真實時間切換底色
    if (this.userPreferredTheme === "auto") {
      this.applyThemeColor(matchedTheme, timeOfDay);
    }
  }

  applyTheme(themeName) {
    if (themeName === "auto") {
      this.updateClockTick();
    } else {
      let timeOfDay = "day";
      if (themeName === "海霧") timeOfDay = "dusk";
      if (themeName === "夜海") timeOfDay = "night";
      this.applyThemeColor(themeName, timeOfDay);
    }
  }

  applyThemeColor(themeName, timeOfDay) {
    document.documentElement.setAttribute("data-theme", themeName);
    if (this.app.sceneManager) {
      this.app.sceneManager.updateDayNightCycle(themeName, timeOfDay);
    }
  }

  /**
   * 側邊抽屜面板 (島嶼詳細內容與測驗)
   */
  setupDrawer() {
    const closeBtn = document.getElementById("btn-close-drawer");
    if (closeBtn) closeBtn.onclick = () => this.closeIslandDrawer();
    if (this.backdrop) this.backdrop.onclick = () => this.closeIslandDrawer();

    const prevBtn = document.getElementById("btn-drawer-prev");
    const nextBtn = document.getElementById("btn-drawer-next");

    if (prevBtn) {
      prevBtn.onclick = () => {
        const curIdx = this.app.data.islands.findIndex(i => i.id === this.currentIslandId);
        const prevIdx = (curIdx - 1 + this.app.data.islands.length) % this.app.data.islands.length;
        this.app.sceneManager.focusIsland(this.app.data.islands[prevIdx].id);
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        const curIdx = this.app.data.islands.findIndex(i => i.id === this.currentIslandId);
        const nextIdx = (curIdx + 1) % this.app.data.islands.length;
        this.app.sceneManager.focusIsland(this.app.data.islands[nextIdx].id);
      };
    }
  }

  prepareIslandDrawer(islandId) {
    const isl = this.app.data.islands.find(i => i.id === islandId);
    if (!isl) return;

    this.currentIslandId = islandId;
    this.app.livingWorld.markVisited(islandId);

    // 填充標題資訊
    document.getElementById("drawer-island-category").textContent = isl.category;
    document.getElementById("drawer-island-title").textContent = isl.name;
    document.getElementById("drawer-island-extra").textContent = `地標：${isl.extra}`;

    const bodyEl = document.getElementById("drawer-body-content");
    bodyEl.innerHTML = "";

    // 簡介卡片
    const introCard = document.createElement("div");
    introCard.className = "drawer-intro-card";
    introCard.textContent = isl.intro;
    bodyEl.appendChild(introCard);

    // 統計卡片
    if (isl.stats) {
      const statsPills = document.createElement("div");
      statsPills.className = "stat-pills";
      statsPills.innerHTML = `
        <div class="stat-pill">
          <span class="stat-pill-label">${isl.stats.label}</span>
          <span class="stat-pill-value">${isl.stats.value}</span>
        </div>
      `;
      bodyEl.appendChild(statsPills);
    }

    // 各章節詳細圖文內容 (來自 materials 整理)
    if (isl.sections) {
      isl.sections.forEach(sec => {
        const secCard = document.createElement("div");
        secCard.className = "section-card";
        secCard.innerHTML = `
          <h3>📌 ${sec.title}</h3>
          <p>${sec.content}</p>
        `;
        bodyEl.appendChild(secCard);
      });
    }

    // 島嶼專屬小測驗
    if (isl.quiz && isl.quiz.length > 0) {
      const quizWrap = document.createElement("div");
      quizWrap.className = "section-card";
      quizWrap.innerHTML = `<h3>💡 本島精選挑戰題</h3>`;

      isl.quiz.forEach((q, qIdx) => {
        const qBlock = document.createElement("div");
        qBlock.className = "quiz-block";
        qBlock.innerHTML = `
          <h4>Q${qIdx + 1}：${q.question}</h4>
          <div class="quiz-options">
            ${q.options.map((opt, optIdx) => `
              <button class="quiz-option" data-opt="${optIdx}">${opt}</button>
            `).join("")}
          </div>
          <div class="quiz-feedback" id="feedback-${isl.id}-${qIdx}"></div>
        `;

        const optButtons = qBlock.querySelectorAll(".quiz-option");
        optButtons.forEach(btn => {
          btn.addEventListener("click", () => {
            const chosen = parseInt(btn.dataset.opt);
            const feedbackEl = qBlock.querySelector(".quiz-feedback");
            optButtons.forEach(b => b.disabled = true);

            if (chosen === q.answerIndex) {
              btn.classList.add("correct");
              feedbackEl.className = "quiz-feedback show";
              feedbackEl.style.background = "#e6f6ee";
              feedbackEl.style.color = "var(--success)";
              feedbackEl.innerHTML = `<strong>答對了！</strong> ${q.explanation}`;
              this.app.livingWorld.playChime("trade");
            } else {
              btn.classList.add("wrong");
              optButtons[q.answerIndex].classList.add("correct");
              feedbackEl.className = "quiz-feedback show";
              feedbackEl.style.background = "#fdeeee";
              feedbackEl.style.color = "var(--danger)";
              feedbackEl.innerHTML = `<strong>答錯囉！</strong> ${q.explanation}`;
            }
          });
        });

        quizWrap.appendChild(qBlock);
      });
      bodyEl.appendChild(quizWrap);
    }
  }

  openIslandDrawer(islandId) {
    this.prepareIslandDrawer(islandId);
    this.drawer.classList.add("open");
    this.backdrop.classList.add("open");
  }

  closeIslandDrawer() {
    this.drawer.classList.remove("open");
    this.backdrop.classList.remove("open");
    this.currentIslandId = null;
    this.app.sceneManager.resetToOverview();
  }

  /**
   * 彈出模態視窗通用控制 (搜尋、清單、小嚮導、背包、護照、測驗、接關碼)
   */
  setupModals() {
    const modalButtons = [
      { btnId: "btn-open-search", modalId: "modal-search", onOpen: () => this.initSearch() },
      { btnId: "btn-open-list", modalId: "modal-list", onOpen: () => this.renderPlaceList() },
      { btnId: "btn-open-guide", modalId: "modal-guide", onOpen: () => {} },
      { btnId: "btn-open-backpack", modalId: "modal-backpack", onOpen: () => this.app.livingWorld.updateBackpackUI() },
      { btnId: "btn-open-passport", modalId: "modal-passport", onOpen: () => this.app.livingWorld.updatePassportUI() },
      { btnId: "btn-open-quiz", modalId: "modal-quiz", onOpen: () => this.renderAllQuizzes() },
      { btnId: "btn-open-savecode", modalId: "modal-savecode", onOpen: () => this.renderSaveCode() },
      { btnId: "btn-brand-home", modalId: null, onOpen: () => this.app.sceneManager.focusIsland("island-center") },
      { btnId: "btn-reset-camera", modalId: null, onOpen: () => this.app.sceneManager.resetToOverview() },
      { btnId: "btn-replay-cinema", modalId: null, onOpen: () => this.app.sceneManager.startCinemaIntro() }
    ];

    modalButtons.forEach(cfg => {
      const btn = document.getElementById(cfg.btnId);
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (cfg.modalId) {
          this.openModal(cfg.modalId);
          if (cfg.onOpen) cfg.onOpen();
        } else if (cfg.onOpen) {
          cfg.onOpen();
        }
      });
    });

    // 關閉按鈕
    document.querySelectorAll(".modal-close-btn").forEach(btn => {
      btn.addEventListener("click", () => this.closeAllModals());
    });

    // 點擊遮罩空白處關閉
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeAllModals();
      });
    });

    // 小嚮導問答發送
    const guideInput = document.getElementById("guide-input-field");
    const guideSend = document.getElementById("btn-guide-send");
    if (guideSend && guideInput) {
      const sendHandler = () => {
        const text = guideInput.value.trim();
        if (!text) return;
        this.handleGuideQuery(text);
        guideInput.value = "";
      };
      guideSend.addEventListener("click", sendHandler);
      guideInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendHandler();
      });
    }

    // 清空背包按鈕
    const clearBp = document.getElementById("btn-clear-backpack");
    if (clearBp) {
      clearBp.onclick = () => {
        if (confirm("確定要清空探險背包嗎？重置後將恢復初始 3 顆貝殼。")) {
          this.app.livingWorld.clearBackpack();
        }
      };
    }

    // 複製接關碼按鈕
    const copyBtn = document.getElementById("btn-copy-savecode");
    if (copyBtn) {
      copyBtn.onclick = () => {
        const txt = document.getElementById("savecode-export-text");
        if (txt) {
          txt.select();
          navigator.clipboard.writeText(txt.value).then(() => {
            alert("接關代碼已成功複製到剪貼簿！");
          });
        }
      };
    }

    // 載入接關碼按鈕
    const applyBtn = document.getElementById("btn-apply-savecode");
    if (applyBtn) {
      applyBtn.onclick = () => this.applySaveCode();
    }

    // 重置所有資料按鈕
    const resetAllBtn = document.getElementById("btn-reset-all-data");
    if (resetAllBtn) {
      resetAllBtn.onclick = () => {
        if (confirm("警告：這將會清除您所有的探索護照印章與背包道具，確定重置嗎？")) {
          localStorage.clear();
          location.reload();
        }
      };
    }

    // 減少動態開關
    const reducedBtn = document.getElementById("btn-reduced-motion");
    if (reducedBtn) {
      reducedBtn.onclick = () => {
        this.app.sceneManager.isReducedMotion = !this.app.sceneManager.isReducedMotion;
        reducedBtn.style.color = this.app.sceneManager.isReducedMotion ? "var(--accent)" : "inherit";
        alert(this.app.sceneManager.isReducedMotion ? "已開啟減少動態模式（暫停島嶼動態動畫）" : "已恢復完整動態模式");
      };
    }
  }

  openModal(modalId) {
    this.closeAllModals();
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("open");
  }

  closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
    if (this.drawer && this.drawer.classList.contains("open")) {
      this.closeIslandDrawer();
    }
  }

  /**
   * 搜尋模態視窗邏輯
   */
  initSearch() {
    const input = document.getElementById("search-input-field");
    const results = document.getElementById("search-results-container");
    if (!input || !results) return;

    input.value = "";
    input.focus();

    input.oninput = () => {
      const query = input.value.trim().toLowerCase();
      if (!query) {
        results.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">請輸入關鍵字搜尋群島景點、服務機能與安全規範</p>`;
        return;
      }

      const matchedIslands = [];
      this.app.data.islands.forEach(isl => {
        let matchScore = 0;
        let snippet = "";

        if (isl.name.toLowerCase().includes(query)) matchScore += 10;
        if (isl.intro.toLowerCase().includes(query)) {
          matchScore += 5;
          snippet = isl.intro;
        }

        if (isl.sections) {
          isl.sections.forEach(sec => {
            if (sec.title.toLowerCase().includes(query) || sec.content.toLowerCase().includes(query)) {
              matchScore += 4;
              if (!snippet) snippet = sec.content.slice(0, 80) + "...";
            }
          });
        }

        if (matchScore > 0) {
          matchedIslands.push({ island: isl, snippet });
        }
      });

      if (matchedIslands.length === 0) {
        results.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">找不到符合「${query}」的內容，換個關鍵字試試看！</p>`;
      } else {
        results.innerHTML = "";
        matchedIslands.forEach(item => {
          const card = document.createElement("div");
          card.className = "section-card";
          card.style.cursor = "pointer";
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">🏝️ ${item.island.name}</h3>
              <span class="drawer-category-tag">${item.island.category}</span>
            </div>
            <p style="margin-top:6px; font-size:13px; color:var(--ink-secondary);">${item.snippet || item.island.intro}</p>
          `;
          card.onclick = () => {
            this.closeAllModals();
            this.app.sceneManager.focusIsland(item.island.id);
          };
          results.appendChild(card);
        });
      }
    };
  }

  /**
   * 地點清單 (無障礙全覽)
   */
  renderPlaceList() {
    const container = document.getElementById("place-list-content");
    if (!container || !this.app.data) return;
    container.innerHTML = "";

    this.app.data.islands.forEach(isl => {
      const card = document.createElement("div");
      card.className = "section-card";
      card.style.marginBottom = "12px";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0;">${isl.order === 0 ? "★" : isl.order + "."} ${isl.name}</h3>
          <span class="drawer-category-tag">${isl.category}</span>
        </div>
        <p style="margin:8px 0; font-size:13.5px; color:var(--ink);">${isl.intro}</p>
        <div style="font-size:12.5px; color:var(--muted);">🏛️ 特色地標：${isl.extra}</div>
        <button class="btn btn-primary" style="margin-top:10px; width:100%; min-height:40px;">飛往此島探索 ›</button>
      `;
      card.querySelector("button").onclick = () => {
        this.closeAllModals();
        this.app.sceneManager.focusIsland(isl.id);
      };
      container.appendChild(card);
    });
  }

  /**
   * 董藥師小嚮導關鍵字比對問答
   */
  handleGuideQuery(query) {
    const chatBox = document.getElementById("guide-chat-box");
    if (!chatBox) return;

    // 顯示使用者發問
    const userMsg = document.createElement("div");
    userMsg.className = "guide-msg user";
    userMsg.innerHTML = `<div class="guide-bubble">${query}</div>`;
    chatBox.appendChild(userMsg);

    // 比對知識庫
    const qLower = query.toLowerCase();
    let bestMatch = null;
    let maxMatches = 0;

    if (this.app.data.qaDatabase) {
      this.app.data.qaDatabase.forEach(qa => {
        let count = 0;
        qa.keywords.forEach(kw => {
          if (qLower.includes(kw.toLowerCase())) count++;
        });
        if (count > maxMatches) {
          maxMatches = count;
          bestMatch = qa;
        }
      });
    }

    setTimeout(() => {
      const botMsg = document.createElement("div");
      botMsg.className = "guide-msg";

      if (bestMatch && maxMatches > 0) {
        botMsg.innerHTML = `
          <div class="guide-avatar">👨‍⚕️</div>
          <div class="guide-bubble">
            ${bestMatch.answer}
            <div>
              <span class="guide-source-tag" data-island="${bestMatch.islandId}">🔗 出處：${bestMatch.source}（點擊飛往）</span>
            </div>
          </div>
        `;
        const link = botMsg.querySelector(".guide-source-tag");
        link.onclick = () => {
          this.closeAllModals();
          this.app.sceneManager.focusIsland(bestMatch.islandId);
        };
      } else {
        botMsg.innerHTML = `
          <div class="guide-avatar">👨‍⚕️</div>
          <div class="guide-bubble">
            您好！關於「${query}」我目前沒有在群島資料庫中查找到確切紀錄。建議您可以嘗試詢問：「全台分布」、「50床專責病房」、「條碼三讀檢核」、「師資證照」或「元氣即飲包」等主題喔！
          </div>
        `;
      }
      chatBox.appendChild(botMsg);
      chatBox.scrollTop = chatBox.scrollHeight;
    }, 350);
  }

  /**
   * 彙整全島測驗題目
   */
  renderAllQuizzes() {
    const container = document.getElementById("all-quiz-container");
    if (!container || !this.app.data) return;
    container.innerHTML = `<p style="font-size:13.5px; color:var(--muted); margin-bottom:12px;">以下收錄中藥群島各島嶼的重點挑戰題，快來檢驗您的中藥智慧吧！</p>`;

    this.app.data.islands.forEach(isl => {
      if (isl.quiz && isl.quiz.length > 0) {
        const wrap = document.createElement("div");
        wrap.className = "section-card";
        wrap.style.marginBottom = "14px";
        wrap.innerHTML = `<h3 style="margin-bottom:10px;">🏝️ ${isl.name}・測驗題庫</h3>`;

        isl.quiz.forEach((q, idx) => {
          const qBlock = document.createElement("div");
          qBlock.className = "quiz-block";
          qBlock.innerHTML = `
            <h4>${q.question}</h4>
            <div class="quiz-options">
              ${q.options.map((opt, oIdx) => `
                <button class="quiz-option" data-opt="${oIdx}">${opt}</button>
              `).join("")}
            </div>
            <div class="quiz-feedback"></div>
          `;

          const optBtns = qBlock.querySelectorAll(".quiz-option");
          optBtns.forEach(btn => {
            btn.onclick = () => {
              const chosen = parseInt(btn.dataset.opt);
              const fb = qBlock.querySelector(".quiz-feedback");
              optBtns.forEach(b => b.disabled = true);

              if (chosen === q.answerIndex) {
                btn.classList.add("correct");
                fb.className = "quiz-feedback show";
                fb.style.background = "#e6f6ee";
                fb.style.color = "var(--success)";
                fb.innerHTML = `<strong>答對了！</strong> ${q.explanation}`;
                this.app.livingWorld.playChime("trade");
              } else {
                btn.classList.add("wrong");
                optBtns[q.answerIndex].classList.add("correct");
                fb.className = "quiz-feedback show";
                fb.style.background = "#fdeeee";
                fb.style.color = "var(--danger)";
                fb.innerHTML = `<strong>答錯囉！</strong> ${q.explanation}`;
              }
            };
          });

          wrap.appendChild(qBlock);
        });
        container.appendChild(wrap);
      }
    });
  }

  /**
   * 接關碼導出與匯入
   */
  renderSaveCode() {
    const exportEl = document.getElementById("savecode-export-text");
    if (!exportEl) return;

    const dataObj = {
      v: 1,
      visited: this.app.livingWorld.visited,
      backpack: this.app.livingWorld.backpack,
      timestamp: Date.now()
    };

    const b64 = btoa(encodeURIComponent(JSON.stringify(dataObj)));
    exportEl.value = b64;
  }

  applySaveCode() {
    const inputEl = document.getElementById("savecode-import-input");
    if (!inputEl) return;
    const code = inputEl.value.trim();
    if (!code) {
      alert("請輸入接關碼！");
      return;
    }

    try {
      const decoded = decodeURIComponent(atob(code));
      const dataObj = JSON.parse(decoded);
      if (dataObj && dataObj.visited && dataObj.backpack) {
        this.app.livingWorld.visited = dataObj.visited;
        this.app.livingWorld.backpack = dataObj.backpack;
        this.app.livingWorld.saveVisited();
        this.app.livingWorld.saveBackpack();
        alert("恭喜！進度成功載入！探索印章與背包道具皆已同步。");
        this.closeAllModals();
      } else {
        throw new Error("接關碼格式不完整");
      }
    } catch (e) {
      alert("接關碼無效或格式錯誤，請確認是否複製完整。");
    }
  }

  /**
   * WebGL 備援無障礙清單
   */
  setupFallbackList() {
    const listEl = document.getElementById("fallback-islands-list");
    if (!listEl || !this.app.data) return;
    listEl.innerHTML = "";

    this.app.data.islands.forEach(isl => {
      const item = document.createElement("article");
      item.style.marginBottom = "24px";
      item.style.borderBottom = "1px solid var(--line)";
      item.style.paddingBottom = "16px";
      item.innerHTML = `
        <h2 style="color:var(--primary); font-size:20px; margin-bottom:6px;">${isl.name}（${isl.category}）</h2>
        <p style="font-size:14.5px; line-height:1.6; color:var(--ink);">${isl.intro}</p>
        <p style="font-size:13px; color:var(--muted); margin:6px 0;">特色地標：${isl.extra}</p>
        ${isl.sections ? isl.sections.map(s => `
          <div style="margin-top:10px;">
            <h4 style="color:var(--accent); font-size:14px;">${s.title}</h4>
            <p style="font-size:13.5px; line-height:1.6; color:var(--ink-secondary);">${s.content}</p>
          </div>
        `).join("") : ""}
      `;
      listEl.appendChild(item);
    });
  }
}

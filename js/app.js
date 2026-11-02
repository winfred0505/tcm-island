/**
 * app.js
 * 中藥島網站主入口：資料載入、模組組裝、WebGL 偵測與生命週期管理
 */

import { SceneManager } from './scene.js';
import { LivingWorldManager } from './living-world.js';
import { UIManager } from './ui.js';

class TCMIslandApp {
  constructor() {
    this.data = null;
    this.sceneManager = null;
    this.livingWorld = null;
    this.ui = null;
  }

  async start() {
    try {
      // 1. 載入結構化內容資料 (content.json)
      const res = await fetch('data/content.json');
      if (!res.ok) {
        throw new Error(`無法讀取 content.json: HTTP ${res.status}`);
      }
      this.data = await res.json();

      // 2. 檢查 WebGL 支援度
      if (!this.isWebGLAvailable()) {
        console.warn("當前瀏覽器不支援 WebGL，切換為無障礙純文字清單模式");
        document.body.classList.add("no-webgl");
        this.livingWorld = new LivingWorldManager(this);
        this.ui = new UIManager(this);
        return;
      }

      // 3. 初始化生活感子系統 (背包、貝殼、居民對話)
      this.livingWorld = new LivingWorldManager(this);

      // 4. 初始化 3D 群島核心引擎 (層疊台地、精緻微縮模型、日夜光影)
      this.sceneManager = new SceneManager(this);

      // 5. 初始化 UI 管理器 (抽屜面板、搜尋、問答、測驗)
      this.ui = new UIManager(this);

      console.log("🌿 中藥島 (TCM Island) 3D 生活感群島系統啟動成功！");
    } catch (err) {
      console.error("中藥島啟動時發生錯誤:", err);
      document.body.classList.add("no-webgl");
    }
  }

  isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }
}

// 網頁載入完成後啟動
window.addEventListener('DOMContentLoaded', () => {
  const app = new TCMIslandApp();
  window.__testApp = app;
  app.start();
});

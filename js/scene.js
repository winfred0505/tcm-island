/**
 * scene.js
 * Three.js 3D 群島核心引擎：層疊台地 (Terrace)、精緻微縮模型、生活感世界、日夜燈光與電影史詩運鏡
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export class SceneManager {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('webgl-container');
    this.labelsLayer = document.getElementById('island-labels-layer');

    // 狀態設定
    this.isReducedMotion = false;
    this.currentTheme = "晨光";
    this.timeOfDay = "day"; // day, dusk, night
    this.autoTimeFlow = true;
    this.simulatedHour = 10.5; // 0~24 小時

    // 運鏡控制
    this.cameraAnim = null;
    this.isCinemaActive = false;
    this.overviewPos = new THREE.Vector3(45, 52, 68);
    this.overviewTarget = new THREE.Vector3(0, 2, 0);

    // 物件儲存
    this.islandMeshes = new Map();
    this.islandCenters = new Map();
    this.islandBounds = new Map();
    this.npcs = [];
    this.animals = [];
    this.clouds = [];
    this.birds = [];
    this.boats = [];
    this.nightLights = [];
    this.fireflies = null;
    this.rainbow = null;
    this.fountainDroplets = [];
    this.seaMesh = null;
    this.seaGeometry = null;

    // 模型快取與動畫混合器
    this.gltfLoader = new GLTFLoader();
    this.modelCache = new Map();
    this.mixers = [];
    this.whaleMesh = null;

    // Raycaster 點擊互動
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  async init() {
    // 1. 場景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f0e4);
    this.scene.fog = new THREE.FogExp2(0xf6f0e4, 0.007);

    // 2. 攝影機
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    this.camera.position.copy(this.overviewPos);

    // 3. 渲染器 (符合精緻度底線：陰影、ACESFilmic、sRGB)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 4. 控制器 (OrbitControls)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // 防止穿入海面下
    this.controls.minDistance = 15;
    this.controls.maxDistance = 160;
    this.controls.target.copy(this.overviewTarget);

    // 5. 建立燈光與環境
    this.setupLighting();

    // 6. 預載入 3D 模型素材 (GLB)
    await this.preloadAssets();

    // 7. 建立動態海面與遠景剪影
    this.setupSeaAndEnvironment();

    // 8. 建立各座層疊台地島嶼 (Terrace) 與地標
    this.buildArchipelago();

    // 9. 建立生活感元素 (居民、動物、雲、鳥群、帆船、彩虹、彩旗)
    this.setupLivingWorld();

    // 10. 事件監聽
    this.setupEventListeners();

    // 11. 啟動電影史詩開場運鏡
    this.startCinemaIntro();

    // 12. 啟動動畫主循環
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  /**
   * 預載入所有桌面 3D 模型素材 (GLB)
   */
  async preloadAssets() {
    const urls = [
      // 角色 (Characters)
      'assets/models/characters/Pharmacist.glb',
      'assets/models/characters/WardNurse.glb',
      'assets/models/characters/WhiteCoatDoctor.glb',
      'assets/models/characters/FoodCourier.glb',
      'assets/models/characters/StoreManager.glb',
      'assets/models/characters/Schoolkid.glb',
      'assets/models/characters/GrandmaShopper.glb',
      // 動物 (Animals)
      'assets/models/animals/Squirrel.glb',
      'assets/models/animals/Hare.glb',
      'assets/models/animals/Duck.glb',
      'assets/models/animals/Corgi.glb',
      'assets/models/animals/Seagull.glb',
      'assets/models/animals/Whale.glb',
      // 自然地貌 (Nature)
      'assets/models/nature/Cliff001.glb',
      'assets/models/nature/Cliff002.glb',
      'assets/models/nature/Rock001.glb',
      'assets/models/nature/Rock002.glb',
      'assets/models/nature/Bush001.glb',
      'assets/models/nature/Grass001.glb',
      'assets/models/nature/TreeMed001.glb',
      'assets/models/nature/TreeHigh001.glb',
      'assets/models/nature/Cloud001.glb',
      'assets/models/nature/MountainFar001.glb'
    ];

    const loadOne = (url) => new Promise((resolve) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.modelCache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (err) => {
          console.warn(`[3D] 無法載入模型: ${url}`, err);
          resolve(null);
        }
      );
    });

    await Promise.all(urls.map(loadOne));
  }

  /**
   * 實例化與縮放已快取的 3D 模型
   */
  instantiateModel(url, targetHeight = null, options = {}) {
    const gltf = this.modelCache.get(url);
    if (!gltf) return null;

    const clone = SkeletonUtils.clone(gltf.scene);

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = options.castShadow !== false;
        child.receiveShadow = options.receiveShadow !== false;
        if (child.material) {
          child.material.roughness = Math.max(child.material.roughness || 0.4, 0.4);
        }
      }
    });

    if (targetHeight) {
      const box = new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = targetHeight / (size.y || 1);
      clone.scale.set(scale, scale, scale);

      if (options.alignBottom !== false) {
        const scaledBox = new THREE.Box3().setFromObject(clone);
        clone.position.y -= scaledBox.min.y;
      }
    }

    let mixer = null;
    const actions = {};
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(clone);
      gltf.animations.forEach((clip) => {
        actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
        actions[clip.name] = mixer.clipAction(clip);
      });
      this.mixers.push(mixer);
    }

    return {
      mesh: clone,
      mixer,
      actions,
      animations: gltf.animations
    };
  }

  setupLighting() {
    // 半球光補色
    this.hemiLight = new THREE.HemisphereLight(0xfff6e6, 0x446655, 0.65);
    this.scene.add(this.hemiLight);

    // 主平行光 (太陽/月亮)
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.35);
    this.sunLight.position.set(40, 65, 35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 190;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 中央噴泉輔助點光源
    this.plazaLight = new THREE.PointLight(0xffeedd, 0.4, 25);
    this.plazaLight.position.set(0, 4, 0);
    this.scene.add(this.plazaLight);
  }

  setupSeaAndEnvironment() {
    // 動態低多邊形海面
    const seaGeo = new THREE.PlaneGeometry(360, 360, 48, 48);
    seaGeo.rotateX(-Math.PI / 2);

    // 儲存原始頂點以計算波浪起伏
    const pos = seaGeo.attributes.position;
    this.seaInitialPos = pos.clone();

    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x5a9baa,
      roughness: 0.25,
      metalness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.88
    });

    this.seaMesh = new THREE.Mesh(seaGeo, seaMat);
    this.seaMesh.position.y = -0.2;
    this.seaMesh.receiveShadow = true;
    this.scene.add(this.seaMesh);

    // 外海遠景群山剪影 (使用 3D 素材 MountainFar001.glb 替換原先幾何圓錐)
    const mountainGroup = new THREE.Group();
    const mountainMat = new THREE.MeshLambertMaterial({
      color: 0x486470,
      flatShading: true
    });

    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const dist = 145 + Math.sin(i * 3) * 14;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const height = 22 + Math.sin(i * 2.5) * 12;

      const m = this.instantiateModel('assets/models/nature/MountainFar001.glb', height, {
        castShadow: false,
        receiveShadow: false
      });

      if (m) {
        m.mesh.position.set(x, -1.2, z);
        m.mesh.rotation.y = angle + Math.PI / 2 + (Math.sin(i) * 0.4);
        mountainGroup.add(m.mesh);
      } else {
        const width = 22 + Math.cos(i * 1.5) * 8;
        const coneGeo = new THREE.ConeGeometry(width, height, 5);
        const cone = new THREE.Mesh(coneGeo, mountainMat);
        cone.position.set(x, height / 2 - 2, z);
        cone.rotation.y = Math.random() * Math.PI;
        mountainGroup.add(cone);
      }
    }
    this.scene.add(mountainGroup);
    this.distantMountains = mountainGroup;

    // 夜晚繁星
    const starGeo = new THREE.BufferGeometry();
    const starCount = 350;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 400;
      starPositions[i + 1] = 40 + Math.random() * 120;
      starPositions[i + 2] = (Math.random() - 0.5) * 400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      transparent: true,
      opacity: 0
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);

    // 螢火蟲 (草地上微光)
    const fireflyGeo = new THREE.BufferGeometry();
    const fireflyCount = 40;
    const fireflyPos = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount * 3; i += 3) {
      fireflyPos[i] = (Math.random() - 0.5) * 70;
      fireflyPos[i + 1] = 1.5 + Math.random() * 3.5;
      fireflyPos[i + 2] = (Math.random() - 0.5) * 70;
    }
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
    const fireflyMat = new THREE.PointsMaterial({
      color: 0xaaff55,
      size: 2.2,
      transparent: true,
      opacity: 0
    });
    this.fireflies = new THREE.Points(fireflyGeo, fireflyMat);
    this.scene.add(this.fireflies);
  }

  /**
   * 建立層疊台地 (Terrace) 群島與獨特地標
   */
  buildArchipelago() {
    // 5 座島嶼的佈局位置 (中央島最大、4座分島依方位環繞)
    this.islandDefs = [
      {
        id: "island-center",
        name: "中藥島",
        order: 0,
        pos: new THREE.Vector3(0, 0, 0),
        tiers: 3,
        radius: 18,
        colorBase: 0x3d7b6a,
        cameraOffset: new THREE.Vector3(0, 14, 26)
      },
      {
        id: "island-01",
        name: "組織人力",
        order: 1,
        pos: new THREE.Vector3(34, 0, -22), // 東北
        tiers: 2,
        radius: 12.5,
        colorBase: 0x3a7566,
        cameraOffset: new THREE.Vector3(34, 12, -4)
      },
      {
        id: "island-02",
        name: "作業機能",
        order: 2,
        pos: new THREE.Vector3(32, 0, 26), // 東南
        tiers: 2,
        radius: 13,
        colorBase: 0x3f7f6f,
        cameraOffset: new THREE.Vector3(32, 12, 44)
      },
      {
        id: "island-03",
        name: "單位特色",
        order: 3,
        pos: new THREE.Vector3(-32, 0, 24), // 西南
        tiers: 3,
        radius: 14,
        colorBase: 0x3b7768,
        cameraOffset: new THREE.Vector3(-32, 12, 42)
      },
      {
        id: "island-04",
        name: "教育訓練",
        order: 4,
        pos: new THREE.Vector3(-34, 0, -22), // 西北
        tiers: 2,
        radius: 12.5,
        colorBase: 0x376f61,
        cameraOffset: new THREE.Vector3(-34, 12, -4)
      }
    ];

    this.islandDefs.forEach(def => {
      const islandGroup = new THREE.Group();
      islandGroup.position.copy(def.pos);
      islandGroup.userData = { islandId: def.id, name: def.name, order: def.order, type: "terrain" };

      // 1. 建造層疊台地 (梯田結構)
      this.buildTerraceBody(islandGroup, def);

      // 2. 依島型建造特色獨特地標與微縮景觀
      this.buildIslandLandmarks(islandGroup, def);

      // 3. 建造石板步道、木箱、長椅、路燈、花草圍籬 (精緻級細節)
      this.buildIslandProps(islandGroup, def);

      // 4. 白色海岸浪花圈
      this.buildShoreFoam(islandGroup, def);

      // 5. 沙灘貝殼 (可拾取生活感互動)
      this.buildBeachShell(islandGroup, def);

      this.scene.add(islandGroup);
      this.islandMeshes.set(def.id, islandGroup);
      this.islandCenters.set(def.id, def.pos);
    });

    // 建造連接中央島與 4 座分島的低多邊形木橋 / 石橋
    this.buildBridges();
  }

  /**
   * 層疊台地 (Terrace) 造型建造
   */
  buildTerraceBody(group, def) {
    const tiers = def.tiers;
    const baseR = def.radius;

    // 材質色階 (精緻度要求：材質分 3 層以上色階)
    const grassTopMat = new THREE.MeshLambertMaterial({ color: 0x5fa472, flatShading: true });
    const grassMidMat = new THREE.MeshLambertMaterial({ color: 0x4d8e5f, flatShading: true });
    const grassHighMat = new THREE.MeshLambertMaterial({ color: 0x6bb87f, flatShading: true });
    const cliffMat = new THREE.MeshLambertMaterial({ color: 0x8a7a67, flatShading: true });
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xe6d4b2, flatShading: true });

    // 0 層：底部平緩沙灘
    const sandGeo = new THREE.CylinderGeometry(baseR + 2.2, baseR + 3.8, 1.2, 14);
    this.displaceVertices(sandGeo, 0.15);
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.position.y = 0.2;
    sandMesh.receiveShadow = true;
    group.add(sandMesh);

    // 第 1 階台地 (下層)
    const t1H = 1.8;
    const t1R = baseR;
    const t1Geo = new THREE.CylinderGeometry(t1R, t1R + 0.8, t1H, 14);
    this.displaceVertices(t1Geo, 0.12);
    const t1Mesh = new THREE.Mesh(t1Geo, cliffMat);
    t1Mesh.position.y = t1H / 2 + 0.6;
    t1Mesh.castShadow = true;
    t1Mesh.receiveShadow = true;
    group.add(t1Mesh);

    // 第 1 階綠草頂蓋
    const cap1Geo = new THREE.CylinderGeometry(t1R - 0.1, t1R + 0.1, 0.2, 14);
    const cap1 = new THREE.Mesh(cap1Geo, grassTopMat);
    cap1.position.y = t1H + 0.6;
    cap1.receiveShadow = true;
    group.add(cap1);

    // 第 2 階台地 (中層)
    const t2H = 1.6;
    const t2R = baseR * 0.72;
    const t2Geo = new THREE.CylinderGeometry(t2R, t2R + 0.6, t2H, 12);
    this.displaceVertices(t2Geo, 0.1);
    const t2Mesh = new THREE.Mesh(t2Geo, cliffMat);
    t2Mesh.position.y = t1H + 0.6 + t2H / 2;
    t2Mesh.castShadow = true;
    t2Mesh.receiveShadow = true;
    group.add(t2Mesh);

    // 第 2 階綠草頂蓋
    const cap2Geo = new THREE.CylinderGeometry(t2R - 0.1, t2R + 0.1, 0.2, 12);
    const cap2 = new THREE.Mesh(cap2Geo, grassMidMat);
    cap2.position.y = t1H + 0.6 + t2H;
    cap2.receiveShadow = true;
    group.add(cap2);

    // 若有第 3 階 (如中央島、特色島)
    if (tiers >= 3) {
      const t3H = 1.5;
      const t3R = baseR * 0.44;
      const t3Geo = new THREE.CylinderGeometry(t3R, t3R + 0.5, t3H, 10);
      this.displaceVertices(t3Geo, 0.08);
      const t3Mesh = new THREE.Mesh(t3Geo, cliffMat);
      t3Mesh.position.y = t1H + 0.6 + t2H + t3H / 2;
      t3Mesh.castShadow = true;
      t3Mesh.receiveShadow = true;
      group.add(t3Mesh);

      const cap3Geo = new THREE.CylinderGeometry(t3R - 0.1, t3R + 0.1, 0.2, 10);
      const cap3 = new THREE.Mesh(cap3Geo, grassHighMat);
      cap3.position.y = t1H + 0.6 + t2H + t3H;
      cap3.receiveShadow = true;
      group.add(cap3);
    }

    // 融入 3D 低多邊形岩壁裝飾 (Cliff001, Cliff002)
    const cliffAngles = [0.35, 1.55, 2.75, 3.95, 5.15];
    cliffAngles.forEach((a, idx) => {
      const cliffUrl = idx % 2 === 0 ? 'assets/models/nature/Cliff001.glb' : 'assets/models/nature/Cliff002.glb';
      const cliff = this.instantiateModel(cliffUrl, 2.2, { alignBottom: true });
      if (cliff) {
        const r = baseR * 0.95;
        cliff.mesh.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
        cliff.mesh.rotation.y = a + Math.PI / 2;
        group.add(cliff.mesh);
      }
    });
  }

  displaceVertices(geo, intensity = 0.1) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const angle = Math.atan2(z, x);
      const noise = 1 + Math.sin(angle * 5) * intensity + Math.cos(angle * 3) * (intensity * 0.7);
      pos.setX(i, x * noise);
      pos.setZ(i, z * noise);
    }
    geo.computeVertexNormals();
  }

  /**
   * 建造每座島的代表性地標建築
   */
  buildIslandLandmarks(group, def) {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf5eedb, flatShading: true });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xbf4a3f, flatShading: true });
    const blueRoofMat = new THREE.MeshLambertMaterial({ color: 0x2e6b82, flatShading: true });
    const greenRoofMat = new THREE.MeshLambertMaterial({ color: 0x2f7a6b, flatShading: true });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd27d }); // 暖黃窗戶
    this.nightLights.push(winMat);

    if (def.id === "island-center") {
      // 中央島地標：中藥旅客服務大廳 + 噴泉廣場 (⛲)
      const topY = 5.6;

      // 服務大廳主殿
      const mainBuilding = new THREE.Group();
      mainBuilding.position.set(0, topY, -2.5);
      mainBuilding.userData = { type: "building", islandId: def.id };

      const hallBase = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 5.2), wallMat);
      hallBase.castShadow = true;
      mainBuilding.add(hallBase);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 4), greenRoofMat);
      roof.position.y = 2.7;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      mainBuilding.add(roof);

      // 窗戶
      const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), winMat);
      win1.position.set(-1.8, 0.4, 2.62);
      mainBuilding.add(win1);
      const win2 = win1.clone();
      win2.position.set(1.8, 0.4, 2.62);
      mainBuilding.add(win2);

      group.add(mainBuilding);

      // ⛲ 噴泉廣場 (中央島特色地景)
      const fountainGroup = new THREE.Group();
      fountainGroup.position.set(0, topY, 4.2);
      fountainGroup.userData = { type: "building", islandId: def.id };

      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 12), wallMat);
      basin.castShadow = true;
      fountainGroup.add(basin);

      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 8), wallMat);
      pillar.position.y = 1.1;
      fountainGroup.add(pillar);

      const topBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 10), wallMat);
      topBasin.position.y = 1.8;
      fountainGroup.add(topBasin);

      // 噴水水珠微粒
      const waterMat = new THREE.MeshBasicMaterial({ color: 0x88ddff });
      for (let i = 0; i < 12; i++) {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), waterMat);
        drop.userData = {
          baseX: (Math.random() - 0.5) * 1.5,
          baseZ: (Math.random() - 0.5) * 1.5,
          speedY: 2.5 + Math.random() * 2,
          currentY: 1.8 + Math.random() * 1.5
        };
        fountainGroup.add(drop);
        this.fountainDroplets.push(drop);
      }
      group.add(fountainGroup);

      // 市集攤位 (篷頂、貨架)
      const stall = this.createMarketStall();
      stall.position.set(-6, 4.1, 1);
      stall.rotation.y = 0.4;
      stall.userData = { type: "building", islandId: def.id };
      group.add(stall);

    } else if (def.id === "island-01") {
      // 組織人力島地標：長庚醫療大樓模型 + 全台分布展示台
      const topY = 4.1;

      // 醫療大樓模型 (階梯雙塔)
      const hospGroup = new THREE.Group();
      hospGroup.position.set(0, topY, -1);
      hospGroup.userData = { type: "building", islandId: def.id };

      const mainTower = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.5, 4.2), wallMat);
      mainTower.castShadow = true;
      hospGroup.add(mainTower);

      const sideTower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.8, 3.8), wallMat);
      sideTower.position.set(3.2, -0.85, 0);
      sideTower.castShadow = true;
      hospGroup.add(sideTower);

      // 紅十字標誌模型
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xd9382f });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.1), crossMat);
      c1.position.set(0, 1.6, 2.15);
      hospGroup.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.1), crossMat);
      c2.position.set(0, 1.6, 2.15);
      hospGroup.add(c2);

      // 窗格群
      for (let row = 0; row < 3; row++) {
        for (let col = -1; col <= 1; col++) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), winMat);
          w.position.set(col * 1.4, row * 1.1 - 0.8, 2.12);
          hospGroup.add(w);
        }
      }
      group.add(hospGroup);

      // 台灣地圖立體展示台
      const mapStand = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 12), woodMat);
      mapStand.position.set(-2.5, 2.6, 4);
      mapStand.userData = { type: "building", islandId: def.id };
      group.add(mapStand);

      const mapRelief = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 2.6), greenRoofMat);
      mapRelief.position.set(-2.5, 3.0, 4);
      mapRelief.rotation.y = 0.25;
      mapRelief.userData = { type: "building", islandId: def.id };
      group.add(mapRelief);

    } else if (def.id === "island-02") {
      // 作業機能島地標：古法代煎藥坊 (煙囪縷縷白煙) + 智慧調劑亭
      const topY = 4.1;

      // 代煎藥坊
      const decoctionHouse = new THREE.Group();
      decoctionHouse.position.set(-1.5, topY, -1.2);
      decoctionHouse.userData = { type: "building", islandId: def.id };

      const houseBody = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.0, 4.2), wallMat);
      houseBody.castShadow = true;
      decoctionHouse.add(houseBody);

      const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.0, 4), roofMat);
      houseRoof.position.y = 2.4;
      houseRoof.rotation.y = Math.PI / 4;
      houseRoof.castShadow = true;
      decoctionHouse.add(houseRoof);

      // 煙囪
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 2.8, 6), woodMat);
      chimney.position.set(1.5, 2.2, 0.8);
      chimney.castShadow = true;
      decoctionHouse.add(chimney);

      // 煙囪裊裊白煙微粒
      const smokeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
      const smokeGroup = new THREE.Group();
      smokeGroup.position.set(1.5, 3.8, 0.8);
      for (let s = 0; s < 3; s++) {
        const sm = new THREE.Mesh(new THREE.SphereGeometry(0.28 + s * 0.1, 5, 5), smokeMat);
        sm.position.y = s * 0.55;
        sm.userData = { baseY: s * 0.55 };
        smokeGroup.add(sm);
      }
      this.chimneySmoke = smokeGroup;
      decoctionHouse.add(smokeGroup);

      group.add(decoctionHouse);

      // 智慧調劑亭
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), blueRoofMat);
      kiosk.position.set(3.5, topY, 1.8);
      kiosk.castShadow = true;
      kiosk.userData = { type: "building", islandId: def.id };
      group.add(kiosk);

      // 水井 (水源汲取)
      const well = this.createWell();
      well.position.set(-3.5, 2.6, 3.5);
      well.userData = { type: "building", islandId: def.id };
      group.add(well);

    } else if (def.id === "island-03") {
      // 單位特色島地標：智能藥檢亭 + 本草百草園 (🌷 花田)
      const topY = 5.5;

      // 現代檢驗亭 (微型玻璃帷幕科技亭)
      const labGroup = new THREE.Group();
      labGroup.position.set(0, topY, -1.5);
      labGroup.userData = { type: "building", islandId: def.id };

      const labBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 3.8), wallMat);
      labBase.castShadow = true;
      labGroup.add(labBase);

      const labRoof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 4.2), greenRoofMat);
      labRoof.position.y = 1.7;
      labGroup.add(labRoof);

      // 檢驗電子條碼燈光螢幕
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x48e6c2 });
      const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), screenMat);
      screenMesh.position.set(0, 0.4, 1.92);
      labGroup.add(screenMesh);

      group.add(labGroup);

      // 本草百草園 (🌷 彩色花田與木圍籬)
      const garden = this.createFlowerField();
      garden.position.set(0, 4.1, 2.8);
      garden.userData = { type: "building", islandId: def.id };
      group.add(garden);

    } else if (def.id === "island-04") {
      // 教育訓練島地標：杏林學堂 (書卷屋頂) + 八段錦養生石坪
      const topY = 4.1;

      // 學堂建築
      const schoolGroup = new THREE.Group();
      schoolGroup.position.set(0, topY, -2);
      schoolGroup.userData = { type: "building", islandId: def.id };

      const schoolBody = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.8, 4.0), wallMat);
      schoolBody.castShadow = true;
      schoolGroup.add(schoolBody);

      const schoolRoof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 4), blueRoofMat);
      schoolRoof.position.y = 2.2;
      schoolRoof.rotation.y = Math.PI / 4;
      schoolRoof.castShadow = true;
      schoolGroup.add(schoolRoof);

      // 書卷屋脊飾物
      const scrollMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.6, 8), woodMat);
      scrollMesh.rotation.z = Math.PI / 2;
      scrollMesh.position.y = 3.1;
      schoolGroup.add(scrollMesh);

      group.add(schoolGroup);

      // 八段錦練功石坪 (太極八卦同心石板)
      const stonePlaza = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.6, 0.25, 12), wallMat);
      stonePlaza.position.set(0, 2.5, 3.2);
      stonePlaza.receiveShadow = true;
      stonePlaza.userData = { type: "building", islandId: def.id };
      group.add(stonePlaza);

      const centerTaiChi = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.28, 8), woodMat);
      centerTaiChi.position.set(0, 2.52, 3.2);
      centerTaiChi.userData = { type: "building", islandId: def.id };
      group.add(centerTaiChi);
    }
  }

  createMarketStall() {
    const stall = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const clothMat = new THREE.MeshLambertMaterial({ color: 0xd9792f });

    // 4 根木柱
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -0.8; z <= 0.8; z += 1.6) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 4), woodMat);
        pole.position.set(x * 1.2, 1.1, z);
        stall.add(pole);
      }
    }
    // 櫃檯
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.6), woodMat);
    table.position.y = 0.5;
    stall.add(table);

    // 斜條紋遮雨蓬
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 2.0), clothMat);
    canopy.position.set(0, 2.2, 0);
    canopy.rotation.x = 0.15;
    stall.add(canopy);

    return stall;
  }

  createWell() {
    const well = new THREE.Group();
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7a7a7a });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });

    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 8), stoneMat);
    wall.position.y = 0.45;
    well.add(wall);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), woodMat);
    roof.position.y = 1.8;
    roof.rotation.y = Math.PI / 4;
    well.add(roof);

    return well;
  }

  createFlowerField() {
    const field = new THREE.Group();
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x5a4835 });
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });

    // 土壤床
    const soil = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.25, 3.8), bedMat);
    field.add(soil);

    // 圍籬
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 0.15), fenceMat);
    f1.position.set(0, 0.3, -1.9);
    field.add(f1);
    const f2 = f1.clone();
    f2.position.set(0, 0.3, 1.9);
    field.add(f2);

    // 鬱金香與草藥花朵群 (🌷)
    const flowerColors = [0xff4d6d, 0xffb703, 0x8338ec, 0x3a86ff, 0xff758f];
    for (let i = 0; i < 28; i++) {
      const col = flowerColors[i % flowerColors.length];
      const mat = new THREE.MeshLambertMaterial({ color: col });
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 4, 4), mat);
      fl.position.set(
        (Math.random() - 0.5) * 4.8,
        0.35 + Math.random() * 0.15,
        (Math.random() - 0.5) * 3.2
      );
      field.add(fl);
    }

    return field;
  }

  /**
   * 精緻級道具：石板路、長椅、木箱、告示牌、路燈、櫻花樹
   */
  buildIslandProps(group, def) {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6e4726 });
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x999388 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd15c });
    this.nightLights.push(lampMat);

    // 1. 🌸 櫻花樹 (每島配置 1~2 棵粉紅櫻花樹)
    const sakuraMat = new THREE.MeshLambertMaterial({ color: 0xffb7c5, flatShading: true });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });

    const treePositions = [
      new THREE.Vector3(def.radius * 0.55, 2.5, -def.radius * 0.4),
      new THREE.Vector3(-def.radius * 0.6, 2.5, def.radius * 0.35)
    ];

    treePositions.forEach((pos, idx) => {
      const tree = new THREE.Group();
      tree.position.copy(pos);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5), trunkMat);
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      tree.add(trunk);

      // 樹冠：幾何堆疊低多邊形
      const isSakura = idx === 0;
      const foliageMat = isSakura ? sakuraMat : new THREE.MeshLambertMaterial({ color: 0x489255, flatShading: true });
      const foliage = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 5), foliageMat);
      foliage.position.y = 2.8;
      foliage.castShadow = true;
      tree.add(foliage);

      group.add(tree);
    });

    // 2. 石板步道 (幾塊扁圓石塊散落)
    for (let s = 0; s < 5; s++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.15, 6), stoneMat);
      stone.position.set(
        Math.sin(s * 1.2) * (def.radius * 0.4),
        2.42,
        Math.cos(s * 1.2) * (def.radius * 0.4)
      );
      group.add(stone);
    }

    // 3. 告示牌
    const sign = new THREE.Group();
    sign.position.set(def.radius * 0.3, 2.45, def.radius * 0.5);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 4), woodMat);
    post.position.y = 0.7;
    sign.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.1), woodMat);
    board.position.set(0, 1.1, 0);
    sign.add(board);
    group.add(sign);

    // 4. 木箱與藥材簍
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), woodMat);
    crate.position.set(-def.radius * 0.25, 2.8, def.radius * 0.45);
    crate.castShadow = true;
    group.add(crate);

    // 5. 復古路燈 (夜間亮起)
    const lamp = new THREE.Group();
    lamp.position.set(def.radius * 0.2, 2.4, -def.radius * 0.3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 5), stoneMat);
    pole.position.y = 1.3;
    lamp.add(pole);

    const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), lampMat);
    lightBulb.position.y = 2.6;
    lamp.add(lightBulb);

    // 路燈微光點光源
    const pointL = new THREE.PointLight(0xffcc66, 0, 14);
    pointL.position.y = 2.6;
    lamp.add(pointL);
    this.nightLights.push(pointL);

    group.add(lamp);

    // 6. 自然景觀 3D 微縮模型 (TreeMed001, TreeHigh001, Bush001, Rock001, Grass001)
    const tree1 = this.instantiateModel('assets/models/nature/TreeMed001.glb', 4.6, { alignBottom: true });
    if (tree1) {
      tree1.mesh.position.set(def.radius * 0.42, 2.45, def.radius * 0.32);
      group.add(tree1.mesh);
    }

    const tree2 = this.instantiateModel('assets/models/nature/TreeHigh001.glb', 5.2, { alignBottom: true });
    if (tree2) {
      tree2.mesh.position.set(-def.radius * 0.48, 2.45, -def.radius * 0.32);
      group.add(tree2.mesh);
    }

    const rock1 = this.instantiateModel('assets/models/nature/Rock001.glb', 0.95, { alignBottom: true });
    if (rock1) {
      rock1.mesh.position.set(def.radius * 0.28, 2.42, def.radius * 0.38);
      group.add(rock1.mesh);
    }

    const rock2 = this.instantiateModel('assets/models/nature/Rock002.glb', 0.8, { alignBottom: true });
    if (rock2) {
      rock2.mesh.position.set(-def.radius * 0.32, 2.42, -def.radius * 0.22);
      group.add(rock2.mesh);
    }

    const bush1 = this.instantiateModel('assets/models/nature/Bush001.glb', 0.75, { alignBottom: true });
    if (bush1) {
      bush1.mesh.position.set(def.radius * 0.18, 2.42, -def.radius * 0.42);
      group.add(bush1.mesh);
    }

    const grass1 = this.instantiateModel('assets/models/nature/Grass001.glb', 0.6, { alignBottom: true });
    if (grass1) {
      grass1.mesh.position.set(-def.radius * 0.18, 2.42, def.radius * 0.32);
      group.add(grass1.mesh);
    }
  }

  /**
   * 白色海岸浪花圈
   */
  buildShoreFoam(group, def) {
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const ringGeo = new THREE.RingGeometry(def.radius + 2.5, def.radius + 4.2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, foamMat);
    ring.position.y = -0.05;
    group.add(ring);
  }

  /**
   * 沙灘貝殼 (可拾取生活感互動)
   */
  buildBeachShell(group, def) {
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xffeedd });
    const shellGeo = new THREE.ConeGeometry(0.4, 0.35, 5);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.rotation.x = Math.PI / 2;
    // 擺在沙灘邊緣
    const angle = def.order * 1.3 + 0.8;
    const r = def.radius + 2.6;
    shell.position.set(Math.cos(angle) * r, 0.35, Math.sin(angle) * r);
    shell.userData = { type: "shell", islandId: def.id };
    group.add(shell);
    this.app.livingWorld.shells.push(shell);
  }

  /**
   * 建造中央島與各分島相連的拱橋
   */
  buildBridges() {
    const bridgeMat = new THREE.MeshLambertMaterial({ color: 0xb5997d, flatShading: true });
    const railingMat = new THREE.MeshLambertMaterial({ color: 0x6e4726, flatShading: true });

    this.islandDefs.slice(1).forEach(def => {
      const p1 = new THREE.Vector3(0, 0.5, 0);
      const p2 = def.pos.clone().multiplyScalar(0.75);
      p2.y = 0.5;

      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      const dist = p1.distanceTo(p2);

      const bridge = new THREE.Group();
      bridge.position.copy(mid);
      bridge.lookAt(p2);

      // 橋面
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, dist), bridgeMat);
      plank.castShadow = true;
      bridge.add(plank);

      // 🎏 彩旗串 (掛於橋兩側)
      const buntingColors = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2];
      for (let b = -dist / 2 + 1; b < dist / 2 - 1; b += 2.5) {
        const flagMat = new THREE.MeshLambertMaterial({
          color: buntingColors[Math.abs(Math.floor(b)) % buntingColors.length],
          side: THREE.DoubleSide
        });
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), flagMat);
        flag.rotation.z = Math.PI;
        flag.position.set(1.1, 0.6, b);
        bridge.add(flag);
      }

      this.scene.add(bridge);
    });
  }

  /**
   * 建立生活感元素：居民 NPC、動物、雲鳥、帆船、彩虹
   */
  setupLivingWorld() {
    // 1. 居民 NPC
    this.createResidents();

    // 2. 7 種動物 (松鼠、兔子、鴨子、貓咪、小狗、海龜、海豚)
    this.createAnimals();

    // 3. 雲朵 (8~12 朵在外圍飄動)
    this.createClouds();

    // 4. 鳥群 (2 群 V 字隊形翱翔)
    this.createBirdFlocks();

    // 5. 外海帆船 (繞外海巡航)
    this.createBoats();

    // 6. 🌈 彩虹 (日間橫跨群島上空)
    this.createRainbow();
  }

  createResidents() {
    if (!this.app.data || !this.app.data.residents) return;

    // 依據角色設定精準對應桌面 3D 人物模型
    const characterModelMap = {
      "npc-01": "assets/models/characters/Pharmacist.glb",       // 董藥師 (中藥科組長)
      "npc-02": "assets/models/characters/StoreManager.glb",     // 市集老陳 (資深掌櫃)
      "npc-03": "assets/models/characters/FoodCourier.glb",      // 送貨員阿明 (跨島運送)
      "npc-04": "assets/models/characters/WardNurse.glb",        // 庭瑄藥師 (行政調劑)
      "npc-05": "assets/models/characters/WhiteCoatDoctor.glb",   // 宏偉藥師 (評鑑長)
      "npc-06": "assets/models/characters/Pharmacist.glb",       // 家豪藥師 (病房專責)
      "npc-07": "assets/models/characters/GrandmaShopper.glb",   // 順伯 (代煎老師傅)
      "npc-08": "assets/models/characters/WardNurse.glb",        // 敏華藥師 (品管師)
      "npc-09": "assets/models/characters/Pharmacist.glb",       // 佳穎藥師 (衛教專員)
      "npc-10": "assets/models/characters/WhiteCoatDoctor.glb",   // 志遠藥師 (臨床導師)
      "npc-11": "assets/models/characters/Schoolkid.glb"         // 宣妤同學 (實習生)
    };

    this.app.data.residents.forEach(resData => {
      const islDef = this.islandDefs.find(d => d.id === resData.islandId) || this.islandDefs[0];
      const modelUrl = characterModelMap[resData.id] || "assets/models/characters/Pharmacist.glb";
      const modelObj = this.instantiateModel(modelUrl, 1.65, { alignBottom: true });

      let npc = null;
      let mixer = null;
      let actions = {};

      if (modelObj) {
        npc = new THREE.Group();
        npc.add(modelObj.mesh);
        mixer = modelObj.mixer;
        actions = modelObj.actions;

        // 預設撥放 Idle 動畫
        const idleAction = actions['idle'] || actions['Idle'];
        if (idleAction) idleAction.play();
      } else {
        npc = this.buildHumanoidMesh(resData);
      }

      // 隨機在所屬島嶼的半徑內散步
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * (islDef.radius * 0.52);
      const baseY = islDef.id === "island-center" ? 4.1 : 2.5;

      npc.position.set(
        islDef.pos.x + Math.cos(angle) * r,
        baseY,
        islDef.pos.z + Math.sin(angle) * r
      );

      npc.userData = {
        type: "npc",
        data: resData,
        islandId: resData.islandId,
        originPos: npc.position.clone(),
        targetPos: npc.position.clone(),
        walkSpeed: 0.02 + Math.random() * 0.012,
        pauseTimer: 0,
        isCourier: resData.id === "npc-03",
        mixer,
        actions,
        currentAnimState: 'idle'
      };

      // 點擊判定強化：加入 100% 透明 Hitbox 圓柱，大幅提高使用者點選靈敏度 (transparent: true, opacity: 0 確保 Raycaster 可檢測)
      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 2.6, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitMesh.position.y = 1.1;
      hitMesh.userData = {
        type: "npc",
        parentNpc: npc,
        data: resData,
        islandId: resData.islandId
      };
      npc.add(hitMesh);

      this.scene.add(npc);
      this.npcs.push(npc);
    });
  }

  buildHumanoidMesh(resData) {
    const group = new THREE.Group();

    // 隨機膚色與服裝搭配 (藥師穿白袍/綠袍)
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdfc4 });
    const robeMat = resData.title.includes("藥師") || resData.title.includes("組長")
      ? new THREE.MeshLambertMaterial({ color: 0xf5f7fa }) // 白袍
      : new THREE.MeshLambertMaterial({ color: 0x2f7a6b }); // 綠色便服

    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x334e68 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x241c18 });

    // 頭部
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), skinMat);
    head.position.y = 1.35;
    head.castShadow = true;
    group.add(head);

    // 頭髮 / 帽子
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), hairMat);
    hair.position.set(0, 1.45, -0.05);
    group.add(hair);

    // 董藥師圓眼鏡裝飾
    if (resData.id === "npc-01") {
      const glassesMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const g1 = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 8), glassesMat);
      g1.position.set(-0.15, 1.38, 0.38);
      group.add(g1);
      const g2 = g1.clone();
      g2.position.set(0.15, 1.38, 0.38);
      group.add(g2);
    }

    // 身體 (外袍)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.8, 6), robeMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    // 手臂 (左右)
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 4);
    const leftArm = new THREE.Mesh(armGeo, robeMat);
    leftArm.position.set(-0.42, 0.85, 0);
    group.add(leftArm);
    group.leftArm = leftArm;

    const rightArm = new THREE.Mesh(armGeo, robeMat);
    rightArm.position.set(0.42, 0.85, 0);
    group.add(rightArm);
    group.rightArm = rightArm;

    // 雙腿
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 4);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.18, 0.25, 0);
    group.add(leftLeg);
    group.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.18, 0.25, 0);
    group.add(rightLeg);
    group.rightLeg = rightLeg;

    // 送貨員阿明扛著的藥材貨箱
    if (resData.id === "npc-03") {
      const crateMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.65), crateMat);
      crate.position.set(0.45, 1.1, 0.2);
      group.add(crate);
    }

    group.userData = { type: "npc", data: resData };
    return group;
  }

  createAnimals() {
    if (!this.app.data || !this.app.data.animals) return;

    this.app.data.animals.forEach(aniData => {
      let animalMesh = null;
      if (aniData.id === "squirrel") animalMesh = this.buildSquirrel();
      else if (aniData.id === "rabbit") animalMesh = this.buildRabbit();
      else if (aniData.id === "duck") animalMesh = this.buildDuck();
      else if (aniData.id === "cat") animalMesh = this.buildCat();
      else if (aniData.id === "dog") animalMesh = this.buildDog();
      else if (aniData.id === "turtle") animalMesh = this.buildTurtle();
      else if (aniData.id === "dolphin") animalMesh = this.buildDolphin();
      else if (aniData.id === "whale") animalMesh = this.buildWhale();
      else if (aniData.id === "seagull") animalMesh = this.buildSeagull();

      if (animalMesh) {
        animalMesh.userData = { type: "animal", data: aniData };
        // 透明 Hitbox 擴大可點擊範圍
        const aniHit = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 6, 6),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        aniHit.position.y = 0.8;
        aniHit.userData = { type: "animal", parentAnimal: animalMesh, data: aniData };
        animalMesh.add(aniHit);

        this.scene.add(animalMesh);
        this.animals.push(animalMesh);
      }
    });
  }

  buildSquirrel() {
    const sq = this.instantiateModel('assets/models/animals/Squirrel.glb', 0.65, { alignBottom: true });
    if (sq) {
      const group = new THREE.Group();
      group.add(sq.mesh);
      group.position.set(27, 2.5, -17);
      if (sq.actions['idle']) sq.actions['idle'].play();
      return group;
    }
    const group = new THREE.Group();
    const brownMat = new THREE.MeshLambertMaterial({ color: 0x99582a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), brownMat);
    body.position.y = 0.32;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), brownMat);
    head.position.set(0, 0.52, 0.2);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.6, 5), brownMat);
    tail.position.set(0, 0.45, -0.28);
    tail.rotation.x = -0.6;
    group.add(tail);
    group.position.set(28, 2.6, -18);
    return group;
  }

  buildRabbit() {
    const rb = this.instantiateModel('assets/models/animals/Hare.glb', 0.7, { alignBottom: true });
    if (rb) {
      const group = new THREE.Group();
      group.add(rb.mesh);
      group.position.set(-27, 4.2, 21);
      if (rb.actions['idle']) rb.actions['idle'].play();
      return group;
    }
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), whiteMat);
    body.position.y = 0.3;
    group.add(body);
    const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), whiteMat);
    ear1.position.set(-0.12, 0.65, 0);
    group.add(ear1);
    const ear2 = ear1.clone();
    ear2.position.set(0.12, 0.65, 0);
    group.add(ear2);
    group.position.set(-28, 4.3, 22);
    return group;
  }

  buildDuck() {
    const dk = this.instantiateModel('assets/models/animals/Duck.glb', 0.65, { alignBottom: true });
    if (dk) {
      const group = new THREE.Group();
      group.add(dk.mesh);
      group.position.set(36, 0.4, 28);
      if (dk.actions['idle']) dk.actions['idle'].play();
      return group;
    }
    const group = new THREE.Group();
    const yellowMat = new THREE.MeshLambertMaterial({ color: 0xffd166 });
    const orangeMat = new THREE.MeshLambertMaterial({ color: 0xf77f00 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), yellowMat);
    body.position.y = 0.32;
    group.add(body);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.25, 4), orangeMat);
    bill.rotation.x = Math.PI / 2;
    bill.position.set(0, 0.35, 0.38);
    group.add(bill);
    group.position.set(38, 0.3, 30);
    return group;
  }

  buildDog() {
    const dg = this.instantiateModel('assets/models/animals/Corgi.glb', 0.85, { alignBottom: true });
    if (dg) {
      const group = new THREE.Group();
      group.add(dg.mesh);
      group.position.set(3.5, 4.2, 5.5);
      if (dg.actions['idle']) dg.actions['idle'].play();
      return group;
    }
    const group = new THREE.Group();
    const dogMat = new THREE.MeshLambertMaterial({ color: 0xd4a373 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.75), dogMat);
    body.position.y = 0.4;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.38), dogMat);
    head.position.set(0, 0.68, 0.4);
    group.add(head);
    group.position.set(4, 4.3, 6);
    return group;
  }

  buildWhale() {
    const wh = this.instantiateModel('assets/models/animals/Whale.glb', 3.8, { alignBottom: false });
    if (wh) {
      const group = new THREE.Group();
      group.add(wh.mesh);
      group.position.set(74, 0.2, 0);
      group.userData.angle = 0;
      const act = wh.actions['idle'] || wh.actions['walk'];
      if (act) act.play();
      this.whaleMesh = group;
      return group;
    }
    return null;
  }

  buildSeagull() {
    const sg = this.instantiateModel('assets/models/animals/Seagull.glb', 0.65, { alignBottom: true });
    if (sg) {
      const group = new THREE.Group();
      group.add(sg.mesh);
      group.position.set(0, 26, 0);
      const act = sg.actions['walk'] || sg.actions['idle'];
      if (act) act.play();
      return group;
    }
    return null;
  }

  buildCat() {
    const group = new THREE.Group();
    const gingerMat = new THREE.MeshLambertMaterial({ color: 0xf4a261 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), gingerMat);
    body.position.y = 0.32;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), gingerMat);
    head.position.set(0, 0.5, 0.22);
    group.add(head);
    group.position.set(-4, 4.3, 5);
    return group;
  }

  buildTurtle() {
    const group = new THREE.Group();
    const shellMat = new THREE.MeshLambertMaterial({ color: 0x2d6a4f });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x52b788 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 5), shellMat);
    shell.scale.set(1.2, 0.5, 1.4);
    shell.position.y = 0.2;
    group.add(shell);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 5, 5), skinMat);
    head.position.set(0, 0.15, 0.95);
    group.add(head);
    group.position.set(-45, -0.1, -10);
    group.userData.swimAngle = 0;
    return group;
  }

  buildDolphin() {
    const group = new THREE.Group();
    const dolphinMat = new THREE.MeshLambertMaterial({ color: 0x48cae4 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 6), dolphinMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 4), dolphinMat);
    fin.position.set(0, 0.45, -0.2);
    group.add(fin);
    group.position.set(50, -0.2, 0);
    group.userData.leapAngle = 0;
    return group;
  }

  createClouds() {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      flatShading: true
    });

    for (let c = 0; c < 10; c++) {
      const targetH = 3.5 + Math.random() * 2.5;
      const cloudObj = this.instantiateModel('assets/models/nature/Cloud001.glb', targetH, {
        castShadow: false,
        receiveShadow: false
      });

      let cloud = null;
      if (cloudObj) {
        cloud = cloudObj.mesh;
      } else {
        cloud = new THREE.Group();
        const numPuffs = 3 + Math.floor(Math.random() * 3);
        for (let p = 0; p < numPuffs; p++) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(1.8 + Math.random() * 1.5, 6, 5),
            cloudMat
          );
          puff.position.set((p - numPuffs / 2) * 2.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2);
          cloud.add(puff);
        }
      }

      const angle = (c / 10) * Math.PI * 2;
      const radius = 62 + Math.random() * 26;
      cloud.position.set(Math.cos(angle) * radius, 25 + Math.random() * 8, Math.sin(angle) * radius);
      cloud.userData = { angle, radius, speed: 0.0006 + Math.random() * 0.0004 };
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  createBirdFlocks() {
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    for (let f = 0; f < 2; f++) {
      const flock = new THREE.Group();
      for (let b = 0; b < 4; b++) {
        const sg = this.instantiateModel('assets/models/animals/Seagull.glb', 0.65, { alignBottom: true });
        let bird = null;
        if (sg) {
          bird = sg.mesh;
          const flap = sg.actions['walk'] || sg.actions['idle'];
          if (flap) flap.play();
        } else {
          bird = new THREE.Group();
          const wingGeo = new THREE.PlaneGeometry(0.6, 0.25);
          const w1 = new THREE.Mesh(wingGeo, birdMat);
          w1.position.x = -0.3;
          w1.rotation.z = 0.3;
          bird.add(w1);
          const w2 = new THREE.Mesh(wingGeo, birdMat);
          w2.position.x = 0.3;
          w2.rotation.z = -0.3;
          bird.add(w2);
        }
        bird.position.set((b - 1.5) * 2.2, 0, Math.abs(b - 1.5) * 1.8);
        flock.add(bird);
      }
      flock.position.set(f === 0 ? 35 : -35, 27, f === 0 ? 35 : -35);
      flock.userData = { angle: f * Math.PI, radius: 58, speed: 0.0028 };
      this.scene.add(flock);
      this.birds.push(flock);
    }
  }

  createBoats() {
    const boatMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const sailMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    for (let b = 0; b < 2; b++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.2, 5), boatMat);
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(1, 0.45, 1);
      boat.add(hull);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 4), boatMat);
      mast.position.y = 1.6;
      boat.add(mast);

      const sail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.5, 3), sailMat);
      sail.position.set(0, 1.8, 0.4);
      boat.add(sail);

      const angle = b * Math.PI + 0.5;
      const radius = 68;
      boat.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius);
      boat.userData = { angle, radius, speed: 0.0015 };
      this.scene.add(boat);
      this.boats.push(boat);
    }
  }

  createRainbow() {
    // 🌈 低多邊形彩虹拱門
    const rainbowGroup = new THREE.Group();
    const colors = [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x8b00ff];
    colors.forEach((col, idx) => {
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      });
      const ringGeo = new THREE.RingGeometry(55 + idx * 0.8, 55.7 + idx * 0.8, 36, 1, 0, Math.PI);
      const arc = new THREE.Mesh(ringGeo, mat);
      rainbowGroup.add(arc);
    });
    rainbowGroup.position.set(0, 0, -45);
    rainbowGroup.rotation.y = 0.2;
    this.scene.add(rainbowGroup);
    this.rainbow = rainbowGroup;
  }

  /**
   * 電影史詩開場運鏡 (4~6 秒俯衝、環繞群島半圈)
   */
  startCinemaIntro() {
    if (this.isReducedMotion) {
      this.camera.position.copy(this.overviewPos);
      this.controls.target.copy(this.overviewTarget);
      document.getElementById('cinema-overlay').classList.add('hidden');
      return;
    }

    this.isCinemaActive = true;
    const startPos = new THREE.Vector3(-90, 85, 110);
    const midPos = new THREE.Vector3(30, 25, 45);
    const endPos = this.overviewPos.clone();

    this.camera.position.copy(startPos);
    this.controls.target.set(0, 0, 0);

    const startTime = performance.now();
    const duration = 4800; // 4.8 秒

    const animateCinema = (now) => {
      if (!this.isCinemaActive) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeInOutCubic
      const t = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      if (t < 0.5) {
        this.camera.position.lerpVectors(startPos, midPos, t * 2);
      } else {
        this.camera.position.lerpVectors(midPos, endPos, (t - 0.5) * 2);
      }
      this.controls.target.set(0, Math.sin(t * Math.PI) * 5, 0);

      if (progress < 1) {
        requestAnimationFrame(animateCinema);
      } else {
        this.skipCinema();
      }
    };
    requestAnimationFrame(animateCinema);
  }

  skipCinema() {
    this.isCinemaActive = false;
    this.camera.position.copy(this.overviewPos);
    this.controls.target.copy(this.overviewTarget);
    const overlay = document.getElementById('cinema-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * 點島鏡頭飛近運鏡 (1.8 秒沿弧線推近)
   */
  focusIsland(islandId) {
    const def = this.islandDefs.find(d => d.id === islandId);
    if (!def) return;

    // 關閉目前所有泡泡
    this.app.livingWorld.closeBubble();
    this.app.ui.prepareIslandDrawer(def.id);

    if (this.isReducedMotion) {
      this.camera.position.copy(def.pos).add(def.cameraOffset);
      this.controls.target.copy(def.pos);
      this.app.ui.openIslandDrawer(def.id);
      return;
    }

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const targetPos = def.pos.clone().add(def.cameraOffset);
    const targetLook = def.pos.clone();

    const startTime = performance.now();
    const duration = 1800;

    const animateFlight = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic
      const t = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, t);
      // 沿弧線稍微拉高
      this.camera.position.y += Math.sin(t * Math.PI) * 4;
      this.controls.target.lerpVectors(startTarget, targetLook, t);

      if (progress < 1) {
        requestAnimationFrame(animateFlight);
      } else {
        this.controls.target.copy(targetLook);
        this.app.ui.openIslandDrawer(def.id);
      }
    };
    requestAnimationFrame(animateFlight);
  }

  resetToOverview() {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();
    const duration = 1400;

    const animateReset = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const t = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, this.overviewPos, t);
      this.controls.target.lerpVectors(startTarget, this.overviewTarget, t);

      if (progress < 1) {
        requestAnimationFrame(animateReset);
      } else {
        this.controls.target.copy(this.overviewTarget);
      }
    };
    requestAnimationFrame(animateReset);
  }

  /**
   * 轉換 3D 空間座標到螢幕像素 (用於浮動標籤與對話泡泡)
   */
  toScreenPosition(pos3D) {
    const v = pos3D.clone();
    v.project(this.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(v.y * 0.5) + 0.5) * window.innerHeight;
    return { x, y, visible: v.z < 1 };
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 拖拉防誤觸判定狀態
    this.pointerDownPos = { x: 0, y: 0, time: 0 };
    this.isDragging = false;

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.pointerDownPos.x = e.clientX;
      this.pointerDownPos.y = e.clientY;
      this.pointerDownPos.time = performance.now();
      this.isDragging = false;
    });

    this.renderer.domElement.addEventListener('pointermove', (e) => {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) {
        this.isDragging = true;
      }

      // 游標懸停回饋：當游標移至人物、建築、動物或貝殼時顯示 pointer 樣式
      if (!this.isDragging && !this.isCinemaActive) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.scene.children, true);
        let hoverTarget = false;
        if (hits.length > 0) {
          for (const hit of hits) {
            let obj = hit.object;
            while (obj && obj !== this.scene) {
              if (obj.userData && (obj.userData.type === "npc" || obj.userData.type === "building" || obj.userData.type === "shell" || obj.userData.type === "animal")) {
                hoverTarget = true;
                break;
              }
              obj = obj.parent;
            }
            if (hoverTarget) break;
          }
        }
        this.renderer.domElement.style.cursor = hoverTarget ? 'pointer' : 'default';
      }
    });

    // 點擊畫布互動 (精準判定：拖拉旋轉視角時絕不觸發，僅點擊人物或建築時開啟介紹框)
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (this.isCinemaActive) {
        this.skipCinema();
        return;
      }
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      // 拖拉旋轉視角判定：移動超過 6 像素即視為拖拉視角，不觸發點擊事件
      if (dist > 6 || this.isDragging) {
        this.isDragging = false;
        return;
      }
      this.isDragging = false;
      this.handlePointerClick(e);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isCinemaActive) this.skipCinema();
        else {
          this.app.livingWorld.closeBubble();
          this.app.ui.closeAllModals();
        }
      }
    });

    const skipHint = document.getElementById('btn-skip-cinema');
    if (skipHint) skipHint.addEventListener('click', () => this.skipCinema());
  }

  handlePointerClick(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      // 尋找最近的有意義物件
      for (const hit of intersects) {
        let obj = hit.object;
        while (obj && obj !== this.scene) {
          if (obj.userData) {
            // 1. 拾取海灘貝殼
            if (obj.userData.type === "shell") {
              this.app.livingWorld.pickupShell(obj);
              return;
            }
            // 2. 點擊島上人物 (NPC)：開啟對話泡泡 + 展開右側介紹框
            if (obj.userData.type === "npc") {
              const targetNpc = obj.userData.parentNpc || obj;
              const npcData = targetNpc.userData?.data || obj.userData.data;
              const islandId = targetNpc.userData?.islandId || npcData?.islandId;
              if (islandId) {
                this.focusIsland(islandId);
              }
              this.app.livingWorld.openNpcDialogue(npcData, targetNpc);
              return;
            }
            // 3. 點擊島上建築 (Building / Landmark)：展開右側介紹框
            if (obj.userData.type === "building") {
              if (obj.userData.islandId) {
                this.focusIsland(obj.userData.islandId);
              }
              return;
            }
            // 4. 點擊動物：開趣味對話泡泡 (不干擾右側抽屜)
            if (obj.userData.type === "animal") {
              const targetAnimal = obj.userData.parentAnimal || obj;
              const data = targetAnimal.userData?.data || obj.userData.data;
              this.app.livingWorld.openAnimalDialogue(data, targetAnimal);
              return;
            }
          }
          obj = obj.parent;
        }
      }
    }
  }

  /**
   * 日夜與主題過渡更新
   */
  updateDayNightCycle(themeName, timeOfDay) {
    this.currentTheme = themeName;
    this.timeOfDay = timeOfDay;

    let skyCol = 0xf6f0e4;
    let fogCol = 0xf6f0e4;
    let sunCol = 0xfffaed;
    let sunInt = 1.35;
    let starOp = 0;
    let fireflyOp = 0;
    let rainbowOp = 0.45;
    let lightPower = 0;

    if (timeOfDay === "dusk" || themeName === "海霧") {
      skyCol = 0xdcebee;
      fogCol = 0xdcebee;
      sunCol = 0xffa055;
      sunInt = 1.0;
      starOp = 0.2;
      fireflyOp = 0.4;
      rainbowOp = 0.15;
      lightPower = 0.5;
    } else if (timeOfDay === "night" || themeName === "夜海") {
      skyCol = 0x16222e;
      fogCol = 0x16222e;
      sunCol = 0x6688aa;
      sunInt = 0.35;
      starOp = 0.85;
      fireflyOp = 0.9;
      rainbowOp = 0;
      lightPower = 1.0;
    }

    this.scene.background.setHex(skyCol);
    this.scene.fog.color.setHex(fogCol);
    this.sunLight.color.setHex(sunCol);
    this.sunLight.intensity = sunInt;
    if (this.stars) this.stars.material.opacity = starOp;
    if (this.fireflies) this.fireflies.material.opacity = fireflyOp;
    if (this.rainbow) {
      this.rainbow.traverse(child => {
        if (child.material) child.material.opacity = rainbowOp;
      });
    }

    // 窗戶與路燈發光
    this.nightLights.forEach(light => {
      if (light.isPointLight) {
        light.intensity = lightPower * 1.5;
      } else if (light.isMaterial) {
        light.color.setHex(lightPower > 0.3 ? 0xffea7a : 0xddc89e);
      }
    });
  }

  /**
   * 主渲染循環
   */
  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    if (!this.isCinemaActive) {
      this.controls.update();
    }

    // 更新所有骨骼動畫混合器 (人物走動、呼吸、動物動畫)
    if (!this.isReducedMotion && this.mixers.length > 0) {
      this.mixers.forEach(mixer => mixer.update(delta));
    }

    // 動態更新 3D 海浪起伏
    if (this.seaMesh && !this.isReducedMotion) {
      const pos = this.seaMesh.geometry.attributes.position;
      const init = this.seaInitialPos;
      for (let i = 0; i < pos.count; i++) {
        const u = init.getX(i);
        const v = init.getZ(i);
        const wave = Math.sin(u * 0.08 + time * 1.5) * Math.cos(v * 0.08 + time * 1.2) * 0.35;
        pos.setY(i, wave);
      }
      pos.needsUpdate = true;
    }

    // 噴泉水珠動態
    if (this.fountainDroplets.length > 0 && !this.isReducedMotion) {
      this.fountainDroplets.forEach(d => {
        d.position.y += delta * d.userData.speedY;
        if (d.position.y > 4.2) {
          d.position.y = 1.8;
        }
      });
    }

    // 煙囪白煙
    if (this.chimneySmoke && !this.isReducedMotion) {
      this.chimneySmoke.children.forEach(sm => {
        sm.position.y = (sm.userData.baseY + (time * 0.4) % 1.6);
        sm.scale.setScalar(1 + sm.position.y * 0.35);
      });
    }

    // 雲朵飄移
    if (!this.isReducedMotion) {
      this.clouds.forEach(c => {
        c.userData.angle += c.userData.speed;
        c.position.x = Math.cos(c.userData.angle) * c.userData.radius;
        c.position.z = Math.sin(c.userData.angle) * c.userData.radius;
      });
    }

    // 鳥群翱翔 (夜晚隱藏)
    if (!this.isReducedMotion && this.birds.length > 0) {
      const isNight = this.timeOfDay === "night";
      this.birds.forEach(flock => {
        flock.visible = !isNight;
        if (!isNight) {
          flock.userData.angle += flock.userData.speed;
          flock.position.x = Math.cos(flock.userData.angle) * flock.userData.radius;
          flock.position.z = Math.sin(flock.userData.angle) * flock.userData.radius;
          flock.lookAt(
            Math.cos(flock.userData.angle + 0.1) * flock.userData.radius,
            flock.position.y,
            Math.sin(flock.userData.angle + 0.1) * flock.userData.radius
          );
        }
      });
    }

    // 帆船航行
    if (!this.isReducedMotion) {
      this.boats.forEach(b => {
        b.userData.angle += b.userData.speed;
        b.position.x = Math.cos(b.userData.angle) * b.userData.radius;
        b.position.z = Math.sin(b.userData.angle) * b.userData.radius;
        b.lookAt(
          Math.cos(b.userData.angle + 0.1) * b.userData.radius,
          b.position.y,
          Math.sin(b.userData.angle + 0.1) * b.userData.radius
        );
        b.rotation.z = Math.sin(time * 2) * 0.08; // 隨浪搖晃
      });
    }

    // 動物動作 (巨鯨巡航、海龜游動、海豚跳躍)
    if (!this.isReducedMotion) {
      // 巨鯨在外海悠泳巡航
      if (this.whaleMesh) {
        this.whaleMesh.userData.angle += 0.0012;
        const r = 76;
        this.whaleMesh.position.x = Math.cos(this.whaleMesh.userData.angle) * r;
        this.whaleMesh.position.z = Math.sin(this.whaleMesh.userData.angle) * r;
        this.whaleMesh.position.y = 0.1 + Math.sin(time * 1.5) * 0.35;
        this.whaleMesh.lookAt(
          Math.cos(this.whaleMesh.userData.angle + 0.1) * r,
          this.whaleMesh.position.y,
          Math.sin(this.whaleMesh.userData.angle + 0.1) * r
        );
        this.whaleMesh.rotation.z = Math.sin(time * 2) * 0.04;
      }

      this.animals.forEach(ani => {
        if (ani.userData.data.id === "turtle") {
          ani.userData.swimAngle += 0.005;
          ani.position.x = Math.cos(ani.userData.swimAngle) * 48;
          ani.position.z = Math.sin(ani.userData.swimAngle) * 48;
          ani.lookAt(Math.cos(ani.userData.swimAngle + 0.1) * 48, ani.position.y, Math.sin(ani.userData.swimAngle + 0.1) * 48);
        } else if (ani.userData.data.id === "dolphin") {
          ani.userData.leapAngle += 0.01;
          ani.position.x = Math.cos(ani.userData.leapAngle) * 52;
          ani.position.z = Math.sin(ani.userData.leapAngle) * 52;
          ani.position.y = -0.2 + Math.max(0, Math.sin(time * 3)) * 2.2;
          ani.rotation.x = Math.sin(time * 3) * 0.4;
        }
      });
    }

    // NPC 居民走動與手腳擺動
    if (!this.isReducedMotion) {
      this.npcs.forEach(npc => {
        // 夜間部分島民休息
        if (this.timeOfDay === "night" && !npc.userData.isCourier && npc.userData.data.id !== "npc-01") {
          return;
        }

        // 散步與巡邏路徑
        if (npc.userData.pauseTimer > 0) {
          npc.userData.pauseTimer -= delta;

          // 切換為 Idle 動畫
          if (npc.userData.currentAnimState !== 'idle' && npc.userData.actions) {
            const idleAct = npc.userData.actions['idle'] || npc.userData.actions['Idle'];
            const walkAct = npc.userData.actions['walk'] || npc.userData.actions['Walk'];
            if (idleAct && walkAct) {
              walkAct.fadeOut(0.3);
              idleAct.reset().fadeIn(0.3).play();
            }
            npc.userData.currentAnimState = 'idle';
          }

          if (npc.leftArm) npc.leftArm.rotation.x = 0;
          if (npc.rightArm) npc.rightArm.rotation.x = 0;
        } else {
          const dir = npc.userData.targetPos.clone().sub(npc.position);
          dir.y = 0;
          const dist = dir.length();
          if (dist < 0.4) {
            // 抵達目標點，停留 1.5~3 秒
            npc.userData.pauseTimer = 1.5 + Math.random() * 2;
            const islDef = this.islandDefs.find(d => d.id === npc.userData.islandId) || this.islandDefs[0];
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * (islDef.radius * 0.52);
            npc.userData.targetPos.set(
              islDef.pos.x + Math.cos(a) * r,
              npc.position.y,
              islDef.pos.z + Math.sin(a) * r
            );
          } else {
            dir.normalize();
            npc.position.addScaledVector(dir, npc.userData.walkSpeed);
            npc.lookAt(npc.position.clone().add(dir));

            // 切換為 Walk 動畫
            if (npc.userData.currentAnimState !== 'walk' && npc.userData.actions) {
              const idleAct = npc.userData.actions['idle'] || npc.userData.actions['Idle'];
              const walkAct = npc.userData.actions['walk'] || npc.userData.actions['Walk'];
              if (idleAct && walkAct) {
                idleAct.fadeOut(0.2);
                walkAct.reset().fadeIn(0.2).play();
              }
              npc.userData.currentAnimState = 'walk';
            }

            // 手腳擺動動畫 (後備幾何模型相容)
            const swing = Math.sin(time * 8) * 0.5;
            if (npc.leftArm) npc.leftArm.rotation.x = swing;
            if (npc.rightArm) npc.rightArm.rotation.x = -swing;
            if (npc.leftLeg) npc.leftLeg.rotation.x = -swing;
            if (npc.rightLeg) npc.rightLeg.rotation.x = swing;
          }
        }
      });
    }

    // 更新貝殼重生計時
    this.app.livingWorld.updateShellCooldowns();

    // 更新浮動標籤與對話泡泡位置
    this.app.ui.updateLabelsPosition();
    if (this.app.livingWorld.activeNpc && this.app.livingWorld.activeNpcMesh) {
      this.app.livingWorld.updateBubblePosition(this.app.livingWorld.activeNpcMesh.position);
    } else if (this.app.livingWorld.activeAnimal && this.app.livingWorld.activeAnimalMesh) {
      this.app.livingWorld.updateBubblePosition(this.app.livingWorld.activeAnimalMesh.position);
    }

    // 渲染場景
    this.renderer.render(this.scene, this.camera);
  }
}

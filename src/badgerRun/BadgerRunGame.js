import * as THREE from "three";
import { AssetManager } from "../assets/AssetManager.js";

const STORAGE_KEY = "badgerRunProgress_v1";

export class BadgerRunGame {
  constructor({ scene, camera, isFullMode }) {
    this.scene = scene;
    this.camera = camera;

    this.mode = isFullMode ? "full" : "prototype";
    this.assets = new AssetManager();
    this.textures = { ground: null, badger: null };
    this.models = { coin: null };
    this._fullLoaded = false;


    // --- game state ---
    this.state = "ready"; // "ready" | "running" | "gameover"

    // --- lanes (Z axis) ---
    this.laneZs = [-2.4, 0, 2.4];
    this.playerLane = 1;
    this.targetLaneZ = this.laneZs[this.playerLane];
    this.laneSnap = 14;

    // time
    this.t = 0;

    // jump physics
    this.badgerY = 0;
    this.velY = 0;
    this.gravity = -22;
    this.jumpVel = 8.8;

    // difficulty
    this.speed = 8.0;
    this.speedRamp = 0.18;
    this.distance = 0;

    // scoring
    this.coinsCollected = 0;   // this run only
    this.coinValue = 25;       // score bonus per coin
    this.bankCoins = 0;        // persistent "wallet" for shop

    // spawner
    this.spawnTimer = 0;
    this.spawnQueue = []; // { t, lead, x, kind, lane, tele }
    this.obstacles = [];

    // coins
    this.coins = [];
    this.coinGeom = new THREE.TorusGeometry(0.32, 0.11, 10, 18);
    this.coinCollectRadius = 0.75;

    // telegraph lead time
    this.telegraphLead = 0.7;

    // world group
    this.world = new THREE.Group();
    this.scene.add(this.world);

    // skins + persistence
    this._setupSkins();

    // world content
    this._buildMaterials();
    this._buildGround();
    this._buildTrackDashes();
    this._buildBadger();

    // background scenery (parallax)
    this.background = new THREE.Group();
    this.scene.add(this.background);

    this.scenery = {
    clouds: [],
    mountains: [],
    trees: [],
    };

    this._buildSky();
    this._buildScenery();


    // collisions
    this.boxBadger = new THREE.Box3();
    this.boxObs = new THREE.Box3();

    // load saved state + apply skin/materials
    this._loadProgress();
    this._applySkin();
    this._applyModeMaterials();
  }

  // ---------- Skins setup ----------
  _setupSkins() {
    // Four skins: classic (free) + 3 shop skins
    this.skinDefs = {
      classic: {
        id: "classic",
        name: "Classic Badger",
        description: "Default runner fur.",
        cost: 0,
        protoColor: 0xb59a7a,
        fullColor: 0xffffff
      },
      cardinal: {
        id: "cardinal",
        name: "Cardinal Badger",
        description: "UW-inspired crimson.",
        cost: 150,
        protoColor: 0x8b0000,
        fullColor: 0xff4b4b
      },
      midnight: {
        id: "midnight",
        name: "Midnight Badger",
        description: "Stealth dark runner.",
        cost: 250,
        protoColor: 0x20252f,
        fullColor: 0x383f5b
      },
      neon: {
        id: "neon",
        name: "Neon Badger",
        description: "Glowing synthwave vibe.",
        cost: 400,
        protoColor: 0x30e3b3,
        fullColor: 0x66ffcc
      }
    };

    this.ownedSkins = new Set(["classic"]);
    this.activeSkinId = "classic";
  }

  // ---------- UI state ----------
  getUIState() {
    const laneLabel = ["L", "C", "R"][this.playerLane] ?? "?";
    const baseScore = Math.floor(this.distance);
    const totalScore = baseScore + this.coinsCollected * this.coinValue;

    return {
      mode: this.mode,
      state: this.state,
      score: baseScore,
      totalScore,
      coins: this.coinsCollected,
      bankCoins: this.bankCoins,
      speed: this.state === "running" ? this.speed : 0,
      lane: laneLabel,
      gameOver: this.state === "gameover"
    };
  }

  // meta for shop/locker UI
  getMetaState() {
    return {
      bankCoins: this.bankCoins,
      skins: this.skinDefs,
      ownedSkins: Array.from(this.ownedSkins),
      activeSkinId: this.activeSkinId
    };
  }

  isGameOver() {
    return this.state === "gameover";
  }

  primaryAction() {
    if (this.state === "ready") return this.startRun();
    if (this.state === "gameover") return this.reset();
    return this.jump();
  }

  startRun() {
    if (this.state !== "ready") return;
    this.state = "running";
    this.spawnTimer = 0.25; // delay before first pattern
  }

  async setMode(mode) {
    this.mode = mode;
    if (this.mode === "full") await this._ensureFullAssets();
    this._applyModeMaterials();
  }

  reset() {
    // obstacles + telegraphs
    for (const o of this.obstacles) this.world.remove(o);
    this.obstacles.length = 0;
    for (const ev of this.spawnQueue) {
      if (ev.tele) this.world.remove(ev.tele);
    }
    this.spawnQueue.length = 0;

    // coins
    for (const c of this.coins) this.world.remove(c);
    this.coins.length = 0;
    this.coinsCollected = 0;

    // state
    this.state = "ready";

    // physics
    this.badgerY = 0;
    this.velY = 0;

    // difficulty
    this.speed = 8.0;
    this.distance = 0;
    this.spawnTimer = 0;

    // lane
    this.playerLane = 1;
    this.targetLaneZ = this.laneZs[this.playerLane];

    this.badger.position.set(0, 0, this.targetLaneZ);
    this.badger.scale.set(1, 1, 1);
  }

  jump() {
    if (this.state !== "running") return;
    if (this.badgerY <= 0.0001) this.velY = this.jumpVel;
  }

  setDuck(on) {
    if (this.state !== "running") return;
    if (on) this.badger.scale.set(1.15, 0.7, 1.15);
    else this.badger.scale.set(1, 1, 1);
  }

  moveLeft() {
    this._setLane(this.playerLane - 1);
  }

  moveRight() {
    this._setLane(this.playerLane + 1);
  }

  _setLane(i) {
    const clamped = THREE.MathUtils.clamp(i, 0, this.laneZs.length - 1);
    this.playerLane = clamped;
    this.targetLaneZ = this.laneZs[this.playerLane];
  }

  // ---------- main update ----------
  update(dt) {
    this.t += dt;

    const running = this.state === "running";
    const worldSpeed = running ? this.speed : 2.0; // even idle animates a bit

    this._updateTrackDashes(dt, worldSpeed);

    this._updateScenery(dt, worldSpeed);

    if (running) {
      // difficulty & movement
      this.speed += this.speedRamp * dt;
      this.speed = Math.min(this.speed, 22); // clamp a bit
      this.distance += this.speed * dt;

      // jump physics
      this.velY += this.gravity * dt;
      this.badgerY += this.velY * dt;
      if (this.badgerY < 0) {
        this.badgerY = 0;
        this.velY = 0;
      }

      // telegraphed spawns
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        const ev = this.spawnQueue[i];
        ev.t -= dt;

        ev.x -= this.speed * dt;
        if (ev.tele) ev.tele.position.x = ev.x;

        const p = THREE.MathUtils.clamp((ev.lead - ev.t) / ev.lead, 0, 1);
        if (ev.tele) {
          ev.tele.visible = p > 0;
          const pulse = 0.65 + 0.35 * Math.sin(this.t * 18 + ev.lane * 2.1);
          ev.tele.material.opacity = (0.12 + 0.38 * p) * pulse;
        }

        if (ev.t <= 0) {
          this._spawnObstacle(ev.kind, ev.lane, ev.x);
          if (ev.tele) this.world.remove(ev.tele);
          this.spawnQueue.splice(i, 1);
        }
      }

      // decide when to queue next pattern
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._enqueuePattern();
        const base = THREE.MathUtils.clamp(1.25 - (this.speed - 8) * 0.045, 0.55, 1.25);
        this.spawnTimer = THREE.MathUtils.randFloat(base * 0.8, base * 1.15);
      }

      // move obstacles
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i];
        o.position.x -= this.speed * dt;
        if (o.position.x < -22) {
          this.world.remove(o);
          this.obstacles.splice(i, 1);
        }
      }

      // move + animate + collect coins
      this._updateCoins(dt);

      // obstacle collision
      this.boxBadger.setFromObject(this.badger);
      for (const o of this.obstacles) {
        this.boxObs.setFromObject(o);
        if (this.boxBadger.intersectsBox(this.boxObs)) {
          this._endGame();
          break;
        }
      }
    } else {
      // idle state
      this.badgerY = 0;
      this.velY = 0;
    }

    // scrolling ground texture in full mode (if added)
    if (this.mode === "full" && this.textures.ground) {
      this.textures.ground.offset.x += worldSpeed * dt * 0.055;
    }

    // --- Badger animation + lane movement ---
    const grounded = this.badgerY <= 0.0001;
    const animRate = running ? 18 : 10;

    // smooth lane slide
    this.badger.position.z = THREE.MathUtils.damp(
      this.badger.position.z,
      this.targetLaneZ,
      this.laneSnap,
      dt
    );

    const bob = grounded ? Math.sin(this.t * (running ? 14 : 8)) * 0.05 : 0;
    this.badger.position.y = this.badgerY + bob;

    if (grounded) {
      const s = Math.sin(this.t * animRate);
      const a = s * 0.9;
      const b = -s * 0.9;
      if (this.legs[0]) this.legs[0].rotation.x = a;
      if (this.legs[3]) this.legs[3].rotation.x = a;
      if (this.legs[1]) this.legs[1].rotation.x = b;
      if (this.legs[2]) this.legs[2].rotation.x = b;
    } else {
      for (const leg of this.legs) leg.rotation.x = 0;
    }

    // camera follow
    this.camera.position.lerp(new THREE.Vector3(-3.5, 3.5, 9), 0.06);
    this.camera.lookAt(0, 1.2, 0);
  }

  _endGame() {
    this.state = "gameover";
  }

  // ---------- build ----------
  _buildMaterials() {
    const teleProto = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const teleFull = new THREE.MeshBasicMaterial({
      color: 0x9ad7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
  
    const coinProto = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0x553300,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.6
    });
    const coinFull = new THREE.MeshStandardMaterial({
      color: 0xfff2b3,
      emissive: 0x224466,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.8
    });
  
    // --- scenery materials ---
    const cloudProto = new THREE.MeshStandardMaterial({
      color: 0xe9f0ff,
      roughness: 1,
      metalness: 0
    });
    const cloudFull = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0
    });
  
    const mountainProto = new THREE.MeshStandardMaterial({
      color: 0x2b3a55,
      roughness: 1,
      metalness: 0
    });
    const mountainFull = new THREE.MeshStandardMaterial({
      color: 0x3a4f7a,
      roughness: 1,
      metalness: 0
    });
  
    const trunkProto = new THREE.MeshStandardMaterial({
      color: 0x5a3a22,
      roughness: 1,
      metalness: 0
    });
    const trunkFull = new THREE.MeshStandardMaterial({
      color: 0x6a4427,
      roughness: 1,
      metalness: 0
    });
  
    const leafProto = new THREE.MeshStandardMaterial({
      color: 0x2f7d3b,
      roughness: 1,
      metalness: 0
    });
    const leafFull = new THREE.MeshStandardMaterial({
      color: 0x3ccf5a,
      roughness: 0.95,
      metalness: 0
    });
  
    this.mats = {
      proto: {
        ground: new THREE.MeshStandardMaterial({ color: 0x1f3a2e, roughness: 1 }),
        badger: new THREE.MeshStandardMaterial({ color: 0xb59a7a, roughness: 0.8 }),
        obstacle: new THREE.MeshStandardMaterial({ color: 0x8bd3ff, roughness: 0.7 }),
        dash: new THREE.MeshStandardMaterial({ color: 0xf0f3f6, roughness: 0.9 }),
        tele: teleProto,
        coin: coinProto,
  
        // scenery
        cloud: cloudProto,
        mountain: mountainProto,
        trunk: trunkProto,
        leaf: leafProto
      },
      full: {
        ground: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
        badger: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
        obstacle: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
        dash: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
        tele: teleFull,
        coin: coinFull,
  
        // scenery
        cloud: cloudFull,
        mountain: mountainFull,
        trunk: trunkFull,
        leaf: leafFull
      }
    };
  }
  

  _buildGround() {
    const groundGeom = new THREE.PlaneGeometry(200, 16, 1, 1);
    this.ground = new THREE.Mesh(groundGeom, this.mats.proto.ground);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.world.add(this.ground);
  }

  _buildSky() {
    // big sky dome with a simple vertical gradient
    const geom = new THREE.SphereGeometry(140, 32, 16);
  
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0b1020) },
        bottomColor: { value: new THREE.Color(0x2a4b7c) },
        offset: { value: 22.0 },
        exponent: { value: 0.75 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = pow(max(h, 0.0), exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    });
  
    this.sky = new THREE.Mesh(geom, mat);
    this.sky.position.set(0, 0, 0);
    this.background.add(this.sky);
  
    // optional sun disk
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.18 })
    );
    sun.position.set(55, 45, -35);
    sun.lookAt(0, 0, 0);
    this.background.add(sun);
  }
  
  _buildScenery() {
    this._buildClouds();
    this._buildMountains();
    this._buildTrees();
  }
  
  _buildClouds() {
    const puffGeom = new THREE.SphereGeometry(1, 10, 10);
  
    const makeCloud = () => {
      const g = new THREE.Group();
      const puffCount = 3 + Math.floor(Math.random() * 3);
  
      for (let i = 0; i < puffCount; i++) {
        const puff = new THREE.Mesh(puffGeom, this.mats.proto.cloud);
        puff.userData.matKey = "cloud";
        puff.scale.set(
          1.2 + Math.random() * 1.2,
          0.7 + Math.random() * 0.7,
          0.8 + Math.random() * 1.0
        );
        puff.position.set(
          (Math.random() - 0.5) * 2.2,
          (Math.random() - 0.5) * 0.9,
          (Math.random() - 0.5) * 1.6
        );
        puff.castShadow = false;
        puff.receiveShadow = false;
        g.add(puff);
      }
  
      g.userData.parallax = 0.18; // slower than gameplay speed
      g.userData.wrapMinX = -40;
      g.userData.wrapMaxX = 90;
      g.userData.baseY = 8 + Math.random() * 6;
      g.userData.phase = Math.random() * Math.PI * 2;
  
      g.position.set(
        -20 + Math.random() * 90,
        g.userData.baseY,
        -18 + Math.random() * 36
      );
  
      return g;
    };
  
    for (let i = 0; i < 10; i++) {
      const c = makeCloud();
      this.background.add(c);
      this.scenery.clouds.push(c);
    }
  }
  
  _buildMountains() {
    // cones along far sides to create a horizon line
    const geom = new THREE.ConeGeometry(4.5, 16, 7);
  
    const makeMountain = (sideSign) => {
      const m = new THREE.Mesh(geom, this.mats.proto.mountain);
      m.userData.matKey = "mountain";
      m.userData.parallax = 0.06;
      m.userData.wrapMinX = -55;
      m.userData.wrapMaxX = 120;
  
      const s = 0.8 + Math.random() * 1.6;
      m.scale.set(s, 0.7 + Math.random() * 1.4, s);
      m.position.set(
        -25 + Math.random() * 120,
        (16 * m.scale.y) / 2 - 0.2,
        sideSign * (11 + Math.random() * 7)
      );
  
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = false;
      m.receiveShadow = false;
  
      return m;
    };
  
    for (let i = 0; i < 9; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const m = makeMountain(side);
      this.background.add(m);
      this.scenery.mountains.push(m);
    }
  }
  
  _buildTrees() {
    // simple low-poly trees along the road sides (nearer parallax layer)
    const trunkGeom = new THREE.CylinderGeometry(0.22, 0.28, 1.6, 7);
    const leafGeom = new THREE.ConeGeometry(0.9, 2.2, 8);
  
    const makeTree = (z) => {
      const g = new THREE.Group();
      g.userData.parallax = 0.28;
      g.userData.wrapMinX = -35;
      g.userData.wrapMaxX = 85;
  
      const trunk = new THREE.Mesh(trunkGeom, this.mats.proto.trunk);
      trunk.userData.matKey = "trunk";
      trunk.position.y = 0.8;
  
      const leaf = new THREE.Mesh(leafGeom, this.mats.proto.leaf);
      leaf.userData.matKey = "leaf";
      leaf.position.y = 2.2;
  
      g.add(trunk);
      g.add(leaf);
  
      g.position.set(-10 + Math.random() * 90, 0, z);
      g.rotation.y = Math.random() * Math.PI;
  
      g.scale.setScalar(0.9 + Math.random() * 0.7);
  
      trunk.castShadow = false;
      leaf.castShadow = false;
      trunk.receiveShadow = false;
      leaf.receiveShadow = false;
  
      return g;
    };
  
    // place on both sides of the lane strip
    for (let i = 0; i < 18; i++) {
      const sideZ = (Math.random() < 0.5 ? -1 : 1) * (7.2 + Math.random() * 3.2);
      const t = makeTree(sideZ);
      this.background.add(t);
      this.scenery.trees.push(t);
    }
  }
  
  _updateScenery(dt, worldSpeed) {
    // move scenery left with parallax; wrap to the right when it goes off screen
    const updateObj = (obj, extraFn = null) => {
      const p = obj.userData.parallax ?? 0.2;
      obj.position.x -= worldSpeed * dt * p;
  
      if (extraFn) extraFn(obj);
  
      const minX = obj.userData.wrapMinX ?? -40;
      const maxX = obj.userData.wrapMaxX ?? 90;
  
      if (obj.position.x < minX) {
        obj.position.x = maxX + Math.random() * 10;
      }
    };
  
    for (const c of this.scenery.clouds) {
      updateObj(c, (cloud) => {
        const baseY = cloud.userData.baseY ?? cloud.position.y;
        const phase = cloud.userData.phase ?? 0;
        cloud.position.y = baseY + Math.sin(this.t * 0.6 + phase) * 0.25;
      });
    }
  
    for (const m of this.scenery.mountains) updateObj(m);
    for (const t of this.scenery.trees) updateObj(t);
  }
  

  _buildTrackDashes() {
    this.dashes = [];
    this.dashSpacing = 1.6;
    this.dashCount = 40;
    this.dashZs = [-1.2, 1.2];

    const geom = new THREE.BoxGeometry(0.9, 0.04, 0.14);

    for (const z of this.dashZs) {
      for (let i = 0; i < this.dashCount; i++) {
        const dash = new THREE.Mesh(geom, this.mats.proto.dash);
        dash.position.set(-18 + i * this.dashSpacing, 0.02, z);
        this.world.add(dash);
        this.dashes.push(dash);
      }
    }
  }

  _updateTrackDashes(dt, worldSpeed) {
    const wrapLen = this.dashSpacing * this.dashCount;
    for (const dash of this.dashes) {
      dash.position.x -= worldSpeed * dt;
      if (dash.position.x < -22) dash.position.x += wrapLen;
    }
  }

  _buildBadger() {
    const g = new THREE.Group();
    this.legs = [];

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 0.9, 8, 16),
      this.mats.proto.badger
    );
    body.position.set(0, 1.1, 0);
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      this.mats.proto.badger
    );
    head.position.set(0.55, 1.35, 0);
    g.add(head);

    const snout = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      this.mats.proto.badger
    );
    snout.scale.set(1.1, 0.8, 0.8);
    snout.position.set(0.85, 1.27, 0);
    g.add(snout);

    const legGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10);
    const legOffsets = [
      [-0.2, 0.4],
      [0.2, 0.4],
      [-0.2, -0.4],
      [0.2, -0.4]
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeom, this.mats.proto.badger);
      leg.position.set(lx, 0.45, lz);
      g.add(leg);
      this.legs.push(leg);
    }

    this.badger = g;
    this.badger.position.set(0, 0, this.targetLaneZ);
    this.world.add(this.badger);
  }

  // ---------- coins ----------
  _spawnCoin(laneIndex, x, baseY = 1.05) {
    let coin;
  
    // Full mode: try glTF coin first
    if (this.mode === "full" && this.models?.coin) {
      coin = this.models.coin.clone(true);
  
      // reasonable defaults (tweak if your coin.glb is huge/tiny)
      coin.scale.setScalar(0.6);
      coin.rotation.set(0, Math.PI / 2, 0);
  
      coin.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
        }
      });
  
      coin.userData.isModelCoin = true;
    } else {
      // Prototype (or fallback): torus mesh coin
      const modeKey = this.mode === "full" ? "full" : "proto";
      coin = new THREE.Mesh(this.coinGeom, this.mats[modeKey].coin);
      coin.rotation.x = Math.PI / 2;
    }
  
    coin.position.set(x, baseY, this.laneZs[laneIndex] ?? 0);
    coin.userData.baseY = baseY;
    coin.userData.phase = Math.random() * Math.PI * 2;
  
    this.world.add(coin);
    this.coins.push(coin);
  }
  

  _spawnCoinTrail(laneIndex, count = 5, xStart = 24, spacing = 1.25) {
    for (let i = 0; i < count; i++) {
      this._spawnCoin(laneIndex, xStart + i * spacing, 1.05);
    }
  }

  _updateCoins(dt) {
    // animate + move coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.position.x -= this.speed * dt;
      c.rotation.y += dt * 6.5;

      const baseY = c.userData.baseY ?? 1.05;
      const phase = c.userData.phase ?? 0;
      c.position.y = baseY + Math.sin(this.t * 6 + phase) * 0.08;

      if (c.position.x < -22) {
        this.world.remove(c);
        this.coins.splice(i, 1);
      }
    }

    // collection
    const badgerCenter = new THREE.Vector3(
      0,
      this.badger.position.y + 1.05,
      this.badger.position.z
    );
    const r2 = this.coinCollectRadius * this.coinCollectRadius;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const dx = c.position.x - badgerCenter.x;
      const dy = c.position.y - badgerCenter.y;
      const dz = c.position.z - badgerCenter.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this.coinsCollected += 1;
        this.bankCoins += 1; // persistent wallet
        this._saveProgress();
        this.world.remove(c);
        this.coins.splice(i, 1);
      }
    }
  }

  // ---------- telegraph + patterns ----------
  _queueSpawn(kind, lane, delay = 0) {
    const lead = this.telegraphLead;
    const tTotal = lead + delay;
    const x0 = 18 + this.speed * tTotal;

    const tele = this._makeTelegraph(kind, lane);
    tele.position.x = x0;
    tele.visible = false;
    this.world.add(tele);

    this.spawnQueue.push({ t: tTotal, lead, x: x0, kind, lane, tele });
  }

  _makeTelegraph(kind, laneIndex) {
    const modeKey = this.mode === "full" ? "full" : "proto";
    const mat = this.mats[modeKey].tele.clone();
    mat.opacity = 0;

    if (kind === "overhead") {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7.0), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(0, 0.03, 0);
      return plane;
    }

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 28), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, this.laneZs[laneIndex] ?? 0);
    return ring;
  }

  _enqueuePattern() {
    const diff = THREE.MathUtils.clamp((this.speed - 8) / 10, 0, 1);
    const randLane = () => Math.floor(Math.random() * this.laneZs.length);

    const biasedLane = () => (Math.random() < 0.65 ? this.playerLane : randLane());
    const laneOtherThanPlayer = () => {
      const dir = Math.random() < 0.5 ? -1 : 1;
      return THREE.MathUtils.clamp(this.playerLane + dir, 0, 2);
    };

    const r = Math.random();

    const maybeCoins = (preferredLane = null) => {
      if (Math.random() > 0.7) return;
      const lane = preferredLane ?? (Math.random() < 0.75 ? laneOtherThanPlayer() : randLane());
      const xStart = 24 + Math.random() * 2.0;
      const count = diff < 0.5 ? 4 : 6;
      this._spawnCoinTrail(lane, count, xStart, 1.25);
    };

    if (diff < 0.35) {
      this._queueSpawn("hurdle", biasedLane(), 0);
      maybeCoins();
      return;
    }

    if (diff < 0.75) {
      if (r < 0.65) this._queueSpawn("hurdle", biasedLane(), 0);
      else this._queueSpawn("wall", biasedLane(), 0);
      maybeCoins();
      return;
    }

    if (r < 0.15) {
      this._queueSpawn("overhead", 1, 0);
      maybeCoins(1);
      return;
    }

    if (r < 0.65) {
      const lane = biasedLane();
      const kind = Math.random() < 0.55 ? "wall" : "hurdle";
      this._queueSpawn(kind, lane, 0);
      maybeCoins();
      return;
    }

    const safe = randLane();
    const blocked = [0, 1, 2].filter((i) => i !== safe);
    this._queueSpawn("wall", blocked[0], 0.0);
    this._queueSpawn("wall", blocked[1], 0.18);

    this._spawnCoinTrail(safe, 6, 24, 1.15);
  }

  _spawnObstacle(kind, laneIndex, x) {
    const laneZ = this.laneZs[laneIndex] ?? 0;
  
    // ---------- FULL MODE: try glTF models first ----------
    if (this.mode === "full") {
      const key =
        kind === "wall" ? "wall" :
        kind === "hurdle" ? "hurdle" :
        kind === "overhead" ? "overhead" :
        null;
  
      const src = key ? this.models?.[key] : null;
  
      if (src) {
        const obj = src.clone(true);
  
        // Position: lane obstacles use laneZ, overhead spans lanes at z=0
        obj.position.set(x, 0, kind === "overhead" ? 0 : laneZ);
  
        // Default scaling (you will likely tweak once you see the model)
        // If your model is HUGE or tiny, adjust these scalars.
        const s =
          kind === "wall" ? 1.0 :
          kind === "hurdle" ? 1.0 :
          1.0;
        obj.scale.setScalar(s);
  
        // If your model’s origin is not at the ground, lift it slightly
        // (optional; tweak if needed)
        if (kind === "overhead") obj.position.y = 1.7; // same as your box y
        else obj.position.y = 0;
  
        // Shadows
        obj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
          }
        });
  
        obj.userData.kind = kind;
  
        // Ensure Box3.setFromObject sees correct transforms
        obj.updateMatrixWorld(true);
  
        this.world.add(obj);
        this.obstacles.push(obj);
        return;
      }
    }
  
    // ---------- PROTOTYPE / FALLBACK: primitives ----------
    const modeKey = this.mode === "full" ? "full" : "proto";
    const mat = this.mats[modeKey].obstacle;
  
    let geom, y, z, w, h, d;
  
    if (kind === "wall") {
      w = THREE.MathUtils.randFloat(0.8, 1.2);
      h = THREE.MathUtils.randFloat(2.6, 3.2);
      d = THREE.MathUtils.randFloat(0.7, 1.0);
      geom = new THREE.BoxGeometry(w, h, d);
      y = h / 2;
      z = laneZ;
    } else if (kind === "overhead") {
      w = THREE.MathUtils.randFloat(1.6, 2.2);
      h = 0.3;
      d = 7.0;
      geom = new THREE.BoxGeometry(w, h, d);
      y = 1.7;
      z = 0;
    } else {
      w = THREE.MathUtils.randFloat(0.6, 1.0);
      h = THREE.MathUtils.randFloat(0.8, 1.3);
      d = THREE.MathUtils.randFloat(0.6, 1.0);
      geom = new THREE.BoxGeometry(w, h, d);
      y = h / 2;
      z = laneZ;
    }
  
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    mesh.userData.kind = kind;
  
    // optional shadows in full even for fallback primitives
    mesh.castShadow = (this.mode === "full");
    mesh.receiveShadow = false;
  
    this.world.add(mesh);
    this.obstacles.push(mesh);
  }
  

  async _ensureFullAssets() {
    if (this._fullLoaded) return;
  
    const [groundTex, badgerTex, coinModel, wallModel, hurdleModel, overheadModel] =
  await Promise.all([
    this.assets.loadTexture("ground", "/textures/ground2.jpg", { repeat: { x: 12, y: 1 } }),
    this.assets.loadTexture("badger", "/textures/badger.jpg"),
    this.assets.loadGLTF("coin", "/models/coin.glb"),
    this.assets.loadGLTF("wall", "/models/obstacle_wall.glb"),
    this.assets.loadGLTF("hurdle", "/models/obstacle_hurdle.glb"),
    this.assets.loadGLTF("overhead", "/models/obstacle_overhead.glb"),
  ]);
  
    this.textures.ground = groundTex;
    this.textures.badger = badgerTex;
    this.models.coin = coinModel;
    this.models.wall = wallModel;
    this.models.hurdle = hurdleModel;
    this.models.overhead = overheadModel;
  
    this._fullLoaded = true;
  }
  

  _applySkin() {
    const def = this.skinDefs[this.activeSkinId] ?? this.skinDefs.classic;
    this.mats.proto.badger.color.set(def.protoColor);
    this.mats.full.badger.color.set(def.fullColor);
    this.mats.proto.badger.needsUpdate = true;
    this.mats.full.badger.needsUpdate = true;
  }

  _applyModeMaterials() {
    const modeKey = this.mode === "full" ? "full" : "proto";

    this.ground.material = this.mats[modeKey].ground;
    for (const dash of this.dashes) dash.material = this.mats[modeKey].dash;

    this.badger.traverse((o) => {
      if (o.isMesh) o.material = this.mats[modeKey].badger;
    });

    for (const o of this.obstacles) o.material = this.mats[modeKey].obstacle;
    for (const c of this.coins) {
        if (c.isMesh) c.material = this.mats[modeKey].coin; // torus coins only
      }

    for (const ev of this.spawnQueue) {
      if (ev.tele) {
        const newMat = this.mats[modeKey].tele.clone();
        newMat.opacity = ev.tele.material.opacity ?? 0;
        ev.tele.material = newMat;
      }
    }

    // Prototype must have NO textures
    this.mats.full.ground.map = null;
    this.mats.full.badger.map = null;

    // update background scenery materials based on mode
    this.background.traverse((o) => {
    if (o.isMesh && o.userData?.matKey) {
        const key = o.userData.matKey;
        if (this.mats[modeKey][key]) o.material = this.mats[modeKey][key];
    }
    });


    if (this.mode === "full") {
      if (this.textures.ground) this.mats.full.ground.map = this.textures.ground;
      if (this.textures.badger) this.mats.full.badger.map = this.textures.badger;
    }

    this.mats.full.ground.needsUpdate = true;
    this.mats.full.badger.needsUpdate = true;
  }

  _loadProgress() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (typeof data.bankCoins === "number" && data.bankCoins >= 0) {
        this.bankCoins = data.bankCoins;
      }

      if (Array.isArray(data.ownedSkins)) {
        this.ownedSkins = new Set(
          data.ownedSkins.filter((id) => this.skinDefs[id])
        );
      }
      if (!this.ownedSkins.has("classic")) this.ownedSkins.add("classic");

      if (data.activeSkinId && this.ownedSkins.has(data.activeSkinId)) {
        this.activeSkinId = data.activeSkinId;
      }
    } catch (e) {
      console.warn("BadgerRun: failed to load progress", e);
    }
  }

  _saveProgress() {
    try {
      const data = {
        bankCoins: this.bankCoins,
        ownedSkins: Array.from(this.ownedSkins),
        activeSkinId: this.activeSkinId
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("BadgerRun: failed to save progress", e);
    }
  }

  // ---------- shop / locker API ----------
  buySkin(id) {
    const def = this.skinDefs[id];
    if (!def || def.cost <= 0) return false;
    if (this.ownedSkins.has(id)) return false;
    if (this.bankCoins < def.cost) return false;
    this.bankCoins -= def.cost;
    this.ownedSkins.add(id);
    this._saveProgress();
    return true;
  }

  equipSkin(id) {
    if (!this.ownedSkins.has(id)) return false;
    if (this.activeSkinId === id) return false;
    this.activeSkinId = id;
    this._applySkin();
    this._applyModeMaterials();
    this._saveProgress();
    return true;
  }
}
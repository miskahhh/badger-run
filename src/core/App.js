import * as THREE from "three";
import { BadgerRunGame } from "../badgerRun/BadgerRunGame.js";
import { MobileControls } from "../ui/MobileControls.js";
import { HUD } from "../ui/HUD.js";
import { ShopLockerUI } from "../ui/ShopLockerUI.js";

export class App {
  constructor({ canvas, modeCheckbox, overlayRoot, hintEl }) {
    this.canvas = canvas;
    this.modeCheckbox = modeCheckbox;
    this.overlayRoot = overlayRoot;
    this.hintEl = hintEl;

    this.clock = new THREE.Clock();

    const isFullMode = Boolean(this.modeCheckbox?.checked);

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Full-mode “nice” settings
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Shadows only in Full mode (prototype stays simpler)
    this.renderer.shadowMap.enabled = isFullMode;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Scene ---
    this.scene = new THREE.Scene();
this._applyModeSceneLook(isFullMode);

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 3.5, 9);
    this.camera.lookAt(0, 1.2, 0);

    // --- Lights ---
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(6, 10, 6);
    this.sun.castShadow = isFullMode;

    // shadow camera tuning (safe defaults)
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.bias = -0.0002;

    this.scene.add(this.sun);

    // --- Game ---
    this.game = new BadgerRunGame({
      scene: this.scene,
      camera: this.camera,
      isFullMode,
    });

    // --- UI ---
    this.hud = new HUD({ root: this.overlayRoot ?? document.body });

    if (this.hintEl) {
      this.hintEl.innerHTML =
        `<b>Controls:</b> Space/Click = Start/Jump, ↓ = Duck, A/D or ←/→ = Change Lane, R = Restart<br/>` +
        `Swipe left/right to change lanes.`;
    }

    this.mobileControls = new MobileControls({
      root: this.overlayRoot ?? document.body,
      onLeft: () => this.game.moveLeft(),
      onRight: () => this.game.moveRight(),
      onJump: () => this.game.primaryAction(),
      onDuckStart: () => this.game.setDuck(true),
      onDuckEnd: () => this.game.setDuck(false),
      onRestart: () => this.game.reset(),
    });

    this.shopLocker = new ShopLockerUI({
      root: this.overlayRoot ?? document.body,
      onBuySkin: (id) => this.game.buySkin(id),
      onEquipSkin: (id) => this.game.equipSkin(id),
    });

    this._bindInputs();

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  _applyFullRenderSettings(full) {
    this.renderer.shadowMap.enabled = full;
    this.sun.castShadow = full;

    // Optional: slightly brighten for Full mode (feel free to tweak)
    this.renderer.toneMappingExposure = full ? 1.05 : 1.0;
  }

  _applyModeSceneLook(full) {
    if (full) {
      this.scene.background = new THREE.Color(0x79b8ff); // light blue
      this.scene.fog = new THREE.Fog(0x79b8ff, 14, 75);
    } else {
      this.scene.background = new THREE.Color(0x0b1020); // dark blue
      this.scene.fog = new THREE.Fog(0x0b1020, 12, 60);
    }
  }
  

  _bindInputs() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        this.game.primaryAction();
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        this.game.setDuck(true);
      }
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        e.preventDefault();
        this.game.moveLeft();
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        e.preventDefault();
        this.game.moveRight();
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        this.game.reset();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowDown") {
        e.preventDefault();
        this.game.setDuck(false);
      }
    });

    // swipe / tap
    let start = null;

    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        start = { x: e.clientX, y: e.clientY };
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        if (!start) return;

        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);

        // tap
        if (ax < 16 && ay < 16) {
          this.game.primaryAction();
          start = null;
          return;
        }

        // swipe
        if (ax > ay) {
          if (dx < 0) this.game.moveLeft();
          else this.game.moveRight();
        } else {
          if (dy > 0) {
            this.game.setDuck(true);
            setTimeout(() => this.game.setDuck(false), 250);
          } else {
            this.game.primaryAction();
          }
        }

        start = null;
      },
      { passive: false }
    );

    this.canvas.addEventListener("pointercancel", () => (start = null));

    if (this.modeCheckbox) {
      this.modeCheckbox.addEventListener("change", async () => {
        const full = this.modeCheckbox.checked;
        await this.game.setMode(full ? "full" : "prototype");
        this._applyFullRenderSettings(full);
        this._applyModeSceneLook(full);
      });
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.game.reset();
  
    const FIXED_DT = 1 / 60;
    const MAX_FRAME_DT = 0.25;   // avoid tab-switch explosions
    const MAX_STEPS = 15;        // IMPORTANT: allow catch-up on low FPS
  
    let acc = 0;
  
    const tick = () => {
      let frameDt = this.clock.getDelta();
      frameDt = Math.min(frameDt, MAX_FRAME_DT);
      acc += frameDt;
  
      // prevent infinite backlog
      acc = Math.min(acc, 0.5);
  
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_STEPS) {
        this.game.update(FIXED_DT);
        acc -= FIXED_DT;
        steps++;
      }
  
      // if we hit the step cap, drop remaining lag so gameplay stays real-time
      if (steps === MAX_STEPS) acc = 0;
  
      const uiState = this.game.getUIState();
      this.hud.update(uiState);
      this.shopLocker.update(this.game.getMetaState(), uiState);
  
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };

  
    requestAnimationFrame(tick);
  }
  
  
}

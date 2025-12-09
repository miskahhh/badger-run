export class HUD {
    constructor({ root }) {
      this.root = root ?? document.body;
      this._mount();
    }
  
    _pillBase(el) {
      el.style.pointerEvents = "none";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "14px";
      el.style.background = "rgba(0,0,0,0.45)";
      el.style.color = "white";
      el.style.backdropFilter = "blur(6px)";
      el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
      el.style.fontFamily =
        "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      el.style.fontSize = "14px";
      el.style.fontWeight = "700";
    }
  
    _mount() {
      const wrap = document.createElement("div");
      wrap.style.position = "absolute";
      wrap.style.inset = "0";
      wrap.style.pointerEvents = "none";
  
      // Top-left: Mode
      const mode = document.createElement("div");
      mode.style.position = "absolute";
      mode.style.left = "12px";
      mode.style.top = "68px"; // below your topbar
      this._pillBase(mode);
  
      // Top-right: Score
      const score = document.createElement("div");
      score.style.position = "absolute";
      score.style.right = "12px";
      score.style.top = "12px";
      this._pillBase(score);
  
      // Center message (game over, prompts)
      const center = document.createElement("div");
      center.style.position = "absolute";
      center.style.left = "50%";
      center.style.top = "50%";
      center.style.transform = "translate(-50%, -50%)";
      center.style.textAlign = "center";
      center.style.maxWidth = "min(560px, calc(100vw - 24px))";
      center.style.padding = "14px 16px";
      center.style.borderRadius = "18px";
      center.style.background = "rgba(0,0,0,0.45)";
      center.style.color = "white";
      center.style.backdropFilter = "blur(6px)";
      center.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
      center.style.fontFamily =
        "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      center.style.display = "none";
  
      wrap.appendChild(mode);
      wrap.appendChild(score);
      wrap.appendChild(center);
  
      this.root.appendChild(wrap);
  
      this.el = wrap;
      this.modeEl = mode;
      this.scoreEl = score;
      this.centerEl = center;
    }
  
    update(ui) {
        const modeLabel = ui.mode === "full" ? "Full" : "Prototype";
        this.modeEl.textContent = `Mode: ${modeLabel}  |  Lane: ${ui.lane ?? "?"}`;
      
        this.scoreEl.textContent =
          `Total: ${ui.totalScore ?? ui.score}` +
          `  |  Run Coins: ${ui.coins ?? 0}` +
          `  |  Bank: ${ui.bankCoins ?? 0}` +
          `  |  Speed: ${(ui.speed ?? 0).toFixed(1)}`;
      
        if (ui.state === "ready") {
          this.centerEl.style.display = "block";
          this.centerEl.innerHTML =
            `<div style="font-size:22px;font-weight:900;margin-bottom:6px;">Badger Run</div>` +
            `<div style="font-size:14px;font-weight:650;opacity:0.92;">Tap / Press <b>Space</b> to start</div>` +
            `<div style="margin-top:8px;font-size:13px;opacity:0.85;">Collect coins to unlock skins in the shop</div>`;
          return;
        }
      
        if (ui.gameOver) {
          this.centerEl.style.display = "block";
          this.centerEl.innerHTML =
            `<div style="font-size:22px;font-weight:900;margin-bottom:6px;">Game Over</div>` +
            `<div style="font-size:14px;font-weight:650;opacity:0.92;">Tap to restart or press <b>R</b></div>`;
          return;
        }
      
        this.centerEl.style.display = "none";
      }
      
    
    
  }
  
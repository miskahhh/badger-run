export class MobileControls {
    constructor({ root, onLeft, onRight, onJump, onDuckStart, onDuckEnd, onRestart }) {
      this.root = root;
      this.onLeft = onLeft;
      this.onRight = onRight;
      this.onJump = onJump;
      this.onDuckStart = onDuckStart;
      this.onDuckEnd = onDuckEnd;
      this.onRestart = onRestart;
  
      this._mount();
    }
  
    _mount() {
      const wrap = document.createElement("div");
      wrap.setAttribute("aria-label", "Mobile Controls");
      wrap.style.position = "absolute";
      wrap.style.right = "12px";
      wrap.style.bottom = "12px";
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.gap = "10px";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "flex-end";
      wrap.style.pointerEvents = "auto";
      wrap.style.userSelect = "none";
      wrap.style.maxWidth = "260px";
  
      const btn = (label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "12px 14px";
        b.style.borderRadius = "14px";
        b.style.border = "1px solid rgba(255,255,255,0.25)";
        b.style.background = "rgba(0,0,0,0.45)";
        b.style.color = "white";
        b.style.backdropFilter = "blur(6px)";
        b.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
        b.style.fontSize = "14px";
        b.style.fontWeight = "600";
        b.style.cursor = "pointer";
        b.style.touchAction = "none";
        return b;
      };
  
      const leftBtn = btn("Left");
      leftBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          this.onLeft?.();
        },
        { passive: false }
      );
  
      const rightBtn = btn("Right");
      rightBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          this.onRight?.();
        },
        { passive: false }
      );
  
      const jumpBtn = btn("Jump");
      jumpBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          this.onJump?.();
        },
        { passive: false }
      );
  
      const duckBtn = btn("Duck");
      duckBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          this.onDuckStart?.();
        },
        { passive: false }
      );
  
      const endDuck = (e) => {
        e?.preventDefault?.();
        this.onDuckEnd?.();
      };
      duckBtn.addEventListener("pointerup", endDuck, { passive: false });
      duckBtn.addEventListener("pointercancel", endDuck, { passive: false });
      duckBtn.addEventListener("pointerleave", endDuck, { passive: false });
  
      const restartBtn = btn("Restart");
      restartBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          this.onRestart?.();
        },
        { passive: false }
      );
  
      wrap.appendChild(leftBtn);
      wrap.appendChild(rightBtn);
      wrap.appendChild(jumpBtn);
      wrap.appendChild(duckBtn);
      wrap.appendChild(restartBtn);
  
      this.root.appendChild(wrap);
      this.el = wrap;
    }
  }
  
  
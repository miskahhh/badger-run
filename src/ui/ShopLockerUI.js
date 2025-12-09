export class ShopLockerUI {
    constructor({ root, onBuySkin, onEquipSkin }) {
      this.root = root ?? document.body;
      this.onBuySkin = onBuySkin;
      this.onEquipSkin = onEquipSkin;
  
      this.activeTab = "shop"; // "shop" | "locker"
      this._lastSig = null;
  
      this._mount();
    }
  
    _mount() {
      const panel = document.createElement("div");
      panel.style.position = "absolute";
      panel.style.top = "110px";
      panel.style.left = "50%";
      panel.style.transform = "translateX(-50%)";
      panel.style.maxWidth = "420px";
      panel.style.width = "calc(100% - 32px)";
      panel.style.pointerEvents = "auto";
      panel.style.userSelect = "none";
      panel.style.background = "rgba(0,0,0,0.5)";
      panel.style.backdropFilter = "blur(8px)";
      panel.style.borderRadius = "18px";
      panel.style.boxShadow = "0 14px 40px rgba(0,0,0,0.35)";
      panel.style.padding = "10px 12px 10px";
      panel.style.color = "white";
      panel.style.fontFamily =
        "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      panel.style.fontSize = "13px";
      panel.style.display = "none";
  
      // stop the canvas from receiving taps through the panel
      panel.addEventListener("pointerdown", (e) => e.stopPropagation());
      panel.addEventListener("pointerup", (e) => e.stopPropagation());
  
      // header
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "10px";
  
      const title = document.createElement("div");
      title.textContent = "Shop & Locker";
      title.style.fontWeight = "800";
      title.style.fontSize = "14px";
  
      const coins = document.createElement("div");
      coins.style.fontWeight = "700";
      coins.style.fontSize = "13px";
      coins.style.opacity = "0.95";
      this.coinsEl = coins;
  
      header.appendChild(title);
      header.appendChild(coins);
  
      // tabs
      const tabs = document.createElement("div");
      tabs.style.display = "flex";
      tabs.style.gap = "6px";
      tabs.style.marginTop = "8px";
  
      const makeTab = (label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.flex = "1";
        btn.style.padding = "6px 8px";
        btn.style.borderRadius = "999px";
        btn.style.border = "1px solid rgba(255,255,255,0.25)";
        btn.style.background = "rgba(0,0,0,0.35)";
        btn.style.color = "white";
        btn.style.fontSize = "12px";
        btn.style.fontWeight = "600";
        btn.style.cursor = "pointer";
        btn.style.touchAction = "none";
        return btn;
      };
  
      this.shopTabBtn = makeTab("Shop");
      this.lockerTabBtn = makeTab("Locker");
  
      const setTab = (tab) => {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this._lastSig = null; // force re-render
      };
  
      this.shopTabBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTab("shop");
      });
  
      this.lockerTabBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTab("locker");
      });
  
      tabs.appendChild(this.shopTabBtn);
      tabs.appendChild(this.lockerTabBtn);
  
      // body
      const body = document.createElement("div");
      body.style.marginTop = "8px";
      body.style.maxHeight = "260px";
      body.style.overflowY = "auto";
      body.style.paddingRight = "4px";
      this.bodyEl = body;
  
      panel.appendChild(header);
      panel.appendChild(tabs);
      panel.appendChild(body);
  
      this.root.appendChild(panel);
      this.panel = panel;
    }
  
    _setTabStyles() {
      const styleTab = (btn, active) => {
        btn.style.background = active ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.35)";
        btn.style.fontWeight = active ? "700" : "600";
      };
      styleTab(this.shopTabBtn, this.activeTab === "shop");
      styleTab(this.lockerTabBtn, this.activeTab === "locker");
    }
  
    update(meta, ui) {
      // show only on READY state
      if (!ui || ui.state !== "ready") {
        this.panel.style.display = "none";
        this._lastSig = null;
        return;
      }
      this.panel.style.display = "block";
  
      if (!meta) return;
  
      const bank = meta.bankCoins ?? 0;
      this.coinsEl.textContent = `Coins: ${bank}`;
      this._setTabStyles();
  
      const owned = Array.isArray(meta.ownedSkins) ? meta.ownedSkins : [];
      const activeId = meta.activeSkinId ?? "classic";
  
      // signature: only re-render when these change
      const sig = JSON.stringify({
        tab: this.activeTab,
        bank,
        owned: owned.slice().sort(),
        activeId,
        skins: Object.keys(meta.skins || {}).sort(),
      });
  
      if (sig === this._lastSig) return;
      this._lastSig = sig;
  
      // rebuild body (now safe because actions are pointerdown)
      this.bodyEl.innerHTML = "";
  
      const skins = meta.skins || {};
      const ownedSet = new Set(owned);
  
      const allSkins = Object.values(skins).sort(
        (a, b) => (a.cost || 0) - (b.cost || 0)
      );
  
      const mkCard = (skin) => {
        const card = document.createElement("div");
        card.style.borderRadius = "12px";
        card.style.border = "1px solid rgba(255,255,255,0.16)";
        card.style.padding = "8px 9px";
        card.style.display = "flex";
        card.style.alignItems = "center";
        card.style.justifyContent = "space-between";
        card.style.gap = "8px";
        card.style.marginBottom = "6px";
        card.style.background = "rgba(0,0,0,0.35)";
  
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.flexDirection = "column";
        left.style.gap = "2px";
  
        const name = document.createElement("div");
        name.textContent = skin.name;
        name.style.fontWeight = "700";
        name.style.fontSize = "13px";
  
        const desc = document.createElement("div");
        desc.textContent = skin.description || "";
        desc.style.fontSize = "11px";
        desc.style.opacity = "0.8";
  
        left.appendChild(name);
        left.appendChild(desc);
  
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.flexDirection = "column";
        right.style.alignItems = "flex-end";
        right.style.gap = "4px";
  
        const price = document.createElement("div");
        price.style.fontSize = "11px";
        price.style.opacity = "0.9";
        price.textContent = skin.cost > 0 ? `${skin.cost} coins` : "Default";
  
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.padding = "5px 8px";
        btn.style.borderRadius = "999px";
        btn.style.border = "1px solid rgba(255,255,255,0.35)";
        btn.style.background = "rgba(0,0,0,0.65)";
        btn.style.color = "white";
        btn.style.fontSize = "11px";
        btn.style.fontWeight = "600";
        btn.style.cursor = "pointer";
        btn.style.touchAction = "none";
  
        right.appendChild(price);
        right.appendChild(btn);
  
        card.appendChild(left);
        card.appendChild(right);
  
        return { card, btn };
      };
  
      if (this.activeTab === "shop") {
        const forSale = allSkins.filter((s) => s.cost > 0 && !ownedSet.has(s.id));
  
        if (forSale.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = "All skins purchased — check your Locker!";
          empty.style.fontSize = "12px";
          empty.style.opacity = "0.85";
          this.bodyEl.appendChild(empty);
          return;
        }
  
        for (const skin of forSale) {
          const { card, btn } = mkCard(skin);
          const canAfford = bank >= (skin.cost || 0);
  
          btn.textContent = canAfford ? "Buy" : "Not enough";
          btn.disabled = !canAfford;
          btn.style.opacity = canAfford ? "1" : "0.6";
  
          btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canAfford) return;
            this.onBuySkin?.(skin.id);
            this._lastSig = null; // force refresh next frame
          });
  
          this.bodyEl.appendChild(card);
        }
      } else {
        const ownedSkins = allSkins.filter((s) => ownedSet.has(s.id));
  
        for (const skin of ownedSkins) {
          const { card, btn } = mkCard(skin);
  
          if (skin.id === activeId) {
            btn.textContent = "Equipped";
            btn.disabled = true;
            btn.style.opacity = "0.9";
            btn.style.background = "rgba(72,187,120,0.7)";
            btn.style.borderColor = "rgba(72,187,120,0.9)";
          } else {
            btn.textContent = "Equip";
            btn.disabled = false;
  
            btn.addEventListener("pointerdown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.onEquipSkin?.(skin.id);
              this._lastSig = null; // force refresh next frame
            });
          }
  
          this.bodyEl.appendChild(card);
        }
      }
    }
  }
  
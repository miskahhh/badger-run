import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class AssetManager {
  constructor() {
    this.texLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this.textures = new Map();
    this.models = new Map();
  }

  async loadTexture(key, url, { repeat = null } = {}) {
    if (this.textures.has(key)) return this.textures.get(key);

    const tex = await new Promise((resolve) => {
      this.texLoader.load(url, (t) => resolve(t), undefined, () => resolve(null));
    });

    if (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat.x, repeat.y);
      }
    }

    this.textures.set(key, tex);
    return tex;
  }

  async loadGLTF(key, url) {
    if (this.models.has(key)) return this.models.get(key);

    const root = await new Promise((resolve) => {
      this.gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    });

    if (root) root.traverse((o) => (o.frustumCulled = true));
    this.models.set(key, root);
    return root;
  }

  getTexture(key) {
    return this.textures.get(key) ?? null;
  }

  getModel(key) {
    return this.models.get(key) ?? null;
  }
}

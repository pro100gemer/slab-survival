import * as THREE from 'three';

export class Grid {
  constructor(scene, size = 5) {
    this.scene = scene;
    this.size = size;
    this.cellSize = 2; // Size of each tile in world units
    this.heights = Array(size).fill().map(() => Array(size).fill(0));

    this.initBase();
  }

  initBase() {
    // Create a base platform
    const geometry = new THREE.BoxGeometry(this.size * this.cellSize, 1, this.size * this.cellSize);
    // Lighter, less metallic base
    const material = new THREE.MeshStandardMaterial({
      color: 0x333344,
      roughness: 0.6,
      metalness: 0.2
    });
    const base = new THREE.Mesh(geometry, material);
    base.position.y = -0.5; // Top surface at y=0
    base.receiveShadow = true;
    this.scene.add(base);

    // Create grid lines/tiles visual (Clean tiles)
    const tileGeo = new THREE.PlaneGeometry(this.cellSize * 0.95, this.cellSize * 0.95);
    const tileMat = new THREE.MeshStandardMaterial({
      color: 0x444455,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });

    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.rotation.x = -Math.PI / 2;
        const pos = this.getWorldPosition(x, z);
        tile.position.set(pos.x, 0.05, pos.z); // Slightly above base to avoid Z-fighting
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }
  }

  // Convert grid coordinates (0..4) to world coordinates (centered at 0,0)
  getWorldPosition(gridX, gridZ) {
    const offset = (this.size - 1) * this.cellSize / 2;
    return {
      x: gridX * this.cellSize - offset,
      z: gridZ * this.cellSize - offset
    };
  }

  getHeight(x, z) {
    if (this.isValid(x, z)) {
      return this.heights[x][z];
    }
    return Infinity; // Out of bounds is infinitely high
  }

  incrementHeight(x, z) {
    if (this.isValid(x, z)) {
      this.heights[x][z]++;
      return this.heights[x][z];
    }
    return -1;
  }

  isValid(x, z) {
    return x >= 0 && x < this.size && z >= 0 && z < this.size;
  }
}

import * as THREE from 'three';

export class SlabManager {
    constructor(scene, grid, player, particleSystem, onGameOver, game, soundManager) {
        this.scene = scene;
        this.grid = grid;
        this.player = player;
        this.particleSystem = particleSystem;
        this.onGameOver = onGameOver;
        this.game = game;
        this.soundManager = soundManager;

        this.slabs = [];
        this.activeWarnings = [];
        // Track blocks that are coming but haven't landed yet
        this.incomingSlabs = Array(this.grid.size).fill().map(() => Array(this.grid.size).fill(0));
        this.lastSpawnTime = 0;
        this.spawnInterval = 1500;

        this.eventModes = {
            blockRain: false
        };

        this.brightness = 1.0;
        this.baseColor = new THREE.Color(0xFF8800);
        this.spawningEnabled = true; // Control flag
        this.targetFillHeight = -1; // -1 means disabled

        // Exposed so other systems (e.g. ApocalypseEvent) can read current timing
        this.currentInterval = 3000;
        this.currentWarningTime = 2000;

        // Shared resources (Optimization Point 1)
        this.sharedGeometry = new THREE.BoxGeometry(1.9, 1, 1.9);
        this.sharedMaterial = new THREE.MeshStandardMaterial({
            color: this.baseColor.clone().multiplyScalar(this.brightness),
            roughness: 0.1,
            metalness: 0.1,
        });

        const edges = new THREE.EdgesGeometry(this.sharedGeometry);
        this.sharedEdgeGeometry = edges;
        this.sharedEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

        this.sharedShadowGeometry = new THREE.PlaneGeometry(1.8, 1.8);
        this.sharedShadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.0,
        });
    }

    setEventMode(mode, active) {
        if (this.eventModes.hasOwnProperty(mode)) {
            this.eventModes[mode] = active;
        }
    }

    update(dt) {
        if (!this.game || !this.game.isRunning || this.game.isPaused || !this.grid) return;

        this.lastSpawnTime += dt;

        // Calculate difficulty-based interval (Exponential curve for smooth progression)
        const timeFactor = Math.min(this.game.elapsedTime / 60000, 1);
        const heightFactor = Math.min(this.game.lookAtHeight / 50, 1);
        const rawFactor = Math.max(timeFactor, heightFactor);

        // Exponential curve: slow start, fast end
        const difficultyFactor = 1 - Math.pow(0.85, rawFactor * 100);

        let currentInterval = 3000 - (2500 * difficultyFactor);

        // User override: FAST spawning for events
        if (this.targetFillHeight !== -1) {
            currentInterval = 300; // Rapid fire
        } else if (this.eventModes.blockRain) {
            currentInterval = 750;
        }

        if (this.lastSpawnTime >= currentInterval) {
            this.lastSpawnTime -= currentInterval;

            const warningTime = 2000 * (1 - difficultyFactor * 0.5);

            // Keep public for other systems to read
            this.currentInterval = currentInterval;
            this.currentWarningTime = warningTime;

            if (this.targetFillHeight !== -1) {
                // FILL MODE: Spawn blocks in all gaps below targetFillHeight
                let spawnedAny = false;
                // Find potential gaps
                const gaps = [];
                for (let x = 0; x < this.grid.size; x++) {
                    for (let z = 0; z < this.grid.size; z++) {
                        const h = this.grid.getHeight(x, z);
                        const incoming = this.incomingSlabs[x] ? this.incomingSlabs[x][z] : 0;
                        const totalH = (h === Infinity ? 0 : h) + incoming;
                        if (!isNaN(totalH) && totalH < this.targetFillHeight) {
                            gaps.push({ x, z });
                        }
                    }
                }

                if (gaps.length > 0) {
                    // Spawn up to 5 gaps at a time for smooth "filling"
                    const count = Math.min(gaps.length, 5);
                    // Shuffle or just pick first few? First few is fine since it runs every interval.
                    for (let i = 0; i < count; i++) {
                        const pos = gaps[i];
                        this.spawnWarning(pos.x, pos.z, 1000); // Faster fall for transition
                    }
                    spawnedAny = true;
                }

                if (!spawnedAny) {
                    // All gaps filled? We can potentially stop here or wait.
                }
            } else if (this.spawningEnabled) {
                if (this.eventModes.blockRain) {
                    // Event: Spawn 3-4 blocks in UNIQUE locations
                    const count = 3 + Math.floor(Math.random() * 2);
                    const chosenCoords = new Set();

                    for (let i = 0; i < count; i++) {
                        const pos = this.getSpawnPosition(chosenCoords);
                        if (pos) {
                            chosenCoords.add(`${pos.x},${pos.z}`);
                            this.spawnWarning(pos.x, pos.z, warningTime);
                        }
                    }
                } else {
                    // Normal spawn
                    const pos = this.getSpawnPosition();
                    this.spawnWarning(pos.x, pos.z, warningTime);
                }
            }
        }
    }

    spawnWarning(x, z, delay = 2000) {
        if (!this.grid.isValid(x, z)) return;

        // Visual warning (Dynamic Shadow) - Use shared resources
        const shadow = new THREE.Mesh(this.sharedShadowGeometry, this.sharedShadowMaterial.clone());
        shadow.rotation.x = -Math.PI / 2;

        const worldPos = this.grid.getWorldPosition(x, z);

        // Track that a slab is coming to this tile (Reservation)
        this.incomingSlabs[x][z]++;

        // Calculate target height for this slab: already landed + incoming before this one
        const currentLandedHeight = this.grid.getHeight(x, z);
        const targetHeight = currentLandedHeight + (this.incomingSlabs[x][z] - 1);

        shadow.position.set(worldPos.x, targetHeight * 1.0 + 0.07, worldPos.z);

        this.scene.add(shadow);

        // Animate shadow opacity/scale via central tween (game-speed scaled)
        this.game.addTween(delay, (t) => {
            shadow.scale.set(t, t, t);
            shadow.material.opacity = 0.6 * (1 - Math.pow(1 - t, 3));
        }, () => {
            this.dropSlab(x, z, targetHeight, shadow);
        }, true /* useGameDelta */);
    }

    dropSlab(x, z, targetHeight, shadowMesh) {
        // Optimization: Use shared geometry and material
        const slab = new THREE.Mesh(this.sharedGeometry, this.sharedMaterial);

        const wireframe = new THREE.LineSegments(this.sharedEdgeGeometry, this.sharedEdgeMaterial);
        slab.add(wireframe);

        const worldPos = this.grid.getWorldPosition(x, z);
        const finalY = targetHeight * 1.0 + 0.5;

        const startY = this.game.targetLookAtHeight + 20;
        slab.position.set(worldPos.x, startY, worldPos.z);
        slab.castShadow = true;
        slab.receiveShadow = true;
        this.scene.add(slab);

        // Animate block falling via central tween (game-speed scaled)
        this.game.addTween(500, (t) => {
            if (!this.game.isRunning) return;
            const easeT = t * t * t; // easeInCubic gravity feel
            slab.position.y = startY + (finalY - startY) * easeT;
            if (shadowMesh) {
                shadowMesh.material.opacity = 0.6 * (1 - t);
            }
            if (this.checkCollision(x, z, slab.position.y)) {
                if (shadowMesh) this.cleanupShadow(shadowMesh);
                // Remove this tween early by forcing elapsed to duration
                // (We can't cancel directly, but collision triggers game over so it's fine)
            }
        }, () => {
            slab.position.y = finalY;
            this.landSlab(x, z, slab, shadowMesh);
            this.optimizeOldSlabs();
        }, true /* useGameDelta */);
    }

    optimizeOldSlabs() {
        // Optimization: Disable shadows for far blocks, DELETE very old blocks
        const playerY = this.player.mesh.position.y;
        const shadowThreshold = 15; // Disable shadows 15 units below
        const deleteThreshold = 50; // DELETE blocks 50 units below

        // Filter and clean up old slabs
        this.slabs = this.slabs.filter(slab => {
            const distanceBelow = playerY - slab.position.y;

            // Delete very old blocks (MEMORY LEAK FIX)
            if (distanceBelow > deleteThreshold) {
                this.scene.remove(slab);
                // Dispose of children (wireframe edges)
                slab.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material && child.material !== this.sharedEdgeMaterial) child.material.dispose(); // Only dispose if not shared
                });
                // Note: slab's main geometry and material are shared, don't dispose them
                return false; // Remove from array
            }

            // Disable shadows for far blocks
            if (distanceBelow > shadowThreshold) {
                if (slab.castShadow) slab.castShadow = false;
                if (slab.receiveShadow) slab.receiveShadow = false;
            } else {
                // Keep/restore shadows for blocks near player
                if (!slab.castShadow) slab.castShadow = true;
                if (!slab.receiveShadow) slab.receiveShadow = true;
            }

            return true; // Keep in array
        });
    }

    checkCollision(x, z, slabY) {
        if (!this.game.isRunning) return false;

        // God Mode: No death
        if (this.player.isGodMode) return false;

        const isAtTile = (this.player.gridX === x && this.player.gridZ === z) ||
            (this.player.isMoving && this.player.startGridX === x && this.player.startGridZ === z);

        if (isAtTile) {
            const slabBase = slabY - 0.5;
            const pY = this.player.mesh.position.y;
            const playerTop = pY + 0.75;

            if (slabBase < playerTop) {
                this.onGameOver("Crushed!");
                return true;
            }
        }
        return false;
    }

    landSlab(x, z, slabMesh, shadowMesh) {
        if (this.checkCollision(x, z, slabMesh.position.y)) {
            if (shadowMesh) this.cleanupShadow(shadowMesh);
            return;
        }

        // Cleanup shadow
        if (shadowMesh) this.cleanupShadow(shadowMesh);

        this.slabs.push(slabMesh); // Track the slab

        this.grid.incrementHeight(x, z);
        this.incomingSlabs[x][z] = Math.max(0, this.incomingSlabs[x][z] - 1);

        const slabTop = this.grid.getHeight(x, z) * 1.0;
        const particlePos = new THREE.Vector3(
            slabMesh.position.x,
            slabTop,
            slabMesh.position.z
        );
        this.particleSystem.spawn(particlePos, slabMesh.material.color.getHex(), 10, 0.2);
        this.soundManager.playLandSound();

        // Squash & Stretch animation via central tween
        slabMesh.scale.set(1.1, 0.8, 1.1);
        this.game.addTween(150, (t) => {
            const e = 1 - Math.pow(1 - t, 3);
            slabMesh.scale.set(1.1 - 0.1 * e, 0.8 + 0.2 * e, 1.1 - 0.1 * e);
        }, () => {
            slabMesh.scale.set(1, 1, 1);
        });

        // Trigger Screen Shake ONLY during event
        if (this.eventModes.blockRain) {
            this.game.triggerShake(0.6, 200);
        }
    }

    cleanupShadow(shadow) {
        this.scene.remove(shadow);
        // Do NOT dispose shared material/geometry here, only the cloned material if used
        if (shadow.material && shadow.material !== this.sharedShadowMaterial) {
            shadow.material.dispose();
        }
    }

    adjustBrightness(delta) {
        this.brightness += delta;
        // Clamp brightness
        this.brightness = Math.max(0.1, Math.min(3.0, this.brightness));

        // Optimization: Shared material updates all blocks instantly!
        this.sharedMaterial.color.copy(this.baseColor.clone().multiplyScalar(this.brightness));
    }

    getSpawnPosition(excludeSet = null) {
        // Calculate min and max heights
        let minHeight = Infinity;
        let maxHeight = -Infinity;

        for (let x = 0; x < this.grid.size; x++) {
            for (let z = 0; z < this.grid.size; z++) {
                // Check if this coordinate is excluded
                if (excludeSet && excludeSet.has(`${x},${z}`)) continue;

                // Use tracked incoming slabs for height calculation to prevent race conditions
                const incoming = this.incomingSlabs[x][z];
                const gridH = this.grid.getHeight(x, z);
                const totalH = gridH + incoming;

                if (totalH < minHeight) minHeight = totalH;
                if (totalH > maxHeight) maxHeight = totalH;
            }
        }

        const difference = maxHeight - minHeight;
        const candidates = [];
        const maxDiff = this.game.maxHeightDiff !== undefined ? this.game.maxHeightDiff : 10;

        for (let x = 0; x < this.grid.size; x++) {
            for (let z = 0; z < this.grid.size; z++) {
                // Ensure this position doesn't already have an incoming block (DUPLICATION FIX)
                if (this.incomingSlabs[x][z] > 0) continue;

                // Check if this coordinate is excluded
                if (excludeSet && excludeSet.has(`${x},${z}`)) continue;

                const incoming = this.incomingSlabs[x][z];
                const gridH = this.grid.getHeight(x, z);
                const totalH = gridH + incoming;

                // Check if height is within acceptable range
                if (totalH <= minHeight + maxDiff) {
                    candidates.push({ x, z });
                }
            }
        }

        if (candidates.length === 0) {
            // Fallback: pick any valid position without incoming blocks
            for (let x = 0; x < this.grid.size; x++) {
                for (let z = 0; z < this.grid.size; z++) {
                    if (excludeSet && excludeSet.has(`${x},${z}`)) continue;
                    if (this.incomingSlabs[x][z] === 0) {
                        return { x, z };
                    }
                }
            }
            return null; // No valid position
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

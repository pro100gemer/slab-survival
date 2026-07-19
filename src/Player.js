import * as THREE from 'three';

export class Player {
    constructor(scene, grid, particleSystem, game) {
        this.scene = scene;
        this.grid = grid;
        this.particleSystem = particleSystem;
        this.game = game;

        // Start at center
        this.gridX = Math.floor(grid.size / 2);
        this.gridZ = Math.floor(grid.size / 2);

        this.mesh = this.createMesh();
        this.scene.add(this.mesh);

        this.updatePosition(false); // Instant update

        this.isMoving = false;
        this.canDoubleJump = false;
        this.doubleJumpEnabled = false; // Toggleable, default OFF
        this.currentJumpDir = null;
        this.jumptween = null; // Store animation frame request to cancel if needed
        this.jumpStartHeight = 0;

        this.isGodMode = false;
        this.godY = undefined;
        this.startGridX = this.gridX; // Track for collision while moving
        this.startGridZ = this.gridZ;

        // Wind / Storm State
        this.isWindActive = false;
        this.windSpeedX = 0;
        this.windOffsetX = 0; // Local offset within the block due to wind
        this.windResistanceCooldown = 0; // Debounce for resistance
        this.isAscending = false; // Animation state
        this.prevGodMode = false; // To restore after ascension
    }

    createMesh() {
        const group = new THREE.Group();

        // Capsule shape: Radius 0.25, Length 0.5 (total height ~1.0)
        // Three.js CapsuleGeometry(radius, length, capSubdivisions, radialSegments)
        const geometry = new THREE.CapsuleGeometry(0.25, 0.5, 4, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00cccc, // Cyan/Teal
            roughness: 0.3,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;

        // Offset mesh UP so the bottom of the capsule is at group's (0,0,0)
        mesh.position.y = 0.5;

        group.add(mesh);
        return group;
    }

    move(dx, dz) {
        if (this.isAscending) return; // Block input during ascension

        if (this.isGodMode) {
            // GOD MODE MOVEMENT: Ignore collisions and restrictions
            const newX = this.gridX + dx;
            const newZ = this.gridZ + dz;

            // Check boundaries only
            if (newX < 0 || newX >= this.grid.size || newZ < 0 || newZ >= this.grid.size) return;

            this.gridX = newX;
            this.gridZ = newZ;
            this.updatePosition(true);
            return;
        }

        // Double Jump Logic
        if (this.isMoving) {
            if (this.canDoubleJump &&
                this.doubleJumpEnabled && // Check enabled flag
                this.currentJumpDir &&
                this.currentJumpDir.dx === dx &&
                this.currentJumpDir.dz === dz) {

                this.performDoubleJump(dx, dz);
            }
            return;
        }

        const newX = this.gridX + dx;
        const newZ = this.gridZ + dz;

        if (!this.grid.isValid(newX, newZ)) return;

        // WIND MECHANIC: COUNTER-ACTION
        // If moving against the wind drift:
        let isCounterAction = false;

        if (this.isWindActive && Math.abs(this.windOffsetX) > 0.05) {
            if (this.windOffsetX > 0.1 && dx < 0) {
                isCounterAction = true;
            } else if (this.windOffsetX < -0.1 && dx > 0) {
                isCounterAction = true;
            }
        }

        if (isCounterAction) {
            // RESIST WIND: animate correction via game tween
            this.isMoving = true;
            const startX = this.mesh.position.x;
            const targetX = this.grid.getWorldPosition(this.gridX, this.gridZ).x;
            const startY = this.mesh.position.y;
            this.windOffsetX = 0;

            this.game.addTween(150, (t) => {
                this.mesh.position.x = startX + (targetX - startX) * t;
                this.mesh.position.y = startY + 0.3 * Math.sin(t * Math.PI);
            }, () => {
                this.isMoving = false;
                this.mesh.position.y = startY;
                this.updatePosition(true);
            });
            return;
        }

        // Normal Move: Success, so reset wind offset
        this.windOffsetX = 0;

        const currentHeight = this.grid.getHeight(this.gridX, this.gridZ);
        const targetHeight = this.grid.getHeight(newX, newZ);

        // Climbing logic: can only climb up 1 block max
        // Can always jump down
        if (targetHeight - currentHeight > 1) return;

        this.jumpStartHeight = currentHeight; // Track where we started for double jump logic

        this.startGridX = this.gridX;
        this.startGridZ = this.gridZ;
        this.gridX = newX;
        this.gridZ = newZ;

        this.currentJumpDir = { dx, dz };
        this.canDoubleJump = true; // Enable double jump at start of jump

        this.updatePosition(true);
    }

    performDoubleJump(dx, dz) {
        // Calculate potential new target
        const newX = this.gridX + dx;
        const newZ = this.gridZ + dz;

        if (!this.grid.isValid(newX, newZ)) return;

        // Constraint: Target height must be <= start of the JUMP chain
        // This allows jumping over a gap (hole) if the destination is reachable from original height
        const newTargetHeight = this.grid.getHeight(newX, newZ);

        if (newTargetHeight > this.jumpStartHeight) return;

        // Valid double jump
        this.canDoubleJump = false; // Consume double jump
        this.startGridX = this.gridX;
        this.startGridZ = this.gridZ;
        this.gridX = newX;
        this.gridZ = newZ;

        // Normal Move (or moving WITH wind)
        // If moving with wind, we keep the offset? Or reset it?
        // Let's reset it to 0 on a successful jump to a new block, 
        // effectively "landing safely".
        this.windOffsetX = 0;

        // Cancel existing animation? 
        // Ideally we just start a new animation from CURRENT position
        if (this.jumptween) cancelAnimationFrame(this.jumptween);

        // Visual feedback
        this.particleSystem.spawn(this.mesh.position, 0xffffff, 10, 0.1);

        this.updatePosition(true, true); // true, true = animate, isDoubleJump
    }

    updatePosition(animate = true, isDoubleJump = false) {
        const worldPos = this.grid.getWorldPosition(this.gridX, this.gridZ);
        const height = this.grid.getHeight(this.gridX, this.gridZ);

        let finalY = (height) * 1.0;
        if (this.isGodMode) {
            if (this.godY === undefined || isNaN(this.godY)) this.godY = this.mesh.position.y;
            finalY = this.godY;
        }
        if (isNaN(finalY)) finalY = height; // Fallback

        if (animate) {
            this.isMoving = true;
            const startX = this.mesh.position.x;
            const startZ = this.mesh.position.z;
            const startY = this.mesh.position.y;
            const duration = isDoubleJump ? 250 : 200;

            this.game.addTween(duration, (t) => {
                this.mesh.position.x = startX + (worldPos.x - startX) * t;
                this.mesh.position.z = startZ + (worldPos.z - startZ) * t;

                const jumpHeight = this.isGodMode ? 0 : (isDoubleJump ? 1.0 : 0.8);
                const arc = 4 * jumpHeight * t * (1 - t);
                this.mesh.position.y = startY + (finalY - startY) * t + arc;

                // Squash & Stretch
                if (t < 0.3) {
                    const s = t / 0.3;
                    this.mesh.scale.set(0.9, 1.0 + 0.2 * s, 0.9);
                } else if (t > 0.7) {
                    const s = (t - 0.7) / 0.3;
                    this.mesh.scale.set(1.0, 1.2 - 0.2 * s, 1.0);
                } else {
                    this.mesh.scale.set(1.0, 1.2, 1.0);
                }

                // Trail
                this.particleSystem.spawn(this.mesh.position, 0x00ffff, 1, 0.02);
            }, () => {
                // Landing
                this.mesh.position.set(worldPos.x, finalY, worldPos.z);
                this.isMoving = false;
                this.startGridX = this.gridX;
                this.startGridZ = this.gridZ;
                this.canDoubleJump = false;
                this.currentJumpDir = null;

                if (!this.isGodMode) {
                    this.particleSystem.spawn(this.mesh.position, 0x00ffff, 5, 0.1);
                }

                // Land squash tween
                this.mesh.scale.set(1.1, 0.8, 1.1);
                this.game.addTween(100, (t) => {
                    const e = 1 - Math.pow(1 - t, 3);
                    this.mesh.scale.set(1.1 - 0.1 * e, 0.8 + 0.2 * e, 1.1 - 0.1 * e);
                }, () => {
                    this.mesh.scale.set(1, 1, 1);
                });
            });
        } else {
            this.mesh.position.set(worldPos.x, finalY, worldPos.z);
        }
    }

    setDoubleJumpEnabled(enabled) {
        this.doubleJumpEnabled = enabled;
    }

    setWindMode(active, intensity = 1.0) {
        this.isWindActive = active;
        if (active) {
            // Random direction: Left (-1) or Right (+1)
            const dir = Math.random() > 0.5 ? 1 : -1;
            // Speed: ~0.1 to 0.2 units per second? 
            // In implementation plan: "windSpeedX * dt". 
            // If dt is in ms, speed should be very small, e.g. 0.0005 units/ms -> 0.5 units/sec.
            // Let's use 0.0003 * intensity.
            // Speed: Reduced per user request ("chut' po medlenee")
            // Was 0.0004, slowing down to 0.00015 (approx 2.5x slower)
            this.windSpeedX = dir * 0.00015 * intensity;
            console.log(`Wind started: Direction ${dir > 0 ? 'RIGHT' : 'LEFT'}`);
        } else {
            this.windSpeedX = 0;
            // Optionally clear offset gradually? Or keep it?
            // Let's keep offset, player has to correct it or jump.
        }
    }

    update(dt) {
        if (this.isWindActive && !this.isMoving && !this.isGodMode) {
            // Apply wind drift
            let nextOffset = this.windOffsetX + this.windSpeedX * dt;
            const dir = Math.sign(this.windSpeedX);

            // Boundary check: Crossed the edge (0.5)
            if (dir !== 0 && Math.abs(nextOffset) > 0.5) {
                const nextGridX = this.gridX + dir;

                const isValidNeighbor = this.grid.isValid(nextGridX, this.gridZ);
                let neighborHeight = -999;
                const currentHeight = this.grid.getHeight(this.gridX, this.gridZ);

                if (isValidNeighbor) {
                    neighborHeight = this.grid.getHeight(nextGridX, this.gridZ);
                }

                // Logic:
                // 1. Same level or drop (Traversable): Transition to next block
                // 2. Wall (Higher): Clamp against it
                // 3. Pit/Void: Fall (Transition physically but no grid update? Or just let offset grow -> death)

                if (isValidNeighbor && neighborHeight <= currentHeight + 0.5 && neighborHeight > -999) {
                    // +0.5 wiggle room, mostly checking if it's not a wall (height > current+1)
                    // Actually, let's say purely traversable is <= currentHeight + 0.5 (ignoring climb for drift)

                    if (neighborHeight > currentHeight + 1) {
                        // WALL: Clamp
                        this.windOffsetX = 0.5 * dir;
                    } else {
                        // WALKAWAY / DROP: Transition
                        // Move to next grid cell
                        this.gridX = nextGridX;
                        // Wrap offset:
                        // If we moved Right (+1), old offset 0.55 becomes -0.45 relative to new center
                        // If we moved Left (-1), old offset -0.55 becomes 0.45 relative to new center
                        nextOffset = nextOffset - (dir * 1.0);
                        this.windOffsetX = nextOffset;

                        // Update tracking var for collision
                        this.startGridX = this.gridX;

                        // If it was a drop, we snap to new height?
                        // updatePosition wil handle visual Y
                        this.updatePosition(true); // Small animation to snap height?
                    }
                } else {
                    // VOID / PIT: Let it drift until 0.6 -> Death
                    this.windOffsetX = nextOffset;
                }
            } else {
                // Within bounds
                this.windOffsetX = nextOffset;
            }

            // Game Over Check (if fell off)
            if (Math.abs(this.windOffsetX) > 0.6) {
                this.game.gameOver("Blown off by Sandstorm!");
                return;
            }

            // Update visual position
            const worldPos = this.grid.getWorldPosition(this.gridX, this.gridZ);
            this.mesh.position.x = worldPos.x + this.windOffsetX;
        }
    }

    setGodMode(enabled, skipUpdate = false) {
        this.isGodMode = enabled;
        if (enabled) {
            this.mesh.children[0].material.color.setHex(0xff0000); // Red
            this.mesh.children[0].material.emissive.setHex(0xff0000);
            this.mesh.children[0].material.emissiveIntensity = 0.5;
            this.godY = this.mesh.position.y; // Capture current height
            this.windOffsetX = 0; // Reset wind on god mode
        } else {
            this.mesh.children[0].material.color.setHex(0x00cccc); // Cyan
            this.mesh.children[0].material.emissive.setHex(0x000000);
            this.mesh.children[0].material.emissiveIntensity = 0;
            // Snap to ground
            if (!skipUpdate) this.updatePosition(true);
        }
    }

    moveUp() {
        if (!this.isGodMode) return;
        if (this.godY === undefined || isNaN(this.godY)) this.godY = this.mesh.position.y;
        this.godY += 1.0;
        this.updatePosition(true);
    }

    moveDown() {
        if (!this.isGodMode) return;
        if (this.godY === undefined) this.godY = this.mesh.position.y;
        this.godY -= 1.0;
        this.updatePosition(true);
    }

    ascend() {
        if (this.isAscending) return;
        this.isAscending = true;

        // 0. Immortality: Store state and enable
        this.prevGodMode = this.isGodMode;
        this.isGodMode = true;

        // 1. Calculate Max Height across the grid
        let maxHeight = 0;
        try {
            for (let x = 0; x < this.grid.size; x++) {
                for (let z = 0; z < this.grid.size; z++) {
                    const h = this.grid.getHeight(x, z);
                    if (h !== Infinity && !isNaN(h)) {
                        maxHeight = Math.max(maxHeight, h);
                    }
                }
            }
        } catch (e) {
            console.error("Error calculating maxHeight:", e);
            maxHeight = this.mesh.position.y; // Fallback
        }

        console.log("Ascension Start! MaxHeight detected:", maxHeight);

        // 2. Coordinate with SlabManager
        if (this.game && this.game.slabManager) {
            this.game.slabManager.targetFillHeight = maxHeight;
            this.game.slabManager.spawningEnabled = false; // Disable normal random spawns
        }

        // 3. Visuals: White Aura
        const mesh = this.mesh.children[0];
        mesh.material.color.setHex(0xffffff);
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveIntensity = 1.0;

        // 4. Animation Target
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;

        const centerWorld = this.grid.getWorldPosition(Math.floor(this.grid.size / 2), Math.floor(this.grid.size / 2));
        const targetX = centerWorld.x;
        const targetZ = centerWorld.z;
        const targetY = maxHeight + 3; // Lower target height as requested

        // Phase 1: Rise tween (4 seconds)
        this.game.addTween(4000, (t) => {
            if (!this.isAscending) return;
            // Easing: EaseInOutQuad
            const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            this.mesh.position.x = startX + (targetX - startX) * e;
            this.mesh.position.z = startZ + (targetZ - startZ) * e;
            this.mesh.position.y = startY + (targetY - startY) * e;

            // Particles trailing downward
            if (Math.random() > 0.3) {
                const pPos = this.mesh.position.clone();
                pPos.x += (Math.random() - 0.5) * 2;
                pPos.z += (Math.random() - 0.5) * 2;
                this.particleSystem.spawn(pPos, 0xffffff, 1, 0.05, new THREE.Vector3(0, -0.2, 0));
            }
        }, () => {
            // Phase 2: Hold tween (500ms pause at the top)
            this.game.addTween(500, () => { }, () => {
                this.finishAscension(maxHeight);
            });
        });
    }

    finishAscension(targetLandingHeight) {
        this.isAscending = false;

        // Restore controls/physics
        this.isGodMode = this.prevGodMode;

        // Reset SlabManager
        if (this.game.slabManager) {
            this.game.slabManager.targetFillHeight = -1;
            this.game.slabManager.spawningEnabled = true;
        }

        // Notify game to restore speed
        if (this.game && this.game.onAscensionComplete) {
            this.game.onAscensionComplete();
        }

        // Store the new platform height in godY so the player actually lands there
        if (this.prevGodMode) {
            this.godY = targetLandingHeight;
        }

        // Restore Visuals & GodMode State
        this.setGodMode(this.prevGodMode, true);

        // Valid grid position
        this.gridX = Math.floor(this.grid.size / 2);
        this.gridZ = Math.floor(this.grid.size / 2);

        // Final snap to the new platform level
        this.updatePosition(true);
    }
}

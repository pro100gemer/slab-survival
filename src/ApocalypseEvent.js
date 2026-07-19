import * as THREE from 'three';

const HOUSE_W = 1.5;  // Width & depth of each house
const HOUSE_H = 4.0;  // Height of each house
// Note: TICK and DROP_DUR are read dynamically from slabManager at round-start
const EVENT_SPEED = 0.8;              // event runs at 0.8× block speed (÷ = slower)
const TOPPLE_DUR = 700 / EVENT_SPEED; // ms for domino fall

export class ApocalypseEvent {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.grid = game.grid;
        this.player = game.player;
        this.particleSystem = game.particleSystem;

        this.isActive = false;
        this.round = 0;
        this.maxRounds = 5;
        this._gameOverTriggered = false;

        this.houses = [];  // THREE.Group pivot objects
        this.arrows = [];  // THREE.ArrowHelper objects
        this.shadows = [];  // shadow planes
    }

    /** Called from Game.triggerApocalypse() */
    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.round = 0;
        this.houses = [];
        this.arrows = [];
        // Ascension creates the flat platform and flies player up.
        // We hook onAscensionComplete to start our sequence instead.
        this.game.triggerAscension();
    }

    /** Called by Game.onAscensionComplete when this event is active */
    onAscensionComplete() {
        // finishAscension re-enabled spawning — keep it OFF
        if (this.game.slabManager) {
            this.game.slabManager.spawningEnabled = false;
        }
        // Brief pause before first round
        this.game.addTween(800, () => { }, () => this.startRound(), true);
    }

    // ─────────────────────────────────────────────────────────────
    //  Round logic
    // ─────────────────────────────────────────────────────────────

    startRound() {
        const platformH = this._platformHeight();
        const N = 5; // houses per round
        const positions = this._randomPositions(N);
        // Direction for each house: toward the player
        const dirs = positions.map(pos => this._dirTowardPlayer(pos));

        // Match timing to current block-fall speed
        const sm = this.game.slabManager;
        const TICK = (sm ? sm.currentInterval : 2000) / EVENT_SPEED;
        const dropDur = (sm ? sm.currentWarningTime : 550) / EVENT_SPEED;

        const h = positions.map(pos => this._createHouse(pos, platformH));

        // Houses drop one per tick; arrow for house i appears one tick after its drop
        for (let i = 0; i < N; i++) {
            this._scheduleDrop(h[i], platformH, TICK * i);
            this._scheduleArrow(positions[i], dirs[i], platformH, TICK * (i + 1));
        }

        // All houses topple one tick after the last arrow
        const toppleDelay = TICK * (N + 1);
        for (let i = 0; i < N; i++) {
            this._scheduleTopple(h[i], dirs[i], platformH, toppleDelay);
        }

        // Standing-collision: while a house is upright (landed → topple), kill on touch
        for (let i = 0; i < N; i++) {
            const landDelay = TICK * i + dropDur; // when house i finishes dropping
            const standDur = toppleDelay - landDelay;
            if (standDur > 10) {
                const pivot = h[i];
                this.game.addTween(standDur, () => {
                    this._checkDropCollision(pivot); // reuse XZ+Y box check
                }, null, true /* useGameDelta */, landDelay);
            }
        }

        // After topple + buffer – next round or end
        const nextDelay = toppleDelay + TOPPLE_DUR + Math.max(400, TICK * 0.3);
        this.game.addTween(100, () => { }, () => {
            this._removeArrows();
            this.round++;
            if (this.round < this.maxRounds) {
                this.startRound();
            } else {
                this.end();
            }
        }, true /* useGameDelta */, nextDelay);
    }

    // ─────────────────────────────────────────────────────────────
    //  House creation
    // ─────────────────────────────────────────────────────────────

    _createHouse(gridPos, platformH) {
        const wp = this.grid.getWorldPosition(gridPos.x, gridPos.z);

        const pivot = new THREE.Group();
        pivot.position.set(wp.x, platformH + HOUSE_H + 22, wp.z);

        const wf = (geo) => new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );

        // ── Base plinth ──────────────────────────────────────────────
        const baseGeo = new THREE.BoxGeometry(2.0, 0.3, 2.0);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0xBB5500, roughness: 0.2, metalness: 0.1 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(0, 0.15, 0);
        base.castShadow = true;
        base.add(wf(baseGeo));
        pivot.add(base);

        // ── Main walls ───────────────────────────────────────────────
        const wallGeo = new THREE.BoxGeometry(1.8, 2.6, 1.8);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xFF8800, emissive: 0x2a1000, emissiveIntensity: 0.2,
            roughness: 0.15, metalness: 0.15,
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, 0.3 + 1.3, 0); // 0.3 base + half of 2.6 = 1.6
        wall.castShadow = true;
        wall.add(wf(wallGeo));
        pivot.add(wall);

        // ── Roof border (flat overhang before pyramid) ────────────────
        const borderGeo = new THREE.BoxGeometry(2.05, 0.15, 2.05);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x994400, roughness: 0.2 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.set(0, 0.3 + 2.6 + 0.075, 0); // on top of walls
        border.add(wf(borderGeo));
        pivot.add(border);

        // ── Pyramid roof (CylinderGeometry with 4 sides) ─────────────
        const roofGeo = new THREE.CylinderGeometry(0, 1.15, 1.1, 4, 1);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xCC4400, roughness: 0.25 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 0.3 + 2.6 + 0.15 + 0.55, 0); // on top of border
        roof.rotation.y = Math.PI / 4; // align pyramid corners to box corners
        roof.castShadow = true;
        roof.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(roofGeo),
            new THREE.LineBasicMaterial({ color: 0x000000 })
        ));
        pivot.add(roof);

        // Drop shadow on platform surface
        const shadowGeo = new THREE.PlaneGeometry(2.2, 2.2);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false,
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(wp.x, platformH + 0.06, wp.z);
        this.scene.add(shadow);
        this.shadows.push(shadow);
        pivot.userData = { groundY: platformH, shadow };

        this.scene.add(pivot);
        this.houses.push(pivot);
        return pivot;
    }


    // ─────────────────────────────────────────────────────────────
    //  Scheduled animations (use addTween delay)
    // ─────────────────────────────────────────────────────────────

    _scheduleDrop(pivot, platformH, delay) {
        const skyY = pivot.position.y;
        const landY = platformH;
        const sm = this.game.slabManager;
        const dropDur = (sm ? sm.currentWarningTime : 550) / EVENT_SPEED;

        this.game.addTween(dropDur, (t) => {
            const ease = t * t * t;
            pivot.position.y = skyY + (landY - skyY) * ease;

            // Animate shadow: fade in as house descends
            if (pivot.userData.shadow) {
                pivot.userData.shadow.material.opacity = 0.55 * t;
            }

            // Kill player if house hits them while falling
            this._checkDropCollision(pivot);
        }, () => {
            pivot.position.y = landY;

            // Remove shadow on landing
            if (pivot.userData.shadow) {
                this.scene.remove(pivot.userData.shadow);
                const si = this.shadows.indexOf(pivot.userData.shadow);
                if (si > -1) this.shadows.splice(si, 1);
                pivot.userData.shadow = null;
            }

            const mesh = pivot.children[0];
            if (mesh) {
                this.game.addTween(140, (t) => {
                    const e = 1 - Math.pow(1 - t, 3);
                    mesh.scale.set(1.15 - 0.15 * e, 0.85 + 0.15 * e, 1.15 - 0.15 * e);
                }, () => mesh.scale.set(1, 1, 1), true);

                const pos = new THREE.Vector3(pivot.position.x, platformH + 0.1, pivot.position.z);
                this.particleSystem.spawn(pos, 0xff4400, 10, 0.18);
                this.game.triggerShake(0.4, 180);

                if (this.game.soundManager) this.game.soundManager.playHouseImpactSound();
            }

            // Also kill if player is directly under the landed house
            this._checkDropCollision(pivot);
        }, true /* useGameDelta */, delay);
    }

    _scheduleArrow(gridPos, dir, platformH, delay) {
        this.game.addTween(16, () => { }, () => {
            const wp = this.grid.getWorldPosition(gridPos.x, gridPos.z);
            const origin = new THREE.Vector3(wp.x, platformH + 0.12, wp.z);
            const direction = new THREE.Vector3(dir.x, 0, dir.z).normalize();
            const arrow = new THREE.ArrowHelper(direction, origin, 2.2, 0xffee00, 0.65, 0.45);
            this.scene.add(arrow);
            this.arrows.push(arrow);
        }, true /* useGameDelta */, delay);
    }

    _scheduleTopple(pivot, dir, platformH, delay) {
        let startX = null;
        let startZ = null;

        this.game.addTween(TOPPLE_DUR, (t) => {
            if (startX === null) { startX = pivot.position.x; startZ = pivot.position.z; }
            const ease = t * t;
            const angle = (Math.PI * 0.42) * ease; // ~75°: falls but doesn't lie flat
            if (dir.x !== 0) {
                pivot.rotation.z = -dir.x * angle;
            } else {
                pivot.rotation.x = dir.z * angle;
            }

            // Kill player if they're in the topple sweep
            this._checkToppleCollision(startX, startZ, dir, ease);
        }, () => {
            const landX = (startX ?? pivot.position.x) + dir.x * HOUSE_H * 0.5;
            const landZ = (startZ ?? pivot.position.z) + dir.z * HOUSE_H * 0.5;
            const landPos = new THREE.Vector3(landX, platformH + 0.2, landZ);
            this.particleSystem.spawn(landPos, 0xff2200, 20, 0.28);
            this.game.triggerShake(0.7, 250);

            // Sound: heavy crash when toppled
            if (this.game.soundManager) this.game.soundManager.playHouseCrashSound();

            this.scene.remove(pivot);
            const idx = this.houses.indexOf(pivot);
            if (idx > -1) this.houses.splice(idx, 1);
        }, true /* useGameDelta */, delay);
    }

    // ─────────────────────────────────────────────────────────────
    //  Collision helpers
    // ─────────────────────────────────────────────────────────────

    _checkDropCollision(pivot) {
        if (!this.isActive || !this.player?.mesh || this._gameOverTriggered) return;
        const { x: px, z: pz, y: py } = this.player.mesh.position;
        const hx = pivot.position.x;
        const hz = pivot.position.z;
        const halfW = HOUSE_W / 2 + 0.35;
        if (Math.abs(px - hx) < halfW && Math.abs(pz - hz) < halfW) {
            // House bottom is at pivot.y, top at pivot.y + HOUSE_H
            const botY = pivot.position.y;
            const topY = botY + HOUSE_H;
            if (botY <= py + 1.2 && topY >= py - 0.5) {
                this._killPlayer();
            }
        }
    }

    _checkToppleCollision(hx, hz, dir, sweepProgress) {
        if (!this.isActive || !this.player?.mesh || this._gameOverTriggered) return;
        const { x: px, z: pz } = this.player.mesh.position;
        const halfW = HOUSE_W / 2 + 0.35;
        // Dot product along fall dir and perpendicular
        const along = (px - hx) * dir.x + (pz - hz) * dir.z;
        const perp = Math.abs((px - hx) * (-dir.z) + (pz - hz) * dir.x);
        const reach = sweepProgress * HOUSE_H + halfW;
        if (along >= -halfW && along <= reach && perp <= halfW) {
            this._killPlayer();
        }
    }

    _killPlayer() {
        if (this._gameOverTriggered) return;
        this._gameOverTriggered = true;
        // Re-use the same game-over path as SlabManager
        if (this.game.slabManager?.onGameOver) {
            this.game.slabManager.onGameOver();
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Cleanup & end
    // ─────────────────────────────────────────────────────────────

    _removeArrows() {
        for (const a of this.arrows) this.scene.remove(a);
        this.arrows = [];
    }

    _cleanup() {
        for (const h of this.houses) this.scene.remove(h);
        this.houses = [];
        for (const s of this.shadows) this.scene.remove(s);
        this.shadows = [];
        this._removeArrows();
    }

    end() {
        this.isActive = false;
        this._gameOverTriggered = false;
        this._cleanup();

        // Re-enable block spawning and clear any fill-mode state
        if (this.game.slabManager) {
            this.game.slabManager.spawningEnabled = true;
            this.game.slabManager.targetFillHeight = -1; // no fill mode left-over
            // Reset incoming-slab reservations to prevent stale block rain
            const sz = this.game.slabManager.incomingSlabs.length;
            for (let x = 0; x < sz; x++)
                for (let z = 0; z < sz; z++)
                    this.game.slabManager.incomingSlabs[x][z] = 0;
        }

        // Restore time scale
        if (this.game.oldTimeScale !== undefined) {
            this.game.timeScale = this.game.oldTimeScale;
            this.game.updateSpeedUI();
        }

        // Close out the EventManager cycle (ACTIVE → COOLDOWN → IDLE)
        if (this.game.eventManager) {
            this.game.eventManager.startCooldown();
        }

        this.game.apocalypseEvent = null;
    }

    // ─────────────────────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────────────────────

    _platformHeight() {
        const center = Math.floor(this.grid.size / 2);
        return this.grid.getHeight(center, center);
    }

    _randomPositions(count) {
        const center = Math.floor(this.grid.size / 2);
        const used = new Set([`${center},${center}`]); // exclude player spawn
        const result = [];
        let safety = 0;
        while (result.length < count && safety++ < 200) {
            const x = Math.floor(Math.random() * this.grid.size);
            const z = Math.floor(Math.random() * this.grid.size);
            const k = `${x},${z}`;
            if (!used.has(k)) {
                used.add(k);
                result.push({ x, z });
            }
        }
        return result;
    }

    _randDir() {
        const dirs = [
            { x: 1, z: 0 },
            { x: -1, z: 0 },
            { x: 0, z: 1 },
            { x: 0, z: -1 },
        ];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }

    /** Return the cardinal direction from a grid cell toward the player. */
    _dirTowardPlayer(gridPos) {
        const wp = this.grid.getWorldPosition(gridPos.x, gridPos.z);
        const pm = this.player?.mesh;
        if (!pm) return this._randDir(); // fallback if player missing

        const dx = pm.position.x - wp.x;
        const dz = pm.position.z - wp.z;

        // Pick the dominant axis, snap to one of the 4 cardinal directions
        if (Math.abs(dx) >= Math.abs(dz)) {
            return dx > 0 ? { x: 1, z: 0 } : { x: -1, z: 0 };
        } else {
            return dz > 0 ? { x: 0, z: 1 } : { x: 0, z: -1 };
        }
    }
}

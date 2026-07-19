import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Grid } from './Grid.js';
import { Player } from './Player.js';
import { SlabManager } from './SlabManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { EventManager } from './EventManager.js';
import { SoundManager } from './SoundManager.js';
import { InputManager } from './InputManager.js';
import { ApocalypseEvent } from './ApocalypseEvent.js';

export class Game {
    constructor() {
        this.container = document.getElementById('app');
        this.scoreElement = document.getElementById('score');
        this.heightElement = document.getElementById('height');
        this.finalScoreElement = document.getElementById('final-score');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.pauseOverlay = document.getElementById('pause-overlay');
        this.restartBtn = document.getElementById('restart-btn');

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null; // Post-processing

        this.grid = null;
        this.player = null;
        this.slabManager = null;
        this.particleSystem = null;
        this.soundManager = null;
        this.eventManager = null;

        this.doubleJumpEnabled = false;
        this.godModeEnabled = false;
        this.autoCameraEnabled = false;

        // UI Elements
        this.speedX1 = document.getElementById('speed-x1');
        this.speedX2 = document.getElementById('speed-x2');
        this.speedX20 = document.getElementById('speed-x20');

        // Double Jump UI
        this.djOn = document.getElementById('dj-on');
        this.djOff = document.getElementById('dj-off');

        // God Mode UI
        this.gmOn = document.getElementById('gm-on');
        this.gmOff = document.getElementById('gm-off');

        // Auto Camera UI
        this.acOn = document.getElementById('ac-on');
        this.acOff = document.getElementById('ac-off');

        this.isRunning = false;
        this.isPaused = false;

        this.startTime = 0;
        this.elapsedTime = 0; // Track game time manually
        this.lastFrameTime = 0;
        this.lastSpawnTime = 0;
        this.spawnInterval = 2000;
        this.timeScale = 1.0; // 1.0 = Normal, 2.0 = Fast
        this.oldTimeScale = 1.0;

        // Camera Rotation State
        this.cameraAngle = Math.PI / 4; // Start at 45 degrees
        this.cameraHeight = 15; // Start height
        this.targetCameraAngle = Math.PI / 4;
        this.targetCameraHeight = 15;
        this.rotationSpeed = 0.03; // Smooth gradual speed
        this.verticalSpeed = 0.2; // Speed for going up/down
        this.lookAtHeight = 1.0; // Current camera focus height (Starts at 1 block height)
        this.targetLookAtHeight = 1.0; // Target camera focus height (Locked to at least 1 block height)

        // Atmosphere State
        this.targetBgColor = new THREE.Color(0x1a1a2e);
        this.targetFogColor = new THREE.Color(0x1a1a2e);
        this.targetFogDensity = 0.005;
        this.currentBgColor = new THREE.Color(0x1a1a2e);
        this.currentFogColor = new THREE.Color(0x1a1a2e);

        // Smoothed State for Camera
        this.smoothedPlayerPos = new THREE.Vector3(0, 0, 0);

        // Screen Shake State
        this.shakeAmount = 0;
        this.shakeDuration = 0;
        this.shakeOffset = new THREE.Vector3(0, 0, 0);

        this.isSandstormActive = false;

        // Tween Registry (replaces scattered requestAnimationFrame calls)
        this.tweens = [];

        this.init();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510); // Deep space blue
        this.scene.fog = new THREE.Fog(0x050510, 10, 50);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Tone mapping for better detailed lighting
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);

        // --- Post-Processing (Bloom removed) ---
        // Just use standard renderer
        // this.composer = new EffectComposer(this.renderer); 
        // We will just render directly in animate loop

        // --- Lights ---
        // Brighter, cleaner background
        this.scene.background = new THREE.Color(0x1a1a2e); // Lighter blue-gray
        this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.005);

        // Ambient Light: SIGNIFICANTLY BRIGHTER for base visibility
        // White ambient light ensures nothing is pitch black
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Hemisphere Light: Natural sky/ground contrast
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1.0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5); // Clear key light
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        // High quality shadows
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.bias = -0.00005;
        this.scene.add(dirLight);

        // Fill light to soften shadows
        const fillLight = new THREE.DirectionalLight(0xaaccff, 0.5);
        fillLight.position.set(-10, 10, -10);
        this.scene.add(fillLight);

        // Components
        this.grid = new Grid(this.scene);
        this.soundManager = new SoundManager();
        this.particleSystem = new ParticleSystem(this.scene);
        this.player = new Player(this.scene, this.grid, this.particleSystem, this);
        this.slabManager = new SlabManager(this.scene, this.grid, this.player, this.particleSystem, this.gameOver.bind(this), this, this.soundManager);
        this.eventManager = new EventManager(this);

        // Input — delegated to InputManager
        this.inputManager = new InputManager(this);
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Page Visibility API: Pause when tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Tab is hidden - pause the game
                if (this.isRunning && !this.isPaused) {
                    this.togglePause();
                }
            }
        });

        this.restartBtn.addEventListener('click', () => {
            location.reload();
        });

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                if (this.soundManager) {
                    this.soundManager.setMasterVolume(vol);
                    if (this.soundManager.context.state === 'suspended') {
                        this.soundManager.context.resume();
                    }
                }
            });
            volumeSlider.addEventListener('keydown', (e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                    e.preventDefault();
                }
            });
        }

        const heightSlider = document.getElementById('height-diff-slider');
        const heightLabel = document.getElementById('height-diff-label');
        if (heightSlider && heightLabel) {
            heightSlider.addEventListener('input', (e) => {
                const diff = parseInt(e.target.value);
                this.maxHeightDiff = diff;
                heightLabel.innerText = diff;
            });
            heightSlider.addEventListener('keydown', (e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                    e.preventDefault();
                }
            });
        }

        this.startGame();
    }

    startGame() {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.elapsedTime = 0;
        this.lastSpawnTime = 0;

        // Start background sounds
        if (this.soundManager) {
            this.soundManager.startAtmosphere();
        }

        if (this.eventManager) this.eventManager.reset();
        this.animate();
    }

    /**
     * Add an animation to the central tween registry.
     * @param {number}   duration       Duration in ms (real time)
     * @param {Function} onUpdate       Called every frame with t ∈ [0, 1]
     * @param {Function} [onComplete]   Called once when t === 1
     * @param {boolean}  [useGameDelta] If true, elapsed time is scaled by timeScale
     * @param {number}   [delay]        Optional delay in ms before the tween starts
     */
    addTween(duration, onUpdate, onComplete = null, useGameDelta = false, delay = 0) {
        this.tweens.push({ elapsed: -delay, duration, onUpdate, onComplete, useGameDelta });
    }

    updateSpeedUI() {
        if (!this.speedX1 || !this.speedX2 || !this.speedX20) return;
        this.speedX1.classList.remove('active');
        this.speedX2.classList.remove('active');
        this.speedX20.classList.remove('active');

        if (this.timeScale === 1.0) {
            this.speedX1.classList.add('active');
        } else if (this.timeScale === 2.0) {
            this.speedX2.classList.add('active');
        } else if (this.timeScale === 20.0) {
            this.speedX20.classList.add('active');
        }
    }

    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.pauseOverlay.classList.remove('hidden');
        } else {
            this.pauseOverlay.classList.add('hidden');
            this.lastFrameTime = performance.now();
        }
        this.soundManager.playPauseSound();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    gameOver(reason) {
        console.log("Game Over:", reason);
        this.isRunning = false;
        this.gameOverScreen.classList.remove('hidden');
        const score = Math.floor(this.elapsedTime / 1000);
        this.finalScoreElement.innerText = score;
        this.player.mesh.visible = false; // Hide player (squished)
        this.soundManager.playGameOverSound();
    }

    animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(this.animate.bind(this));

        if (this.isPaused) return;

        const now = performance.now();
        // Calculate delta (in ms)
        let frameDelta = now - this.lastFrameTime;
        this.lastFrameTime = now;

        // Clamp frameDelta to prevent huge time jumps (e.g., after tab switch)
        // Max 100ms per frame (equivalent to 10 FPS minimum)
        frameDelta = Math.min(frameDelta, 100);

        // Apply Time Scale for GAME LOGIC
        const gameDelta = frameDelta * this.timeScale;
        this.elapsedTime += gameDelta;

        // Update Game Logic
        this.eventManager.update(gameDelta);
        this.slabManager.update(gameDelta);
        this.particleSystem.update(gameDelta);
        if (this.player) this.player.update(gameDelta);

        // --- Tween Registry: Process all active animations ---
        const survivingTweens = [];
        for (const tw of this.tweens) {
            tw.elapsed += tw.useGameDelta ? gameDelta : frameDelta;
            if (tw.elapsed < 0) { survivingTweens.push(tw); continue; } // still in delay
            const t = Math.min(tw.elapsed / tw.duration, 1);
            tw.onUpdate(t);
            if (t < 1) {
                survivingTweens.push(tw);
            } else if (tw.onComplete) {
                tw.onComplete();
            }
        }
        this.tweens = survivingTweens;


        // STORM PARTICLES: "Sandstorm" event
        // Check if it's sandstorm (Active or approaching)
        const isSandstorm = (this.eventManager.currentState === this.eventManager.states.ACTIVE && this.isSandstormActive) ||
            (this.eventManager.currentState === this.eventManager.states.WARNING && this.eventManager.nextEventType === 'sandstorm');

        if (isSandstorm) {
            // High-density storm spawning
            // Restore original parameters "we left"
            if (Math.random() > 0.1) { // 90% chance per frame
                for (let i = 0; i < 40; i++) {
                    const px = -20; // Original position
                    const pz = (Math.random() - 0.5) * 60;
                    const py = this.lookAtHeight + (Math.random() - 0.5) * 30;

                    const brownColors = [
                        0x5C4033, 0x3D2B1F, 0x8B4513, 0xA0522D, 0xD2691E,
                        0xCD853F, 0xBC8F8F, 0x7B3F00, 0x654321, 0x4B3621
                    ];
                    const color = brownColors[Math.floor(Math.random() * brownColors.length)];

                    // Original velocity "we left"
                    const windVelocity = new THREE.Vector3(0.35, 0.002, 0);
                    this.particleSystem.spawn(new THREE.Vector3(px, py, pz), color, 1, 0.05, windVelocity);
                }
            }
        }


        // Update Atmosphere (Lerp)
        this.currentBgColor.lerp(this.targetBgColor, 0.05);
        this.currentFogColor.lerp(this.targetFogColor, 0.05);
        this.scene.background.copy(this.currentBgColor);
        this.scene.fog.color.copy(this.currentFogColor);
        this.scene.fog.density += (this.targetFogDensity - this.scene.fog.density) * 0.05;

        // Update Audio Atmosphere
        if (this.soundManager && this.player) {
            const isEvent = this.eventManager.currentState !== this.eventManager.states.IDLE;
            this.soundManager.updateAtmosphere(this.player.mesh.position.y, isEvent);
        }

        // Update score UI (Uses Game Time)
        this.scoreElement.innerText = Math.floor(this.elapsedTime / 1000);

        // Update height UI
        if (this.heightElement) {
            this.heightElement.innerText = Math.floor(this.lookAtHeight);
        }

        // Update Camera Rotation (Horizontal)
        // frameDelta is in ms. Normalizing to 60fps (16.6ms) for consistent speed.
        const deltaFactor = frameDelta / 16.6;
        const scaledRotSpeed = this.rotationSpeed * deltaFactor;
        const scaledVertSpeed = this.verticalSpeed * deltaFactor;

        if (this.autoCameraEnabled && this.player && this.player.mesh) {
            // SMART CAMERA LOGIC:

            // 1. Smooth the player position to avoid sudden jumps
            this.smoothedPlayerPos.lerp(this.player.mesh.position, 0.05);

            // 2. Rotation: Passive rotation + decisive but smooth visibility correction
            const px = this.smoothedPlayerPos.x;
            const pz = this.smoothedPlayerPos.z;
            const distFromCenter = Math.sqrt(px * px + pz * pz);

            // Base passive rotation (0.003 radians)
            this.targetCameraAngle += 0.003;

            if (distFromCenter > 0.5) {
                // Ideal view angle is from the player side towards center
                const idealAngle = Math.atan2(px, pz);

                // CRITICAL: Handle wrap-around for angle interpolation (shortest path)
                let diff = idealAngle - (this.targetCameraAngle % (Math.PI * 2));
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                // Decisively nudge target angle towards ideal side (0.01 weight is safe but visible)
                this.targetCameraAngle += diff * 0.02;
            }

            // 3. Height: Ensure player is nicely framed (roughly at 40% height)
            const playerY = this.smoothedPlayerPos.y;
            this.targetCameraHeight = 15 + (playerY * 0.4);

        } else {
            // MANUAL CAMERA LOGIC:
            if (this.inputManager.isRotatingLeft) {
                this.targetCameraAngle += scaledRotSpeed;
            }
            if (this.inputManager.isRotatingRight) {
                this.targetCameraAngle -= scaledRotSpeed;
            }

            // Update Camera Height (Vertical)
            if (this.inputManager.isRotatingUp) {
                this.targetCameraHeight += scaledVertSpeed;
            }
            if (this.inputManager.isRotatingDown) {
                this.targetCameraHeight -= scaledVertSpeed;
            }
        }

        // Clamp Height to meaningful values (Manual or Auto)
        this.targetCameraHeight = Math.max(2, Math.min(40, this.targetCameraHeight));

        // Update Dynamic Camera Height (Lock to Maximum reached by player)
        if (this.player && this.player.mesh) {
            this.targetLookAtHeight = Math.max(this.targetLookAtHeight, this.player.mesh.position.y);
        }
        this.lookAtHeight += (this.targetLookAtHeight - this.lookAtHeight) * 0.05;

        // Smooth Interpolation
        this.cameraAngle += (this.targetCameraAngle - this.cameraAngle) * 0.1;
        this.cameraHeight += (this.targetCameraHeight - this.cameraHeight) * 0.1;

        // Update Camera Position (Orbit)
        const radius = 20;
        const camX = Math.sin(this.cameraAngle) * radius;
        const camZ = Math.cos(this.cameraAngle) * radius;

        // Apply Screen Shake
        if (this.shakeDuration > 0) {
            this.shakeDuration -= frameDelta;
            const currentIntensity = (this.shakeDuration / 200) * this.shakeAmount;
            this.shakeOffset.set(
                (Math.random() - 0.5) * currentIntensity,
                (Math.random() - 0.5) * currentIntensity,
                (Math.random() - 0.5) * currentIntensity
            );
        } else {
            this.shakeOffset.set(0, 0, 0);
        }

        // The camera Y position is offset by the dynamic look-at height
        this.camera.position.set(camX, this.cameraHeight + this.lookAtHeight, camZ);
        this.camera.position.add(this.shakeOffset); // Add shake offset

        this.camera.lookAt(0, this.lookAtHeight, 0);

        // Render directly (No Bloom)
        this.renderer.render(this.scene, this.camera);
    }

    setAtmosphere(mode) {
        if (mode === 'event') {
            // Cyberpunk Storm: Deep purple/indigo atmosphere (Block Rain)
            this.targetBgColor.set(0x150025);
            this.targetFogColor.set(0x150025);
            this.targetFogDensity = 0.012;
        } else if (mode === 'sandstorm') {
            this.targetBgColor.set(0x1a1005);
            this.targetFogColor.set(0x4d2600);
            this.targetFogDensity = 0.025;
        } else if (mode === 'apocalypse') {
            // Blood red / deep crimson
            this.targetBgColor.set(0x1a0000);
            this.targetFogColor.set(0x3a0000);
            this.targetFogDensity = 0.018;
        } else {
            // Restore Normal
            this.targetBgColor.set(0x1a1a2e);
            this.targetFogColor.set(0x1a1a2e);
            this.targetFogDensity = 0.005;
        }
    }

    setEventMode(mode, isActive) {
        if (mode === 'sandstorm') {
            this.isSandstormActive = isActive;
            if (this.player) {
                this.player.setWindMode(isActive, 2.5); // 2.5 units/sec wind speed
            }
        }
    }

    updateDoubleJumpUI() {
        if (this.doubleJumpEnabled) {
            this.djOn.classList.add('active');
            this.djOff.classList.remove('active');
        } else {
            this.djOn.classList.remove('active');
            this.djOff.classList.add('active');
        }
    }

    triggerShake(amount = 0.5, duration = 300) {
        this.shakeAmount = amount;
        this.shakeDuration = duration;
    }

    updateGodModeUI() {
        if (this.godModeEnabled) {
            this.gmOn.classList.add('active');
            this.gmOff.classList.remove('active');
            // Make badge red for God Mode
            this.gmOn.style.background = '#ff3333';
            this.gmOn.style.color = 'white';
            this.gmOn.style.boxShadow = '0 0 10px rgba(255, 50, 50, 0.5)';
        } else {
            this.gmOn.classList.remove('active');
            this.gmOff.classList.add('active');
            this.gmOn.style.background = '';
            this.gmOn.style.color = '';
            this.gmOn.style.boxShadow = '';
        }
    }

    updateAutoCameraUI() {
        if (this.autoCameraEnabled) {
            this.acOn.classList.add('active');
            this.acOff.classList.remove('active');
        } else {
            this.acOn.classList.remove('active');
            this.acOff.classList.add('active');
        }
    }

    triggerAscension() {
        console.log("Triggering Ascension Prototype");

        // 0. Speed: Set to x2 and store old value
        this.oldTimeScale = this.timeScale;
        this.timeScale = 2.0;
        this.updateSpeedUI();

        // 1. Stop Blocks
        if (this.slabManager) {
            this.slabManager.spawningEnabled = false;
        }

        // 2. Animate Player
        if (this.player) {
            this.player.ascend();
        }
    }

    onAscensionComplete() {
        console.log("Ascension Complete!");
        // If Apocalypse is active, delegate to it instead of normal restore
        if (this.apocalypseEvent && this.apocalypseEvent.isActive) {
            this.apocalypseEvent.onAscensionComplete();
            return;
        }
        // Normal ascension end: restore speed
        if (this.oldTimeScale !== undefined) {
            this.timeScale = this.oldTimeScale;
            this.updateSpeedUI();
        }
    }

    triggerApocalypse() {
        if (!this.isRunning || this.isPaused) return;
        if (this.player && this.player.isAscending) return;
        if (this.apocalypseEvent && this.apocalypseEvent.isActive) return;
        this.apocalypseEvent = new ApocalypseEvent(this);
        this.apocalypseEvent.start();
    }

}

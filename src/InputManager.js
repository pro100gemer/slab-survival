export class InputManager {
    constructor(game) {
        this.game = game;

        // Camera rotation flags (previously in Game)
        this.isRotatingLeft = false;
        this.isRotatingRight = false;
        this.isRotatingUp = false;
        this.isRotatingDown = false;

        // Swipe tracking
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.swipeThreshold = 30;

        // Bind handlers so they can be removed if needed
        this._onKeyDown = this.handleKeyDown.bind(this);
        this._onKeyUp = this.handleKeyUp.bind(this);

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);

        this.setupMobileControls();
    }

    handleKeyDown(event) {
        const game = this.game;

        if (event.code === 'KeyR') {
            location.reload();
            return;
        }

        if (event.code === 'KeyQ') {
            game.slabManager.adjustBrightness(-0.1);
            return;
        }

        if (event.code === 'KeyE') {
            game.slabManager.adjustBrightness(0.1);
            return;
        }

        if (event.code === 'KeyG') {
            game.godModeEnabled = !game.godModeEnabled;
            game.player.setGodMode(game.godModeEnabled);

            if (game.godModeEnabled) {
                game.speedX20.classList.remove('hidden');
            } else {
                game.speedX20.classList.add('hidden');
                if (game.timeScale === 20.0) {
                    game.timeScale = 1.0;
                    game.updateSpeedUI();
                }
            }
            game.updateGodModeUI();
            return;
        }

        // God Mode Vertical Movement
        if (game.godModeEnabled) {
            if (event.code.startsWith('Shift')) {
                game.player.moveUp();
                return;
            }
            if (event.code.startsWith('Control')) {
                game.player.moveDown();
                return;
            }
        }

        if (event.code === 'Space') {
            game.togglePause();
            return;
        }

        if (game.isPaused) return;
        if (!game.isRunning) return;

        let dx = 0;
        let dz = 0;

        switch (event.code) {
            case 'KeyW': dx = 0; dz = -1; break;
            case 'KeyS': dx = 0; dz = 1; break;
            case 'KeyA': dx = -1; dz = 0; break;
            case 'KeyD': dx = 1; dz = 0; break;
            case 'ArrowLeft': this.isRotatingLeft = true; return;
            case 'ArrowRight': this.isRotatingRight = true; return;
            case 'ArrowUp': this.isRotatingUp = true; return;
            case 'ArrowDown': this.isRotatingDown = true; return;
            case 'KeyF':
                if (game.timeScale === 1.0) {
                    game.timeScale = 2.0;
                } else if (game.timeScale === 2.0) {
                    game.timeScale = game.godModeEnabled ? 20.0 : 1.0;
                } else if (game.timeScale === 20.0) {
                    game.timeScale = 1.0;
                }
                game.updateSpeedUI();
                return;
            case 'KeyJ':
                game.doubleJumpEnabled = !game.doubleJumpEnabled;
                game.player.setDoubleJumpEnabled(game.doubleJumpEnabled);
                game.updateDoubleJumpUI();
                return;
            case 'KeyC':
                game.autoCameraEnabled = !game.autoCameraEnabled;
                game.updateAutoCameraUI();
                return;
            case 'KeyU':
                game.triggerApocalypse();
                return;
            case 'KeyI':
                game.triggerAscension();
                return;
            default:
                return;
        }

        // Camera-relative movement
        let angle = game.cameraAngle % (Math.PI * 2);
        if (angle < 0) angle += Math.PI * 2;

        const qAngle = Math.round(angle / (Math.PI / 2)) % 4;

        let finalDx = 0;
        let finalDz = 0;

        if (qAngle === 0) {
            finalDx = dx; finalDz = dz;
        } else if (qAngle === 1) {
            finalDx = dz; finalDz = -dx;
        } else if (qAngle === 2) {
            finalDx = -dx; finalDz = -dz;
        } else if (qAngle === 3) {
            finalDx = -dz; finalDz = dx;
        }

        game.player.move(finalDx, finalDz);
    }

    handleKeyUp(event) {
        if (this.game.isPaused) return;
        switch (event.code) {
            case 'ArrowLeft': this.isRotatingLeft = false; break;
            case 'ArrowRight': this.isRotatingRight = false; break;
            case 'ArrowUp': this.isRotatingUp = false; break;
            case 'ArrowDown': this.isRotatingDown = false; break;
        }
    }

    setupMobileControls() {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (!isTouch) return;

        document.body.classList.add('touch-device');
        const mobileControls = document.getElementById('mobile-controls');
        if (mobileControls) mobileControls.classList.remove('hidden');

        const bindButton = (id, code) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleKeyDown({ code, preventDefault: () => { } });
            });
            if (code === 'Space') {
                btn.addEventListener('touchend', (e) => e.preventDefault());
            }
        };

        const bindRotation = (id, direction) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (direction === 'left') this.isRotatingLeft = true;
                if (direction === 'right') this.isRotatingRight = true;
            });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                if (direction === 'left') this.isRotatingLeft = false;
                if (direction === 'right') this.isRotatingRight = false;
            });
        };

        bindButton('btn-up', 'KeyW');
        bindButton('btn-down', 'KeyS');
        bindButton('btn-left', 'KeyA');
        bindButton('btn-right', 'KeyD');
        bindButton('btn-ascend', 'KeyI');
        bindButton('btn-pause', 'Space');

        bindRotation('btn-rot-left', 'left');
        bindRotation('btn-rot-right', 'right');

        // Global Swipe Detection
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('.mobile-btn')) return;
            this.touchStartX = e.changedTouches[0].screenX;
            this.touchStartY = e.changedTouches[0].screenY;
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            if (e.target.closest('.mobile-btn')) return;

            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            const dx = touchEndX - this.touchStartX;
            const dy = touchEndY - this.touchStartY;

            if (Math.abs(dx) > Math.abs(dy)) {
                if (Math.abs(dx) > this.swipeThreshold) {
                    this.handleKeyDown({ code: dx > 0 ? 'KeyD' : 'KeyA', preventDefault: () => { } });
                }
            } else {
                if (Math.abs(dy) > this.swipeThreshold) {
                    this.handleKeyDown({ code: dy > 0 ? 'KeyS' : 'KeyW', preventDefault: () => { } });
                }
            }
        }, { passive: false });
    }
}

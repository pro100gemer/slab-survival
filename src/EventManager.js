export class EventManager {
    constructor(game) {
        this.game = game;
        this.states = {
            IDLE: 'idle',
            WARNING: 'warning',
            ACTIVE: 'active',
            COOLDOWN: 'cooldown'
        };
        this.currentState = this.states.IDLE;

        this.timer = 0;
        this.nextEventTime = this.getNextInterval();

        this.banner = document.getElementById('event-banner');
        this.bannerText = document.getElementById('event-text');

        this.currentEvent = null;
        this.eventDuration = 10000; // 10s default
        this.warningDuration = 5000; // 5s warning

        // Intensity scaling
        this.intensity = 1.0;

        this.eventTypes = {
            BLOCK_RAIN: 'block_rain',
            SANDSTORM: 'sandstorm',
            APOCALYPSE: 'apocalypse',
        };
        this.nextEventType = null;
    }

    getNextInterval() {
        // 30-60 seconds of idle time
        return 30000 + Math.random() * 30000;
    }

    update(dt) {
        if (!this.game.isRunning || this.game.isPaused) return;

        // Scale intensity by score (every 100 points)
        this.intensity = 1.0 + Math.floor(this.game.score / 100) * 0.1;

        this.timer += dt;

        switch (this.currentState) {
            case this.states.IDLE:
                if (this.timer >= this.nextEventTime) {
                    this.startWarning();
                }
                break;

            case this.states.WARNING:
                if (this.timer >= this.warningDuration) {
                    this.startEvent();
                }
                break;

            case this.states.ACTIVE:
                if (this.timer >= this.eventDuration) {
                    this.startCooldown();
                }
                break;

            case this.states.COOLDOWN:
                if (this.timer >= 3000) { // 3s cooldown for blocks to land
                    this.stopEvent();
                }
                break;
        }
    }

    startWarning() {
        this.currentState = this.states.WARNING;
        this.timer = 0;

        // Randomly select next event (equal split, APOCALYPSE excluded for now)
        const rand = Math.random();
        if (rand < 0.5) {
            this.nextEventType = this.eventTypes.BLOCK_RAIN;
        } else {
            this.nextEventType = this.eventTypes.SANDSTORM;
        }

        // Show UI
        if (this.banner) {
            this.banner.classList.remove('hidden');
            this.banner.classList.add('warning-pulse');

            if (this.nextEventType === this.eventTypes.SANDSTORM) {
                this.bannerText.innerText = "WARNING: SANDSTORM APPROACHING!";
                if (this.bannerText) this.bannerText.style.color = '#ffaa00';
                this.banner.style.borderColor = '#ffaa00';
            } else if (this.nextEventType === this.eventTypes.APOCALYPSE) {
                this.bannerText.innerText = "WARNING: APOCALYPSE INCOMING!";
                if (this.bannerText) this.bannerText.style.color = '#ff2200';
                this.banner.style.borderColor = '#ff2200';
                this.warningDuration = 3000; // 3s warning (others use default 5s)
            } else {
                this.bannerText.innerText = "WARNING: BLOCK RAIN INCOMING!";
                if (this.bannerText) this.bannerText.style.color = '#00ffff';
                this.banner.style.borderColor = '#00ffff';
            }
        }

        // Audio: Alarm
        if (this.game.soundManager) {
            this.game.soundManager.playAlarm();
        }
    }

    startEvent() {
        this.currentState = this.states.ACTIVE;
        this.timer = 0;
        this.eventDuration = 10000 + Math.random() * 5000; // 10-15s default

        if (this.banner) {
            this.banner.classList.remove('warning-pulse');
            this.banner.classList.add('active-glow');

            if (this.nextEventType === this.eventTypes.APOCALYPSE) {
                if (this.bannerText) this.bannerText.innerText = "EVENT ACTIVE: APOCALYPSE!";
                this.eventDuration = 999999; // ApocalypseEvent calls startCooldown() when done
                this.game.triggerApocalypse();
                this.game.setAtmosphere('apocalypse');

            } else if (this.nextEventType === this.eventTypes.SANDSTORM) {
                if (this.bannerText) this.bannerText.innerText = "EVENT ACTIVE: SANDSTORM!";
                this.game.setEventMode('sandstorm', true);
                this.game.setAtmosphere('sandstorm');

            } else {
                if (this.bannerText) this.bannerText.innerText = "EVENT ACTIVE: BLOCK RAIN!";
                if (this.game.slabManager) {
                    this.game.slabManager.setEventMode('blockRain', true);
                }
                this.game.setAtmosphere('event');
            }
        }
    }

    startCooldown() {
        // 1. Immediately disable spawning batches
        // 1. Immediately disable spawning batches / effects
        if (this.game.slabManager) {
            this.game.slabManager.setEventMode('blockRain', false);
        }
        this.game.setEventMode('sandstorm', false);

        // 2. Change state
        this.currentState = this.states.COOLDOWN;
        this.timer = 0;

        // 3. Start returning atmosphere to normal
        this.game.setAtmosphere('normal');
    }

    stopEvent() {
        this.currentState = this.states.IDLE;
        this.timer = 0;
        this.nextEventTime = this.getNextInterval();

        if (this.banner) {
            this.banner.classList.add('hidden');
            this.banner.classList.remove('warning-pulse');
            this.banner.classList.remove('active-glow');
        }

        // Ensure Block Rain is disabled (redundant but safe)
        if (this.game.slabManager) {
            this.game.slabManager.setEventMode('blockRain', false);
        }
        // Ensure Sandstorm is disabled
        this.game.setEventMode('sandstorm', false);
    }

    reset() {
        this.stopEvent();
        this.timer = 0;
        this.nextEventTime = this.getNextInterval();
    }
}

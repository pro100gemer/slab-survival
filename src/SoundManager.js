export class SoundManager {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = 0.5;

        // Atmosphere Sound Nodes
        this.droneOsc = null;
        this.droneGain = null;
        this.windSource = null;
        this.windGain = null;
        this.isAtmosphereStarted = false;
    }

    startAtmosphere() {
        if (this.isAtmosphereStarted) return;
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const t = this.context.currentTime;

        // 1. Deep Drone Removed by user request
        /*
        this.droneGain = this.context.createGain();
        this.droneGain.gain.setValueAtTime(0.0001, t);
        this.droneGain.gain.exponentialRampToValueAtTime(0.03 * this.masterVolume, t + 3);

        const osc1 = this.context.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(50, t); // Stable base
        
        const osc2 = this.context.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(100.2, t); // Octave + tiny detune for thickness without 'jumping'

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(100, t); // Very low to keep it 'deep' and steady

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(this.droneGain);
        this.droneGain.connect(this.context.destination);

        osc1.start();
        osc2.start();
        */

        // 2. Wind Noise (Pinker Noise)
        const bufferSize = this.context.sampleRate * 2;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        // Approximation of Pink Noise for a softer "wind" feel
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            data[i] *= 0.11; // Bring volume down to reasonable level
            b6 = white * 0.115926;
        }

        this.windSource = this.context.createBufferSource();
        this.windSource.buffer = buffer;
        this.windSource.loop = true;

        this.windGain = this.context.createGain();
        this.windGain.gain.setValueAtTime(0.0001, t);

        const windFilter = this.context.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.setValueAtTime(300, t);
        windFilter.Q.setValueAtTime(1, t);

        this.windSource.connect(windFilter);
        windFilter.connect(this.windGain);
        this.windGain.connect(this.context.destination);

        this.windSource.start();
        this.isAtmosphereStarted = true;
    }

    updateAtmosphere(height, isEventActive) {
        if (!this.isAtmosphereStarted) return;
        const t = this.context.currentTime;

        // Wind volume increases with height - much smoother transition
        const targetWindVol = Math.min(height / 120, 0.3) * this.masterVolume;
        this.windGain.gain.setTargetAtTime(targetWindVol + 0.001, t, 1.0);

        // Drone intensity: Disabled
        /*
        const targetDroneVol = (isEventActive ? 0.14 : 0.03) * this.masterVolume;
        this.droneGain.gain.setTargetAtTime(targetDroneVol, t, 1.0);
        */
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    playAlarm() {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const t = this.context.currentTime;
        const duration = 2.0;

        // Two-tone siren - Softer (Triangle wave, lower freq)
        for (let i = 0; i < 6; i++) {
            const start = t + i * 0.4;
            this.playTone(330, 'triangle', 0.15, 0.2, start);
            this.playTone(220, 'triangle', 0.15, 0.2, start + 0.2);
        }
    }

    playTone(frequency, type, duration, volume = 1.0, startTime = null) {
        const start = startTime || this.context.currentTime;
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(volume * this.masterVolume, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

        osc.connect(gain);
        gain.connect(this.context.destination);

        osc.start(start);
        osc.stop(start + duration);
    }

    playLandSound() {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const t = this.context.currentTime;

        // 1. Low Impact Thud (Oscillator)
        const osc = this.context.createOscillator();
        const oscGain = this.context.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);

        oscGain.gain.setValueAtTime(1.0 * this.masterVolume, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(oscGain);
        oscGain.connect(this.context.destination);

        osc.start(t);
        osc.stop(t + 0.3);

        // 2. Noise Burst (Crunch/Rumble)
        const bufferSize = this.context.sampleRate * 0.2; // 0.2 seconds
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const noise = this.context.createBufferSource();
        noise.buffer = buffer;

        // Filter the noise to make it "heavy" (Low Pass)
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.linearRampToValueAtTime(100, t + 0.2);

        const noiseGain = this.context.createGain();
        noiseGain.gain.setValueAtTime(0.8 * this.masterVolume, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.context.destination);

        noise.start(t);
    }

    playWarningSound() {
        // Warning sound removed by user request
    }

    playGameOverSound() {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const t = this.context.currentTime;
        const duration = 2.0;

        // Noise buffer for "Exhale"
        const bufferSize = this.context.sampleRate * duration;
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = this.context.createBufferSource();
        noise.buffer = buffer;

        // Filter for "breath" quality
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t); // Start with some high freq
        filter.frequency.exponentialRampToValueAtTime(50, t + duration * 0.8); // Close down to low rumble

        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1.0 * this.masterVolume, t + 0.1); // Fast attack
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration); // Long decay

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.context.destination);

        noise.start(t);
        noise.stop(t + duration);
    }

    playPauseSound() {
        this.playTone(600, 'sine', 0.1, 0.3);
    }

    /** Deep thud when a house drops from the sky and lands */
    playHouseImpactSound() {
        if (!this.context || this.context.state === 'suspended') {
            if (this.context) this.context.resume();
            return;
        }
        const t = this.context.currentTime;

        // Sub-bass oscillator: heavy thud (40 Hz → 10 Hz)
        const osc = this.context.createOscillator();
        const oscGain = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.35);
        oscGain.gain.setValueAtTime(1.8 * this.masterVolume, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(oscGain);
        oscGain.connect(this.context.destination);
        osc.start(t); osc.stop(t + 0.4);

        // Low-pass noise burst (crunch)
        const bufSize = this.context.sampleRate * 0.25;
        const buf = this.context.createBuffer(1, bufSize, this.context.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.context.createBufferSource();
        noise.buffer = buf;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t);
        filter.frequency.exponentialRampToValueAtTime(60, t + 0.25);
        const noiseGain = this.context.createGain();
        noiseGain.gain.setValueAtTime(1.2 * this.masterVolume, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(this.context.destination);
        noise.start(t);
    }

    /** Heavy crash + rumble when a house topples over */
    playHouseCrashSound() {
        if (!this.context || this.context.state === 'suspended') {
            if (this.context) this.context.resume();
            return;
        }
        const t = this.context.currentTime;

        // Impact boom (very low)
        const osc = this.context.createOscillator();
        const oscGain = this.context.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(70, t);
        osc.frequency.exponentialRampToValueAtTime(8, t + 0.6);
        oscGain.gain.setValueAtTime(2.0 * this.masterVolume, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(oscGain);
        oscGain.connect(this.context.destination);
        osc.start(t); osc.stop(t + 0.6);

        // Long low rumble
        const bufSize = this.context.sampleRate * 0.7;
        const buf = this.context.createBuffer(1, bufSize, this.context.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.context.createBufferSource();
        noise.buffer = buf;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, t);
        filter.frequency.exponentialRampToValueAtTime(40, t + 0.6);
        const noiseGain = this.context.createGain();
        noiseGain.gain.setValueAtTime(1.5 * this.masterVolume, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(this.context.destination);
        noise.start(t);
    }
}

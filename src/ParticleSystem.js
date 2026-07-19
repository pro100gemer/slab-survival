import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particleCount = 10000;

        // Geometry: 0.05 (as requested, half of previous 0.1)
        this.geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // InstancedMesh for performance
        this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.particleCount);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // Initialize instance colors
        const colorArray = new Float32Array(this.particleCount * 3);
        for (let i = 0; i < colorArray.length; i++) colorArray[i] = 1; // Default white
        this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
        this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        // Disable frustum culling temporarily to ensure visibility during debugging if needed
        // but it should work fine with it on if matrices are correct.
        this.instancedMesh.frustumCulled = false;

        this.scene.add(this.instancedMesh);

        this.particles = [];
        this.dummy = new THREE.Object3D();
        this.colorHelper = new THREE.Color();

        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                active: false,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 0,
                color: new THREE.Color()
            });

            // Hide them initially
            this.dummy.scale.setScalar(0);
            this.dummy.position.set(0, -1000, 0); // Far away
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.nextIndex = 0;
    }

    spawn(position, colorHex, count = 1, speed = 0.1, baseVelocity = null) {
        for (let i = 0; i < count; i++) {
            const p = this.particles[this.nextIndex];

            p.active = true;
            p.position.copy(position);
            p.color.setHex(colorHex);

            if (baseVelocity) {
                p.velocity.copy(baseVelocity);
                // Tiny variation
                p.velocity.x += (Math.random() - 0.5) * speed * 0.2;
                p.velocity.y += (Math.random() - 0.5) * speed * 0.2;
                p.velocity.z += (Math.random() - 0.5) * speed * 0.2;
                p.maxLife = 200 + Math.random() * 200;
            } else {
                p.velocity.set(
                    (Math.random() - 0.5) * speed,
                    Math.random() * speed,
                    (Math.random() - 0.5) * speed
                );
                p.maxLife = 30 + Math.random() * 20;
            }

            p.life = 0;
            this.nextIndex = (this.nextIndex + 1) % this.particleCount;
        }
    }

    update(dt) {
        if (!dt) return;

        // Normalize dt to 60fps (16.6ms) for consistent physics
        const timeFactor = dt / 16.6;

        let needsUpdate = false;
        const drag = Math.pow(0.995, timeFactor);

        for (let i = 0; i < this.particleCount; i++) {
            const p = this.particles[i];

            if (p.active) {
                needsUpdate = true;

                // Physics: Scaled by timeFactor
                p.velocity.multiplyScalar(drag);
                p.velocity.y -= 0.0002 * timeFactor;

                const moveVec = p.velocity.clone().multiplyScalar(timeFactor);
                p.position.add(moveVec);

                // Drift oscillation
                p.position.y += Math.sin(p.life * 0.05) * 0.005 * timeFactor;

                p.life += timeFactor;
                const lifePercent = p.life / p.maxLife;
                const scale = Math.max(0, 1 - lifePercent);

                if (p.life >= p.maxLife) {
                    p.active = false;
                    this.dummy.scale.setScalar(0);
                    this.dummy.position.set(0, -1000, 0);
                } else {
                    this.dummy.position.copy(p.position);
                    this.dummy.scale.setScalar(scale);
                    this.dummy.rotation.x += 0.05 * timeFactor;
                }

                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                this.instancedMesh.setColorAt(i, p.color);
            }
        }

        if (needsUpdate) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
            if (this.instancedMesh.instanceColor) {
                this.instancedMesh.instanceColor.needsUpdate = true;
            }
        }
    }
}

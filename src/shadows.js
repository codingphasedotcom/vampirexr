import * as THREE from 'three';

// Immediate-mode blob shadows: soft dark discs under every creature, the player and chests.
// One instanced draw call; strength rides in instanceColor.r so flyers can cast fainter shadows.
const dummy = new THREE.Object3D();
const _c = new THREE.Color();

export class BlobShadows {
  constructor(scene, max = 600) {
    this.max = max; this.n = 0;
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; varying float vStrength;
        void main() {
          vUv = uv;
          vStrength = instanceColor.r;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 vUv; varying float vStrength;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.25, 1.0, d)) * vStrength;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setScalar(1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin() { this.n = 0; }

  add(x, z, radius, strength = 0.55) {
    if (this.n >= this.max || radius <= 0) return;
    dummy.position.set(x, 0.025, z);
    dummy.scale.setScalar(radius);
    dummy.updateMatrix();
    this.mesh.setMatrixAt(this.n, dummy.matrix);
    this.mesh.setColorAt(this.n, _c.setScalar(strength));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

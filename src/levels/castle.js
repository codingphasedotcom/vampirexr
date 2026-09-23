import * as THREE from 'three';
import { tileTexture } from '../world.js';
import { ROOMS } from '../siege.js';

export const castle = {
  id: 'castle', name: 'Castle Siege', desc: 'Clear four chambers, unlock gates, defeat the Vampire Lord.',
  sky: { top: 0x202c58, horizon: 0x827691 }, fog: { color: 0x827691, density: 0.008 },
  hemi: { sky: 0xc6d6ff, ground: 0x66516b, intensity: 1.8 },
  key: { color: 0xffdcad, intensity: 2, position: [20, 60, 10] },
  rim: { color: 0x91adff, intensity: 1, position: [-30, 30, -80] },
  stars: true, clouds: { color: 0xbeb6db, opacity: 0.3, count: 5 },
  celestial: { position: [-80, 100, -120], radius: 9, color: 0xe5efff, glow: 0x93bfff, glowSize: 70 }, playerLight: 4,
  groundFog: { color: 0x9a8fb0, opacity: 0.25, height: 0.3 },
  rimLight: { color: 0xc9b8ff, strength: 0.55 },
  weather: { type: 'snow', count: 1400 },
  ground: () => tileTexture(256, 100, (g, s) => {
    g.fillStyle = '#484557'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#716b7e' : '#625d70'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }),
  build(group, col) {
    const boxes = [], lamps = [], gates = [];
    const add = (x,y,z,w,h,d,color,rz=0) => boxes.push({x,y,z,w,h,d,color,rz});
    const wall = (x1,z1,x2,z2) => {
      add((x1+x2)/2,3,(z1+z2)/2,Math.abs(x2-x1)+0.8,6,Math.abs(z2-z1)+0.8,0x77758b);
      col.add({x1,z1,x2,z2,r:0.4});
    };
    wall(-14,11,-14,-77); wall(14,11,14,-77); wall(-14,11,14,11); wall(-14,-77,14,-77);
    // Crenellations and masonry bands give the silhouette and walls readable depth.
    for (let z=9;z>=-77;z-=3) for(const x of [-14,14]) add(x,6.5,z,1.2,1.2,1.4,0x9c91a8);
    for (const y of [1,3,5]) for(const x of [-13.55,13.55]) add(x,y,-33,0.18,0.12,88,0x5a566e);
    for (let r=0;r<4;r++) {
      const z=ROOMS[r].z;
      // A clear central aisle and broad flanking combat lanes; furniture is decorative along walls.
      if(r>0) add(0,0.025,z,5,0.04,20,r===2?0x315765:0x842845);
      for(const side of [-1,1]) for(let n=0;n<4;n++) {
        const zz=z+7-n*4.5;
        add(side*13,3.6,zz,1.2,7.2,1.2,0xb0a6b9);
        add(side*13,0.4,zz,1.7,0.8,1.7,0xd0bd9c);
        add(side*13,7.1,zz,1.7,0.6,1.7,0xd0bd9c);
        add(side*12.6,4,zz+1,0.2,2.5,1.1,r===2?0x338692:0x971e49);
        lamps.push(new THREE.Vector3(side*11.9,2.8,zz));
        add(side*12.2,2.3,zz,0.3,0.8,0.3,0x3b293b);
      }
      // Arch ribs cross high above the player without a low ceiling.
      if(r>0) for(const dz of [-7,0,7]) {
        add(-6.5,8.8,z+dz,14,0.55,0.8,0xc7b8c9,0.24); add(6.5,8.8,z+dz,14,0.55,0.8,0xc7b8c9,-0.24);
      }
      if(r===1) for(const side of [-1,1]) {
        add(side*11,0.85,z,2,0.3,10,0x694035);
        col.addBox(side*11,z,1.1,5.1);
        for(const dz of [-4,-2,0,2,4]) { add(side*11,1.08,z+dz,1,0.08,0.6,0xdfcda3); }
      }
      if(r===2) for(const side of [-1,1]) for(let j=0;j<7;j++) add(side*11,1.8,z-7+j*2.2,0.16,3.6,0.16,0x2a3345);
      if(r===0) {
        add(-11,0.35,0,2,0.7,2,0xb6a6b6); add(-11,1.4,0,1.2,2.4,1.2,0xd0bed0);
        col.add({x:-11,z:0,r:1.3});
      }
      if(r===3) {
        add(0,0.2,z-8,8,0.4,3,0xbaa380); add(0,1,z-8,2.5,1.4,1.7,0xab8449);
        add(0,2.5,z-8.7,2.8,4,0.4,0xae844b); add(0,2.2,z-8.4,1.9,2.8,0.2,0x7d173d);
        col.addBox(0,z-8,1.8,1);
        for(const x of [-1,0,1]) add(x,4.9-Math.abs(x)*0.4,z-8.7,0.3,1.3,0.4,0xe8bc62);
        // Stained glass sits high behind the throne, visible above the king.
        for(const x of [-4.5,4.5]) {
          add(x,4.8,-76.4,2.8,4.8,0.3,0x242039);
          for(let row=0;row<4;row++) for(let pane=0;pane<2;pane++)
            add(x-0.62+pane*1.24,3+row*1.15,-76.2,1.05,0.98,0.12,(row+pane)%2?0x67bccd:0xac527f);
          add(x,7.6,-76.4,2,0.35,0.3,0xd2b793,0.5);
        }
      }
      if(r<3) {
        const gz=z-11;
        wall(-14,gz,-3,gz); wall(3,gz,14,gz);
        add(0,6,gz,7,1,1.4,0xc5afbb);
        const barrier={x1:-3,z1:gz,x2:3,z2:gz,r:0.35}; col.add(barrier);
        const gate=new THREE.Group();
        const mat=new THREE.MeshLambertMaterial({color:0x56334f,emissive:0x331022});
        for(let j=-3;j<=3;j++) { const bar=new THREE.Mesh(new THREE.BoxGeometry(0.15,5.6,0.25),mat); bar.position.set(j*0.85,2.8,0);gate.add(bar); }
        const seal=new THREE.Mesh(new THREE.TorusGeometry(0.65,0.09,6,16),new THREE.MeshBasicMaterial({color:0xff587d})); seal.position.y=2.3;gate.add(seal);
        gate.position.z=gz;group.add(gate);gates.push({gate,barrier,seal,open:false});
      }
    }
    // All static masonry/furniture is one draw call with instance colors.
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:0xffffff}),boxes.length);
    const d=new THREE.Object3D(), color=new THREE.Color();
    boxes.forEach((b,i)=>{d.position.set(b.x,b.y,b.z);d.rotation.set(0,0,b.rz);d.scale.set(b.w,b.h,b.d);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);mesh.setColorAt(i,color.setHex(b.color));});group.add(mesh);
    const fire=new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.25),new THREE.MeshBasicMaterial({color:0xffbd62}),lamps.length); group.add(fire);
    return {
      gates,
      setGate(i,open){if(!gates[i])return;const g=gates[i];g.open=open;g.barrier.disabled=open;g.seal.material.color.setHex(open?0x5affbc:0xff587d);},
      reset(){gates.forEach((g,i)=>{this.setGate(i,false);g.gate.position.y=0;});},
      update(dt,time){
        gates.forEach(g=>{g.gate.position.y=THREE.MathUtils.damp(g.gate.position.y,g.open?5.8:0,4,dt);});
        lamps.forEach((p,i)=>{d.position.copy(p);d.rotation.y=time+i;d.scale.set(1,1.4+Math.sin(time*9+i)*0.3,1);d.updateMatrix();fire.setMatrixAt(i,d.matrix);});fire.instanceMatrix.needsUpdate=true;
      },
    };
  },
};

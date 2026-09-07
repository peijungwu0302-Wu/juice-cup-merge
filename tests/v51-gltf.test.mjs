import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function load(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
}

test('Three.js decodes every V5.1 Meshopt cup variant used at runtime', async () => {
  const gltf = await load('../public/models/cups-v51.glb');
  const roots = gltf.scene.children.filter((object) => object.name.startsWith('Cup_'));
  assert.equal(roots.length, 21);
  for (const kind of ['juice', 'sundae', 'wine']) {
    for (let level = 0; level < 7; level += 1) {
      const root = gltf.scene.getObjectByName(`Cup_${kind}_${level}`);
      assert.ok(root, `missing Cup_${kind}_${level}`);
      assert.ok(root.getObjectByProperty('userData', { role: 'glass' }) || root.getObjectByName(`Cup_${kind}_${level}_Glass`));
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.x >= 1.9 && size.y >= 2.17);
      assert.ok(size.x < 2.2 && size.y < 2.8, `${root.name} bounds ${size.toArray()}`);
    }
  }
});

test('Three.js lane geometry and the shared collision specification agree', async () => {
  const gltf = await load('../public/models/lane-v51.glb');
  const lane = gltf.scene.getObjectByName('LaneSurface');
  const left = gltf.scene.getObjectByName('LeftRail');
  const right = gltf.scene.getObjectByName('RightRail');
  const wall = gltf.scene.getObjectByName('FrontWall');
  assert.ok(lane && left && right && wall);
  const laneSize = new THREE.Box3().setFromObject(lane).getSize(new THREE.Vector3());
  assert.ok(Math.abs(laneSize.x - 5.6) < 0.04);
  assert.ok(Math.abs(laneSize.z - 19.6) < 0.04);
  assert.ok(Math.abs(left.position.x + 2.98) < 0.04);
  assert.ok(Math.abs(right.position.x - 2.98) < 0.04);
  assert.ok(Math.abs(wall.position.z + 9.98) < 0.04);
});

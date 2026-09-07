import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

const project = (camera, point) => new THREE.Vector3(...point).project(camera);

test('the full 3D lane and front wall fit inside an iPhone 15 Pro playfield', () => {
  const camera = new THREE.PerspectiveCamera(45, 383 / 633, 0.1, 80);
  camera.position.set(0, 12, 19);
  camera.lookAt(0, -0.1, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const nearLeft = project(camera, [-3.16, 0.098, 9.8]);
  const nearRight = project(camera, [3.16, 0.098, 9.8]);
  const laneEnd = project(camera, [0, -0.098, -9.8]);
  const wallTop = project(camera, [0, 1.42, -9.98]);
  const launchCupTop = project(camera, [0, 1.44, 8.42]);

  assert.ok(nearLeft.x > -0.95 && nearRight.x < 0.95, 'both near rails must remain visible');
  assert.ok(nearLeft.y > -0.98, 'the launch edge must stay above the bottom UI strip');
  assert.ok(laneEnd.y < wallTop.y && wallTop.y < 0.65, 'the front wall must remain below the HUD');
  assert.ok(launchCupTop.y > -0.8, 'the complete launch cup must be visible');
});

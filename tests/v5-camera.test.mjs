import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const ASSET_SPEC = JSON.parse(readFileSync(new URL('../app/game/v51-asset-spec.json', import.meta.url), 'utf8'));

const project = (camera, point) => new THREE.Vector3(...point).project(camera);

test('the full 3D lane and front wall fit inside an iPhone 15 Pro playfield', () => {
  const camera = new THREE.PerspectiveCamera(45, 383 / 633, 0.1, 80);
  camera.position.set(0, 12, 19);
  camera.lookAt(0, -0.1, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const outerRail = ASSET_SPEC.lane.railCenterX + ASSET_SPEC.lane.railWidth / 2;
  const halfLength = ASSET_SPEC.lane.length / 2;
  const nearLeft = project(camera, [-outerRail, 0.098, halfLength]);
  const nearRight = project(camera, [outerRail, 0.098, halfLength]);
  const laneEnd = project(camera, [0, -0.098, -halfLength]);
  const wallTop = project(camera, [0, ASSET_SPEC.lane.frontWallCenterY + ASSET_SPEC.lane.frontWallHeight / 2, ASSET_SPEC.lane.frontWallCenterZ]);
  const launchCupTop = project(camera, [0, 1.44, 8.42]);

  assert.ok(nearLeft.x > -0.95 && nearRight.x < 0.95, 'both near rails must remain visible');
  assert.ok(nearLeft.y > -0.98, 'the launch edge must stay above the bottom UI strip');
  assert.ok(laneEnd.y < wallTop.y && wallTop.y < 0.65, 'the front wall must remain below the HUD');
  assert.ok(launchCupTop.y > -0.8, 'the complete launch cup must be visible');
});

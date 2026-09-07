import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const root = new URL('../', import.meta.url);
const asset = (path) => new URL(path, root);
const spec = JSON.parse(readFileSync(asset('app/game/v52-art-spec.json'), 'utf8'));
const laneSpec = JSON.parse(readFileSync(asset('app/game/v51-asset-spec.json'), 'utf8')).lane;

test('V5.2 ships 21 isolated, transparent, mobile-budgeted art sprites', () => {
  let total = 0;
  for (const kind of ['juice', 'sundae', 'wine']) {
    assert.equal(spec.sprite.themes[kind].bounds.length, 7);
    assert.equal(spec.sprite.themes[kind].bodyRatios.length, 7);
    for (let level = 1; level <= 7; level += 1) {
      const path = asset(`public/art-v52/${kind}-${level}.png`);
      const contents = readFileSync(path);
      assert.deepEqual([...contents.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(contents.readUInt32BE(16) >= 180, `${kind}-${level} must retain useful detail`);
      assert.ok(contents.readUInt32BE(20) >= 300, `${kind}-${level} must retain useful detail`);
      assert.equal(contents[25], 6, `${kind}-${level} must be RGBA`);
      total += statSync(path).size;
    }
  }
  assert.ok(total < 3_800_000, `art sprites total ${total} bytes`);
  assert.equal(spec.version, '5.2.0');
});

test('the fixed portrait art camera projects physics rails onto the painted guides', () => {
  const camera = new THREE.PerspectiveCamera(spec.lane.portraitFov, 383 / 728, 0.1, 80);
  camera.position.set(0, spec.lane.cameraHeight, 19);
  camera.lookAt(0, -0.1, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const project = (point) => {
    const clip = new THREE.Vector3(...point).project(camera);
    return { x: (clip.x + 1) / 2, y: (1 - clip.y) / 2 };
  };
  const half = laneSpec.width / 2;
  for (const guide of [spec.lane.farGuide, spec.lane.nearGuide]) {
    const left = project([-half, 0, guide.z]);
    const right = project([half, 0, guide.z]);
    assert.ok(Math.abs(left.x - guide.leftX) < 0.015);
    assert.ok(Math.abs(right.x - guide.rightX) < 0.015);
    assert.ok(Math.abs(left.y - guide.y) < 0.02);
  }
});

test('the art lane and all sprite sources retain their canonical dimensions', () => {
  const lane = readFileSync(asset('public/assets/lane-premium-v1.png'));
  assert.equal(lane.readUInt32BE(16), spec.lane.sourceWidth);
  assert.equal(lane.readUInt32BE(20), spec.lane.sourceHeight);
  for (const theme of Object.values(spec.sprite.themes)) {
    const source = readFileSync(asset(theme.source));
    assert.equal(source.readUInt32BE(16), theme.sourceWidth);
    assert.equal(source.readUInt32BE(20), theme.sourceHeight);
  }
});

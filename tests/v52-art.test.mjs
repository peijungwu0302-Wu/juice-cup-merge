import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const root = new URL('../', import.meta.url);
const asset = (path) => new URL(path, root);
const spec = JSON.parse(readFileSync(asset('app/game/v52-art-spec.json'), 'utf8'));
const laneSpec = JSON.parse(readFileSync(asset('app/game/v51-asset-spec.json'), 'utf8')).lane;

test('V5.3 retains 21 isolated, transparent, mobile-budgeted art sprites', () => {
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
  assert.equal(spec.version, '5.3.0');
});

const artCamera = (aspect) => {
  const camera = new THREE.PerspectiveCamera(spec.lane.portraitFov, aspect, 0.1, 80);
  camera.position.set(...spec.lane.cameraPosition);
  camera.lookAt(...spec.lane.cameraTarget);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
};

const project = (camera, point) => {
  const clip = new THREE.Vector3(...point).project(camera);
  return { x: (clip.x + 1) / 2, y: (1 - clip.y) / 2 };
};

test('the fixed art camera projects five lane anchors onto the shared guides', () => {
  const camera = artCamera(spec.lane.referenceAspect);
  const half = laneSpec.width / 2;
  for (const guide of [spec.lane.farGuide, spec.lane.midGuide, spec.lane.nearGuide]) {
    const left = project(camera, [-half, 0, guide.z]);
    const right = project(camera, [half, 0, guide.z]);
    assert.ok(Math.abs(left.x - guide.leftX) < 0.001);
    assert.ok(Math.abs(right.x - guide.rightX) < 0.001);
    assert.ok(Math.abs(left.y - guide.y) < 0.001);
  }
});

test('the art camera is 10–15% deeper without changing the physical lane length', () => {
  const previousDepth = 0.972 - 0.318;
  const currentDepth = spec.lane.nearGuide.y - spec.lane.farGuide.y;
  const increase = currentDepth / previousDepth - 1;
  assert.ok(increase >= 0.1 && increase <= 0.15);
  assert.ok(Math.abs(increase - spec.lane.depthIncrease) < 0.003);
  assert.equal(laneSpec.length, 19.6);
});

test('equal-height art and the camera preserve the same horizontal mapping on phones', () => {
  const half = laneSpec.width / 2;
  for (const aspect of [0.52, 0.56, 0.62]) {
    const camera = artCamera(aspect);
    for (const guide of [spec.lane.farGuide, spec.lane.midGuide, spec.lane.nearGuide]) {
      const left = project(camera, [-half, 0, guide.z]);
      const expectedX = 0.5 + (guide.leftX - 0.5) * spec.lane.referenceAspect / aspect;
      assert.ok(Math.abs(left.x - expectedX) < 0.001);
      assert.ok(Math.abs(left.y - guide.y) < 0.001);
    }
  }
});

test('visible art rails and wall derive their placement from the collision specification', () => {
  const scene = readFileSync(asset('app/game/GameScene.tsx'), 'utf8');
  const styles = readFileSync(asset('app/globals.css'), 'utf8');
  assert.match(scene, /side \* LANE_ASSET\.railCenterX/);
  assert.match(scene, /LANE_ASSET\.frontWallCenterZ/);
  assert.match(styles, /background-size: auto 100%, 100% 100%/);
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

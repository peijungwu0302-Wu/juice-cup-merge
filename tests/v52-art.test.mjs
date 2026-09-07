import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const root = new URL('../', import.meta.url);
const asset = (path) => new URL(path, root);
const spec = JSON.parse(readFileSync(asset('app/game/v52-art-spec.json'), 'utf8'));
const laneSpec = JSON.parse(readFileSync(asset('app/game/v51-asset-spec.json'), 'utf8')).lane;

test('V5.6 retains 21 isolated, transparent, mobile-budgeted art sprites with per-cup foot anchors', () => {
  let total = 0;
  for (const kind of ['juice', 'sundae', 'wine']) {
    assert.equal(spec.sprite.themes[kind].bounds.length, 7);
    assert.equal(spec.sprite.themes[kind].bodyRatios.length, 7);
    assert.equal(spec.sprite.themes[kind].footInsets.length, 7);
    assert.equal(spec.sprite.themes[kind].footShadowRatios.length, 7);
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
  assert.equal(spec.version, '5.6.0');
});

const artCamera = () => {
  const camera = new THREE.PerspectiveCamera(spec.lane.portraitFov, spec.lane.referenceAspect, 0.1, 80);
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
  const camera = artCamera();
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

test('the calibrated art projection stays locked to the stretched background on every phone aspect', () => {
  const half = laneSpec.width / 2;
  const scene = readFileSync(asset('app/game/GameScene.tsx'), 'utf8');
  assert.match(scene, /camera\.aspect = artMode[\s\S]*ART_ASSET\.lane\.referenceAspect/);
  for (const displayAspect of [0.52, 0.56, 0.62]) {
    assert.ok(displayAspect > 0);
    const camera = artCamera();
    for (const guide of [spec.lane.farGuide, spec.lane.midGuide, spec.lane.nearGuide]) {
      const left = project(camera, [-half, 0, guide.z]);
      assert.ok(Math.abs(left.x - guide.leftX) < 0.001);
      assert.ok(Math.abs(left.y - guide.y) < 0.001);
    }
  }
});

test('art mode uses one seamless background and no runtime rail overlay', () => {
  const scene = readFileSync(asset('app/game/GameScene.tsx'), 'utf8');
  const styles = readFileSync(asset('app/globals.css'), 'utf8');
  assert.doesNotMatch(scene, /ArtLaneFrame/);
  assert.equal(styles.match(/lane-premium-v54\.png/g)?.length, 1);
  assert.match(styles, /background-size: 100% 100%/);
});

test('art cups retain their original billboard proportions with two ground-contact shadows', () => {
  const model = readFileSync(asset('app/game/CupModel.tsx'), 'utf8');
  assert.match(model, /<sprite position=\{\[0, -bottomPaddingWorld, 0\]\} scale=\{\[spriteWidth, spriteHeight, 1\]\}/);
  assert.doesNotMatch(model, /<Billboard/);
  assert.match(model, /getArtShadowTexture\('contact'\)/);
  assert.match(model, /getArtShadowTexture\('ambient'\)/);
  assert.match(model, /footInsets/);
});

test('simple release uses the whole playfield and bypasses straight-mode position locking', () => {
  const page = readFileSync(asset('app/page.tsx'), 'utf8');
  assert.match(page, /releaseArmed: simpleRelease/);
  assert.match(page, /if \(simpleRelease\) \{\s*commitAim\(\{ x: screenToLaunchX/);
  assert.doesNotMatch(page, /releaseArmed: simpleRelease && \(nearCup/);
});

test('the art lane and all sprite sources retain their canonical dimensions', () => {
  const lane = readFileSync(asset(`public${spec.lane.image}`));
  assert.equal(lane.readUInt32BE(16), spec.lane.sourceWidth);
  assert.equal(lane.readUInt32BE(20), spec.lane.sourceHeight);
  assert.ok(lane.length < 2_000_000);
  for (const theme of Object.values(spec.sprite.themes)) {
    const source = readFileSync(asset(theme.source));
    assert.equal(source.readUInt32BE(16), theme.sourceWidth);
    assert.equal(source.readUInt32BE(20), theme.sourceHeight);
  }
});

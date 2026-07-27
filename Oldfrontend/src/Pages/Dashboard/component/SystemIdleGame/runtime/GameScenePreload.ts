/**
 * Preloads Phaser texture, sprite sheet, tilemap, and audio assets for the scene.
 */
import Phaser from 'phaser';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHEST_FRAME_H,
  CHEST_FRAME_W,
  CHICK_FRAME_H,
  CHICK_FRAME_W,
} from '../constants';
import {
  basicPlantsUrl,
  busOpen1Url,
  busOpen2Url,
  busOpen3Url,
  busStationUrl,
  busUrl,
  charUrl,
  chestUrl,
  chickenUrl,
  cowAdultBrownUrl,
  cowAdultGreenUrl,
  cowAdultLightUrl,
  cowAdultPinkUrl,
  cowAdultPurpleUrl,
  cowBabyBrownUrl,
  cowBabyGreenUrl,
  cowBabyLightUrl,
  cowBabyPinkUrl,
  cowBabyPurpleUrl,
  dialogBoxUrl,
  eggNestUrl,
  fence01Url,
  fence02Url,
  fence03Url,
  fence04Url,
  fence05Url,
  fence06Url,
  fence07Url,
  fence08Url,
  fence09Url,
  fence10Url,
  fence11Url,
  fence12Url,
  fence13Url,
  fence14Url,
  flashlightUrl,
  furnitureUrl,
  greenhouseCloseUrl,
  greenhouseOpenUrl,
  greenhouseStep0Url,
  greenhouseStep1Url,
  greenhouseStep2Url,
  greenhouseStep3Url,
  greenhouseStep4Url,
  houseKeyUrl,
  houseUrl,
  objectsUrl,
  pathsUrl,
  slimeBlueUrl,
  slimeGreenUrl,
  slimeOrangeUrl,
  stoneGolemWalkUrl,
  tileGrassUrl,
  tileHillsUrl,
  tileWaterUrl,
  tilledDirtUrl,
  tilledDirtV2Url,
  toolsUrl,
} from '../../../../../assets';
import {
  getPreloadAudioEntries,
  resolveAudioSourceUrl,
} from '../audio';
import { listPhaserPreloadEntries } from '../visuals';

export function preloadGameSceneAssets(scene: Phaser.Scene): void {
  createLoadingOverlay(scene);
  scene.load.font('sprout-pixel-7-8x14', '/font/pixelFont-7-8x14-sproutLands.ttf', 'truetype');
  scene.load.image('grass', tileGrassUrl);
  scene.load.spritesheet('water', tileWaterUrl, { frameWidth: 16, frameHeight: 16 });
  scene.load.image('hills', tileHillsUrl);
  scene.load.image('objects', objectsUrl);
  scene.load.image('house', houseUrl);
  scene.load.spritesheet('player', charUrl, { frameWidth: CHAR_FRAME_W, frameHeight: CHAR_FRAME_H });
  scene.load.spritesheet('chicken', chickenUrl, { frameWidth: CHICK_FRAME_W, frameHeight: CHICK_FRAME_H });
  scene.load.spritesheet('pet-cow-adult-brown', cowAdultBrownUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-adult-green', cowAdultGreenUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-adult-light', cowAdultLightUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-adult-pink', cowAdultPinkUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-adult-purple', cowAdultPurpleUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-baby-brown', cowBabyBrownUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-baby-green', cowBabyGreenUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-baby-light', cowBabyLightUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-baby-pink', cowBabyPinkUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('pet-cow-baby-purple', cowBabyPurpleUrl, { frameWidth: 32, frameHeight: 32 });
  scene.load.spritesheet('chest', chestUrl, { frameWidth: CHEST_FRAME_W, frameHeight: CHEST_FRAME_H });
  scene.load.spritesheet('egg-nest', eggNestUrl, { frameWidth: 16, frameHeight: 16 });
  scene.load.image('tilled-dirt', tilledDirtUrl);
  scene.load.image('tilled-dirt-v2', tilledDirtV2Url);
  scene.load.image('tools', toolsUrl);
  scene.load.image('basic-plants', basicPlantsUrl);
  scene.load.image('furniture', furnitureUrl);
  scene.load.image('bus-station', busStationUrl);
  scene.load.image('bus', busUrl);
  scene.load.image('bus-open1', busOpen1Url);
  scene.load.image('bus-open2', busOpen2Url);
  scene.load.image('bus-open3', busOpen3Url);
  scene.load.image('house-greenhouse-step0', greenhouseStep0Url);
  scene.load.image('house-greenhouse-step1', greenhouseStep1Url);
  scene.load.image('house-greenhouse-step2', greenhouseStep2Url);
  scene.load.image('house-greenhouse-step3', greenhouseStep3Url);
  scene.load.image('house-greenhouse-step4', greenhouseStep4Url);
  scene.load.image('house-greenhouse-close', greenhouseCloseUrl);
  scene.load.image('house-greenhouse-open', greenhouseOpenUrl);
  scene.load.image('house-key', houseKeyUrl);
  scene.load.image('flashlight', flashlightUrl);
  scene.load.spritesheet('mob-slime-green', slimeGreenUrl, { frameWidth: 16, frameHeight: 24 });
  scene.load.spritesheet('mob-slime-orange', slimeOrangeUrl, { frameWidth: 16, frameHeight: 24 });
  scene.load.spritesheet('mob-slime-blue', slimeBlueUrl, { frameWidth: 16, frameHeight: 24 });
  scene.load.image('fence-01', fence01Url);
  scene.load.image('fence-02', fence02Url);
  scene.load.image('fence-03', fence03Url);
  scene.load.image('fence-04', fence04Url);
  scene.load.image('fence-05', fence05Url);
  scene.load.image('fence-06', fence06Url);
  scene.load.image('fence-07', fence07Url);
  scene.load.image('fence-08', fence08Url);
  scene.load.image('fence-09', fence09Url);
  scene.load.image('fence-10', fence10Url);
  scene.load.image('fence-11', fence11Url);
  scene.load.image('fence-12', fence12Url);
  scene.load.image('fence-13', fence13Url);
  scene.load.image('fence-14', fence14Url);
  scene.load.spritesheet('paths', pathsUrl, { frameWidth: 16, frameHeight: 16 });
  scene.load.image('entity-golem-stone-walk', stoneGolemWalkUrl);
  scene.load.image('ui-dialog-box', dialogBoxUrl);
  const manuallyQueuedTextureKeys = new Set([
    'objects',
    'tools',
    'basic-plants',
    'furniture',
    'egg-nest',
    'chest',
    'house-greenhouse-close',
    'house-key',
    'flashlight',
    'fence-03',
    'paths',
  ]);
  for (const entry of listPhaserPreloadEntries()) {
    if (scene.textures.exists(entry.textureKey) || manuallyQueuedTextureKeys.has(entry.textureKey)) continue;
    if (entry.kind === 'spritesheet') {
      scene.load.spritesheet(entry.textureKey, entry.asset, {
        frameWidth: entry.frameWidth ?? 16,
        frameHeight: entry.frameHeight ?? 16,
      });
    } else {
      scene.load.image(entry.textureKey, entry.asset);
    }
  }
  for (const entry of getPreloadAudioEntries()) {
    scene.load.audio(entry.id, resolveAudioSourceUrl(entry.source));
  }
}

function createLoadingOverlay(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const barWidth = Math.min(360, Math.max(220, width * 0.46));
  const barHeight = 14;
  const x = width / 2;
  const y = height / 2;
  const panelWidth = barWidth + 72;
  const panelHeight = 116;
  const panelX = x - panelWidth / 2;
  const panelY = y - panelHeight / 2;
  const barX = x - barWidth / 2;
  const barY = y + 10;

  const panel = scene.add.graphics();
  panel.fillStyle(0x101620, 0.88);
  panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
  panel.lineStyle(2, 0xd99a17, 1);
  panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
  panel.setDepth(100000);
  panel.setScrollFactor(0);

  const title = scene.add.text(x, panelY + 24, 'LOADING WORLD', {
    fontFamily: 'monospace',
    fontSize: '16px',
    color: '#fff6d8',
    align: 'center',
  });
  title.setOrigin(0.5);
  title.setDepth(100001);
  title.setScrollFactor(0);

  const detail = scene.add.text(x, panelY + 48, 'Preparing assets...', {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#9fb0c8',
    align: 'center',
  });
  detail.setOrigin(0.5);
  detail.setDepth(100001);
  detail.setScrollFactor(0);

  const barBack = scene.add.graphics();
  barBack.fillStyle(0x273244, 1);
  barBack.fillRoundedRect(barX, barY, barWidth, barHeight, 7);
  barBack.setDepth(100001);
  barBack.setScrollFactor(0);

  const barFill = scene.add.graphics();
  barFill.setDepth(100002);
  barFill.setScrollFactor(0);

  const percentText = scene.add.text(x, barY + 34, '0%', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ffd36a',
    align: 'center',
  });
  percentText.setOrigin(0.5);
  percentText.setDepth(100001);
  percentText.setScrollFactor(0);

  const overlayObjects: Phaser.GameObjects.GameObject[] = [
    panel,
    title,
    detail,
    barBack,
    barFill,
    percentText,
  ];
  let disposed = false;

  const destroyOverlay = () => {
    for (const object of overlayObjects) {
      if (object.active) object.destroy();
    }
  };

  const cleanupListeners = () => {
    scene.load.off('progress', onProgress);
    scene.load.off('fileprogress', onFileProgress);
    scene.load.off('complete', onComplete);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanupListeners();
    destroyOverlay();
  };

  const onProgress = (value: number) => {
    if (disposed || !barFill.active || !percentText.active) return;
    const progress = Phaser.Math.Clamp(value, 0, 1);
    barFill.clear();
    barFill.fillStyle(0xf2b233, 1);
    barFill.fillRoundedRect(barX, barY, Math.max(barHeight, barWidth * progress), barHeight, 7);
    percentText.setText(`${Math.round(progress * 100)}%`);
  };

  const onFileProgress = (file: { key?: string; type?: string }) => {
    if (disposed || !detail.active) return;
    const label = [file?.type, file?.key].filter(Boolean).join(': ');
    if (label) detail.setText(label);
  };

  const onComplete = () => {
    cleanupListeners();
    if (disposed || !barFill.active || !percentText.active || !detail.active) return;
    barFill.clear();
    barFill.fillStyle(0xf2b233, 1);
    barFill.fillRoundedRect(barX, barY, barWidth, barHeight, 7);
    percentText.setText('100%');
    detail.setText('Starting scene...');
    scene.tweens.add({
      targets: [panel, title, detail, barBack, barFill, percentText],
      alpha: 0,
      duration: 180,
      onComplete: () => {
        disposed = true;
        destroyOverlay();
      },
    });
  };

  const onShutdown = () => dispose();

  scene.load.on('progress', onProgress);
  scene.load.on('fileprogress', onFileProgress);
  scene.load.once('complete', onComplete);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
}

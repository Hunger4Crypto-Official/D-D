import fs from 'fs-extra';
import path from 'path';
import equal from 'fast-deep-equal';
import { CFG } from '../config.js';
import { Manifest, SceneDef, DropTable, Compliments } from '../models.js';

export const loadManifest = (pack='genesis'): Manifest => {
  const p = path.join(CFG.contentRoot, pack, 'manifest.json');
  return fs.readJSONSync(p);
};

export const loadScene = (pack='genesis', sceneId='1.1'): SceneDef => {
  const p = path.join(CFG.contentRoot, pack, 'scenes', `scene_${sceneId}.json`);
  return fs.readJSONSync(p);
};

export const loadDropTable = (file='packs_genesis.json'): DropTable => {
  const p = path.join(CFG.contentRoot, 'droptables', file);
  return fs.readJSONSync(p);
};

export const loadCompliments = (): Compliments => {
  const p = path.join(CFG.contentRoot, 'ui', 'compliments.json');
  return fs.readJSONSync(p);
};

export function changed(a:any,b:any){ return !equal(a,b); }

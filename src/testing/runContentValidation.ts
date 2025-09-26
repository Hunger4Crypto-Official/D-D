import fs from 'fs';
import path from 'node:path';

import type { SceneDef } from '../models.js';
import { ContentValidator } from './contentValidator.js';

const { readdir, readFile } = fs.promises;
const { join, relative, resolve, sep } = path;

const VALIDATION_TARGETS = [
  join('genesis', 'scenes', 'scene_boss.custodian.json'),
  join('seasons', 'halloween2025', 'scenes'),
  join('seasons', 'summer_solstice', 'scenes')
];

async function walk(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const dirent of dirents) {
    const fullPath = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (dirent.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isSceneFile(filePath: string): boolean {
  const segments = filePath.split(sep);
  return segments.includes('scenes') && /scene_.*\.json$/u.test(segments[segments.length - 1]);
}

function shouldValidate(relativePath: string): boolean {
  return VALIDATION_TARGETS.some((target) => {
    if (target.endsWith('.json')) {
      return relativePath === target;
    }
    return relativePath.startsWith(target + sep);
  });
}

async function main(): Promise<void> {
  const validator = new ContentValidator();
  const contentRoot = resolve(process.cwd(), 'content');
  const allSceneFiles = (await walk(contentRoot)).filter(isSceneFile);
  const sceneFiles = allSceneFiles.filter((file) => shouldValidate(relative(contentRoot, file)));

  if (sceneFiles.length === 0) {
    console.warn('No matching scene files located under content/.');
    return;
  }

  const issues: { file: string; path: string; message: string }[] = [];

  for (const sceneFile of sceneFiles) {
    const relativePath = relative(contentRoot, sceneFile);
    const raw = await readFile(sceneFile, 'utf8');
    let scene: SceneDef | null = null;
    try {
      scene = JSON.parse(raw) as SceneDef;
    } catch (error) {
      issues.push({ file: relativePath, path: relativePath, message: `invalid JSON: ${(error as Error).message}` });
      continue;
    }

    const result = validator.validateScene(scene);
    if (!result.ok) {
      for (const issue of result.issues) {
        issues.push({ file: relativePath, path: issue.path, message: issue.message });
      }
    }
  }

  if (issues.length > 0) {
    console.error('Scene validation failed with the following issues:');
    for (const issue of issues) {
      console.error(`- [${issue.file}] ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${sceneFiles.length} scene files with no issues.`);
}

main().catch((error) => {
  console.error('Content validation encountered an unexpected error:', error);
  process.exitCode = 1;
});

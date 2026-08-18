#!/usr/bin/env node
/**
 * Firebase native config joylash (haqiqiy credential repoga commit qilinmaydi).
 *
 * Ishlatish:
 *   node scripts/setup-firebase-config.mjs
 *   node scripts/setup-firebase-config.mjs --check
 *
 * Firebase Console'dan yuklab olingan fayllarni qo'lda joylash:
 *   ios/Logistika/GoogleService-Info.plist
 *   android/app/google-services.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

const targets = [
  {
    dest: path.join(mobileRoot, 'ios/Logistika/GoogleService-Info.plist'),
    example: path.join(mobileRoot, 'ios/Logistika/GoogleService-Info.plist.example'),
    legacyExample: path.join(mobileRoot, 'ios/GoogleService-Info.plist.example'),
    label: 'iOS GoogleService-Info.plist',
  },
  {
    dest: path.join(mobileRoot, 'android/app/google-services.json'),
    example: path.join(mobileRoot, 'android/app/google-services.json.example'),
    label: 'Android google-services.json',
  },
];

const checkOnly = process.argv.includes('--check');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function looksLikePlaceholder(content) {
  const text = content.toLowerCase();
  return (
    text.includes('your_ios_api_key') ||
    text.includes('your_android_api_key') ||
    text.includes('logistika-example') ||
    text.includes('000000000000')
  );
}

function validateTarget(target) {
  const { dest, label } = target;
  if (!fs.existsSync(dest)) {
    return { ok: false, label, reason: 'fayl topilmadi' };
  }

  const content = fs.readFileSync(dest, 'utf8');
  if (looksLikePlaceholder(content)) {
    return { ok: false, label, reason: 'namuna (placeholder) qiymatlar — Firebase Console faylini joylang' };
  }

  if (dest.endsWith('.json')) {
    const json = readJsonSafe(dest);
    if (!json?.client?.length) {
      return { ok: false, label, reason: 'google-services.json formati noto\'g\'ri' };
    }
  }

  return { ok: true, label };
}

function copyExample(target) {
  const examplePath = fs.existsSync(target.example)
    ? target.example
    : target.legacyExample;

  if (!examplePath || !fs.existsSync(examplePath)) {
    console.error(`[skip] ${target.label}: example topilmadi`);
    return false;
  }

  if (fs.existsSync(target.dest)) {
    console.log(`[ok] ${target.label}: allaqachon mavjud (${target.dest})`);
    return true;
  }

  fs.mkdirSync(path.dirname(target.dest), { recursive: true });
  fs.copyFileSync(examplePath, target.dest);
  console.log(`[created] ${target.label}: ${target.dest}`);
  console.log('         Firebase Console\'dan haqiqiy faylni shu pathga qo\'ying.');
  return true;
}

console.log('Logistika — Firebase config setup\n');

if (checkOnly) {
  const results = targets.map(validateTarget);
  let allOk = true;
  for (const result of results) {
    if (result.ok) {
      console.log(`✓ ${result.label}`);
    } else {
      allOk = false;
      console.log(`✗ ${result.label}: ${result.reason}`);
    }
  }
  process.exit(allOk ? 0 : 1);
}

for (const target of targets) {
  copyExample(target);
}

console.log('\nKeyingi qadamlar:');
console.log('1. Firebase Console → iOS (org.reactjs.native.example.Logistika) + Android (com.logistikatemp)');
console.log('2. Haqiqiy fayllarni yuqoridagi pathlarga qo\'ying');
console.log('3. cd ios && pod install && cd ..');
console.log('4. npx react-native run-ios / run-android');
console.log('5. Tekshiruv: node scripts/setup-firebase-config.mjs --check');

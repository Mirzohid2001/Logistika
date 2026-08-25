import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const allowedAdvisories = new Set([1138808, 1138809]);
const allowedDependencyChain = new Set([
  'image-size',
  'metro',
  'metro-config',
  'metro-transform-worker',
  '@react-native/community-cli-plugin',
  'react-native',
]);
const reviewDue = new Date('2026-09-23T00:00:00Z');

function assertImageSizePatch() {
  if (new Date() >= reviewDue) {
    throw new Error('The temporary image-size audit exception has expired; review upstream status.');
  }
  const icns = readFileSync('node_modules/image-size/dist/types/icns.js', 'utf8');
  const utils = readFileSync('node_modules/image-size/dist/types/utils.js', 'utf8');
  if (!icns.includes("throw new TypeError('Invalid ICNS entry length')")) {
    throw new Error('The ICNS zero-length-entry guard is not installed.');
  }
  if (!utils.includes('offset += box.size > 0 ? box.size : 8')) {
    throw new Error('The HEIF/JXL zero-length-box guard is not installed.');
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('Run this check through npm run audit:prod.');
}
const audit = spawnSync(
  process.execPath,
  [npmCli, 'audit', '--omit=dev', '--json'],
  {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024},
);

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stderr || audit.stdout);
  process.exit(1);
}

if ((report.metadata?.vulnerabilities?.total || 0) === 0) {
  process.stdout.write('No known production dependency vulnerabilities found.\n');
  process.exit(0);
}

assertImageSizePatch();
const vulnerabilities = report.vulnerabilities || {};
function isPatchedImageSizeChain(packageName) {
  if (!allowedDependencyChain.has(packageName) || !vulnerabilities[packageName]) {
    return false;
  }
  return vulnerabilities[packageName].via.every(item => {
    if (typeof item === 'string') {
      return allowedDependencyChain.has(item);
    }
    return allowedAdvisories.has(Number(item.source));
  });
}

const unexpected = Object.keys(vulnerabilities).filter(
  packageName => !isPatchedImageSizeChain(packageName),
);
if (unexpected.length > 0) {
  process.stderr.write(`Unexpected production vulnerabilities: ${unexpected.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(
  'Production audit passed with a verified local image-size infinite-loop patch; ' +
    'temporary exception review due 2026-09-23.\n',
);

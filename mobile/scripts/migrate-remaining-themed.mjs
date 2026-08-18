#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('src');

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.includes('__tests__')) walk(p, files);
    else if (/\.(tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
  return files;
}

function themeRel(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(ROOT, 'theme'));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function migrateFile(abs) {
  let content = fs.readFileSync(abs, 'utf8');
  if (content.includes('useThemedStyles')) {
    return { changed: false, reason: 'already migrated' };
  }

  const themeImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*theme)['"]\s*;?/;
  const match = content.match(themeImportRe);
  if (!match || !match[1].includes('colors')) {
    return { changed: false, reason: 'no colors theme import' };
  }

  const specifiers = match[1].split(',').map((s) => s.trim()).filter(Boolean);
  const rest = specifiers.filter((s) => s !== 'colors' && !s.startsWith('colors '));
  const themePath = match[2];
  const themedBase = themeRel(abs);

  const newThemeImport = rest.length
    ? `import { ${rest.join(', ')} } from '${themePath}';`
    : '';

  content = content.replace(match[0], newThemeImport);

  const extraImports = [
    `import type { AppColors } from '${themedBase}/colors';`,
    `import { useThemedStyles } from '${themedBase}/useThemedStyles';`,
  ];
  const usesColorsOutsideStyles =
    /colors\./.test(content) &&
    !/const\s+styles\s*=\s*StyleSheet\.create\(\{[\s\S]*\}\);/.test(content.replace(/const\s+createStyles[\s\S]*$/, ''));
  if (usesColorsOutsideStyles || /colors\./.test(content)) {
    extraImports.push(`import { useAppTheme } from '${themedBase}/useAppTheme';`);
  }

  const insertAfter = newThemeImport || match[0];
  const idx = content.indexOf(insertAfter);
  if (idx === -1) return { changed: false, reason: 'insert failed' };
  const end = idx + insertAfter.length;
  content = content.slice(0, end) + '\n' + extraImports.join('\n') + content.slice(end);

  if (/const\s+styles\s*=\s*StyleSheet\.create\(\{/.test(content)) {
    content = content.replace(
      /const\s+styles\s*=\s*StyleSheet\.create\(\{/,
      'const createStyles = (colors: AppColors) =>\n  StyleSheet.create({',
    );
  }

  const hookBlock =
    '  const styles = useThemedStyles(createStyles);\n' +
    (content.includes('useAppTheme') ? '  const { colors } = useAppTheme();\n' : '');

  const patterns = [
    /(export\s+const\s+\w+(?::\s*React\.FC<[^>]+>)?\s*=\s*\([^)]*\)\s*=>\s*\{)\s*\n/,
    /(const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{)\s*\n(?!\s*const\s+styles)/,
    /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)\s*\n/,
    /(function\s+\w+\s*\([^)]*\)\s*\{)\s*\n(?!\s*const\s+styles)/,
  ];

  let hooked = false;
  for (const re of patterns) {
    if (re.test(content) && !content.includes('useThemedStyles(createStyles)')) {
      content = content.replace(re, `$1\n${hookBlock}`);
      hooked = true;
      break;
    }
  }

  if (!hooked && /const\s+createStyles/.test(content) && !content.includes('useThemedStyles(createStyles)')) {
    return { changed: false, reason: 'could not inject hooks' };
  }

  fs.writeFileSync(abs, content);
  return { changed: true };
}

const targets = walk(ROOT).filter((f) => {
  const c = fs.readFileSync(f, 'utf8');
  return /import.*\bcolors\b.*from.*theme/.test(c) && !c.includes('useThemedStyles');
});

let ok = 0;
for (const f of targets) {
  const { changed, reason } = migrateFile(f);
  const rel = path.relative(process.cwd(), f);
  if (changed) {
    console.log('OK', rel);
    ok++;
  } else {
    console.log('SKIP', rel, reason || '');
  }
}
console.log('MIGRATED', ok);

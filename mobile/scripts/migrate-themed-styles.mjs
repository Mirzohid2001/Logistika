#!/usr/bin/env node
/**
 * Migrates screen files from static `colors` StyleSheet to useThemedStyles.
 * Usage: node scripts/migrate-themed-styles.mjs <file1> <file2> ...
 */
import fs from 'fs';
import path from 'path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node migrate-themed-styles.mjs <files...>');
  process.exit(1);
}

const THEME_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*theme)['"]\s*;?/;

function migrate(content, filePath) {
  if (content.includes('useThemedStyles')) {
    return { content, changed: false, reason: 'already migrated' };
  }
  if (!content.includes('colors') || !content.match(/const\s+styles\s*=\s*StyleSheet\.create/)) {
    return { content, changed: false, reason: 'no static styles pattern' };
  }

  let out = content;

  const importMatch = out.match(THEME_IMPORT_RE);
  if (!importMatch) {
    return { content, changed: false, reason: 'no theme import' };
  }

  const specifiers = importMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (!specifiers.includes('colors')) {
    return { content, changed: false, reason: 'no colors import' };
  }

  const rest = specifiers.filter((s) => s !== 'colors');
  const themePath = importMatch[2];
  const depth = themePath.startsWith('.') ? themePath : '../../theme';
  const themedPath = depth.includes('useThemedStyles') ? depth : depth.replace(/\/?theme$/, '/theme/useThemedStyles');
  const appThemePath = depth.replace(/\/?theme$/, '/theme/useAppTheme');

  const newImport = rest.length
    ? `import { ${rest.join(', ')} } from '${importMatch[2]}';`
    : '';
  out = out.replace(importMatch[0], newImport);

  if (!out.includes("from './theme/useThemedStyles'") && !out.includes('useThemedStyles')) {
    const relThemed = filePath.includes('/screens/')
      ? themedPath.startsWith('.')
        ? themedPath
        : `../../theme/useThemedStyles`
      : `../theme/useThemedStyles`;
    const relApp = relThemed.replace('useThemedStyles', 'useAppTheme');
    const insertAt = out.indexOf(newImport) + newImport.length;
    out =
      out.slice(0, insertAt) +
      `\nimport { useThemedStyles } from '${relThemed.includes('theme') ? relThemed : '../../theme/useThemedStyles'}';\nimport type { AppColors } from '${relThemed.replace('useThemedStyles', 'colors').replace('useAppTheme', 'colors') || '../../theme/colors'}';` +
      (content.match(/colors\./) ? `\nimport { useAppTheme } from '${relApp.includes('theme') ? relApp : '../../theme/useAppTheme'}';` : '') +
      out.slice(insertAt);
  }

  out = out.replace(
    /const\s+styles\s*=\s*StyleSheet\.create\(\{/,
    'const createStyles = (colors: AppColors) =>\n  StyleSheet.create({',
  );

  const componentMatch = out.match(
    /(const\s+\w+\s*=\s*\(\)\s*=>\s*\{)\s*\n(\s*const\s+(?:navigation|route|{))/,
  );
  if (componentMatch) {
    const hookLines =
      `\n  const styles = useThemedStyles(createStyles);` +
      (content.match(/colors\./) ? `\n  const { colors } = useAppTheme();` : '');
    out = out.replace(componentMatch[0], componentMatch[1] + hookLines + '\n' + componentMatch[2]);
  }

  return { content: out, changed: true };
}

for (const file of files) {
  const abs = path.resolve(file);
  const raw = fs.readFileSync(abs, 'utf8');
  const rel = path.relative(process.cwd(), abs);
  const { content, changed, reason } = migrate(raw, abs);
  if (changed) {
    fs.writeFileSync(abs, content);
    console.log('OK', rel);
  } else {
    console.log('SKIP', rel, reason || '');
  }
}

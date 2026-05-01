#!/usr/bin/env node
/**
 * create-pilcrow — starter CLI for Pilcrow ¶
 *
 * Usage:
 *   npx create-pilcrow my-blog
 *   node index.js my-blog
 *
 * Copies the bundled template into a new directory, renames gitignore →
 * .gitignore, and prints next steps.
 *
 * Zero runtime dependencies — uses only Node.js built-ins (fs, path, process).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ─── Parse arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const projectName = args[0];

if (!projectName) {
  console.error('Usage: npx create-pilcrow <project-name>');
  console.error('  Example: npx create-pilcrow my-blog');
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), projectName);

if (fs.existsSync(targetDir)) {
  console.error(`Error: directory already exists: ${targetDir}`);
  console.error('Choose a different project name or remove the existing directory.');
  process.exit(1);
}

// ─── Copy template ────────────────────────────────────────────────────────────

const templateDir = path.join(__dirname, 'template');

if (!fs.existsSync(templateDir)) {
  console.error('Error: template directory not found next to this script.');
  console.error('This is a packaging bug — please report it at https://github.com/pilcrow-press/pilcrow/issues');
  process.exit(1);
}

/**
 * Recursively copy a directory tree from src to dest.
 * Renames `gitignore` → `.gitignore` at the root level of dest.
 */
function copyDir(src, dest, isRoot) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    // Rename gitignore → .gitignore so npm publish doesn't strip it
    const destEntry = (isRoot && entry === 'gitignore') ? '.gitignore' : entry;
    const destPath = path.join(dest, destEntry);

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log(`\nCreating a new Pilcrow site in ${targetDir}\n`);

try {
  copyDir(templateDir, targetDir, true);
} catch (err) {
  console.error('Error copying template:', err.message);
  process.exit(1);
}

// ─── Update package.json name field ──────────────────────────────────────────

const pkgPath = path.join(targetDir, 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  // Use projectName as the npm package name (sanitised to lowercase kebab-case)
  pkg.name = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
} catch (err) {
  // Non-fatal — the template default name is fine if this fails
  console.warn('Warning: could not update package name in package.json:', err.message);
}

// ─── Print next steps ─────────────────────────────────────────────────────────

console.log('Done. Your new Pilcrow site is ready.\n');
console.log('Next steps:\n');
console.log(`  cd ${projectName}`);
console.log('  bun install');
console.log('  bun run dev\n');
console.log('Then open http://localhost:4321 in your browser.\n');
console.log('To write your first post, edit or replace:');
console.log('  src/content/posts/example.md\n');
console.log('To build for production:');
console.log('  bun run build\n');
console.log('Documentation: https://pilcrow.page\n');

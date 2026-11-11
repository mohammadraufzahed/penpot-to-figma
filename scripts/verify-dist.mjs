#!/usr/bin/env node
/**
 * Verifies that the built plugin artifacts exist and that manifest.json
 * points at files that were actually produced by the build.
 */
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

const required = [manifest.main, manifest.ui].filter(Boolean);
if (required.length === 0) {
  console.error('manifest.json has no main/ui entries');
  process.exit(1);
}

let failed = false;
for (const entry of required) {
  if (!existsSync(entry)) {
    console.error(`Missing build artifact referenced by manifest: ${entry}`);
    failed = true;
  } else {
    console.log(`OK: ${entry} (${readFileSync(entry, 'utf8').length} bytes)`);
  }
}

// The sandbox bundle must contain the inlined UI html (__html__ define).
if (existsSync('dist/code.js')) {
  const code = readFileSync('dist/code.js', 'utf8');
  if (!code.includes('<!doctype html>') && !code.includes('<html')) {
    console.error('dist/code.js does not appear to contain the inlined UI HTML');
    failed = true;
  } else {
    console.log('OK: dist/code.js contains inlined UI HTML');
  }
}

if (failed) {
  console.error('Dist verification failed');
  process.exit(1);
}
console.log('Dist verification passed');

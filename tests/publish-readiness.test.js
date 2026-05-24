'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const index = read('index.html');

assert.match(index, /<canvas\s+id="gameCanvas"/, 'index.html must expose the game canvas');
assert.match(index, /<video\s+id="cameraVideo"/, 'index.html must expose the camera video element');
assert.match(index, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest"/, 'index.html must link the web app manifest');
assert.match(index, /serviceWorker\.register\('\.\/sw\.js'\)/, 'index.html must register the service worker');
assert.match(index, /project-gameplay-screenshot\.png/, 'index.html should expose a share preview image');

assert.ok(exists('manifest.webmanifest'), 'manifest.webmanifest is required');
const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name, '一指清台');
assert.equal(manifest.start_url, './');
assert.equal(manifest.display, 'fullscreen');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must include icons');

assert.ok(exists('sw.js'), 'sw.js is required for installable mobile experience');
assert.match(read('sw.js'), /project-gameplay-screenshot\.png/, 'service worker should cache gameplay assets');

assert.ok(exists('.github/workflows/pages.yml'), 'GitHub Pages workflow is required');
const workflow = read('.github/workflows/pages.yml');
assert.match(workflow, /actions\/upload-pages-artifact/, 'workflow must upload a Pages artifact');
assert.match(workflow, /actions\/deploy-pages/, 'workflow must deploy to GitHub Pages');
assert.match(workflow, /enablement:\s*true/, 'workflow must enable Pages for first-time deployment');

console.log('ok - publish readiness');

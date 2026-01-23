#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generate a manifest file listing all KML files
 * This allows the frontend to display available files without scanning the directory
 */

const KML_DIR = path.join(__dirname, '..', 'kmls');
const MANIFEST_PATH = path.join(__dirname, '..', 'kml-manifest.json');

// Read GITHUB_REPOSITORY from environment or use placeholder
const repoFullName = process.env.GITHUB_REPOSITORY || 'TannerTunstall/MapPipeline';
const baseURL = `https://raw.githubusercontent.com/${repoFullName}/main/kmls`;

function generateManifest() {
    console.log('Generating manifest...');

    // Get all KML files
    const files = fs.readdirSync(KML_DIR)
        .filter(file => file.endsWith('.kml'))
        .map(file => {
            const filepath = path.join(KML_DIR, file);
            const stats = fs.statSync(filepath);

            return {
                name: file,
                url: `${baseURL}/${file}`,
                size: stats.size,
                updated: stats.mtime.toISOString()
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    const manifest = {
        lastUpdate: new Date().toISOString(),
        files: files
    };

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`✓ Generated manifest with ${files.length} files`);
}

generateManifest();

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Update Israel Rocket Alerts KML
 *
 * Data Source: rocketalert.live API
 * Updates: Every minute via GitHub Actions
 * Retention: Clears alerts older than 8 hours
 */

const KML_DIR = path.join(__dirname, '..', 'kmls');
const ALERTS_FILE = path.join(KML_DIR, 'israel-alerts.kml');
const ALERTS_CACHE_FILE = path.join(KML_DIR, '.alerts-cache.json');

// API endpoint
const API_URL = 'https://agg.rocketalert.live/api/v2/alerts/real-time/cached';

// Alert retention period (8 hours in milliseconds)
const RETENTION_MS = 8 * 60 * 60 * 1000;

// Ensure kmls directory exists
if (!fs.existsSync(KML_DIR)) {
    fs.mkdirSync(KML_DIR, { recursive: true });
}

/**
 * Fetch JSON from URL
 */
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'MapPipeline/1.0',
                'Accept': 'application/json'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Load existing alerts from cache
 */
function loadCachedAlerts() {
    try {
        if (fs.existsSync(ALERTS_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(ALERTS_CACHE_FILE, 'utf8'));
            return data.alerts || [];
        }
    } catch (e) {
        console.log('No existing cache or error reading:', e.message);
    }
    return [];
}

/**
 * Save alerts to cache
 */
function saveCachedAlerts(alerts) {
    fs.writeFileSync(ALERTS_CACHE_FILE, JSON.stringify({
        lastUpdate: new Date().toISOString(),
        alerts
    }, null, 2));
}

/**
 * Filter out alerts older than 8 hours
 */
function filterOldAlerts(alerts) {
    const cutoff = Date.now() - RETENTION_MS;
    return alerts.filter(alert => {
        const alertTime = new Date(alert.timeStamp).getTime();
        return alertTime > cutoff;
    });
}

/**
 * Merge new alerts with existing, avoiding duplicates
 */
function mergeAlerts(existing, newAlerts) {
    const seen = new Set();
    const merged = [];

    // Create unique key for each alert (location + timestamp rounded to minute)
    function alertKey(alert) {
        const time = new Date(alert.timeStamp);
        const roundedTime = new Date(Math.floor(time.getTime() / 60000) * 60000);
        return `${alert.name || alert.englishName}_${roundedTime.toISOString()}`;
    }

    // Add existing alerts first
    for (const alert of existing) {
        const key = alertKey(alert);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(alert);
        }
    }

    // Add new alerts
    for (const alert of newAlerts) {
        const key = alertKey(alert);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(alert);
        }
    }

    return merged;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Get alert style based on age
 */
function getAlertStyle(alert) {
    const ageMs = Date.now() - new Date(alert.timeStamp).getTime();
    const ageMinutes = ageMs / 60000;

    if (ageMinutes < 5) {
        return 'alert-critical';  // Red - very recent
    } else if (ageMinutes < 30) {
        return 'alert-recent';    // Orange - recent
    } else if (ageMinutes < 120) {
        return 'alert-moderate';  // Yellow - within 2 hours
    } else {
        return 'alert-old';       // Gray - older
    }
}

/**
 * Format time ago string
 */
function timeAgo(timestamp) {
    const ms = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Generate KML content
 */
function generateKml(alerts) {
    const now = new Date().toISOString();

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>Israel Rocket Alerts</name>
    <description>Real-time rocket and missile alerts in Israel. Data from rocketalert.live. Updated every minute. Alerts older than 8 hours are automatically cleared.</description>
    <open>1</open>

    <!-- Styles -->
    <Style id="alert-critical">
        <IconStyle>
            <color>ff0000ff</color>
            <scale>1.4</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle>
            <color>ff0000ff</color>
            <scale>0.9</scale>
        </LabelStyle>
    </Style>
    <Style id="alert-recent">
        <IconStyle>
            <color>ff0080ff</color>
            <scale>1.2</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle>
            <color>ff0080ff</color>
            <scale>0.8</scale>
        </LabelStyle>
    </Style>
    <Style id="alert-moderate">
        <IconStyle>
            <color>ff00ffff</color>
            <scale>1.0</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle>
            <color>ff00ffff</color>
            <scale>0.7</scale>
        </LabelStyle>
    </Style>
    <Style id="alert-old">
        <IconStyle>
            <color>ff808080</color>
            <scale>0.8</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
        </IconStyle>
        <LabelStyle>
            <color>ff808080</color>
            <scale>0.6</scale>
        </LabelStyle>
    </Style>

    <Folder>
        <name>Active Alerts (${alerts.length})</name>
        <description>Last updated: ${now}</description>
`;

    // Sort alerts by timestamp (newest first)
    const sortedAlerts = [...alerts].sort((a, b) =>
        new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime()
    );

    for (const alert of sortedAlerts) {
        // Skip alerts without coordinates
        if (!alert.lat || !alert.lon) continue;

        const name = alert.englishName || alert.name || 'Unknown';
        const hebrewName = alert.name || '';
        const area = alert.areaNameEn || alert.areaNameHe || '';
        const countdown = alert.countdownSec || 0;
        const style = getAlertStyle(alert);
        const ago = timeAgo(alert.timeStamp);
        const alertTime = new Date(alert.timeStamp).toLocaleString('en-US', {
            timeZone: 'Asia/Jerusalem',
            dateStyle: 'short',
            timeStyle: 'medium'
        });

        kml += `
        <Placemark>
            <name>${escapeXml(name)}</name>
            <description><![CDATA[
                <div style="font-family: Arial, sans-serif; min-width: 200px;">
                    <h3 style="margin: 0 0 8px 0; color: #d32f2f;">🚨 Rocket Alert</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Location:</td><td style="padding: 4px 0;"><strong>${escapeXml(name)}</strong></td></tr>
                        ${hebrewName ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Hebrew:</td><td style="padding: 4px 0;">${escapeXml(hebrewName)}</td></tr>` : ''}
                        ${area ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Region:</td><td style="padding: 4px 0;">${escapeXml(area)}</td></tr>` : ''}
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Time:</td><td style="padding: 4px 0;">${alertTime}</td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Ago:</td><td style="padding: 4px 0;"><strong>${ago}</strong></td></tr>
                        ${countdown ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Shelter time:</td><td style="padding: 4px 0;">${countdown} seconds</td></tr>` : ''}
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 11px; color: #999;">Data: rocketalert.live</p>
                </div>
            ]]></description>
            <styleUrl>#${style}</styleUrl>
            <TimeStamp><when>${new Date(alert.timeStamp).toISOString()}</when></TimeStamp>
            <Point>
                <coordinates>${alert.lon},${alert.lat},0</coordinates>
            </Point>
            <ExtendedData>
                <Data name="location"><value>${escapeXml(name)}</value></Data>
                <Data name="hebrewName"><value>${escapeXml(hebrewName)}</value></Data>
                <Data name="area"><value>${escapeXml(area)}</value></Data>
                <Data name="timestamp"><value>${alert.timeStamp}</value></Data>
                <Data name="countdown"><value>${countdown}</value></Data>
            </ExtendedData>
        </Placemark>`;
    }

    kml += `
    </Folder>
</Document>
</kml>`;

    return kml;
}

/**
 * Main update function
 */
async function updateAlerts() {
    console.log('Fetching latest alerts from rocketalert.live...');

    try {
        // Fetch new alerts
        const response = await fetchJson(API_URL);

        if (!response.success || !response.payload) {
            console.log('No alerts data in response');
            return;
        }

        // Extract all alerts from payload
        const newAlerts = [];
        for (const group of response.payload) {
            if (group.alerts && Array.isArray(group.alerts)) {
                newAlerts.push(...group.alerts);
            }
        }

        console.log(`Fetched ${newAlerts.length} new alerts`);

        // Load existing cached alerts
        const existingAlerts = loadCachedAlerts();
        console.log(`Loaded ${existingAlerts.length} cached alerts`);

        // Merge new with existing
        let allAlerts = mergeAlerts(existingAlerts, newAlerts);
        console.log(`Total after merge: ${allAlerts.length} alerts`);

        // Filter out alerts older than 8 hours
        allAlerts = filterOldAlerts(allAlerts);
        console.log(`After 8-hour filter: ${allAlerts.length} alerts`);

        // Save updated cache
        saveCachedAlerts(allAlerts);

        // Generate and save KML
        const kml = generateKml(allAlerts);
        fs.writeFileSync(ALERTS_FILE, kml);
        console.log(`KML saved to ${ALERTS_FILE}`);

        // Stats
        const alertsWithCoords = allAlerts.filter(a => a.lat && a.lon).length;
        console.log(`Alerts with coordinates: ${alertsWithCoords}`);

    } catch (error) {
        console.error('Error updating alerts:', error.message);

        // If API fails, still try to refresh KML from cache
        const existingAlerts = loadCachedAlerts();
        if (existingAlerts.length > 0) {
            const filteredAlerts = filterOldAlerts(existingAlerts);
            saveCachedAlerts(filteredAlerts);
            const kml = generateKml(filteredAlerts);
            fs.writeFileSync(ALERTS_FILE, kml);
            console.log('Regenerated KML from cache');
        }
    }
}

// Run
updateAlerts();

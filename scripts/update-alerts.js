#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Update Israel Rocket Alerts KML
 *
 * Data Source: rocketalert.live API + tzevaadom polygons
 * Updates: Every 5 minutes via GitHub Actions
 * Retention: Clears alerts older than 4 hours
 */

const KML_DIR = path.join(__dirname, '..', 'kmls');
const ALERTS_FILE = path.join(KML_DIR, 'israel-alerts.kml');
const ALERTS_CACHE_FILE = path.join(KML_DIR, '.alerts-cache.json');

// API endpoints
const API_URL = 'https://agg.rocketalert.live/api/v2/alerts/real-time/cached';
const POLYGONS_URL = 'https://www.tzevaadom.co.il/static/polygons.json';

// Alert retention period (4 hours in milliseconds)
const RETENTION_MS = 4 * 60 * 60 * 1000;

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
 * Filter out alerts older than retention period
 */
function filterOldAlerts(alerts) {
    const cutoff = Date.now() - RETENTION_MS;
    return alerts.filter(alert => {
        const alertTime = new Date(alert.timeStamp).getTime();
        return alertTime > cutoff;
    });
}

/**
 * Merge new alerts with existing - newer alerts replace older ones for same location
 */
function mergeAlerts(existing, newAlerts) {
    // Map to store latest alert per location
    const alertsByLocation = new Map();

    // Key by location name (taCityId if available, otherwise name)
    function locationKey(alert) {
        return alert.taCityId || alert.name || alert.englishName || 'unknown';
    }

    // Process all alerts, keeping only the most recent per location
    const allAlerts = [...existing, ...newAlerts];

    for (const alert of allAlerts) {
        const key = locationKey(alert);
        const existing = alertsByLocation.get(key);

        if (!existing) {
            alertsByLocation.set(key, alert);
        } else {
            // Keep the more recent alert
            const existingTime = new Date(existing.timeStamp).getTime();
            const newTime = new Date(alert.timeStamp).getTime();
            if (newTime > existingTime) {
                alertsByLocation.set(key, alert);
            }
        }
    }

    return Array.from(alertsByLocation.values());
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
 * Get style ID based on alert age
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
 * Get polygon style based on alert age
 */
function getPolygonStyle(alert) {
    const ageMs = Date.now() - new Date(alert.timeStamp).getTime();
    const ageMinutes = ageMs / 60000;

    if (ageMinutes < 5) {
        return 'poly-critical';
    } else if (ageMinutes < 30) {
        return 'poly-recent';
    } else if (ageMinutes < 120) {
        return 'poly-moderate';
    } else {
        return 'poly-old';
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
 * Format date/time for Israel timezone
 */
function formatDateTime(timestamp) {
    const date = new Date(timestamp);

    // Format date
    const dateStr = date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    // Format time
    const timeStr = date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    return { date: dateStr, time: timeStr, full: `${dateStr} ${timeStr}` };
}

/**
 * Convert polygon coordinates to KML format
 * tzevaadom uses [lat, lng], KML needs lng,lat,0
 */
function polygonToKmlCoords(coords) {
    return coords.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
}

/**
 * Generate KML content with polygons
 */
function generateKml(alerts, polygons) {
    const now = new Date();
    const nowFormatted = formatDateTime(now.toISOString());

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>Israel Rocket Alerts</name>
    <description>Real-time rocket and missile alerts in Israel. Data from rocketalert.live. Updated every 5 minutes. Alerts older than 4 hours are automatically cleared.

Last updated: ${nowFormatted.full} (Israel Time)</description>
    <open>1</open>

    <!-- Point Styles -->
    <Style id="alert-critical">
        <IconStyle>
            <color>ff0000ff</color>
            <scale>1.4</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.9</scale></LabelStyle>
    </Style>
    <Style id="alert-recent">
        <IconStyle>
            <color>ff0080ff</color>
            <scale>1.2</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle><color>ff0080ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="alert-moderate">
        <IconStyle>
            <color>ff00ffff</color>
            <scale>1.0</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon>
        </IconStyle>
        <LabelStyle><color>ff00ffff</color><scale>0.7</scale></LabelStyle>
    </Style>
    <Style id="alert-old">
        <IconStyle>
            <color>ff808080</color>
            <scale>0.8</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
        </IconStyle>
        <LabelStyle><color>ff808080</color><scale>0.6</scale></LabelStyle>
    </Style>

    <!-- Polygon Styles -->
    <Style id="poly-critical">
        <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
        <PolyStyle><color>600000ff</color></PolyStyle>
    </Style>
    <Style id="poly-recent">
        <LineStyle><color>ff0080ff</color><width>2</width></LineStyle>
        <PolyStyle><color>400080ff</color></PolyStyle>
    </Style>
    <Style id="poly-moderate">
        <LineStyle><color>ff00ffff</color><width>1</width></LineStyle>
        <PolyStyle><color>3000ffff</color></PolyStyle>
    </Style>
    <Style id="poly-old">
        <LineStyle><color>ff808080</color><width>1</width></LineStyle>
        <PolyStyle><color>20808080</color></PolyStyle>
    </Style>
`;

    // Sort alerts by timestamp (newest first)
    const sortedAlerts = [...alerts].sort((a, b) =>
        new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime()
    );

    // Group alerts by city for polygon deduplication
    const alertsByCityId = new Map();
    for (const alert of sortedAlerts) {
        if (alert.taCityId && !alertsByCityId.has(alert.taCityId)) {
            alertsByCityId.set(alert.taCityId, alert);
        }
    }

    // Polygons folder
    kml += `
    <Folder>
        <name>Alert Zones (${alertsByCityId.size})</name>
        <description>Polygon boundaries for alerted areas. Last updated: ${nowFormatted.full}</description>
`;

    for (const [cityId, alert] of alertsByCityId) {
        const polygon = polygons[cityId];
        if (!polygon || polygon.length < 3) continue;

        const name = alert.englishName || alert.name || 'Unknown';
        const hebrewName = alert.name || '';
        const area = alert.areaNameEn || alert.areaNameHe || '';
        const countdown = alert.countdownSec || 0;
        const style = getPolygonStyle(alert);
        const ago = timeAgo(alert.timeStamp);
        const dt = formatDateTime(alert.timeStamp);

        kml += `
        <Placemark>
            <name>${escapeXml(name)}</name>
            <description><![CDATA[
                <div style="font-family: Arial, sans-serif; min-width: 220px;">
                    <h3 style="margin: 0 0 10px 0; color: #d32f2f;">🚨 Alert Zone</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr><td style="padding: 4px 8px 4px 0; color: #666; white-space: nowrap;">Location:</td><td style="padding: 4px 0;"><strong>${escapeXml(name)}</strong></td></tr>
                        ${hebrewName && hebrewName !== name ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Hebrew:</td><td style="padding: 4px 0;">${escapeXml(hebrewName)}</td></tr>` : ''}
                        ${area ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Region:</td><td style="padding: 4px 0;">${escapeXml(area)}</td></tr>` : ''}
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Date:</td><td style="padding: 4px 0;">${dt.date}</td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Time:</td><td style="padding: 4px 0;"><strong>${dt.time}</strong></td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Elapsed:</td><td style="padding: 4px 0;">${ago}</td></tr>
                        ${countdown ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Shelter:</td><td style="padding: 4px 0;">${countdown} sec</td></tr>` : ''}
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">Source: rocketalert.live</p>
                </div>
            ]]></description>
            <styleUrl>#${style}</styleUrl>
            <TimeStamp><when>${new Date(alert.timeStamp).toISOString()}</when></TimeStamp>
            <Polygon>
                <outerBoundaryIs>
                    <LinearRing>
                        <coordinates>${polygonToKmlCoords(polygon)}</coordinates>
                    </LinearRing>
                </outerBoundaryIs>
            </Polygon>
        </Placemark>`;
    }

    kml += `
    </Folder>

    <Folder>
        <name>Alert Points (${alerts.length})</name>
        <description>Individual alert markers with timestamps. Last updated: ${nowFormatted.full}</description>
`;

    for (const alert of sortedAlerts) {
        // Skip alerts without coordinates
        if (!alert.lat || !alert.lon) continue;

        const name = alert.englishName || alert.name || 'Unknown';
        const hebrewName = alert.name || '';
        const area = alert.areaNameEn || alert.areaNameHe || '';
        const countdown = alert.countdownSec || 0;
        const style = getAlertStyle(alert);
        const ago = timeAgo(alert.timeStamp);
        const dt = formatDateTime(alert.timeStamp);

        kml += `
        <Placemark>
            <name>${escapeXml(name)}</name>
            <description><![CDATA[
                <div style="font-family: Arial, sans-serif; min-width: 220px;">
                    <h3 style="margin: 0 0 10px 0; color: #d32f2f;">🚨 Rocket Alert</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr><td style="padding: 4px 8px 4px 0; color: #666; white-space: nowrap;">Location:</td><td style="padding: 4px 0;"><strong>${escapeXml(name)}</strong></td></tr>
                        ${hebrewName && hebrewName !== name ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Hebrew:</td><td style="padding: 4px 0;">${escapeXml(hebrewName)}</td></tr>` : ''}
                        ${area ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Region:</td><td style="padding: 4px 0;">${escapeXml(area)}</td></tr>` : ''}
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Date:</td><td style="padding: 4px 0;">${dt.date}</td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Time:</td><td style="padding: 4px 0;"><strong>${dt.time}</strong></td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Elapsed:</td><td style="padding: 4px 0;">${ago}</td></tr>
                        ${countdown ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Shelter:</td><td style="padding: 4px 0;">${countdown} sec</td></tr>` : ''}
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">Source: rocketalert.live</p>
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
                <Data name="date"><value>${dt.date}</value></Data>
                <Data name="time"><value>${dt.time}</value></Data>
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
        // Fetch alerts and polygons in parallel
        const [alertResponse, polygons] = await Promise.all([
            fetchJson(API_URL),
            fetchJson(POLYGONS_URL).catch(err => {
                console.log('Warning: Could not fetch polygons:', err.message);
                return {};
            })
        ]);

        console.log(`Fetched polygon data for ${Object.keys(polygons).length} areas`);

        if (!alertResponse.success || !alertResponse.payload) {
            console.log('No alerts data in response');
            return;
        }

        // Extract all alerts from payload
        const newAlerts = [];
        for (const group of alertResponse.payload) {
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

        // Filter out alerts older than retention period
        allAlerts = filterOldAlerts(allAlerts);
        console.log(`After 4-hour filter: ${allAlerts.length} alerts`);

        // Save updated cache
        saveCachedAlerts(allAlerts);

        // Generate and save KML
        const kml = generateKml(allAlerts, polygons);
        fs.writeFileSync(ALERTS_FILE, kml);
        console.log(`KML saved to ${ALERTS_FILE}`);

        // Stats
        const alertsWithCoords = allAlerts.filter(a => a.lat && a.lon).length;
        const alertsWithPolygons = allAlerts.filter(a => a.taCityId && polygons[a.taCityId]).length;
        console.log(`Alerts with coordinates: ${alertsWithCoords}`);
        console.log(`Alerts with polygons: ${alertsWithPolygons}`);

    } catch (error) {
        console.error('Error updating alerts:', error.message);

        // If API fails, still try to refresh KML from cache
        const existingAlerts = loadCachedAlerts();
        if (existingAlerts.length > 0) {
            const filteredAlerts = filterOldAlerts(existingAlerts);
            saveCachedAlerts(filteredAlerts);
            const kml = generateKml(filteredAlerts, {});
            fs.writeFileSync(ALERTS_FILE, kml);
            console.log('Regenerated KML from cache (no polygons)');
        }
    }
}

// Run
updateAlerts();

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
        const alertTime = parseAlertTimestamp(alert.timeStamp).getTime();
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
            const existingTime = parseAlertTimestamp(existing.timeStamp).getTime();
            const newTime = parseAlertTimestamp(alert.timeStamp).getTime();
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
 * Parse timestamp from API (Israel time) to Date object
 * API returns: "2026-02-28 18:15:34" in Israel timezone
 */
function parseAlertTimestamp(timestamp) {
    if (!timestamp) return new Date();

    // If already an ISO string with timezone, parse directly
    if (timestamp.includes('T') || timestamp.includes('Z')) {
        return new Date(timestamp);
    }

    // API format: "2026-02-28 18:15:34" (Israel time)
    // Convert to ISO format and append Israel timezone offset
    // Israel is UTC+2 (winter) or UTC+3 (summer DST)
    // For simplicity, we'll treat as UTC+2 and let the display handle DST
    const isoString = timestamp.replace(' ', 'T') + '+02:00';
    return new Date(isoString);
}

/**
 * Get style ID based on alert age
 */
function getAlertStyle(alert) {
    const alertTime = parseAlertTimestamp(alert.timeStamp);
    const ageMs = Date.now() - alertTime.getTime();
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
    const alertTime = parseAlertTimestamp(alert.timeStamp);
    const ageMs = Date.now() - alertTime.getTime();
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
    const alertTime = parseAlertTimestamp(timestamp);
    const ms = Date.now() - alertTime.getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Format time for a specific timezone
 */
function formatTimeForZone(date, timeZone, label) {
    const timeStr = date.toLocaleTimeString('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    return { time: timeStr, label };
}

/**
 * Format date/time for multiple timezones
 */
function formatDateTime(timestamp) {
    const date = parseAlertTimestamp(timestamp);

    // Format date (use Israel timezone as reference)
    const dateStr = date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    // Format time for Israel (primary)
    const israelTime = date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    // Format times for other timezones
    const timezones = {
        israel: formatTimeForZone(date, 'Asia/Jerusalem', 'Israel'),
        central: formatTimeForZone(date, 'America/Chicago', 'Central'),
        london: formatTimeForZone(date, 'Europe/London', 'London'),
        singapore: formatTimeForZone(date, 'Asia/Singapore', 'Singapore')
    };

    return {
        date: dateStr,
        time: israelTime,
        full: `${dateStr} ${israelTime}`,
        timezones
    };
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
    <description>Real-time rocket and missile alerts in Israel. Updated every 5 minutes. Last updated: ${nowFormatted.full} (Israel Time)</description>

    <Style id="alert-critical">
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="alert-recent">
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="alert-moderate">
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="alert-old">
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="poly-critical">
      <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
      <PolyStyle><color>600000ff</color><outline>1</outline></PolyStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="poly-recent">
      <LineStyle><color>ff0080ff</color><width>2</width></LineStyle>
      <PolyStyle><color>400080ff</color><outline>1</outline></PolyStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="poly-moderate">
      <LineStyle><color>ff00ffff</color><width>1</width></LineStyle>
      <PolyStyle><color>3000ffff</color><outline>1</outline></PolyStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="poly-old">
      <LineStyle><color>ff808080</color><width>1</width></LineStyle>
      <PolyStyle><color>20808080</color><outline>1</outline></PolyStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>`;

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
                <div style="font-family: Arial, sans-serif; min-width: 280px;">
                    <h3 style="margin: 0 0 10px 0; color: #d32f2f;">🚨 Alert Zone</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr><td style="padding: 4px 8px 4px 0; color: #666; white-space: nowrap;">Location:</td><td style="padding: 4px 0;"><strong>${escapeXml(name)}</strong></td></tr>
                        ${hebrewName && hebrewName !== name ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Hebrew:</td><td style="padding: 4px 0;">${escapeXml(hebrewName)}</td></tr>` : ''}
                        ${area ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Region:</td><td style="padding: 4px 0;">${escapeXml(area)}</td></tr>` : ''}
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Date:</td><td style="padding: 4px 0;">${dt.date}</td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Elapsed:</td><td style="padding: 4px 0;"><strong>${ago}</strong></td></tr>
                        ${countdown ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Shelter:</td><td style="padding: 4px 0;">${countdown} sec</td></tr>` : ''}
                    </table>
                    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
                        <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Alert Time:</div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇮🇱 Israel:</td><td style="padding: 2px 0;"><strong>${dt.timezones.israel.time}</strong></td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇺🇸 Central:</td><td style="padding: 2px 0;">${dt.timezones.central.time}</td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇬🇧 London:</td><td style="padding: 2px 0;">${dt.timezones.london.time}</td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇸🇬 Singapore:</td><td style="padding: 2px 0;">${dt.timezones.singapore.time}</td></tr>
                        </table>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">Source: rocketalert.live</p>
                </div>
            ]]></description>
            <styleUrl>#${style}</styleUrl>
            <TimeStamp><when>${parseAlertTimestamp(alert.timeStamp).toISOString()}</when></TimeStamp>
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
                <div style="font-family: Arial, sans-serif; min-width: 280px;">
                    <h3 style="margin: 0 0 10px 0; color: #d32f2f;">🚨 Rocket Alert</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr><td style="padding: 4px 8px 4px 0; color: #666; white-space: nowrap;">Location:</td><td style="padding: 4px 0;"><strong>${escapeXml(name)}</strong></td></tr>
                        ${hebrewName && hebrewName !== name ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Hebrew:</td><td style="padding: 4px 0;">${escapeXml(hebrewName)}</td></tr>` : ''}
                        ${area ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Region:</td><td style="padding: 4px 0;">${escapeXml(area)}</td></tr>` : ''}
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Date:</td><td style="padding: 4px 0;">${dt.date}</td></tr>
                        <tr><td style="padding: 4px 8px 4px 0; color: #666;">Elapsed:</td><td style="padding: 4px 0;"><strong>${ago}</strong></td></tr>
                        ${countdown ? `<tr><td style="padding: 4px 8px 4px 0; color: #666;">Shelter:</td><td style="padding: 4px 0;">${countdown} sec</td></tr>` : ''}
                    </table>
                    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
                        <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Alert Time:</div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇮🇱 Israel:</td><td style="padding: 2px 0;"><strong>${dt.timezones.israel.time}</strong></td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇺🇸 Central:</td><td style="padding: 2px 0;">${dt.timezones.central.time}</td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇬🇧 London:</td><td style="padding: 2px 0;">${dt.timezones.london.time}</td></tr>
                            <tr><td style="padding: 2px 8px 2px 0; color: #888;">🇸🇬 Singapore:</td><td style="padding: 2px 0;">${dt.timezones.singapore.time}</td></tr>
                        </table>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">Source: rocketalert.live</p>
                </div>
            ]]></description>
            <styleUrl>#${style}</styleUrl>
            <TimeStamp><when>${parseAlertTimestamp(alert.timeStamp).toISOString()}</when></TimeStamp>
            <Point>
                <coordinates>${alert.lon},${alert.lat},0</coordinates>
            </Point>
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

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    // Default Mobilize.us search URL - can be overridden via environment variable
    searchUrl: process.env.MOBILIZE_SEARCH_URL || 'https://www.mobilize.us/map/?q=ICE',
    // Delay between API requests (ms) to avoid rate limiting
    requestDelay: 500,
    // Maximum events to fetch (0 = unlimited)
    maxEvents: parseInt(process.env.MOBILIZE_MAX_EVENTS) || 0,
    // Output file
    outputFile: path.join(__dirname, '..', 'kmls', 'mobilize-events.kml')
};

/**
 * Fetch URL content with proper handling
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KML-Generator/1.0)',
                'Accept': 'text/html,application/json,*/*'
            }
        };

        protocol.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
 * Extract event markers from Mobilize.us search page
 */
async function extractEventMarkers(searchUrl) {
    console.log(`  Fetching search page: ${searchUrl}`);
    const html = await fetchUrl(searchUrl);
    console.log(`  Fetched ${(html.length / 1024).toFixed(1)} KB`);

    // Extract embedded event data
    const regex = /window\.__MLZ_EMBEDDED_DATA__\s*=\s*({[\s\S]*?});/;
    const match = html.match(regex);

    if (!match) {
        throw new Error('Could not find embedded event data in page');
    }

    const embeddedData = JSON.parse(match[1]);
    const markers = embeddedData.data?.event_marker_response?.event_markers;

    if (!markers || markers.length === 0) {
        throw new Error('No event markers found in page');
    }

    return markers;
}

/**
 * Fetch full event details from Mobilize.us API
 */
async function fetchEventDetails(eventId) {
    const url = `https://www.mobilize.us/mobilize/event/${eventId}/`;

    try {
        const response = await fetchUrl(url);

        // Try to parse as JSON first
        try {
            const data = JSON.parse(response);
            return data.data?.event || data.embedded_json?.data?.event || data;
        } catch (e) {
            // Fallback to HTML parsing - look for JSON-LD structured data
            const jsonLdMatch = response.match(/<script type="application\/ld\+json">\s*(\[[\s\S]*?\])\s*<\/script>/);

            if (jsonLdMatch) {
                const jsonLdArray = JSON.parse(jsonLdMatch[1]);
                const jsonLd = jsonLdArray[0];

                return {
                    name: jsonLd.name,
                    description: jsonLd.description,
                    organization: {
                        name: jsonLd.organizer?.name || 'Unknown',
                        slug: jsonLd.organizer?.url?.split('/').filter(x => x).pop() || ''
                    },
                    location_name: jsonLd.location?.name || '',
                    address_line1: jsonLd.location?.address?.streetAddress || '',
                    address_line2: '',
                    city: jsonLd.location?.address?.addressLocality || '',
                    state: jsonLd.location?.address?.addressRegion || '',
                    zipcode: jsonLd.location?.address?.postalCode || '',
                    country: jsonLd.location?.address?.addressCountry || 'US',
                    times: [{
                        start: jsonLd.startDate,
                        end: jsonLd.endDate
                    }],
                    image_url: jsonLd.image?.[0] || ''
                };
            }

            throw new Error('Could not parse event data');
        }
    } catch (error) {
        throw new Error(`Failed to fetch event ${eventId}: ${error.message}`);
    }
}

/**
 * Format event time for display
 */
function formatEventTime(times) {
    if (!times || times.length === 0) return 'Time not specified';

    try {
        const start = new Date(times[0].start);
        const end = times[0].end ? new Date(times[0].end) : null;

        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };

        const dateStr = start.toLocaleDateString('en-US', dateOptions);
        const startTimeStr = start.toLocaleTimeString('en-US', timeOptions);

        if (end) {
            const endTimeStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `${dateStr} at ${startTimeStr} - ${endTimeStr}`;
        }
        return `${dateStr} at ${startTimeStr}`;
    } catch (e) {
        return 'Time not available';
    }
}

/**
 * Generate KML from fetched events
 */
function generateKML(events, searchUrl) {
    const timestamp = new Date().toISOString();
    const searchQuery = decodeURIComponent(searchUrl.match(/[?&]q=([^&]+)/)?.[1] || 'events').replace(/\+/g, ' ');

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>Mobilize.us Events - ${escapeXml(searchQuery)}</name>
    <description>Events from Mobilize.us search. Updated: ${timestamp}</description>

    <!-- Exact location (street address) -->
    <Style id="exact">
        <IconStyle>
            <color>ff0000ff</color>
            <scale>1.1</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
        </IconStyle>
        <BalloonStyle>
            <bgColor>ff1a1a2e</bgColor>
            <textColor>ffffffff</textColor>
        </BalloonStyle>
    </Style>

    <!-- Approximate location -->
    <Style id="approximate">
        <IconStyle>
            <color>ff00ffff</color>
            <scale>1.0</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href></Icon>
        </IconStyle>
        <BalloonStyle>
            <bgColor>ff1a1a2e</bgColor>
            <textColor>ffffffff</textColor>
        </BalloonStyle>
    </Style>

    <!-- Zipcode-level location -->
    <Style id="zipcode">
        <IconStyle>
            <color>ff00aaff</color>
            <scale>0.9</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon>
        </IconStyle>
        <BalloonStyle>
            <bgColor>ff1a1a2e</bgColor>
            <textColor>ffffffff</textColor>
        </BalloonStyle>
    </Style>

    <!-- Error fetching details -->
    <Style id="error">
        <IconStyle>
            <color>ff0000cc</color>
            <scale>0.8</scale>
            <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-diamond.png</href></Icon>
        </IconStyle>
        <BalloonStyle>
            <bgColor>ff1a1a2e</bgColor>
            <textColor>ffffffff</textColor>
        </BalloonStyle>
    </Style>

`;

    for (const event of events) {
        const name = escapeXml(event.name || `Event ${event.event_id}`);
        const lat = event.marker_lat || event.lat || 0;
        const lng = event.marker_lng || event.lon || event.lng || 0;
        const eventUrl = `https://www.mobilize.us/event/${event.event_id}/`;

        let description = '';

        if (event.error) {
            description = `<![CDATA[
<p><strong>Event ID:</strong> ${event.event_id}</p>
<p><strong>Zipcode:</strong> ${event.marker_zipcode || 'N/A'}</p>
<p><a href="${eventUrl}" target="_blank">View Event on Mobilize.us</a></p>
<p><i>Note: Could not fetch full event details</i></p>
]]>`;
        } else {
            const timeStr = formatEventTime(event.times);

            // Format location
            let locationStr = '';
            if (event.location_name) locationStr += escapeXml(event.location_name) + '<br>';
            if (event.address_line1) locationStr += escapeXml(event.address_line1);
            if (event.address_line2) locationStr += ', ' + escapeXml(event.address_line2);
            if (event.city || event.state || event.zipcode) {
                locationStr += '<br>' + [event.city, event.state].filter(x => x).map(escapeXml).join(', ');
                if (event.zipcode) locationStr += ' ' + escapeXml(event.zipcode);
            }

            const org = escapeXml(event.organization?.name || 'Unknown');
            const desc = escapeXml(event.description || '');

            description = `<![CDATA[
<h3>${escapeXml(event.name || 'Event')}</h3>
<p><strong>When:</strong> ${timeStr}</p>
<p><strong>Where:</strong><br>${locationStr || 'Location not specified'}</p>
<p><strong>Organized by:</strong> ${org}</p>
${desc ? `<p><strong>About:</strong></p><p>${desc}</p>` : ''}
<p><a href="${eventUrl}" target="_blank">View Event on Mobilize.us</a></p>
<p><i>Data source: Mobilize.us | Updated: ${timestamp}</i></p>
]]>`;
        }

        const styleUrl = event.error ? 'error' : (event.location_specificity || 'exact');

        kml += `    <Placemark>
        <name>${name}</name>
        <description>${description}</description>
        <styleUrl>#${styleUrl}</styleUrl>
        <ExtendedData>
            <Data name="EventID"><value>${event.event_id}</value></Data>
            <Data name="Organization"><value>${escapeXml(event.organization?.name || 'Unknown')}</value></Data>
            <Data name="LocationType"><value>${event.location_specificity || 'exact'}</value></Data>
        </ExtendedData>
        <Point>
            <coordinates>${lng},${lat},0</coordinates>
        </Point>
    </Placemark>
`;
    }

    kml += `</Document>
</kml>`;

    return kml;
}

/**
 * Main update function
 */
async function updateMobilizeEvents() {
    console.log('Updating Mobilize.us events...');

    try {
        // Extract event markers from search page
        const markers = await extractEventMarkers(CONFIG.searchUrl);
        console.log(`  Found ${markers.length} event markers`);

        // Limit events if configured
        const eventsToFetch = CONFIG.maxEvents > 0
            ? markers.slice(0, CONFIG.maxEvents)
            : markers;
        console.log(`  Fetching details for ${eventsToFetch.length} events...`);

        // Fetch full details for each event
        const fetchedEvents = [];
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < eventsToFetch.length; i++) {
            const marker = eventsToFetch[i];
            const eventId = marker.event_id;

            try {
                const eventData = await fetchEventDetails(eventId);

                fetchedEvents.push({
                    ...eventData,
                    marker_lat: marker.lat,
                    marker_lng: marker.lng,
                    location_specificity: marker.location_specificity,
                    marker_zipcode: marker.zipcode,
                    event_id: eventId
                });

                successCount++;
                if ((i + 1) % 10 === 0 || i === eventsToFetch.length - 1) {
                    console.log(`    Progress: ${i + 1}/${eventsToFetch.length} (${successCount} success, ${failCount} failed)`);
                }
            } catch (error) {
                failCount++;
                // Still add marker data so we don't lose the location
                fetchedEvents.push({
                    event_id: eventId,
                    name: `Event ${eventId}`,
                    marker_lat: marker.lat,
                    marker_lng: marker.lng,
                    location_specificity: marker.location_specificity,
                    marker_zipcode: marker.zipcode,
                    error: true
                });
            }

            // Rate limiting delay
            if (i < eventsToFetch.length - 1) {
                await sleep(CONFIG.requestDelay);
            }
        }

        // Generate KML
        console.log('  Generating KML...');
        const kml = generateKML(fetchedEvents, CONFIG.searchUrl);

        // Ensure output directory exists
        const outputDir = path.dirname(CONFIG.outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write KML file
        fs.writeFileSync(CONFIG.outputFile, kml, 'utf8');

        console.log(`✓ Mobilize.us KML updated`);
        console.log(`  Events: ${fetchedEvents.length} total`);
        console.log(`  Success: ${successCount} | Failed: ${failCount}`);
        console.log(`  Output: ${CONFIG.outputFile}`);

        return true;
    } catch (error) {
        console.error(`✗ Failed to update Mobilize.us events: ${error.message}`);
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    console.log('Starting Mobilize.us KML update...');
    console.log('======================\n');

    updateMobilizeEvents().then(success => {
        console.log('\n======================');
        console.log(`Mobilize.us update ${success ? 'complete!' : 'failed!'}`);
        process.exit(success ? 0 : 1);
    });
}

module.exports = { updateMobilizeEvents };

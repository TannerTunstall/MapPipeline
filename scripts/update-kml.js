#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Update KML files from various sources
 *
 * Data Sources:
 * - SafeAirspace.net: Aviation risk warnings and NOTAMs
 */

const KML_DIR = path.join(__dirname, '..', 'kmls');

// Ensure kmls directory exists
if (!fs.existsSync(KML_DIR)) {
    fs.mkdirSync(KML_DIR, { recursive: true });
}

/**
 * Fetch content from a URL with redirect support
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : require('http');
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        };

        protocol.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ============================================================================
// Country Code Mapping
// ============================================================================

const countryNameToCode = {
    'Afghanistan': 'AFG', 'Albania': 'ALB', 'Algeria': 'DZA', 'Angola': 'AGO', 'Argentina': 'ARG',
    'Armenia': 'ARM', 'Australia': 'AUS', 'Austria': 'AUT', 'Azerbaijan': 'AZE',
    'Bahamas': 'BHS', 'Bahrain': 'BHR', 'Bangladesh': 'BGD', 'Barbados': 'BRB', 'Belarus': 'BLR',
    'Belgium': 'BEL', 'Belize': 'BLZ', 'Benin': 'BEN', 'Bhutan': 'BTN', 'Bolivia': 'BOL',
    'Bosnia and Herzegovina': 'BIH', 'Botswana': 'BWA', 'Brazil': 'BRA',
    'Brunei': 'BRN', 'Bulgaria': 'BGR', 'Burkina Faso': 'BFA', 'Burundi': 'BDI', 'Cambodia': 'KHM',
    'Cameroon': 'CMR', 'Canada': 'CAN', 'Cape Verde': 'CPV',
    'Central African Republic': 'CAF', 'CentralAfricanRepublic': 'CAF', 'Chad': 'TCD', 'Chile': 'CHL',
    'China': 'CHN', 'Colombia': 'COL', 'Congo DRC': 'COD', 'CongoDRC': 'COD', 'Costa Rica': 'CRI',
    'Croatia': 'HRV', 'Cuba': 'CUB', 'Curacao': 'CUW', 'Cyprus': 'CYP', 'Czech Republic': 'CZE',
    'Denmark': 'DNK', 'Djibouti': 'DJI', 'Dominican Republic': 'DOM', 'Ecuador': 'ECU', 'Egypt': 'EGY',
    'El Salvador': 'SLV', 'Equatorial Guinea': 'GNQ', 'Eritrea': 'ERI', 'Estonia': 'EST',
    'Ethiopia': 'ETH', 'Fiji': 'FJI',
    'Finland': 'FIN', 'France': 'FRA', 'Gabon': 'GAB', 'Gambia': 'GMB',
    'Georgia': 'GEO', 'Germany': 'DEU', 'Ghana': 'GHA', 'Greece': 'GRC', 'Greenland': 'GRL',
    'Guatemala': 'GTM', 'Guinea': 'GIN', 'Guyana': 'GUY',
    'Haiti': 'HTI', 'Honduras': 'HND', 'Hungary': 'HUN', 'Iceland': 'ISL', 'India': 'IND',
    'Indonesia': 'IDN', 'Iran': 'IRN', 'Iraq': 'IRQ', 'Ireland': 'IRL', 'Israel': 'ISR',
    'Italy': 'ITA', 'Ivory Coast': 'CIV', 'Jamaica': 'JAM', 'Japan': 'JPN', 'Jordan': 'JOR',
    'Kazakhstan': 'KAZ', 'Kenya': 'KEN', 'Kuwait': 'KWT', 'Kyrgyzstan': 'KGZ', 'Laos': 'LAO',
    'Latvia': 'LVA', 'Lebanon': 'LBN', 'Lesotho': 'LSO', 'Liberia': 'LBR', 'Libya': 'LBY',
    'Lithuania': 'LTU', 'Luxembourg': 'LUX', 'Macedonia': 'MKD', 'Madagascar': 'MDG', 'Malawi': 'MWI',
    'Malaysia': 'MYS', 'Mali': 'MLI', 'Malta': 'MLT', 'Mauritania': 'MRT',
    'Mauritius': 'MUS', 'Mexico': 'MEX', 'Moldova': 'MDA', 'Mongolia': 'MNG', 'Montenegro': 'MNE',
    'Morocco': 'MAR', 'Mozambique': 'MOZ', 'Myanmar': 'MMR', 'Namibia': 'NAM', 'Nepal': 'NPL',
    'Netherlands': 'NLD', 'New Zealand': 'NZL', 'Nicaragua': 'NIC', 'Niger': 'NER', 'Nigeria': 'NGA',
    'North Korea': 'PRK', 'NorthKorea': 'PRK', 'Norway': 'NOR', 'Oman': 'OMN', 'Pakistan': 'PAK',
    'Panama': 'PAN', 'Papua New Guinea': 'PNG', 'Paraguay': 'PRY', 'Peru': 'PER', 'Philippines': 'PHL',
    'Poland': 'POL', 'Portugal': 'PRT', 'Puerto Rico': 'PRI', 'PuertoRico': 'PRI', 'Qatar': 'QAT',
    'Romania': 'ROU', 'Russia': 'RUS', 'Rwanda': 'RWA',
    'Saudi Arabia': 'SAU', 'SaudiArabia': 'SAU', 'Senegal': 'SEN',
    'Serbia': 'SRB', 'Sierra Leone': 'SLE', 'Singapore': 'SGP', 'Slovakia': 'SVK',
    'Slovenia': 'SVN', 'Somalia': 'SOM', 'South Africa': 'ZAF', 'South Korea': 'KOR', 'SouthKorea': 'KOR',
    'South Sudan': 'SSD', 'SouthSudan': 'SSD', 'Spain': 'ESP', 'Sri Lanka': 'LKA', 'Sudan': 'SDN',
    'Suriname': 'SUR', 'Swaziland': 'SWZ', 'Sweden': 'SWE', 'Switzerland': 'CHE', 'Syria': 'SYR',
    'Taiwan': 'TWN', 'Tajikistan': 'TJK', 'Tanzania': 'TZA', 'Thailand': 'THA', 'Togo': 'TGO',
    'Trinidad and Tobago': 'TTO', 'Tunisia': 'TUN', 'Turkey': 'TUR', 'Turkmenistan': 'TKM',
    'Uganda': 'UGA', 'Ukraine': 'UKR', 'United Arab Emirates': 'ARE',
    'UnitedArabEmirates': 'ARE', 'United Kingdom': 'GBR', 'United States': 'USA', 'Uruguay': 'URY',
    'Uzbekistan': 'UZB', 'Vanuatu': 'VUT', 'Venezuela': 'VEN', 'Vietnam': 'VNM',
    'Western Sahara': 'ESH', 'WesternSahara': 'ESH', 'Yemen': 'YEM', 'Zambia': 'ZMB', 'Zimbabwe': 'ZWE',
    'Central America': 'CENTRAL_AMERICA', 'CentralAmerica': 'CENTRAL_AMERICA',
    'Aruba': 'ABW', 'Bonaire': 'BES'
};

const riskLabels = {
    1: 'Do Not Fly',
    2: 'High Risk',
    3: 'Caution',
    4: 'Monitor'
};

// KML polygon colors (AABBGGRR format)
const riskColors = {
    1: { fill: '990000ff', outline: 'ff0000ff' },  // Red
    2: { fill: '990080ff', outline: 'ff0080ff' },  // Orange
    3: { fill: '9900ffff', outline: 'ff00ffff' },  // Yellow
    4: { fill: '00000000', outline: 'ff00ff00' }   // Transparent (green outline only)
};

function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Fetch country boundaries GeoJSON from Natural Earth via GitHub
 */
async function fetchCountryBoundaries() {
    console.log('  Fetching country boundaries...');
    const url = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

    try {
        const data = await fetchUrl(url);
        return JSON.parse(data);
    } catch (error) {
        console.error('  Failed to fetch country boundaries:', error.message);
        return null;
    }
}

/**
 * Convert GeoJSON coordinates to KML coordinate string
 */
function coordsToKml(coords) {
    if (typeof coords[0] === 'number') {
        return `${coords[0]},${coords[1]},0`;
    }
    return coords.map(c => coordsToKml(c)).join(' ');
}

/**
 * Generate KML polygon from GeoJSON geometry
 */
function geometryToKml(geometry) {
    let kml = '';

    if (geometry.type === 'Polygon') {
        kml += '        <Polygon>\n';
        kml += '          <outerBoundaryIs><LinearRing><coordinates>\n';
        kml += '            ' + coordsToKml(geometry.coordinates[0]) + '\n';
        kml += '          </coordinates></LinearRing></outerBoundaryIs>\n';

        // Inner boundaries (holes)
        for (let i = 1; i < geometry.coordinates.length; i++) {
            kml += '          <innerBoundaryIs><LinearRing><coordinates>\n';
            kml += '            ' + coordsToKml(geometry.coordinates[i]) + '\n';
            kml += '          </coordinates></LinearRing></innerBoundaryIs>\n';
        }
        kml += '        </Polygon>\n';
    } else if (geometry.type === 'MultiPolygon') {
        kml += '        <MultiGeometry>\n';
        for (const polygon of geometry.coordinates) {
            kml += '          <Polygon>\n';
            kml += '            <outerBoundaryIs><LinearRing><coordinates>\n';
            kml += '              ' + coordsToKml(polygon[0]) + '\n';
            kml += '            </coordinates></LinearRing></outerBoundaryIs>\n';

            for (let i = 1; i < polygon.length; i++) {
                kml += '            <innerBoundaryIs><LinearRing><coordinates>\n';
                kml += '              ' + coordsToKml(polygon[i]) + '\n';
                kml += '            </coordinates></LinearRing></innerBoundaryIs>\n';
            }
            kml += '          </Polygon>\n';
        }
        kml += '        </MultiGeometry>\n';
    }

    return kml;
}

/**
 * Fetch and generate SafeAirspace KML with polygon boundaries
 */
async function updateSafeAirspace() {
    console.log('Updating SafeAirspace data...');

    try {
        // Fetch SafeAirspace data
        const html = await fetchUrl('https://safeairspace.net/');
        console.log(`  Fetched ${(html.length / 1024).toFixed(1)} KB from safeairspace.net`);

        // Fetch country boundaries
        const boundaries = await fetchCountryBoundaries();
        if (!boundaries) {
            console.error('  Cannot generate polygon KML without boundaries data');
            return false;
        }
        console.log(`  Loaded ${boundaries.features.length} country boundaries`);

        // Build a map of ISO3 code to GeoJSON feature
        const countryFeatures = {};
        for (const feature of boundaries.features) {
            const iso3 = feature.properties['ISO3166-1-Alpha-3'];
            if (iso3 && iso3 !== '-99') {
                countryFeatures[iso3] = feature;
            }
            // Also map by country name for fallback
            if (feature.properties.name) {
                countryFeatures[feature.properties.name] = feature;
            }
        }

        // Parse SafeAirspace data
        const data = {};

        // Extract warnings
        const warningMatches = html.matchAll(/(\w+)Warning\s*=\s*'((?:[^'\\]|\\.)*)'/g);
        for (const match of warningMatches) {
            const country = match[1];
            const content = match[2].replace(/\\'/g, "'").replace(/\\n/g, '\n');
            if (content.length > 0) {
                if (!data[country]) data[country] = {};
                data[country].warning = content;
            }
        }

        // Extract news
        const newsMatches = html.matchAll(/(\w+)News\s*=\s*'((?:[^'\\]|\\.)*)'/g);
        for (const match of newsMatches) {
            const country = match[1];
            const content = match[2].replace(/\\'/g, "'").replace(/\\n/g, '\n');
            if (content.length > 0) {
                if (!data[country]) data[country] = {};
                data[country].news = content;
            }
        }

        // Extract risk levels
        const levelPattern = /data-feed-item-country="([^"]+)"[^>]*data-feed-item-warn-level="(\d)"/g;
        let levelMatch;
        while ((levelMatch = levelPattern.exec(html)) !== null) {
            const countryDisplay = levelMatch[1];
            const level = parseInt(levelMatch[2]);
            const countryKey = countryDisplay.replace(/\s+/g, '');

            if (data[countryKey]) {
                data[countryKey].level = level;
                data[countryKey].displayName = countryDisplay;
            } else {
                const existingKey = Object.keys(data).find(k =>
                    k.toLowerCase() === countryKey.toLowerCase() ||
                    k.toLowerCase().replace(/\s+/g, '') === countryKey.toLowerCase()
                );
                if (existingKey) {
                    data[existingKey].level = level;
                    data[existingKey].displayName = countryDisplay;
                } else {
                    data[countryKey] = { level, displayName: countryDisplay };
                }
            }
        }

        // Generate KML
        const countriesWithData = Object.entries(data).filter(([k, v]) => v.warning || v.level);
        const timestamp = new Date().toISOString();

        let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Safe Airspace - Aviation Risk Map</name>
    <description>Aviation risk warnings and NOTAMs from SafeAirspace.net. Updated: ${timestamp}</description>

    <!-- Risk Level Styles with Polygon Fill -->
    <Style id="level1">
      <PolyStyle>
        <color>${riskColors[1].fill}</color>
        <outline>1</outline>
      </PolyStyle>
      <LineStyle>
        <color>${riskColors[1].outline}</color>
        <width>2</width>
      </LineStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="level2">
      <PolyStyle>
        <color>${riskColors[2].fill}</color>
        <outline>1</outline>
      </PolyStyle>
      <LineStyle>
        <color>${riskColors[2].outline}</color>
        <width>2</width>
      </LineStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="level3">
      <PolyStyle>
        <color>${riskColors[3].fill}</color>
        <outline>1</outline>
      </PolyStyle>
      <LineStyle>
        <color>${riskColors[3].outline}</color>
        <width>2</width>
      </LineStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Style id="level4">
      <PolyStyle>
        <color>${riskColors[4].fill}</color>
        <outline>1</outline>
      </PolyStyle>
      <LineStyle>
        <color>${riskColors[4].outline}</color>
        <width>1</width>
      </LineStyle>
      <BalloonStyle>
        <bgColor>ff1a1a2e</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
`;

        const byLevel = { 1: [], 2: [], 3: [], 4: [] };
        for (const [countryKey, info] of countriesWithData) {
            const level = info.level || 3;
            byLevel[level].push({ key: countryKey, ...info });
        }

        let totalMapped = 0;
        let unmapped = [];

        for (const level of [1, 2, 3, 4]) {
            const countries = byLevel[level];
            if (countries.length === 0) continue;

            kml += `
    <Folder>
      <name>Level ${level} - ${riskLabels[level]} (${countries.length})</name>
      <open>${level <= 2 ? 1 : 0}</open>
`;

            for (const country of countries) {
                const displayName = country.displayName || country.key;
                const iso3 = countryNameToCode[country.key] || countryNameToCode[displayName];
                // Try ISO3 first, then display name, then key
                let feature = iso3 ? countryFeatures[iso3] : null;
                if (!feature) feature = countryFeatures[displayName];
                if (!feature) feature = countryFeatures[country.key];

                if (!feature) {
                    unmapped.push(displayName);
                    continue;
                }

                totalMapped++;

                // Build full description with all available info
                let description = `<h2>${escapeXml(displayName)}</h2>\n`;
                description += `<h3 style="color: ${level === 1 ? '#ff0000' : level === 2 ? '#ff8000' : '#ffff00'}">`;
                description += `Risk Level ${level}: ${riskLabels[level]}</h3>\n`;

                if (country.news) {
                    const newsText = stripHtml(country.news);
                    description += `<h4>Latest News:</h4>\n<p>${escapeXml(newsText)}</p>\n`;
                }

                if (country.warning) {
                    const warningText = stripHtml(country.warning);
                    description += `<h4>Warning Details / NOTAMs:</h4>\n<p>${escapeXml(warningText)}</p>\n`;
                }

                description += `<p><a href="https://safeairspace.net/${displayName.toLowerCase().replace(/\s+/g, '-')}/">View Full Details on SafeAirspace.net</a></p>\n`;
                description += `<p><i>Data source: SafeAirspace.net | Updated: ${timestamp}</i></p>`;

                kml += `
      <Placemark>
        <name>${escapeXml(displayName)}</name>
        <description><![CDATA[${description}]]></description>
        <styleUrl>#level${level}</styleUrl>
        <ExtendedData>
          <Data name="RiskLevel"><value>${level}</value></Data>
          <Data name="RiskLabel"><value>${riskLabels[level]}</value></Data>
          <Data name="ISO3"><value>${iso3}</value></Data>
          <Data name="Source"><value>SafeAirspace.net</value></Data>
          <Data name="LastUpdate"><value>${timestamp}</value></Data>
        </ExtendedData>
${geometryToKml(feature.geometry)}
      </Placemark>
`;
            }

            kml += `    </Folder>
`;
        }

        kml += `  </Document>
</kml>`;

        // Write KML file
        const outputPath = path.join(KML_DIR, 'safeairspace-warnings.kml');
        fs.writeFileSync(outputPath, kml, 'utf8');

        console.log(`✓ SafeAirspace KML updated`);
        console.log(`  Countries mapped: ${totalMapped}`);
        console.log(`  Level 1 (Do Not Fly): ${byLevel[1].length}`);
        console.log(`  Level 2 (High Risk): ${byLevel[2].length}`);
        console.log(`  Level 3 (Caution): ${byLevel[3].length}`);

        if (unmapped.length > 0) {
            console.log(`  Unmapped: ${unmapped.join(', ')}`);
        }

        return true;
    } catch (error) {
        console.error(`✗ SafeAirspace update failed: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// ============================================================================
// Main Update Function
// ============================================================================

async function updateKMLFiles() {
    console.log('Starting KML update...');
    console.log('======================\n');

    const results = {
        success: [],
        failed: []
    };

    // Update SafeAirspace
    if (await updateSafeAirspace()) {
        results.success.push('safeairspace-warnings.kml');
    } else {
        results.failed.push('safeairspace-warnings.kml');
    }

    console.log('\n======================');
    console.log('KML update complete!');
    console.log(`  Success: ${results.success.length}`);
    console.log(`  Failed: ${results.failed.length}`);

    if (results.failed.length > 0) {
        console.log(`  Failed files: ${results.failed.join(', ')}`);
    }

    return results.failed.length === 0;
}

// Run the update
updateKMLFiles().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Error updating KML files:', error);
    process.exit(1);
});

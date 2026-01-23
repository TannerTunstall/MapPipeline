# MapPipeline

An automatically updating KML repository with a modern web interface. KML files are updated hourly via GitHub Actions and can be imported directly into GIS software, flight planning tools, and mapping applications.

## Live Site

**Website:** [https://mappipeline.com](https://mappipeline.com)

## Features

- **Auto-updating KML files** - GitHub Actions runs hourly to fetch and regenerate KML files from various data sources
- **Direct URL access** - Each KML file is accessible via a direct URL for import into any GIS software
- **Modern web interface** - Browse, search, preview, and download KML files
- **Polygon & point support** - KML files include styled polygons, points, and rich descriptions
- **100% Free hosting** - Powered by GitHub Pages and Cloudflare Pages

## Available KML Layers

### SafeAirspace Warnings
Aviation risk warnings and NOTAMs for countries worldwide, sourced from [SafeAirspace.net](https://safeairspace.net).

```
https://raw.githubusercontent.com/TannerTunstall/MapPipeline/main/kmls/safeairspace-warnings.kml
```

| Risk Level | Label | Color |
|------------|-------|-------|
| 1 | Do Not Fly | Red |
| 2 | High Risk | Orange |
| 3 | Caution | Yellow |

*More KML layers coming soon...*

## Usage

### Import into GIS Software

Copy any KML URL and import it into your preferred mapping software:

- **Google Earth Pro:** File → Open → Enter URL
- **QGIS:** Layer → Add Layer → Add Vector Layer → Protocol: HTTP(S)
- **ArcGIS:** Add Data → Data From Path
- **ForeFlight / Garmin Pilot:** Add as custom map layer

### Direct Download

Visit [mappipeline.com](https://mappipeline.com) to browse and download KML files directly.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Sources   │────▶│  GitHub Actions  │────▶│   KML Files     │
│  (APIs, sites)  │     │  (hourly cron)   │     │  (GitHub repo)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Raw URLs for   │
                                                 │  GIS Import     │
                                                 └─────────────────┘
```

1. **GitHub Actions** runs hourly to fetch the latest data from various sources
2. **Node.js scripts** scrape, parse, and transform data into KML format
3. **KML files** are committed to the repository with updated content
4. **GitHub raw URLs** serve files directly for import into any GIS software

## Project Structure

```
├── index.html                # Web interface
├── styles.css                # Styling
├── script.js                 # Frontend logic
├── kml-manifest.json         # Auto-generated file list
├── kmls/                     # KML files directory
├── scripts/
│   ├── update-kml.js         # Main update script (add sources here)
│   └── generate-manifest.js  # Generates file manifest
└── .github/workflows/
    └── update-kml.yml        # Hourly automation
```

## Adding New KML Sources

To add a new data source, edit `scripts/update-kml.js`:

```javascript
// Fetch KML from a URL
await fetchKML('https://example.com/data.kml', 'output-name.kml');

// Or add custom logic to generate KML from any data source
async function updateMyDataSource() {
    const data = await fetchUrl('https://api.example.com/data');
    const kml = generateKmlFromData(data);
    fs.writeFileSync('kmls/my-layer.kml', kml);
}
```

## Data Sources

| Layer | Source | Update Frequency |
|-------|--------|------------------|
| SafeAirspace Warnings | [SafeAirspace.net](https://safeairspace.net) | Hourly |

## License

MIT

## Disclaimer

Data is provided for informational purposes only. Always verify with official sources before making decisions based on this data. The maintainers are not responsible for the accuracy of third-party data sources.

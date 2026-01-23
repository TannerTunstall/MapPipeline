# Aviation Risk KML Repository

An automatically updating KML repository for aviation risk data. KML files are updated hourly via GitHub Actions and can be imported directly into GIS software, flight planning tools, and mapping applications.

## Live Site

**Website:** [https://mappipeline.pages.dev](https://mappipeline.pages.dev)

## Available KML Layers

### SafeAirspace Warnings
Aviation risk warnings and NOTAMs for countries worldwide, sourced from [SafeAirspace.net](https://safeairspace.net).

**Direct URL:**
```
https://raw.githubusercontent.com/TannerTunstall/MapPipeline/main/kmls/safeairspace-warnings.kml
```

**Risk Levels:**
| Level | Label | Color |
|-------|-------|-------|
| 1 | Do Not Fly | Red |
| 2 | High Risk | Orange |
| 3 | Caution | Yellow |

**Features:**
- Country polygon boundaries with color-coded risk levels
- Detailed warning descriptions and NOTAMs
- Links to full briefings on SafeAirspace.net
- Updated hourly via GitHub Actions

## Usage

### Import into GIS Software
Copy the KML URL and import it into your preferred GIS or mapping software:
- Google Earth Pro: File → Open → Enter URL
- QGIS: Layer → Add Layer → Add Vector Layer → Protocol: HTTP(S)
- ForeFlight, Garmin Pilot, etc.: Add as custom map layer

### Direct Download
Visit the [live site](https://mappipeline.pages.dev) to browse and download KML files.

## How It Works

1. **GitHub Actions** runs hourly to fetch the latest data
2. **Scripts** scrape and parse aviation risk data from source websites
3. **KML files** are generated with country polygons and risk information
4. **GitHub Pages** serves the files via raw URLs for direct import

## Project Structure

```
├── index.html              # Web interface
├── styles.css              # Styling
├── script.js               # Frontend logic
├── kml-manifest.json       # Auto-generated file list
├── kmls/                   # KML files directory
├── scripts/
│   ├── update-kml.js       # Fetches and generates KML files
│   └── generate-manifest.js
└── .github/workflows/
    └── update-kml.yml      # Hourly automation
```

## Data Sources

- **SafeAirspace.net** - Aviation risk assessments and warnings
- Country boundary data from [Natural Earth](https://www.naturalearthdata.com/)

## License

MIT

## Disclaimer

This data is provided for informational purposes only. Always consult official NOTAMs and aviation authorities for flight planning decisions. The maintainers of this repository are not responsible for the accuracy of the source data.

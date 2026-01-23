# KML Repository

An automatically updating KML file repository with a sleek web interface. KML files are updated hourly via GitHub Actions and served directly from GitHub Pages.

## 🌐 Live Site

Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## 📦 Features

- **Auto-updating KML files**: GitHub Actions runs hourly to fetch/update KML files
- **Direct URL access**: Each KML file is accessible via a direct URL for import into software
- **Modern UI**: Clean, responsive interface for browsing and downloading KML files
- **Search functionality**: Quickly find KML files by name
- **One-click URL copying**: Easy sharing of KML file URLs
- **100% Free**: Hosted on GitHub Pages with no costs

## 🚀 Setup

### 1. Create GitHub Repository

1. Create a new repository on GitHub
2. Push this code to your repository

### 2. Enable GitHub Pages

1. Go to your repository Settings
2. Navigate to "Pages" section
3. Under "Source", select "Deploy from a branch"
4. Select branch: `main` and folder: `/ (root)`
5. Click Save

Your site will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/` in a few minutes.

### 3. Configure KML Sources

Edit `scripts/update-kml.js` to add your KML data sources:

```javascript
// Example: Fetch from URL
await fetchKML('https://example.com/data.kml', 'my-data.kml');

// Add multiple sources
await fetchKML('https://api.example.com/kml1', 'location1.kml');
await fetchKML('https://api.example.com/kml2', 'location2.kml');
```

### 4. Update Configuration

In `script.js`, update these variables:
```javascript
const REPO_OWNER = 'YOUR_GITHUB_USERNAME';
const REPO_NAME = 'YOUR_REPO_NAME';
```

### 5. Manual Update (Optional)

Trigger the first update manually:
1. Go to "Actions" tab in your repository
2. Click "Update KML Files" workflow
3. Click "Run workflow"

After this, updates will run automatically every hour.

## 📁 Project Structure

```
.
├── index.html              # Main web interface
├── styles.css              # Styling
├── script.js               # Frontend logic
├── kml-manifest.json       # Auto-generated file list
├── kmls/                   # KML files directory
├── scripts/
│   ├── update-kml.js       # Fetches/updates KML files
│   └── generate-manifest.js # Generates file manifest
└── .github/
    └── workflows/
        └── update-kml.yml  # Hourly update automation
```

## 🔗 Accessing KML Files

Each KML file is accessible via direct URL:

```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/kmls/filename.kml
```

These URLs can be imported directly into software that supports remote KML loading.

## 🛠️ Development

### Run Locally

Simply open `index.html` in a web browser, or use a local server:

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server
```

### Test KML Update Script

```bash
node scripts/update-kml.js
node scripts/generate-manifest.js
```

## 📝 License

MIT

## 🤝 Contributing

Feel free to open issues or submit pull requests!

// Configuration
const REPO_OWNER = 'TannerTunstall';
const REPO_NAME = 'MapPipeline';
const KML_DIRECTORY = 'kmls';

// KML metadata - attribution and data source information
const KML_METADATA = {
    'safeairspace-warnings.kml': {
        displayName: 'SafeAirspace Warnings',
        description: 'Aviation risk levels and NOTAMs by country',
        source: 'SafeAirspace.net',
        sourceUrl: 'https://safeairspace.net',
        license: 'Fair use - factual data aggregation',
        boundarySource: 'Natural Earth via datasets/geo-countries',
        boundaryUrl: 'https://github.com/datasets/geo-countries'
    }
    // Add more KML metadata here as new sources are added
};

// Global state
let currentMap = null;
let currentKmlLayer = null;

// Toast notification system
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success'
        ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

    toast.innerHTML = `
        ${icon}
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Load KML files from the repository
async function loadKMLFiles() {
    try {
        const response = await fetch('kml-manifest.json');
        const manifest = await response.json();

        displayKMLFiles(manifest.files);
        document.getElementById('updateTime').textContent = new Date(manifest.lastUpdate).toLocaleString();

        // Update file count in hero section
        const fileCountEl = document.getElementById('fileCount');
        if (fileCountEl) {
            fileCountEl.textContent = manifest.files.length;
        }
    } catch (error) {
        console.error('Error loading KML files:', error);
        document.getElementById('kmlList').innerHTML = `
            <div class="empty-state">
                <p>Error loading KML files. Please try again later.</p>
            </div>
        `;
    }
}

// Display KML files in the UI
function displayKMLFiles(files) {
    const kmlList = document.getElementById('kmlList');

    if (files.length === 0) {
        kmlList.innerHTML = `
            <div class="empty-state">
                <p>No KML files available yet.</p>
            </div>
        `;
        return;
    }

    kmlList.innerHTML = files.map(file => {
        const meta = KML_METADATA[file.name] || {};
        const displayName = meta.displayName || file.name.replace('.kml', '').replace(/-/g, ' ');
        const description = meta.description || '';
        const sourceHtml = meta.source
            ? `<a href="${meta.sourceUrl}" target="_blank" rel="noopener">${meta.source}</a>`
            : 'Unknown';

        return `
        <div class="kml-card" data-name="${file.name.toLowerCase()}">
            <div class="kml-card-header">
                <div class="kml-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </div>
                <div class="kml-info">
                    <h3>${displayName}</h3>
                    ${description ? `<p class="kml-description">${description}</p>` : ''}
                    <div class="kml-meta">
                        ${formatFileSize(file.size)} &bull; ${new Date(file.updated).toLocaleDateString()}
                    </div>
                    <div class="kml-attribution">
                        Source: ${sourceHtml}
                    </div>
                </div>
            </div>
            <div class="kml-actions">
                <button class="btn btn-accent btn-sm" onclick="openPreview('${file.url}', '${file.name}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    Preview
                </button>
                <a href="${file.url}" class="btn btn-primary btn-sm" download>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </a>
                <button class="btn btn-secondary btn-sm" onclick="copyURL('${file.url}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy URL
                </button>
            </div>
        </div>
    `}).join('');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Copy URL to clipboard with toast notification
function copyURL(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy URL:', err);
        showToast('Failed to copy URL', 'error');
    });
}

// Open map preview modal
function openPreview(url, filename) {
    const modal = document.getElementById('previewModal');
    const modalTitle = document.getElementById('modalTitle');
    const mapLoading = document.getElementById('mapLoading');

    modalTitle.textContent = filename;
    modal.classList.add('active');
    mapLoading.classList.remove('hidden');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Initialize map after modal is visible
    setTimeout(() => {
        initializeMap(url);
    }, 100);
}

// Close map preview modal
function closePreview() {
    const modal = document.getElementById('previewModal');
    modal.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = '';

    // Cleanup map
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
    if (currentKmlLayer) {
        currentKmlLayer = null;
    }
}

// Initialize Leaflet map with KML data
function initializeMap(kmlUrl) {
    const mapContainer = document.getElementById('map');
    const mapLoading = document.getElementById('mapLoading');

    // Clear previous map if exists
    if (currentMap) {
        currentMap.remove();
    }

    // Create new map
    currentMap = L.map(mapContainer).setView([39.8283, -98.5795], 4); // Center on US

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(currentMap);

    // Load KML using omnivore
    // Note: Due to CORS, we may need to use a proxy or ensure the KML is accessible
    currentKmlLayer = omnivore.kml(kmlUrl)
        .on('ready', function() {
            mapLoading.classList.add('hidden');

            // Fit map to KML bounds if there are features
            if (this.getLayers().length > 0) {
                currentMap.fitBounds(this.getBounds(), { padding: [20, 20] });
            }

            // Style the features
            this.eachLayer(function(layer) {
                if (layer.feature && layer.feature.properties) {
                    const props = layer.feature.properties;
                    const popupContent = formatPopupContent(props);
                    if (popupContent) {
                        layer.bindPopup(popupContent);
                    }
                }
            });
        })
        .on('error', function(e) {
            mapLoading.classList.add('hidden');
            console.error('Error loading KML:', e);
            showToast('Error loading KML file. The file may have CORS restrictions.', 'error');

            // Show error message on map
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #9ca3af; z-index: 1000;';
            errorDiv.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="margin: 0 auto 1rem; display: block;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Unable to load KML preview</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Try downloading the file instead</p>
            `;
            mapContainer.appendChild(errorDiv);
        })
        .addTo(currentMap);
}

// Format popup content from KML properties
function formatPopupContent(props) {
    const displayProps = ['name', 'Name', 'description', 'Description', 'title', 'Title'];
    let content = '';

    for (const prop of displayProps) {
        if (props[prop]) {
            if (prop.toLowerCase() === 'name' || prop.toLowerCase() === 'title') {
                content += `<strong>${props[prop]}</strong><br>`;
            } else {
                content += `${props[prop]}<br>`;
            }
        }
    }

    return content || null;
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePreview();
    }
});

// Close modal on background click
document.getElementById('previewModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closePreview();
    }
});

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.kml-card');

    items.forEach(item => {
        const name = item.getAttribute('data-name');
        if (name.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);

        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Load files on page load
loadKMLFiles();

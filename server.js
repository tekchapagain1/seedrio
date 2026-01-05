const express = require("express");
const addon = require("./addon");
const seedrApi = require("./seedrApi");

const app = express();

// ============================================
// Deduplication: Track pending resolve requests
// ============================================
const pendingMagnets = new Map(); // key: infoHash, value: { promise, timestamp }
const recentlyAdded = new Map();  // key: infoHash, value: { result, timestamp }
const PENDING_TTL = 60 * 1000;    // 60 seconds for pending requests
const RECENTLY_ADDED_TTL = 5 * 60 * 1000; // 5 minutes for recently added magnets

/**
 * Clean up expired entries from tracking maps
 */
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [hash, data] of pendingMagnets) {
        if (now - data.timestamp > PENDING_TTL) {
            pendingMagnets.delete(hash);
        }
    }
    for (const [hash, data] of recentlyAdded) {
        if (now - data.timestamp > RECENTLY_ADDED_TTL) {
            recentlyAdded.delete(hash);
        }
    }
}

// Run cleanup every minute
setInterval(cleanupExpiredEntries, 60 * 1000);
const PORT = process.env.PORT || 7000;

// Enable CORS for all routes
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    next();
});

// ============================================
// Configuration Page - Device Code Authorization
// ============================================
app.get("/configure", async (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Setup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            color: #4ade80;
        }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .step { margin: 20px 0; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; }
        .step-number {
            display: inline-block;
            width: 30px;
            height: 30px;
            background: #4ade80;
            color: #1a1a2e;
            border-radius: 50%;
            line-height: 30px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .code-display {
            font-size: 2.5rem;
            font-family: monospace;
            letter-spacing: 8px;
            color: #4ade80;
            background: rgba(0,0,0,0.3);
            padding: 15px 25px;
            border-radius: 8px;
            margin: 15px 0;
            display: inline-block;
        }
        .link { color: #60a5fa; text-decoration: none; font-weight: bold; }
        .link:hover { text-decoration: underline; }
        .status { margin-top: 20px; padding: 15px; border-radius: 8px; }
        .status.waiting { background: rgba(251,191,36,0.2); color: #fbbf24; }
        .status.success { background: rgba(74,222,128,0.2); color: #4ade80; }
        .status.error { background: rgba(248,113,113,0.2); color: #f87171; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .hidden { display: none; }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #4ade80;
            animation: spin 1s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
        }
        .url-container {
            display: flex;
            margin: 15px 0;
            gap: 8px;
        }
        .url-input {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 12px;
            font-family: monospace;
        }
        .copy-btn {
            padding: 12px 16px;
            border: none;
            border-radius: 8px;
            background: #60a5fa;
            color: #1a1a2e;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        .copy-btn:hover { background: #93c5fd; }
        .copy-btn.copied { background: #4ade80; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Connect your Seedr account to Stremio</p>
        
        <div id="loading">
            <div class="spinner"></div>
            <span>Getting authorization code...</span>
        </div>
        
        <div id="auth-steps" class="hidden">
            <div class="step">
                <div class="step-number">1</div>
                <p>Visit <a href="https://www.seedr.cc/devices" target="_blank" class="link">seedr.cc/devices</a></p>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <p>Enter this code:</p>
                <div id="user-code" class="code-display">--------</div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <p>Click "Authorize" on Seedr</p>
            </div>
            
            <div id="status" class="status waiting">
                <span class="spinner"></span>
                Waiting for authorization...
            </div>
        </div>
        
        <div id="success" class="hidden">
            <div class="status success">
                ✅ Authorization successful!
            </div>
            <p style="margin-top: 15px; color: #94a3b8;">Copy this URL to install manually:</p>
            <div class="url-container">
                <input type="text" id="manifest-url" readonly class="url-input">
                <button onclick="copyUrl()" class="copy-btn" id="copy-btn">📋 Copy</button>
            </div>
            <a id="install-btn" href="#" class="btn">Install in Stremio</a>
        </div>
        
        <div id="error" class="hidden">
            <div class="status error" id="error-message">
                ❌ An error occurred
            </div>
            <a href="/configure" class="btn">Try Again</a>
        </div>
    </div>
    
    <script>
        const baseUrl = window.location.origin;
        let deviceCode = null;
        let pollInterval = null;
        
        async function startAuth() {
            try {
                // Get device code
                const response = await fetch('/api/device-code');
                const data = await response.json();
                
                if (data.error) {
                    showError(data.error);
                    return;
                }
                
                deviceCode = data.device_code;
                document.getElementById('user-code').textContent = data.user_code;
                
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('auth-steps').classList.remove('hidden');
                
                // Start polling
                pollInterval = setInterval(pollForAuth, (data.interval || 5) * 1000);
                
            } catch (error) {
                showError('Failed to start authorization: ' + error.message);
            }
        }
        
        async function pollForAuth() {
            try {
                const response = await fetch('/api/poll-token?device_code=' + encodeURIComponent(deviceCode));
                const data = await response.json();
                
                if (data.access_token) {
                    clearInterval(pollInterval);
                    showSuccess(data.access_token);
                }
            } catch (error) {
                // Continue polling
            }
        }
        
        function showSuccess(token) {
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('success').classList.remove('hidden');
            
            // Create Stremio install URL with token
            const encodedToken = encodeURIComponent(token);
            const manifestUrl = baseUrl + '/' + encodedToken + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
        }
        
        function copyUrl() {
            const urlInput = document.getElementById('manifest-url');
            urlInput.select();
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copy-btn');
            copyBtn.textContent = '✅ Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy';
                copyBtn.classList.remove('copied');
            }, 2000);
        }
        
        function showError(message) {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
            document.getElementById('error-message').textContent = '❌ ' + message;
            
            if (pollInterval) clearInterval(pollInterval);
        }
        
        // Start authorization on page load
        startAuth();
    </script>
</body>
</html>
    `);
});

// ============================================
// API Endpoints for Device Authorization
// ============================================
app.get("/api/device-code", async (req, res) => {
    try {
        const data = await seedrApi.getDeviceCode();
        res.json(data);
    } catch (error) {
        console.error("Error getting device code:", error.message);
        res.json({ error: error.message });
    }
});

app.get("/api/poll-token", async (req, res) => {
    try {
        const deviceCode = req.query.device_code;
        if (!deviceCode) {
            return res.json({ error: "Missing device_code" });
        }

        const data = await seedrApi.pollForToken(deviceCode);
        res.json(data || { pending: true });
    } catch (error) {
        console.error("Error polling for token:", error.message);
        res.json({ error: error.message });
    }
});

// ============================================
// Token-based Addon Routes
// ============================================
// Handle configure page with token (redirect to main configure or show reconfigure option)
app.get("/:token/configure", (req, res) => {
    const token = req.params.token;
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Configuration</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 { font-size: 2rem; margin-bottom: 10px; color: #4ade80; }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .status { margin: 20px 0; padding: 20px; background: rgba(74,222,128,0.2); border-radius: 12px; }
        .status.success { color: #4ade80; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 10px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .btn.secondary {
            background: rgba(255,255,255,0.2);
            color: #fff;
        }
        .info { margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; color: #94a3b8; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Configuration</p>
        
        <div class="status success">
            ✅ Your addon is already configured and connected to Seedr!
        </div>
        
        <p style="margin: 20px 0; color: #94a3b8;">
            Your Seedr account is linked. You can browse your files in Stremio under "My Seedr Files".
        </p>
        
        <div style="margin: 20px 0;">
            <a id="install-btn" href="#" class="btn">📥 Install Addon in Stremio</a>
        </div>
        
        <p style="margin: 15px 0; color: #94a3b8; font-size: 0.9rem;">Or copy this URL to install manually:</p>
        <div style="display: flex; margin: 15px 0; gap: 8px;">
            <input type="text" id="manifest-url" readonly style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; font-size: 12px; font-family: monospace;">
            <button onclick="copyUrl()" id="copy-btn" style="padding: 12px 16px; border: none; border-radius: 8px; background: #60a5fa; color: #1a1a2e; font-weight: bold; cursor: pointer;">📋 Copy</button>
        </div>
        
        <div>
            <a href="/configure" class="btn secondary">🔄 Reconfigure with Different Account</a>
        </div>
        
        <div class="info">
            <strong>Tip:</strong> To see your Seedr files in Stremio, go to the Discover tab and select "My Seedr Files" from the catalog.
        </div>
        
        <script>
            const token = "${token}";
            const baseUrl = window.location.origin;
            const manifestUrl = baseUrl + '/' + encodeURIComponent(token) + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
            
            function copyUrl() {
                const urlInput = document.getElementById('manifest-url');
                urlInput.select();
                document.execCommand('copy');
                
                const copyBtn = document.getElementById('copy-btn');
                copyBtn.textContent = '✅ Copied!';
                copyBtn.style.background = '#4ade80';
                
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.style.background = '#60a5fa';
                }, 2000);
            }
        </script>
    </div>
</body>
</html>
    `);
});

// Handle manifest request with token
app.get("/:token/manifest.json", (req, res) => {
    const manifest = addon.manifest;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");
    res.json(manifest);
});

// Custom router to handle token extraction
app.get("/:token/catalog/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;

        const result = await addon.catalogHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        });

        res.json(result);
    } catch (error) {
        console.error("Catalog error:", error);
        res.json({ metas: [] });
    }
});

app.get("/:token/stream/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;
        const serverBaseUrl = `${req.protocol}://${req.get('host')}`;

        const result = await addon.streamHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        }, serverBaseUrl);

        res.json(result);
    } catch (error) {
        console.error("Stream error:", error);
        res.json({ streams: [] });
    }
});

// ============================================
// Resolve Endpoint - Download torrent and redirect to stream
// ============================================
app.get("/:token/resolve/:infoHash", async (req, res) => {
    const { token, infoHash } = req.params;
    const { name, trackers, fileIdx } = req.query;
    const accessToken = decodeURIComponent(token);
    const hashLower = infoHash.toLowerCase();

    console.log("============================================");
    console.log("🔄 Resolve request for infoHash:", infoHash);
    console.log("   Name:", name);
    console.log("============================================");

    try {
        // First, check if the content already exists in Seedr and is ready to stream
        try {
            const videos = await seedrApi.getAllVideoFiles(accessToken);
            const searchName = name ? name.toLowerCase().replace(/\.[^/.]+$/, "") : "";

            // Search for matching video by name similarity
            const matchingVideo = videos.find(video => {
                const videoNameLower = video.name.toLowerCase().replace(/\.[^/.]+$/, "");
                // Check for name match or if video path contains the search name
                return videoNameLower.includes(searchName.substring(0, 20)) ||
                    searchName.includes(videoNameLower.substring(0, 20)) ||
                    video.path.toLowerCase().includes(searchName.substring(0, 20));
            });

            if (matchingVideo) {
                console.log("✅ Found existing video in Seedr:", matchingVideo.name);
                const streamData = await seedrApi.getStreamUrl(accessToken, matchingVideo.id);

                if (streamData && streamData.url) {
                    console.log("🎬 Redirecting to stream URL");
                    return res.redirect(streamData.url);
                }
            }
        } catch (checkError) {
            console.log("⚠️ Could not check existing videos:", checkError.message);
        }

        // Check 1: Was this magnet recently added? (handles duplicate clicks)
        const recent = recentlyAdded.get(hashLower);
        if (recent && Date.now() - recent.timestamp < RECENTLY_ADDED_TTL) {
            console.log("⏭️ Skipping - magnet was recently added");
            // Try to find the video again after it might have finished downloading
            try {
                const videos = await seedrApi.getAllVideoFiles(accessToken);
                const searchName = name ? name.toLowerCase().replace(/\.[^/.]+$/, "") : "";

                const matchingVideo = videos.find(video => {
                    const videoNameLower = video.name.toLowerCase().replace(/\.[^/.]+$/, "");
                    return videoNameLower.includes(searchName.substring(0, 20)) ||
                        searchName.includes(videoNameLower.substring(0, 20));
                });

                if (matchingVideo) {
                    const streamData = await seedrApi.getStreamUrl(accessToken, matchingVideo.id);
                    if (streamData && streamData.url) {
                        return res.redirect(streamData.url);
                    }
                }
            } catch (e) { /* ignore */ }

            // Show download status page
            return res.send(getDownloadStatusPage(name || "Torrent", "recently_added"));
        }

        // Check 2: Is there already a pending request for this hash?
        const pending = pendingMagnets.get(hashLower);
        if (pending && Date.now() - pending.timestamp < PENDING_TTL) {
            console.log("⏳ Deduplicating - waiting for existing request");
            try {
                await pending.promise;
            } catch (error) {
                console.log("⚠️ Original request failed, retrying...");
                pendingMagnets.delete(hashLower);
            }
        }

        // CRITICAL: Create a deferred promise and register it IMMEDIATELY (synchronously)
        let resolvePromise, rejectPromise;
        const deferredPromise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        pendingMagnets.set(hashLower, { promise: deferredPromise, timestamp: Date.now() });

        try {
            // Check 3: Is this torrent already downloading in Seedr?
            try {
                const transfers = await seedrApi.getActiveTransfers(accessToken);
                const existingTransfer = transfers.find(t =>
                    t.hash?.toLowerCase() === hashLower ||
                    (name && t.name?.toLowerCase().includes(name.toLowerCase().substring(0, 20)))
                );

                if (existingTransfer) {
                    const progress = existingTransfer.progress || 0;
                    console.log(`⏳ Already downloading: ${existingTransfer.name} (${progress}%)`);

                    resolvePromise({ status: "already_downloading", transfer: existingTransfer });
                    pendingMagnets.delete(hashLower);

                    return res.send(getDownloadStatusPage(existingTransfer.name, "downloading", progress));
                }
            } catch (transferError) {
                console.log("⚠️ Could not check active transfers:", transferError.message);
            }

            // Build magnet link from parameters
            let magnet = `magnet:?xt=urn:btih:${infoHash}`;
            if (name) {
                magnet += `&dn=${encodeURIComponent(name)}`;
            }
            if (trackers) {
                const trackerList = trackers.split(",");
                for (const tracker of trackerList) {
                    magnet += `&tr=${encodeURIComponent(tracker)}`;
                }
            }

            console.log("📥 Adding magnet to Seedr...");

            // Add magnet to Seedr
            const result = await seedrApi.addMagnet(accessToken, magnet);
            console.log("✅ Seedr response:", JSON.stringify(result, null, 2));

            // Cache the successful result
            recentlyAdded.set(hashLower, { result, timestamp: Date.now() });

            // Invalidate video cache so new files appear faster
            addon.invalidateCache(accessToken);

            // Resolve the deferred promise for any waiting requests
            resolvePromise(result);
            pendingMagnets.delete(hashLower);

            // Show download started page
            return res.send(getDownloadStatusPage(name || "Torrent", "started"));

        } catch (innerError) {
            rejectPromise(innerError);
            pendingMagnets.delete(hashLower);
            throw innerError;
        }

    } catch (error) {
        console.error("❌ Resolve error:", error.message);
        pendingMagnets.delete(hashLower);
        return res.send(getDownloadStatusPage(name || "Torrent", "error", 0, error.message));
    }
});

/**
 * Generate a user-friendly download status page
 */
function getDownloadStatusPage(name, status, progress = 0, errorMessage = "") {
    const statusMessages = {
        "started": { icon: "📥", title: "Download Started", message: "The torrent has been added to Seedr. Check 'My Seedr Files' when complete." },
        "downloading": { icon: "⏳", title: "Downloading...", message: `Currently downloading: ${progress}% complete` },
        "recently_added": { icon: "⏳", title: "Download in Progress", message: "This torrent was recently added. Check 'My Seedr Files' when complete." },
        "error": { icon: "❌", title: "Error", message: errorMessage || "Failed to add torrent" }
    };

    const info = statusMessages[status] || statusMessages.error;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr - ${info.title}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .icon { font-size: 4rem; margin-bottom: 20px; }
        h1 { font-size: 1.8rem; margin-bottom: 10px; color: #4ade80; }
        .name { 
            color: #94a3b8; 
            margin: 15px 0; 
            font-size: 0.9rem;
            word-break: break-word;
            background: rgba(0,0,0,0.2);
            padding: 10px;
            border-radius: 8px;
        }
        .message { color: #fff; margin: 20px 0; line-height: 1.6; }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4ade80, #22c55e);
            transition: width 0.3s;
        }
        .tip {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
            color: #94a3b8;
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">${info.icon}</div>
        <h1>${info.title}</h1>
        <div class="name">📁 ${name}</div>
        ${status === "downloading" ? `
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        ` : ""}
        <p class="message">${info.message}</p>
        <div class="tip">
            💡 <strong>Tip:</strong> Go to "My Seedr Files" in Stremio to find your downloaded content when it's ready.
        </div>
    </div>
</body>
</html>
    `;
}

// ============================================
// Root redirect to configure
// ============================================
app.get("/", (req, res) => {
    res.redirect("/configure");
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log("============================================");
    console.log("🎬 Seedr Cloud Player for Stremio");
    console.log("============================================");
    console.log("");
    console.log("📍 Server running at: http://127.0.0.1:" + PORT);
    console.log("");
    console.log("🔧 To connect your Seedr account:");
    console.log("   1. Open: http://127.0.0.1:" + PORT + "/configure");
    console.log("   2. Follow the on-screen instructions");
    console.log("   3. Click 'Install in Stremio' when done");
    console.log("");
    console.log("Press Ctrl+C to stop the server");
    console.log("============================================");
});

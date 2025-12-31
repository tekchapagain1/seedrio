const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

// ============================================
// Start the Addon Server
// ============================================

// Use PORT from environment variable (for deployment) or default to 7000
const PORT = process.env.PORT || 7000;

// Start the HTTP server
serveHTTP(addonInterface, { port: PORT });

// Log helpful information
console.log("============================================");
console.log("🎬 Stremio Addon is running!");
console.log("============================================");
console.log("");
console.log("📍 Local URL: http://127.0.0.1:" + PORT);
console.log("");
console.log("🔗 To install in Stremio:");
console.log("   1. Open Stremio desktop app");
console.log("   2. Click the puzzle icon (Addons) in top right");
console.log("   3. Paste this URL in search: http://127.0.0.1:" + PORT + "/manifest.json");
console.log("   4. Press Enter and click Install");
console.log("");
console.log("🧪 Test URLs:");
console.log("   Manifest:  http://127.0.0.1:" + PORT + "/manifest.json");
console.log("   Catalog:   http://127.0.0.1:" + PORT + "/catalog/movie/helloworld-movies.json");
console.log("");
console.log("Press Ctrl+C to stop the server");
console.log("============================================");

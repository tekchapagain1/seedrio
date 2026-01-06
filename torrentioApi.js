const axios = require("axios");

// Torrentio API Configuration
const TORRENTIO_BASE_URL = "https://torrentio.strem.fun";

/**
 * Get available streams for a movie from Torrentio
 * @param {string} imdbId - IMDB ID (e.g., "tt0111161")
 * @returns {Promise<Array<{infoHash: string, title: string, name: string, quality: string, size: string, seeders: string, source: string, filename: string, trackers: string[]}>>}
 */
async function getMovieStreams(imdbId) {
    try {
        const response = await axios.get(`${TORRENTIO_BASE_URL}/stream/movie/${imdbId}.json`, {
            timeout: 10000
        });

        if (!response.data || !response.data.streams) {
            return [];
        }

        // ... (existing code)
        return response.data.streams.map(stream => parseStream(stream)).filter(s => s !== null);
    } catch (error) {
        console.error("Error fetching Torrentio streams:", error.message);
        return [];
    }
}

/**
 * Get available streams for a series from Torrentio
 * @param {string} imdbId - IMDB ID (e.g., "tt0111161:1:1" for S1:E1)
 * @returns {Promise<Array>}
 */
async function getSeriesStreams(imdbId) {
    try {
        // ID format for series in Stremio is usually "tt123456:1:1" (IMDB:Season:Episode)
        console.log("Fetching series streams for:", imdbId);

        const response = await axios.get(`${TORRENTIO_BASE_URL}/stream/series/${imdbId}.json`, {
            timeout: 10000
        });

        if (!response.data || !response.data.streams) {
            return [];
        }

        return response.data.streams.map(stream => parseStream(stream)).filter(s => s !== null);
    } catch (error) {
        console.error("Error fetching Torrentio series streams:", error.message);
        return [];
    }
}

/**
 * Get available streams for anime from Torrentio
 * @param {string} kitsuId - Kitsu ID (e.g., "kitsu:12345" or "kitsu:12345:1:5" for episode)
 * @returns {Promise<Array>}
 */
async function getAnimeStreams(kitsuId) {
    try {
        // ID format for anime in Stremio is "kitsu:12345" for series or "kitsu:12345:1:5" for S1:E5
        console.log("Fetching anime streams for:", kitsuId);

        // Torrentio uses the anime endpoint for kitsu IDs
        const response = await axios.get(`${TORRENTIO_BASE_URL}/stream/anime/${kitsuId}.json`, {
            timeout: 10000
        });

        if (!response.data || !response.data.streams) {
            return [];
        }

        return response.data.streams.map(stream => parseStream(stream)).filter(s => s !== null);
    } catch (error) {
        console.error("Error fetching Torrentio anime streams:", error.message);
        return [];
    }
}

/**
 * Parse a Torrentio stream object into our format
 * @param {Object} stream - Torrentio stream object
 * @returns {Object|null}
 */
function parseStream(stream) {
    if (!stream.infoHash) {
        return null;
    }

    // Parse the title to extract quality, size, seeders, source
    // Format: "Movie.Title.2024.1080p.BluRay\n👤 48 💾 6.91 GB ⚙️ YTS"
    const titleLines = (stream.title || "").split("\n");
    const torrentName = titleLines[0] || "";
    const metaLine = titleLines[1] || "";

    // Extract seeders (👤 number)
    const seedersMatch = metaLine.match(/👤\s*(\d+)/);
    const seeders = seedersMatch ? seedersMatch[1] : "0";

    // Extract size (💾 size)
    const sizeMatch = metaLine.match(/💾\s*([\d.]+\s*[GMKTP]?B)/i);
    const size = sizeMatch ? sizeMatch[1] : "Unknown";

    // Extract source (⚙️ source)
    const sourceMatch = metaLine.match(/⚙️\s*(.+?)$/);
    const source = sourceMatch ? sourceMatch[1].trim() : "Unknown";

    // Parse quality from name line (e.g., "Torrentio\n1080p" or "Torrentio\n4k HDR")
    const nameLines = (stream.name || "").split("\n");
    const quality = nameLines[1] || "Unknown";

    // Get filename from behavior hints
    const filename = stream.behaviorHints?.filename || torrentName;

    // Extract trackers from sources array
    const trackers = [];
    if (stream.sources) {
        for (const src of stream.sources) {
            if (src.startsWith("tracker:")) {
                trackers.push(src.replace("tracker:", ""));
            }
        }
    }

    return {
        infoHash: stream.infoHash,
        fileIdx: stream.fileIdx || 0,
        title: torrentName,
        name: stream.name || "",
        quality,
        size,
        seeders: parseInt(seeders, 10),
        source,
        filename,
        trackers
    };
}

/**
 * Build a magnet URI from stream data
 * @param {Object} stream - Parsed stream object
 * @returns {string}
 */
function buildMagnet(stream) {
    let magnet = `magnet:?xt=urn:btih:${stream.infoHash}`;

    // Add display name
    if (stream.filename) {
        magnet += `&dn=${encodeURIComponent(stream.filename)}`;
    }

    // Add trackers
    if (stream.trackers && stream.trackers.length > 0) {
        for (const tracker of stream.trackers) {
            magnet += `&tr=${encodeURIComponent(tracker)}`;
        }
    } else {
        // Add default trackers if none provided
        const defaultTrackers = [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.demonii.com:1337/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://open.stealth.si:80/announce",
            "udp://exodus.desync.com:6969/announce"
        ];
        for (const tracker of defaultTrackers) {
            magnet += `&tr=${encodeURIComponent(tracker)}`;
        }
    }

    return magnet;
}

/**
 * Format stream for display in Stremio
 * Multi-line format:
 * Line 1: Full torrent name
 * Line 2: Quality
 * Line 3: Seeders + Size
 * @param {Object} stream - Parsed stream object
 * @returns {string}
 */
function formatStreamTitle(stream) {
    const lines = [];

    // Line 1: Full torrent name
    const name = stream.title || stream.filename || "Unknown";
    lines.push(`⬇️ ${name}`);

    // Line 2: Quality
    if (stream.quality && stream.quality !== "Unknown") {
        lines.push(`📺 ${stream.quality}`);
    }

    // Line 3: Seeders + Size
    const metaParts = [];
    if (stream.seeders && stream.seeders !== 0) {
        metaParts.push(`👤 ${stream.seeders}`);
    }
    if (stream.size && stream.size !== "Unknown") {
        metaParts.push(`💾 ${stream.size}`);
    }
    if (metaParts.length > 0) {
        lines.push(metaParts.join(" • "));
    }

    return lines.join("\n");
}

module.exports = {
    getMovieStreams,
    getSeriesStreams,
    getAnimeStreams,
    buildMagnet,
    formatStreamTitle,
    parseStream
};

const axios = require("axios");

// Torrentio API Configuration
const TORRENTIO_BASE_URL = "https://torrentio.strem.fun";

// Quality ranking for sorting (higher = better)
const QUALITY_RANKS = {
    "4k": 5,
    "2160p": 5,
    "1080p": 4,
    "720p": 3,
    "480p": 2,
    "360p": 1
};

/**
 * Get numeric quality rank for sorting
 * @param {string} quality - Quality string (e.g., "4k DV HDR10+")
 * @returns {number} - Rank value (higher = better quality)
 */
function getQualityRank(quality) {
    if (!quality) return 0;
    const lowerQuality = quality.toLowerCase();

    // Check for each quality level
    for (const [key, rank] of Object.entries(QUALITY_RANKS)) {
        if (lowerQuality.includes(key)) {
            return rank;
        }
    }
    return 0;
}

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

        return response.data.streams.map(stream => parseStream(stream)).filter(s => s !== null);
    } catch (error) {
        console.error("Error fetching Torrentio streams:", error.message);
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

    // Extract seeders (👤 number) - convert to integer for sorting
    const seedersMatch = metaLine.match(/👤\s*(\d+)/);
    const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

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
        seeders,
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
 * Format stream for display in Stremio (multi-line format)
 * Line 1: Full torrent name (with esub, release info, etc.)
 * Line 2: Quality info
 * Line 3: Size and seeders
 * @param {Object} stream - Parsed stream object
 * @returns {string}
 */
function formatStreamTitle(stream) {
    // Line 1: Full torrent name/filename
    const torrentName = stream.filename || stream.title || "Unknown";

    // Line 2: Quality
    const quality = stream.quality && stream.quality !== "Unknown"
        ? stream.quality
        : "Unknown Quality";

    // Line 3: Size and seeders
    const line3Parts = [];

    if (stream.size && stream.size !== "Unknown") {
        line3Parts.push(stream.size);
    }

    if (stream.seeders && stream.seeders > 0) {
        line3Parts.push(`${stream.seeders} seeds`);
    } else {
        line3Parts.push("No seeds");
    }

    const line3 = line3Parts.join(" · ");

    return `${torrentName}\n${quality}\n${line3}`;
}

/**
 * Sort streams by seeders (desc) then quality (desc)
 * Streams with 0 seeders go to the bottom
 * @param {Array} streams - Array of parsed stream objects
 * @returns {Array} - Sorted streams
 */
function sortStreams(streams) {
    return streams.sort((a, b) => {
        const aSeeders = a.seeders || 0;
        const bSeeders = b.seeders || 0;

        // Zero seeders go to bottom
        if (aSeeders === 0 && bSeeders > 0) return 1;
        if (bSeeders === 0 && aSeeders > 0) return -1;

        // Sort by seeders descending
        if (bSeeders !== aSeeders) {
            return bSeeders - aSeeders;
        }

        // If seeders equal, sort by quality descending
        return getQualityRank(b.quality) - getQualityRank(a.quality);
    });
}

module.exports = {
    getMovieStreams,
    sortStreams,
    getQualityRank,
    buildMagnet,
    formatStreamTitle,
    parseStream
};

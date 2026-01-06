const axios = require("axios");

// Seedr API Configuration
const SEEDR_BASE_URL = "https://www.seedr.cc";
const CLIENT_ID = "seedr_xbmc"; // Long-lived token (1 year)

/**
 * Request a device code for authorization
 * @returns {Promise<{device_code: string, user_code: string, expires_in: number, interval: number}>}
 */
async function getDeviceCode() {
    const response = await axios.get(`${SEEDR_BASE_URL}/api/device/code`, {
        params: { client_id: CLIENT_ID }
    });
    return response.data;
}

/**
 * Poll for authorization token after user enters code
 * @param {string} deviceCode - The device code from getDeviceCode
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}|null>}
 */
async function pollForToken(deviceCode) {
    try {
        const response = await axios.get(`${SEEDR_BASE_URL}/api/device/authorize`, {
            params: {
                device_code: deviceCode,
                client_id: CLIENT_ID
            }
        });

        if (response.data && response.data.access_token) {
            return response.data;
        }
        return null;
    } catch (error) {
        // Authorization pending - user hasn't entered code yet
        if (error.response && error.response.status === 400) {
            return null;
        }
        throw error;
    }
}

/**
 * Get contents of a folder (or root folder if no folderId)
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Optional folder ID (null for root)
 * @returns {Promise<{folders: Array, files: Array}>}
 */
async function getFolder(accessToken, folderId = null) {
    let url = `${SEEDR_BASE_URL}/api/folder`;
    if (folderId) {
        url = `${SEEDR_BASE_URL}/api/folder/${folderId}`;
    }

    const response = await axios.get(url, {
        params: { access_token: accessToken }
    });
    return response.data;
}

/**
 * Recursively get all video files from Seedr account
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Folder ID to start from (null for root)
 * @param {string} parentPath - Path prefix for folder hierarchy
 * @returns {Promise<Array<{id: string, name: string, size: number, path: string}>>}
 */
async function getAllVideoFiles(accessToken, folderId = null, parentPath = "") {
    const videos = [];

    try {
        const folderData = await getFolder(accessToken, folderId);

        // Add video files from current folder
        if (folderData.files) {
            for (const file of folderData.files) {
                if (file.play_video) {
                    videos.push({
                        id: file.folder_file_id.toString(),
                        name: file.name,
                        size: file.size,
                        path: parentPath ? `${parentPath}/${file.name}` : file.name
                    });
                }
            }
        }

        // Recursively scan subfolders
        if (folderData.folders) {
            for (const folder of folderData.folders) {
                const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
                const subVideos = await getAllVideoFiles(accessToken, folder.id.toString(), folderPath);
                videos.push(...subVideos);
            }
        }
    } catch (error) {
        console.error("Error fetching folder:", folderId, error.message);
    }

    return videos;
}

/**
 * Get streaming URL for a file
 * @param {string} accessToken - The access token
 * @param {string} fileId - The folder_file_id of the file
 * @returns {Promise<{url: string, name: string, size: number}>}
 */
async function getStreamUrl(accessToken, fileId) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "fetch_file");
    formData.append("folder_file_id", fileId);

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Get user account information
 * @param {string} accessToken - The access token
 * @returns {Promise<Object>}
 */
async function getUserInfo(accessToken) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "get_settings");

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Add a magnet link to Seedr for downloading
 * @param {string} accessToken - The access token
 * @param {string} magnetLink - The magnet URI to add
 * @param {number} folderId - Target folder ID (-1 for root folder)
 * @returns {Promise<{result: boolean, user_torrent_id?: number, error?: string}>}
 */
async function addMagnet(accessToken, magnetLink, folderId = -1) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "add_torrent");
    formData.append("torrent_magnet", magnetLink);
    formData.append("folder_id", folderId.toString());

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    const result = response.data;

    if (result.error) {
        throw new Error(`Failed to add magnet: ${result.error}`);
    }

    return result;
}

/**
 * Get active transfers (downloading torrents) from Seedr
 * The transfers are included in the root folder response
 * @param {string} accessToken - The access token
 * @returns {Promise<Array<{id: number, name: string, progress: number, size: number}>>}
 */
async function getActiveTransfers(accessToken) {
    try {
        const folderData = await getFolder(accessToken, null);
        return folderData.transfers || [];
    } catch (error) {
        console.error("Error getting active transfers:", error.message);
        return [];
    }
}

/**
 * Delete a folder from Seedr
 * @param {string} accessToken - The access token
 * @param {string} folderId - The folder ID to delete
 * @returns {Promise<Object>}
 */
async function deleteFolder(accessToken, folderId) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "delete");
    formData.append("delete_arr", JSON.stringify([{ type: "folder", id: folderId }]));

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Delete all content from Seedr (folders, files, and active transfers)
 * @param {string} accessToken - The access token
 * @returns {Promise<{result: boolean, deleted: number, message: string}>}
 */
async function deleteAllContent(accessToken) {
    try {
        const rootFolder = await getFolder(accessToken, null);
        const deleteItems = [];

        // Queue all folders for deletion
        if (rootFolder.folders && rootFolder.folders.length > 0) {
            for (const folder of rootFolder.folders) {
                deleteItems.push({ type: "folder", id: folder.id });
            }
        }

        // Queue all files for deletion
        if (rootFolder.files && rootFolder.files.length > 0) {
            for (const file of rootFolder.files) {
                deleteItems.push({ type: "file", id: file.folder_file_id });
            }
        }

        // Queue all active transfers for deletion
        if (rootFolder.transfers && rootFolder.transfers.length > 0) {
            for (const transfer of rootFolder.transfers) {
                deleteItems.push({ type: "torrent", id: transfer.id });
            }
        }

        if (deleteItems.length === 0) {
            return { result: true, deleted: 0, message: "Nothing to delete" };
        }

        // Delete all items in one API call
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        formData.append("func", "delete");
        formData.append("delete_arr", JSON.stringify(deleteItems));

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        return { 
            result: response.data.result || true, 
            deleted: deleteItems.length, 
            message: `Deleted ${deleteItems.length} items` 
        };
    } catch (error) {
        console.error("Error deleting all content:", error.message);
        throw error;
    }
}

module.exports = {
    getDeviceCode,
    pollForToken,
    getFolder,
    getAllVideoFiles,
    getStreamUrl,
    getUserInfo,
    addMagnet,
    getActiveTransfers,
    deleteFolder,
    deleteAllContent
};

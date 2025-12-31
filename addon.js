const { addonBuilder } = require("stremio-addon-sdk");

// ============================================
// STEP 1: Define the Addon Manifest
// ============================================
// The manifest tells Stremio what your addon does
const manifest = {
    // Unique identifier for your addon (use reverse domain notation)
    id: "org.myFirstAddon.helloworld",
    
    // Version of your addon (semantic versioning: major.minor.patch)
    version: "1.0.0",
    
    // Human-readable name shown in Stremio
    name: "My First Stremio Addon",
    
    // Description of what your addon does
    description: "A simple Hello World addon that shows free movies",
    
    // What resources your addon provides:
    // - "catalog" = list of movies/series
    // - "stream" = playable video URLs
    // - "meta" = detailed info about content
    // - "subtitles" = subtitle files
    resources: ["catalog", "stream"],
    
    // What content types your addon supports:
    // - "movie" = movies
    // - "series" = TV shows
    // - "channel" = live TV
    types: ["movie"],
    
    // Define your catalogs (shown in Stremio's Discover section)
    catalogs: [
        {
            type: "movie",                    // This catalog contains movies
            id: "helloworld-movies",          // Unique ID for this catalog
            name: "Hello World Free Movies"   // Name shown in Stremio
        }
    ],
    
    // Only handle IDs that start with these prefixes
    // "tt" = IMDB IDs, "hw" = our custom IDs
    idPrefixes: ["tt", "hw"]
};

// ============================================
// STEP 2: Create the Addon Builder
// ============================================
const builder = new addonBuilder(manifest);

// ============================================
// STEP 3: Define Sample Movie Data
// ============================================
// These are free/public domain movies we can legally stream
const MOVIES = {
    // Big Buck Bunny - A famous open-source animated short
    "tt1254207": {
        id: "tt1254207",
        type: "movie",
        name: "Big Buck Bunny",
        poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg",
        background: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg",
        description: "A large and lovable rabbit deals with three tiny bullies, led by a flying squirrel, who are determined to ruin his day.",
        releaseInfo: "2008",
        runtime: "10 min",
        genres: ["Animation", "Comedy", "Short"],
        director: ["Sacha Goedegebure"],
        streams: [
            {
                url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                title: "HD 1080p"
            }
        ]
    },
    
    // Sintel - Another open-source animated short from Blender
    "hw-sintel": {
        id: "hw-sintel",
        type: "movie",
        name: "Sintel",
        poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Sintel_poster.jpg/800px-Sintel_poster.jpg",
        background: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Sintel_poster.jpg/800px-Sintel_poster.jpg",
        description: "A lonely young woman, Sintel, helps and befriends a dragon, whom she calls Scales. But when Scales is taken from her, she must embark on a dangerous quest to find her friend.",
        releaseInfo: "2010",
        runtime: "15 min",
        genres: ["Animation", "Fantasy", "Short"],
        director: ["Colin Levy"],
        streams: [
            {
                url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
                title: "HD 1080p"
            }
        ]
    },
    
    // Tears of Steel - Live action + CGI short film
    "hw-tearsofsteel": {
        id: "hw-tearsofsteel",
        type: "movie",
        name: "Tears of Steel",
        poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Tears_of_Steel_poster.jpg/800px-Tears_of_Steel_poster.jpg",
        background: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Tears_of_Steel_poster.jpg/800px-Tears_of_Steel_poster.jpg",
        description: "In a post-apocalyptic world, a group of warriors must fight to save humanity from a cyborg invasion.",
        releaseInfo: "2012",
        runtime: "12 min",
        genres: ["Sci-Fi", "Short", "Action"],
        director: ["Ian Hubert"],
        streams: [
            {
                url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
                title: "HD 1080p"
            }
        ]
    },
    
    // Elephant's Dream - The first Blender open movie
    "hw-elephantsdream": {
        id: "hw-elephantsdream",
        type: "movie",
        name: "Elephant's Dream",
        poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Elephants_Dream_cover.jpg/800px-Elephants_Dream_cover.jpg",
        background: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Elephants_Dream_cover.jpg/800px-Elephants_Dream_cover.jpg",
        description: "Emo and Proog are in a strange world, a vast building with many rooms. While exploring, they encounter strange machines and other weird things.",
        releaseInfo: "2006",
        runtime: "11 min",
        genres: ["Animation", "Sci-Fi", "Short"],
        director: ["Bassam Kurdali"],
        streams: [
            {
                url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
                title: "HD 1080p"
            }
        ]
    }
};

// ============================================
// STEP 4: Define Catalog Handler
// ============================================
// This function is called when Stremio requests a list of movies
builder.defineCatalogHandler(function(args) {
    console.log("Catalog request:", args);
    
    // Check if the request is for our movie catalog
    if (args.type === "movie" && args.id === "helloworld-movies") {
        // Convert our MOVIES object to an array of metadata
        const metas = Object.values(MOVIES).map(movie => ({
            id: movie.id,
            type: movie.type,
            name: movie.name,
            poster: movie.poster,
            description: movie.description,
            releaseInfo: movie.releaseInfo,
            genres: movie.genres
        }));
        
        console.log("Returning", metas.length, "movies");
        return Promise.resolve({ metas: metas });
    }
    
    // Return empty array if catalog not found
    return Promise.resolve({ metas: [] });
});

// ============================================
// STEP 5: Define Stream Handler
// ============================================
// This function is called when user clicks on a movie to play it
builder.defineStreamHandler(function(args) {
    console.log("Stream request:", args);
    
    // Check if we have this movie in our database
    if (args.type === "movie" && MOVIES[args.id]) {
        const movie = MOVIES[args.id];
        console.log("Returning streams for:", movie.name);
        
        return Promise.resolve({ 
            streams: movie.streams 
        });
    }
    
    // Return empty array if movie not found
    return Promise.resolve({ streams: [] });
});

// Export the addon interface
module.exports = builder.getInterface();

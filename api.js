// WalkerBot API Client
const API_BASE_URL = 'https://walkerbot.onrender.com/api';

// Helper function to make API requests
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error?.message || 'API error');
        }
        
        return data.data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// ==================== PROFILE ====================
async function getProfile(userId) {
    return await apiRequest(`/profile?user_id=${userId}`);
}

async function updateProfile(userId, updates) {
    return await apiRequest('/profile/update', {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId, ...updates })
    });
}

// ==================== STATS ====================
async function getStats(userId, period = 'all') {
    return await apiRequest(`/stats?user_id=${userId}&period=${period}`);
}

// ==================== GOALS ====================
async function getGoals(userId) {
    return await apiRequest(`/goals?user_id=${userId}`);
}

async function createGoal(userId, goalType, targetValue, period) {
    return await apiRequest('/create_goal', {
        method: 'POST',
        body: JSON.stringify({
            user_id: userId,
            goal_type: goalType,
            target_value: targetValue,
            period: period
        })
    });
}

// ==================== ACHIEVEMENTS ====================
async function getAchievements(userId) {
    return await apiRequest(`/achievements?user_id=${userId}`);
}

// ==================== TRACKS ====================
async function getUserTracks(userId) {
    return await apiRequest(`/tracks/${userId}`);
}

async function getTrackDetails(trackId) {
    return await apiRequest(`/track/${trackId}`);
}

async function saveTrack(userId, trackData) {
    return await apiRequest('/save_track', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, ...trackData })
    });
}

// ==================== PUBLIC ROUTES ====================
async function getPublicRoutes(filters = {}) {
    const params = new URLSearchParams();
    if (filters.district) params.append('district', filters.district);
    if (filters.difficulty) params.append('difficulty', filters.difficulty);
    if (filters.min_distance) params.append('min_distance', filters.min_distance);
    if (filters.max_distance) params.append('max_distance', filters.max_distance);
    if (filters.category) params.append('category', filters.category);
    
    return await apiRequest(`/public_routes?${params.toString()}`);
}

async function publishRoute(userId, routeData) {
    return await apiRequest('/publish_route', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, ...routeData })
    });
}

// ==================== FRIENDS ====================
async function getFriends(userId) {
    return await apiRequest(`/friends?user_id=${userId}`);
}

async function getFriendRequests(userId) {
    return await apiRequest(`/friend_requests?user_id=${userId}`);
}

async function sendFriendRequest(userId, friendUsername) {
    return await apiRequest('/send_friend_request', {
        method: 'POST',
        body: JSON.stringify({
            user_id: userId,
            friend_username: friendUsername
        })
    });
}

// ==================== EVENTS/GROUPS ====================
async function getGroups() {
    return await apiRequest('/groups');
}

async function getMyEvents(userId) {
    return await apiRequest(`/my_events?user_id=${userId}`);
}

async function joinEvent(userId, eventId) {
    return await apiRequest('/join_event', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, event_id: eventId })
    });
}

// ==================== POI (Points of Interest) ====================
async function getPOI(filters = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.append('q', filters.q);
    if (filters.district) params.append('district', filters.district);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return await apiRequest(`/poi${query}`);
}

// ==================== LEADERBOARD ====================
async function getLeaderboard(limit = 10) {
    return await apiRequest(`/leaderboard?limit=${limit}`);
}

// ==================== AI CHAT ====================
async function sendAIChat(userId, message, context = {}) {
    return await apiRequest('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
            user_id: userId,
            message: message,
            context: context
        })
    });
}

// ==================== ELEVATION/RELIEF ====================
async function getElevationData(points) {
    // points: array of {lat, lon}
    const locations = points.map(p => `${p.lat},${p.lon}`).join('|');
    return await apiRequest(`/route/elevation?points=${locations}`);
}

// Alternative: Direct Open-Elevation API call
async function getElevationFromOpenElevation(points) {
    const locations = points.map(p => `${p.lat},${p.lon}`).join('|');
    const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${locations}`);
    const data = await response.json();
    
    return data.results.map((result, index) => ({
        lat: points[index].lat,
        lon: points[index].lon,
        elevation: result.elevation
    }));
}

// Helper to calculate elevation gain
function calculateElevationGain(pointsWithElevation) {
    let gain = 0;
    for (let i = 1; i < pointsWithElevation.length; i++) {
        const diff = pointsWithElevation[i].elevation - pointsWithElevation[i-1].elevation;
        if (diff > 0) {
            gain += diff;
        }
    }
    return Math.round(gain);
}

// Export all functions
window.WalkerAPI = {
    // Profile
    getProfile,
    updateProfile,
    // Stats
    getStats,
    // Goals
    getGoals,
    createGoal,
    // Achievements
    getAchievements,
    // Tracks
    getUserTracks,
    getTrackDetails,
    saveTrack,
    // Public Routes
    getPublicRoutes,
    publishRoute,
    // Friends
    getFriends,
    getFriendRequests,
    sendFriendRequest,
    // Events
    getGroups,
    getMyEvents,
    joinEvent,
    // POI
    getPOI,
    // Leaderboard
    getLeaderboard,
    // AI Chat
    sendAIChat,
    // Elevation
    getElevationData,
    getElevationFromOpenElevation,
    calculateElevationGain
};

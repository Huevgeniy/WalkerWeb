const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const API_URL = 'https://walkerbot.onrender.com/api';
const USER_ID = tg.initDataUnsafe?.user?.id || 12345;
const USER_NAME = tg.initDataUnsafe?.user?.first_name || 'Путешественник';
const USER_PHOTO = tg.initDataUnsafe?.user?.photo_url;

// Состояние приложения
let map, markersLayer, routeLayer, measureLayer;
let allPois = [];
let currentMode = 'walk';
let isMeasureMode = false;
let isRouteBuilderMode = false;
let isRecordingTrack = false;
let tempPoints = [];
let userMarker = null;
let watchId = null;
let trackRecordingPoints = [];
let recordingStartTime = null;
let recordingInterval = null;
let currentTrack = null;
let trackPoints = [];
let trackingStartTime = null;
let trackingInterval = null;
let polyline = null;

// Описания достижений
const ACHIEVEMENTS_DESC = {
    'first_step': 'Первый шаг - Пройдите свой первый трек',
    'walker_1km': 'Ходок 1км - Пройдите 1 километр',
    'walker_5km': 'Ходок 5км - Пройдите 5 километров',
    'walker_10km': 'Ходок 10км - Пройдите 10 километров',
    'explorer': 'Исследователь - Посетите 10 разных мест',
    'week_streak': 'Недельный стрик - Гуляйте 7 дней подряд',
    'month_streak': 'Месячный стрик - Гуляйте 30 дней подряд',
    'group_hiker': 'Групповой турист - Участвуйте в групповом походе',
    'route_creator': 'Создатель маршрутов - Опубликуйте свой маршрут',
    'night_walker': 'Ночной ходок - Совершите прогулку ночью'
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    loadPois();
    loadFilters();
    setupSearch();
    loadProfile();
    loadAchievements();
    loadRoutes();
    loadLeaderboard();
});

// ==================== ТЕМА TELEGRAM ====================
function initTheme() {
    const root = document.documentElement;
    
    if (tg.themeParams) {
        if (tg.themeParams.bg_color) {
            root.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color);
        }
        if (tg.themeParams.text_color) {
            root.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color);
        }
        if (tg.themeParams.hint_color) {
            root.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color);
        }
        if (tg.themeParams.link_color) {
            root.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color);
        }
        if (tg.themeParams.button_color) {
            root.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color);
        }
        if (tg.themeParams.button_text_color) {
            root.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color);
        }
        if (tg.themeParams.secondary_bg_color) {
            root.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color);
        }
    }
}

// ==================== НАВИГАЦИЯ ПО ТАБАМ ====================
function switchTab(tabName) {
    // Скрыть все табы
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Убрать активность с кнопок навигации
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показать выбранный таб
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Активировать кнопку навигации
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Если переключились на карту - обновить её размер
    if (tabName === 'map' && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }
}

// ==================== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ====================
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_URL}/user/profile`, {
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('user-name').textContent = data.username || data.first_name || 'Пользователь';
            document.getElementById('profile-name').textContent = data.username || data.first_name || 'Пользователь';
            document.getElementById('profile-username').textContent = data.username ? `@${data.username}` : '@user';
        } else {
            // Fallback для тестирования без бэкенда
            const user = tg.initDataUnsafe?.user;
            if (user) {
                const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
                document.getElementById('user-name').textContent = name || 'Пользователь';
                document.getElementById('profile-name').textContent = name || 'Пользователь';
                document.getElementById('profile-username').textContent = user.username ? `@${user.username}` : '@user';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        // Fallback
        const user = tg.initDataUnsafe?.user;
        if (user) {
            const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
            document.getElementById('user-name').textContent = name || 'Пользователь';
            document.getElementById('profile-name').textContent = name || 'Пользователь';
            document.getElementById('profile-username').textContent = user.username ? `@${user.username}` : '@user';
        }
    }
}

// ==================== БЫСТРАЯ СТАТИСТИКА ====================
async function loadQuickStats() {
    try {
        const response = await fetch(`${API_URL}/user/stats`, {
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('total-distance').textContent = (data.total_distance_km || 0).toFixed(1);
            document.getElementById('total-tracks').textContent = data.total_tracks || 0;
            document.getElementById('achievements-count').textContent = data.achievements_count || 0;
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ==================== ПОСЛЕДНИЕ ТРЕКИ ====================
async function loadRecentTracks() {
    try {
        const response = await fetch(`${API_URL}/tracks/recent?limit=5`, {
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const tracks = await response.json();
            renderRecentTracks(tracks);
        } else {
            document.getElementById('recent-tracks').innerHTML = '<p class="loading">Нет недавних треков</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки треков:', error);
        document.getElementById('recent-tracks').innerHTML = '<p class="loading">Ошибка загрузки</p>';
    }
}

function renderRecentTracks(tracks) {
    const container = document.getElementById('recent-tracks');
    
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<p class="loading">Нет недавних треков</p>';
        return;
    }
    
    container.innerHTML = tracks.map(track => `
        <div class="route-card" style="margin-bottom: 12px;">
            <div class="route-info">
                <div class="route-title">${track.name || 'Без названия'}</div>
                <div class="route-meta">
                    <span>📍 ${(track.distance_km || 0).toFixed(2)} км</span>
                    <span>⏱️ ${formatDuration(track.duration_seconds || 0)}</span>
                    <span>📅 ${new Date(track.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
}

// ==================== КАРТА И ТРЕКИНГ ====================
function initMap() {
    // Инициализация карты Leaflet
    map = L.map('map').setView([55.7558, 37.6173], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Слои для маркеров и маршрутов
    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    
    // Пытаемся получить текущее местоположение
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                map.setView([lat, lng], 15);
                
                userMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-marker',
                        html: '<div style="background:#2ecc71;border:3px solid white;border-radius:50%;width:16px;height:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
                        iconSize: [20, 20]
                    })
                }).addTo(map).bindPopup('Вы здесь');
            },
            (error) => {
                console.error('Ошибка получения геолокации:', error);
            }
        );
    }
    
    // Обработчик кликов по карте для режимов измерения/построения
    map.on('click', onMapClick);
}

function onMapClick(e) {
    if (isMeasureMode) {
        tempPoints.push(e.latlng);
        drawMeasureLine();
    } else if (isRouteBuilderMode) {
        tempPoints.push(e.latlng);
        drawRoutePreview();
    }
}

function drawMeasureLine() {
    if (tempPoints.length < 2) return;
    
    if (measureLayer) {
        map.removeLayer(measureLayer);
    }
    
    measureLayer = L.polyline(tempPoints, {color: '#e74c3c', weight: 3, dashArray: '10, 10'}).addTo(map);
    
    const distance = calculateDistanceLatlng(tempPoints);
    document.getElementById('info-dist').textContent = formatDistance(distance);
    document.getElementById('info-time').textContent = formatTime(walkTime(distance));
    document.getElementById('info-pill').style.display = 'flex';
}

function drawRoutePreview() {
    if (tempPoints.length < 2) return;
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    
    routeLayer = L.polyline(tempPoints, {color: '#2ecc71', weight: 4}).addTo(map);
    
    const distance = calculateDistanceLatlng(tempPoints);
    document.getElementById('info-dist').textContent = formatDistance(distance);
    document.getElementById('info-time').textContent = formatTime(calculateTime(distance));
    document.getElementById('info-pill').style.display = 'flex';
}

function calculateDistanceLatlng(points) {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += map.distance(points[i-1], points[i]) / 1000;
    }
    return total;
}

function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)} м`;
    return `${km.toFixed(2)} км`;
}

function walkTime(km) {
    return Math.round(km / 5 * 60);
}

function calculateTime(km) {
    const speed = currentMode === 'bike' ? 15 : 5;
    return Math.round(km / speed * 60);
}

function formatTime(minutes) {
    if (minutes < 60) return `${minutes} мин`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}ч ${m}м`;
}

function toggleMeasureMode() {
    isMeasureMode = !isMeasureMode;
    isRouteBuilderMode = false;
    tempPoints = [];
    
    document.getElementById('measure-btn').classList.toggle('active', isMeasureMode);
    document.getElementById('route-btn-main').classList.remove('active');
    document.getElementById('mode-hint').textContent = isMeasureMode ? 'Нажимайте на карту для измерения расстояния' : '';
    
    if (!isMeasureMode && measureLayer) {
        map.removeLayer(measureLayer);
        measureLayer = null;
        document.getElementById('info-pill').style.display = 'none';
    }
}

function startRouteBuilder() {
    isRouteBuilderMode = !isRouteBuilderMode;
    isMeasureMode = false;
    tempPoints = [];
    
    document.getElementById('route-btn-main').classList.toggle('active', isRouteBuilderMode);
    document.getElementById('measure-btn').classList.remove('active');
    document.getElementById('mode-hint').textContent = isRouteBuilderMode ? 'Нажимайте на карту для построения маршрута' : '';
    
    if (!isRouteBuilderMode && routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
        document.getElementById('info-pill').style.display = 'none';
    }
}

function resetTools() {
    isMeasureMode = false;
    isRouteBuilderMode = false;
    tempPoints = [];
    
    if (measureLayer) {
        map.removeLayer(measureLayer);
        measureLayer = null;
    }
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    document.getElementById('measure-btn').classList.remove('active');
    document.getElementById('route-btn-main').classList.remove('active');
    document.getElementById('info-pill').style.display = 'none';
    document.getElementById('mode-hint').textContent = '';
}

// Загрузка POI точек с бэкенда
async function loadPois() {
    try {
        const response = await fetch(`${API_URL}/pois`);
        if (response.ok) {
            allPois = await response.json();
            renderPois(allPois);
        } else {
            // Демо данные для теста если API не доступен
            allPois = [
                {id: 1, name: 'Парк Горького', lat: 55.7297, lng: 37.6015, type: 'park', district: 'central'},
                {id: 2, name: 'ВДНХ', lat: 55.8263, lng: 37.6377, type: 'park', district: 'north'},
                {id: 3, name: 'Красная площадь', lat: 55.7539, lng: 37.6208, type: 'landmark', district: 'central'}
            ];
            renderPois(allPois);
        }
    } catch (error) {
        console.error('Ошибка загрузки POI:', error);
        // Демо данные для теста
        allPois = [
            {id: 1, name: 'Парк Горького', lat: 55.7297, lng: 37.6015, type: 'park', district: 'central'},
            {id: 2, name: 'ВДНХ', lat: 55.8263, lng: 37.6377, type: 'park', district: 'north'},
            {id: 3, name: 'Красная площадь', lat: 55.7539, lng: 37.6208, type: 'landmark', district: 'central'}
        ];
        renderPois(allPois);
    }
}

// Загрузка фильтров районов и типов
function loadFilters() {
    const districts = ['central', 'north', 'south', 'east', 'west'];
    const types = ['park', 'landmark', 'cafe', 'viewpoint', 'history', 'sport'];
    
    const districtContainer = document.getElementById('district-filters');
    const typeContainer = document.getElementById('type-filters');
    
    districtContainer.innerHTML = districts.map(d => `
        <label class="filter-item">
            <input type="checkbox" value="${d}" checked onchange="applyFilters()"> ${getDistrictName(d)}
        </label>
    `).join('');
    
    typeContainer.innerHTML = types.map(t => `
        <label class="filter-item">
            <input type="checkbox" value="${t}" checked onchange="applyFilters()"> ${getTypeName(t)}
        </label>
    `).join('');
}

function getDistrictName(district) {
    const names = {
        'central': 'Центральный',
        'north': 'Северный',
        'south': 'Южный',
        'east': 'Восточный',
        'west': 'Западный'
    };
    return names[district] || district;
}

// Применение фильтров
function applyFilters() {
    const checkedDistricts = Array.from(document.querySelectorAll('#district-filters input:checked')).map(el => el.value);
    const checkedTypes = Array.from(document.querySelectorAll('#type-filters input:checked')).map(el => el.value);
    
    const filtered = allPois.filter(poi => 
        checkedDistricts.includes(poi.district) && checkedTypes.includes(poi.type)
    );
    
    renderPois(filtered);
}

// Поиск POI
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let debounceTimer;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim().toLowerCase();
        
        debounceTimer = setTimeout(() => {
            if (query.length < 2) {
                renderPois(allPois);
                return;
            }
            
            const filtered = allPois.filter(poi => 
                poi.name.toLowerCase().includes(query) ||
                getTypeName(poi.type).toLowerCase().includes(query)
            );
            
            renderPois(filtered);
            
            if (filtered.length > 0 && map) {
                map.setView([filtered[0].lat, filtered[0].lng], 14);
            }
        }, 300);
    });
}

function renderPois(pois) {
    if (markersLayer) {
        markersLayer.clearLayers();
    }
    
    pois.forEach(poi => {
        const icon = getPoiIcon(poi.type);
        const marker = L.marker([poi.lat, poi.lng], {
            icon: L.divIcon({
                className: 'poi-marker',
                html: `<div style="background:#2ecc71;border:2px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${icon}</div>`,
                iconSize: [32, 32]
            })
        }).addTo(markersLayer);
        
        marker.bindPopup(`
            <div style="min-width:200px;">
                <b>${poi.name}</b><br>
                <small>${getTypeName(poi.type)}</small><br>
                <button onclick="showPoiDetails(${poi.id})" style="margin-top:8px;background:#2ecc71;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Подробнее</button>
            </div>
        `);
    });
}

function getPoiIcon(type) {
    const icons = {
        'park': '🌳',
        'landmark': '🏛️',
        'cafe': '☕',
        'viewpoint': '👁️',
        'history': '📜',
        'sport': '⚽'
    };
    return icons[type] || '📍';
}

function getTypeName(type) {
    const names = {
        'park': 'Парк',
        'landmark': 'Достопримечательность',
        'cafe': 'Кафе',
        'viewpoint': 'Смотровая площадка',
        'history': 'Историческое место',
        'sport': 'Спорт'
    };
    return names[type] || 'Место';
}

function showPoiDetails(id) {
    const poi = allPois.find(p => p.id === id);
    if (!poi) return;
    
    const content = `
        <h3>${poi.name}</h3>
        <p><b>Тип:</b> ${getTypeName(poi.type)}</p>
        <p><b>Район:</b> ${poi.district || 'Не указан'}</p>
        <p><b>Координаты:</b> ${poi.lat.toFixed(4)}, ${poi.lng.toFixed(4)}</p>
        <button onclick="navigateToPoi(${poi.lat}, ${poi.lng})" style="width:100%;margin-top:10px;background:#2ecc71;color:white;border:none;padding:10px;border-radius:8px;cursor:pointer;">Показать маршрут</button>
    `;
    
    document.getElementById('details-content').innerHTML = content;
    document.getElementById('details-sheet').classList.add('open');
}

function navigateToPoi(lat, lng) {
    closeDetails();
    map.setView([lat, lng], 16);
    
    if (userMarker) {
        const from = userMarker.getLatLng();
        tempPoints = [from, L.latLng(lat, lng)];
        drawRoutePreview();
    }
}

function closeDetails() {
    document.getElementById('details-sheet').classList.remove('open');
}

async function startTracking() {
    try {
        // Создаем новый трек на бэкенде
        const response = await fetch(`${API_URL}/tracks/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: `Трек ${new Date().toLocaleDateString()}`,
                started_at: new Date().toISOString()
            })
        });
        
        if (response.ok) {
            currentTrack = await response.json();
            trackPoints = [];
            trackingStartTime = new Date();
            
            // Обновляем UI
            document.getElementById('btn-start-tracking').disabled = true;
            document.getElementById('btn-stop-tracking').disabled = false;
            document.getElementById('btn-pause-tracking').disabled = false;
            
            // Запускаем отслеживание GPS
            startGPSWatch();
            
            // Запускаем таймер
            trackingInterval = setInterval(updateTrackingTimer, 1000);
            
            tg.showAlert('Трекинг начался! Не закрывайте приложение.');
        } else {
            tg.showAlert('Ошибка начала трекинга');
        }
    } catch (error) {
        console.error('Ошибка старта трекинга:', error);
        tg.showAlert('Ошибка соединения с сервером');
    }
}

function startGPSWatch() {
    if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                
                trackPoints.push({
                    latitude: lat,
                    longitude: lng,
                    timestamp: new Date().toISOString(),
                    accuracy: accuracy
                });
                
                // Обновляем маркер пользователя
                if (userMarker) {
                    userMarker.setLatLng([lat, lng]);
                } else {
                    userMarker = L.marker([lat, lng]).addTo(map);
                }
                
                // Рисуем линию трека
                if (polyline) {
                    polyline.setLatLngs(trackPoints.map(p => [p.latitude, p.longitude]));
                } else {
                    polyline = L.polyline(trackPoints.map(p => [p.latitude, p.longitude]), {
                        color: '#2481cc',
                        weight: 4
                    }).addTo(map);
                }
                
                // Центрируем карту на текущей позиции
                map.setView([lat, lng]);
                
                // Отправляем точку на бэкенд (опционально, можно батчами)
                sendTrackPoint(lat, lng, accuracy);
            },
            (error) => {
                console.error('Ошибка GPS:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }
}

async function sendTrackPoint(lat, lng, accuracy) {
    if (!currentTrack) return;
    
    try {
        await fetch(`${API_URL}/tracks/${currentTrack.id}/points`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: lat,
                longitude: lng,
                accuracy: accuracy,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Ошибка отправки точки:', error);
    }
}

function updateTrackingTimer() {
    if (!trackingStartTime) return;
    
    const now = new Date();
    const elapsed = Math.floor((now - trackingStartTime) / 1000);
    
    document.getElementById('tracking-time').textContent = formatTime(elapsed);
    
    // Расчет расстояния (упрощенно)
    const distance = calculateDistance(trackPoints);
    document.getElementById('tracking-distance').textContent = `${distance.toFixed(2)} км`;
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
}

function calculateDistance(points) {
    if (points.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += getDistanceFromLatLonInKm(
            points[i-1].latitude,
            points[i-1].longitude,
            points[i].latitude,
            points[i].longitude
        );
    }
    
    return total;
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Радиус Земли в км
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function pauseTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    document.getElementById('btn-pause-tracking').textContent = '▶️ Продолжить';
    document.getElementById('btn-pause-tracking').setAttribute('onclick', 'resumeTracking()');
}

function resumeTracking() {
    startGPSWatch();
    trackingInterval = setInterval(updateTrackingTimer, 1000);
    
    document.getElementById('btn-pause-tracking').textContent = '⏸️ Пауза';
    document.getElementById('btn-pause-tracking').setAttribute('onclick', 'pauseTracking()');
}

async function stopTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    if (currentTrack) {
        try {
            // Завершаем трек на бэкенде
            await fetch(`${API_URL}/tracks/${currentTrack.id}/stop`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${USER_ID}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ended_at: new Date().toISOString(),
                    total_distance_km: calculateDistance(trackPoints),
                    total_points: trackPoints.length
                })
            });
            
            tg.showAlert(`Трек завершен! Пройдено: ${calculateDistance(trackPoints).toFixed(2)} км`);
            
            // Сброс
            currentTrack = null;
            trackPoints = [];
            polyline = null;
            trackingStartTime = null;
            
            // Обновляем UI
            document.getElementById('btn-start-tracking').disabled = false;
            document.getElementById('btn-stop-tracking').disabled = true;
            document.getElementById('btn-pause-tracking').disabled = true;
            document.getElementById('btn-pause-tracking').textContent = '⏸️ Пауза';
            document.getElementById('btn-pause-tracking').setAttribute('onclick', 'pauseTracking()');
            document.getElementById('tracking-time').textContent = '00:00:00';
            document.getElementById('tracking-distance').textContent = '0.00 км';
            
            // Перезагружаем статистику
            loadQuickStats();
            loadRecentTracks();
            
        } catch (error) {
            console.error('Ошибка остановки трекинга:', error);
            tg.showAlert('Ошибка сохранения трека');
        }
    }
}

// ==================== КАТАЛОГ МАРШРУТОВ ====================
async function loadRoutes() {
    try {
        const response = await fetch(`${API_URL}/routes`, {
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const routes = await response.json();
            renderRoutes(routes);
        }
    } catch (error) {
        console.error('Ошибка загрузки маршрутов:', error);
    }
}

function renderRoutes(routes) {
    const container = document.getElementById('routes-list');
    
    if (!routes || routes.length === 0) {
        container.innerHTML = '<p class="loading">Маршруты не найдены</p>';
        return;
    }
    
    container.innerHTML = routes.map(route => `
        <div class="route-card" data-difficulty="${route.difficulty || 'medium'}">
            <img src="${route.image_url || 'images/route-placeholder.jpg'}" alt="${route.name}" class="route-image" onerror="this.src='images/route-placeholder.jpg'">
            <div class="route-info">
                <div class="route-title">${route.name}</div>
                <div class="route-meta">
                    <span>📍 ${(route.distance_km || 0).toFixed(1)} км</span>
                    <span>⏱️ ${formatDuration(route.duration_seconds || 0)}</span>
                    <span class="route-difficulty difficulty-${route.difficulty || 'medium'}">
                        ${getDifficultyLabel(route.difficulty)}
                    </span>
                </div>
                <button class="btn-route-action" onclick="viewRoute(${route.id})">
                    Смотреть маршрут
                </button>
            </div>
        </div>
    `).join('');
}

function getDifficultyLabel(difficulty) {
    const labels = {
        'easy': 'Легкий',
        'medium': 'Средний',
        'hard': 'Сложный'
    };
    return labels[difficulty] || 'Средний';
}

function filterRoutes() {
    const searchTerm = document.getElementById('route-search').value.toLowerCase();
    const difficultyFilter = document.getElementById('route-difficulty').value;
    
    const cards = document.querySelectorAll('.route-card');
    
    cards.forEach(card => {
        const title = card.querySelector('.route-title').textContent.toLowerCase();
        const difficulty = card.getAttribute('data-difficulty');
        
        const matchesSearch = title.includes(searchTerm);
        const matchesDifficulty = !difficultyFilter || difficulty === difficultyFilter;
        
        card.style.display = matchesSearch && matchesDifficulty ? 'block' : 'none';
    });
}

function viewRoute(routeId) {
    // TODO: Открыть детальную информацию о маршруте
    tg.showAlert(`Маршрут #${routeId}`);
}

// Загрузка маршрутов при инициализации
loadRoutes();

// ==================== ДОСТИЖЕНИЯ ====================
async function loadAchievements() {
    try {
        const response = await fetch(`${API_URL}/user/achievements`, {
            headers: {
                'Authorization': `Bearer ${USER_ID}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const achievements = await response.json();
            renderAchievements(achievements);
        }
    } catch (error) {
        console.error('Ошибка загрузки достижений:', error);
    }
}

function renderAchievements(achievements) {
    const container = document.getElementById('achievements-list');
    
    if (!achievements || achievements.length === 0) {
        container.innerHTML = '<p class="loading">Достижения не найдены</p>';
        return;
    }
    
    container.innerHTML = achievements.map(achievement => {
        const isLocked = !achievement.unlocked;
        const desc = ACHIEVEMENTS_DESC[achievement.id] || achievement.description || 'Описание недоступно';
        return `
        <div class="achievement-item ${isLocked ? 'locked' : ''}" onclick="showAchievementDetails('${achievement.id}', '${achievement.name}', '${desc}', ${isLocked})">
            <div class="achievement-icon">${achievement.icon || '🏆'}</div>
            <div class="achievement-name">${achievement.name}</div>
            <span class="achievement-desc">${isLocked ? '???' : desc}</span>
        </div>
    `}).join('');
}

function showAchievementDetails(id, name, desc, locked) {
    const content = `
        <h3>${name}</h3>
        <p><b>Описание:</b> ${desc}</p>
        <p><b>Статус:</b> ${locked ? '🔒 Заблокировано' : '✅ Получено'}</p>
        <button onclick="closeDetails()" style="width:100%;margin-top:15px;background:#2ecc71;color:white;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold;">Закрыть</button>
    `;
    document.getElementById('details-content').innerHTML = content;
    document.getElementById('details-sheet').classList.add('open');
}

loadAchievements();

// ==================== AI ЧАТ ====================
function openAIChat() {
    document.getElementById("ai-chat-modal").classList.add("active");
}

function closeAIChat() {
    document.getElementById("ai-chat-modal").classList.remove("active");
}

async function sendChat() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message) return;
    
    const chatBody = document.getElementById("chat-body");
    chatBody.innerHTML += `<div class="msg user">${message}</div>`;
    input.value = "";
    
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({message: message, user_id: USER_ID})
        });
        
        if (response.ok) {
            const data = await response.json();
            chatBody.innerHTML += `<div class="msg bot">${data.response || "Получил ваш вопрос!"}</div>`;
        } else {
            chatBody.innerHTML += `<div class="msg bot">Извините, сейчас я недоступен.</div>`;
        }
    } catch (error) {
        chatBody.innerHTML += `<div class="msg bot">Ошибка соединения. Попробуйте позже.</div>`;
    }
    
    chatBody.scrollTop = chatBody.scrollHeight;
}

function handleChatKeyPress(event) {
    if (event.key === "Enter") sendChat();
}

function logout() {
    tg.showConfirm('Вы уверены, что хотите выйти?', (confirmed) => {
        if (confirmed) {
            // TODO: Логика выхода
            tg.close();
        }
    });
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
// Здесь будут другие утилиты и функции по мере необходимости

// ==================== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ====================
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    const btn = document.querySelector(`[onclick="switchView('${viewId}')"]`);
    if (btn) btn.classList.add('active');
    
    if (viewId === 'map-view' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
}

function centerOnUser() {
    if (userMarker) {
        const latlng = userMarker.getLatLng();
        map.setView(latlng, 16);
    }
}

function toggleFilterMenu() {
    const menu = document.getElementById('filter-menu');
    menu.classList.toggle('open');
}

function setTransport(mode) {
    currentMode = mode;
    document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');
}

function getDifficultyLabel(difficulty) {
    const labels = {'easy': 'Легкий', 'medium': 'Средний', 'hard': 'Сложный'};
    return labels[difficulty] || 'Средний';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openPublishRouteModal() {
    document.getElementById('publish-route-modal').classList.add('active');
}

function openGroupHikeModal() {
    document.getElementById('group-hike-modal').classList.add('active');
}

function publishRoute() {
    const name = document.getElementById('route-name').value;
    tg.showAlert(`Маршрут "${name}" опубликован!`);
    closeModal('publish-route-modal');
}

function createGroupHike() {
    const name = document.getElementById('group-name').value;
    tg.showAlert(`Поход "${name}" создан!`);
    closeModal('group-hike-modal');
}

function inviteFriend() {
    tg.showShareURL();
}

function editParams() {
    document.getElementById('params-display').style.display = 'none';
    document.getElementById('params-editor').style.display = 'block';
}

function saveParams() {
    const age = document.getElementById('edit-age').value;
    const height = document.getElementById('edit-height').value;
    const weight = document.getElementById('edit-weight').value;
    
    document.getElementById('p-age').textContent = age || '-';
    document.getElementById('p-height').textContent = height || '-';
    document.getElementById('p-weight').textContent = weight || '-';
    
    document.getElementById('params-editor').style.display = 'none';
    document.getElementById('params-display').style.display = 'block';
}

function cancelParams() {
    document.getElementById('params-editor').style.display = 'none';
    document.getElementById('params-display').style.display = 'block';
}

function openGoalsEditor() {
    document.getElementById('goals-modal').classList.add('active');
}

function saveGoals() {
    tg.showAlert('Цели сохранены!');
    closeModal('goals-modal');
}

function togglePublicRoutes() {
    loadRoutes();
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    try {
        const response = await fetch(`${API_URL}/leaderboard`);
        if (response.ok) {
            const data = await response.json();
            renderLeaderboard(data);
            return;
        }
    } catch (e) {}
    
    // Демо данные
    const demo = [
        {rank: 1, name: 'Алексей', distance_km: 125.5},
        {rank: 2, name: 'Мария', distance_km: 98.2},
        {rank: 3, name: 'Дмитрий', distance_km: 87.6}
    ];
    renderLeaderboard(demo);
}

function renderLeaderboard(users) {
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = users.map((u, i) => `
        <div class="card" style="margin-bottom:10px;">
            <div class="card-icon" style="background:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'var(--tg-secondary)'};color:${i<3?'#000':'var(--tg-text)'}">${i+1}</div>
            <div class="card-info">
                <h4>${u.name || u.username}</h4>
                <p>${(u.distance_km || 0).toFixed(1)} км</p>
            </div>
        </div>
    `).join('');
}

async function loadRoutes() {
    const container = document.getElementById('routes-list');
    try {
        const response = await fetch(`${API_URL}/routes/public`);
        if (response.ok) {
            const routes = await response.json();
            renderRoutes(routes);
            return;
        }
    } catch (e) {}
    
    // Демо данные
    const demo = [
        {id: 1, name: 'Парковый круг', distance_km: 3.5, duration_seconds: 2520, difficulty: 'easy'},
        {id: 2, name: 'Исторический центр', distance_km: 5.2, duration_seconds: 4200, difficulty: 'medium'}
    ];
    renderRoutes(demo);
}

function renderRoutes(routes) {
    const container = document.getElementById('routes-list');
    if (!routes || routes.length === 0) {
        container.innerHTML = '<p class="loading">Маршруты не найдены</p>';
        return;
    }
    
    container.innerHTML = routes.map(route => `
        <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="viewRoute(${route.id})">
            <div class="card-icon">🗺️</div>
            <div class="card-info">
                <h4>${route.name}</h4>
                <p>${(route.distance_km || 0).toFixed(1)} км • ${formatDuration(route.duration_seconds || 0)} • ${getDifficultyLabel(route.difficulty)}</p>
            </div>
        </div>
    `).join('');
}

function viewRoute(id) {
    tg.showAlert(`Маршрут #${id}`);
}

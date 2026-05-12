const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const CONFIG = {
    defaultCenter: [55.9833, 92.8667],  // Центр Красноярска
    defaultZoom: 12,
    apiBaseUrl: 'https://walkerbot.onrender.com/api'
};

let map;
let markersLayer = L.layerGroup();
let routeLayer = L.layerGroup();
let currentRoutePoints = [];
let isRouteMode = false;
let allPois = [];

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18
    }).addTo(map);

    markersLayer.addTo(map);
    routeLayer.addTo(map);

    loadPoisFromApi();
    
    map.on('click', function(e) {
        if (isRouteMode) addRoutePoint(e.latlng);
    });
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadPoisFromApi() {
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/poi`);
        allPois = await res.json();
        renderPois('all');
    } catch (e) {
        console.error('Ошибка загрузки POI:', e);
        // Запасные точки если API недоступен
        allPois = [
            { name: "Николаевская сопка", lat: 56.0014, lon: 92.7375, type: "сопка", tags: ["панорама"], desc: "505 м, флаг России", district: "октябрьский" },
            { name: "Такмак", lat: 55.9492, lon: 92.8008, type: "скала", tags: ["скалы"], desc: "Главный массив", district: "столбы" },
            { name: "Красный гребень", lat: 55.9639, lon: 92.8286, type: "хребет", tags: ["горы"], desc: "Высшая точка", district: "торгашинский" }
        ];
        renderPois('all');
    }
}

async function loadGroups() {
    switchView('groups-view');
    const list = document.getElementById('groups-list');
    list.innerHTML = '<p class="loading">Загрузка...</p>';
    
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/groups`);
        const groups = await res.json();
        
        if (groups.length === 0) {
            list.innerHTML = '<p class="loading">Нет активных прогулок</p>';
            return;
        }
        
        list.innerHTML = '';
        groups.forEach(g => {
            list.innerHTML += `
                <div class="card" onclick="joinGroup(${g.id})">
                    <div class="card-icon"><i class="fas fa-users"></i></div>
                    <div class="card-info">
                        <h4>${g.name}</h4>
                        <p>📍 ${g.place_name || 'Не указано'}</p>
                        <p style="color: var(--tg-theme-button-color)">${g.participants || 0} участников</p>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        list.innerHTML = '<p class="loading">Ошибка загрузки</p>';
    }
}

async function loadProfile() {
    switchView('profile-view');
    
    try {
        const uid = tg.initDataUnsafe?.user?.id;
        const res = await fetch(`${CONFIG.apiBaseUrl}/profile?user_id=${uid}`);
        const user = await res.json();
        
        document.getElementById('user-name').innerText = user.first_name || 'Путешественник';
        document.getElementById('stat-dist').innerText = (user.total_km || 0).toFixed(0);
        document.getElementById('stat-tracks').innerText = user.total_walks || 0;
        document.getElementById('stat-rank').innerText = getRank(user.points || 0);
        document.getElementById('user-avatar').innerText = (user.first_name || 'U')[0].toUpperCase();
        
        const achList = document.getElementById('achievements-list');
        achList.innerHTML = '';
        const achievements = [
            { icon: '🥇', label: 'Первый шаг', unlocked: (user.total_walks || 0) >= 1 },
            { icon: '🚶', label: '10 км', unlocked: (user.total_km || 0) >= 10 },
            { icon: '🌄', label: 'Закаты', unlocked: (user.points || 0) >= 50 },
            { icon: '📸', label: 'Фотограф', unlocked: false },
            { icon: '🏆', label: '100 км', unlocked: (user.total_km || 0) >= 100 }
        ];
        
        achievements.forEach(a => {
            achList.innerHTML += `
                <div class="achievement-item ${a.unlocked ? '' : 'locked'}">
                    ${a.icon}
                    <span class="achievement-label">${a.label}</span>
                </div>
            `;
        });
    } catch (e) {
        console.error('Ошибка профиля:', e);
    }
}

// ==================== КАРТА ====================
function renderPois(filterType) {
    markersLayer.clearLayers();
    
    allPois.forEach(poi => {
        if (filterType === 'all' || 
            (filterType === 'viewpoint' && (poi.tags || []).includes('панорама')) ||
            (filterType === 'rock' && poi.type === 'скала') ||
            (filterType === 'water' && ((poi.tags || []).includes('река') || (poi.tags || []).includes('вода'))) ||
            (filterType === 'forest' && poi.type === 'лес')) {
            
            const marker = L.marker([poi.lat, poi.lon]);
            marker.bindPopup(`<b>${poi.name}</b><br>${poi.desc || ''}`);
            marker.on('click', () => showDetails(poi));
            markersLayer.addLayer(marker);
        }
    });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
        renderPois(e.target.closest('button').dataset.filter);
    });
});

function showDetails(poi) {
    const content = document.getElementById('details-content');
    content.innerHTML = `
        <h2>${poi.name}</h2>
        <p style="color: var(--tg-theme-link-color)">${poi.district || ''} • ${poi.type || ''}</p>
        <p>${poi.desc || 'Описание скоро появится'}</p>
        <button class="primary-btn" style="margin-top: 15px;" onclick="startRouteTo(${poi.lat}, ${poi.lng})">
            <i class="fas fa-location-arrow"></i> Построить путь сюда
        </button>
        <button class="primary-btn" style="margin-top: 10px; background: var(--tg-theme-secondary-bg-color); color: var(--tg-theme-text-color);" onclick="sharePoi('${poi.name}', ${poi.lat}, ${poi.lng})">
            <i class="fas fa-share"></i> Поделиться
        </button>
    `;
    document.getElementById('details-view').classList.add('open');
}

function toggleRouteMode() {
    isRouteMode = !isRouteMode;
    currentRoutePoints = [];
    routeLayer.clearLayers();
    
    const btn = document.querySelector('#main-action-bar .primary-btn');
    
    if (isRouteMode) {
        btn.innerHTML = '<i class="fas fa-check"></i> Готово';
        btn.style.background = '#e74c3c';
        tg.HapticFeedback?.notificationOccurred('success');
    } else {
        if (currentRoutePoints.length < 2) {
            isRouteMode = true;
            return;
        }
        finishRouteBuilding();
        btn.innerHTML = '<i class="fas fa-route"></i> Построить маршрут';
        btn.style.background = 'var(--tg-theme-button-color)';
    }
}

function addRoutePoint(latlng) {
    currentRoutePoints.push(latlng);
    L.circleMarker(latlng, { radius: 8, color: '#e74c3c', fillOpacity: 0.8 }).addTo(routeLayer);
    
    if (currentRoutePoints.length > 1) {
        L.polyline(currentRoutePoints, { color: '#2ecc71', weight: 4 }).addTo(routeLayer);
    }
}

function finishRouteBuilding() {
    const points = currentRoutePoints.map(p => ({ lat: p.lat, lng: p.lng }));
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) {
        dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    }
    
    tg.sendData(JSON.stringify({
        action: 'route_built',
        data: { points: points, length: dist.toFixed(2) }
    }));
    tg.close();
}

function startRouteTo(lat, lng) {
    document.getElementById('details-view').classList.remove('open');
    isRouteMode = true;
    currentRoutePoints = [];
    routeLayer.clearLayers();
    addRoutePoint({ lat: map.getCenter().lat, lng: map.getCenter().lng });
    addRoutePoint({ lat, lng });
    toggleRouteMode();
}

function sharePoi(name, lat, lng) {
    tg.sendData(JSON.stringify({
        action: 'share_poi',
        data: { name, lat, lng }
    }));
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (viewId === 'map-view') document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    if (viewId === 'groups-view') document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
    if (viewId === 'profile-view') document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
    
    if (viewId === 'map-view') setTimeout(() => map?.invalidateSize(), 300);
}

function joinGroup(id) {
    tg.sendData(JSON.stringify({ action: 'join_group', id: id }));
    tg.showPopup({ title: 'Заявка отправлена!', message: 'Организатор рассмотрит вашу заявку.' });
}

function getRank(points) {
    if (points >= 500) return '🏆 Легенда';
    if (points >= 200) return '🥇 Мастер';
    if (points >= 100) return '🥈 Опытный';
    if (points >= 50) return '🥉 Любитель';
    return '🌱 Новичок';
}

// Старт
initMap();
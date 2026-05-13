const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const CONFIG = {
    defaultCenter: [55.9833, 92.8667],
    defaultZoom: 12,
    apiBaseUrl: 'https://walkerbot.onrender.com/api'
};

let map, markersLayer = L.layerGroup(), routeLayer = L.layerGroup(), measureLayer = L.layerGroup();
let currentRoutePoints = [], isRouteMode = false, isMeasureMode = false;
let allPois = [], currentMode = 'walk';

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 18 }).addTo(map);
    markersLayer.addTo(map);
    routeLayer.addTo(map);
    measureLayer.addTo(map);
    loadPoisFromApi();
    map.on('click', handleMapClick);
}

// ==================== РЕЖИМЫ ====================
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    if (currentRoutePoints.length >= 2) updateRouteInfo();
}

function toggleRouteMode() {
    isRouteMode = !isRouteMode;
    isMeasureMode = false;
    document.getElementById('measure-line').classList.remove('active');
    currentRoutePoints = [];
    routeLayer.clearLayers();
    document.getElementById('route-panel').classList.remove('active');
    
    const btn = document.getElementById('route-btn');
    if (isRouteMode) {
        btn.innerHTML = '<i class="fas fa-check"></i> <span>Готово</span>';
        btn.style.background = '#e74c3c';
    } else {
        btn.innerHTML = '<i class="fas fa-route"></i> <span>Построить маршрут</span>';
        btn.style.background = 'var(--tg-theme-button-color)';
    }
}

function toggleMeasureMode() {
    isMeasureMode = !isMeasureMode;
    isRouteMode = false;
    document.getElementById('route-panel').classList.remove('active');
    currentRoutePoints = [];
    routeLayer.clearLayers();
    measureLayer.clearLayers();
    
    const btn = document.querySelector('#main-action-bar .primary-btn:first-child');
    btn.innerHTML = '<i class="fas fa-route"></i> <span>Построить маршрут</span>';
    btn.style.background = 'var(--tg-theme-button-color)';
    
    if (isMeasureMode) {
        document.getElementById('measure-line').classList.add('active');
        document.getElementById('measure-dist').innerText = '0';
        document.getElementById('measure-time').innerText = '0';
    } else {
        document.getElementById('measure-line').classList.remove('active');
    }
}

// ==================== ОБРАБОТКА КЛИКОВ ====================
function handleMapClick(e) {
    if (isRouteMode) {
        addRoutePoint(e.latlng);
    } else if (isMeasureMode) {
        addMeasurePoint(e.latlng);
    }
}

function addRoutePoint(latlng) {
    currentRoutePoints.push(latlng);
    L.circleMarker(latlng, { radius: 8, color: '#e74c3c', fillOpacity: 0.8 }).addTo(routeLayer);
    if (currentRoutePoints.length > 1) {
        L.polyline(currentRoutePoints.map(p => [p.lat, p.lng]), { color: '#2ecc71', weight: 4 }).addTo(routeLayer);
        updateRouteInfo();
    }
}

function addMeasurePoint(latlng) {
    currentRoutePoints.push(latlng);
    L.circleMarker(latlng, { radius: 6, color: '#3498db', fillOpacity: 0.8 }).addTo(measureLayer);
    if (currentRoutePoints.length > 1) {
        measureLayer.clearLayers();
        currentRoutePoints.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 6, color: '#3498db', fillOpacity: 0.8 }).addTo(measureLayer));
        L.polyline(currentRoutePoints.map(p => [p.lat, p.lng]), { color: '#3498db', weight: 3, dashArray: '10' }).addTo(measureLayer);
        updateMeasureInfo();
    }
}

// ==================== РАСЧЁТЫ ====================
async function updateRouteInfo() {
    if (currentRoutePoints.length < 2) return;
    
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) {
        dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    }
    
    document.getElementById('route-panel').classList.add('active');
    document.getElementById('route-dist').innerText = dist.toFixed(2) + ' км';
    
    // Запрашиваем время у API бота
    try {
        const points = currentRoutePoints.map(p => ({ lat: p.lat, lng: p.lng }));
        const res = await fetch(`${CONFIG.apiBaseUrl}/route-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points, mode: currentMode, user_id: tg.initDataUnsafe?.user?.id })
        });
        const data = await res.json();
        document.getElementById('route-time').innerText = data.time_min + ' мин';
        document.getElementById('route-cal').innerText = '~' + data.calories + ' ккал';
    } catch (e) {
        const speed = currentMode === 'walk' ? 5 : 15;
        const time = Math.round((dist / speed) * 60);
        document.getElementById('route-time').innerText = time + ' мин';
        document.getElementById('route-cal').innerText = '~' + Math.round(dist * 50) + ' ккал';
    }
}

function updateMeasureInfo() {
    if (currentRoutePoints.length < 2) return;
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) {
        dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    }
    const speed = currentMode === 'walk' ? 5 : 15;
    const time = Math.round((dist / speed) * 60);
    document.getElementById('measure-dist').innerText = dist.toFixed(2);
    document.getElementById('measure-time').innerText = time;
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadPoisFromApi() {
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/poi`);
        allPois = await res.json();
        renderPois('all');
    } catch (e) {
        allPois = [
            { name: "Николаевская сопка", lat: 56.0014, lon: 92.7375, type: "сопка", district: "гремячая" },
            { name: "Такмак", lat: 55.9492, lon: 92.8008, type: "скала", district: "столбы" },
            { name: "Красный гребень", lat: 55.9639, lon: 92.8286, type: "хребет", district: "торгашинский" }
        ];
        renderPois('all');
    }
}

async function loadProfile() {
    try {
        const uid = tg.initDataUnsafe?.user?.id;
        const res = await fetch(`${CONFIG.apiBaseUrl}/profile?user_id=${uid}`);
        const user = await res.json();
        document.getElementById('user-name').innerText = user.first_name || 'Путешественник';
        document.getElementById('user-avatar').innerText = (user.first_name || 'U')[0].toUpperCase();
        document.getElementById('stat-dist').innerText = (user.total_km || 0).toFixed(0);
        document.getElementById('stat-tracks').innerText = user.total_walks || 0;
        document.getElementById('stat-rank').innerText = getRank(user.points || 0);
    } catch (e) {}
}

// ==================== КАРТА ====================
function renderPois(filter) {
    markersLayer.clearLayers();
    allPois.forEach(poi => {
        if (filter === 'all' || poi.district === filter || (poi.tags || []).includes(filter)) {
            const marker = L.marker([poi.lat, poi.lon]);
            marker.bindTooltip(poi.name);
            marker.on('click', () => showDetails(poi));
            markersLayer.addLayer(marker);
        }
    });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', e => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderPois(e.target.dataset.filter);
    });
});

document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    markersLayer.clearLayers();
    allPois.filter(p => p.name.toLowerCase().includes(q)).forEach(poi => {
        const m = L.marker([poi.lat, poi.lon]);
        m.bindTooltip(poi.name);
        m.on('click', () => showDetails(poi));
        markersLayer.addLayer(m);
    });
});

// ==================== ДЕТАЛИ МЕСТА ====================
function showDetails(poi) {
    document.getElementById('details-content').innerHTML = `
        <h2>${poi.name}</h2>
        <p style="color:var(--tg-theme-link-color)">${poi.district||''} • ${poi.type||''}</p>
        <p>${poi.desc||''}</p>
        <button class="primary-btn" onclick="startRouteTo(${poi.lat},${poi.lng})"><i class="fas fa-location-arrow"></i> Маршрут сюда</button>
        <button class="primary-btn" style="margin-top:8px;background:var(--tg-theme-secondary-bg-color);color:var(--tg-theme-text-color)" onclick="sharePoi('${poi.name}',${poi.lat},${poi.lng})"><i class="fas fa-share"></i> Поделиться</button>
    `;
    document.getElementById('details-view').classList.add('open');
}

function startRouteTo(lat, lng) {
    document.getElementById('details-view').classList.remove('open');
    toggleRouteMode();
    addRoutePoint({ lat: map.getCenter().lat, lng: map.getCenter().lng });
    addRoutePoint({ lat, lng });
}

function sharePoi(name, lat, lng) {
    tg.sendData(JSON.stringify({ action: 'share_poi', data: { name, lat, lng } }));
}

// ==================== ФИНАЛИЗАЦИЯ ====================
function finishRouteBuilding() {
    if (currentRoutePoints.length < 2) return;
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) {
        dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    }
    tg.sendData(JSON.stringify({
        action: 'route_built',
        data: { points: currentRoutePoints.map(p => ({ lat: p.lat, lng: p.lng })), length: dist.toFixed(2), mode: currentMode }
    }));
    tg.close();
}

// ==================== НАВИГАЦИЯ ====================
function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (id === 'map-view') document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    if (id === 'profile-view') document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
    if (id === 'map-view') setTimeout(() => map?.invalidateSize(), 300);
}

function getRank(p) {
    if (p >= 500) return '🏆 Легенда';
    if (p >= 200) return '🥇 Мастер';
    if (p >= 100) return '🥈 Опытный';
    if (p >= 50) return '🥉 Любитель';
    return '🌱 Новичок';
}

initMap();
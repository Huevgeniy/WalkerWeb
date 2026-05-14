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
let userLocationMarker = null;
let locationWatchId = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 18 }).addTo(map);
    markersLayer.addTo(map); routeLayer.addTo(map); measureLayer.addTo(map);
    loadPoisFromApi();
    map.on('click', handleMapClick);
}

// ==================== ГЕОЛОКАЦИЯ ====================
function startLocationTracking() {
    if (!navigator.geolocation) {
        tg.showPopup({ title: 'Ошибка', message: 'Геолокация не поддерживается' });
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            map.setView([lat, lng], 14);
            if (userLocationMarker) {
                userLocationMarker.setLatLng([lat, lng]);
            } else {
                userLocationMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-location',
                        html: '<div style="width:16px;height:16px;background:#3498db;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(52,152,219,0.5)"></div>',
                        iconSize: [16, 16]
                    })
                }).addTo(map);
                userLocationMarker.bindPopup('Вы здесь');
            }
            tg.showPopup({ title: '📍 Геолокация', message: 'Карта центрирована на вас' });
        },
        (err) => {
            tg.showPopup({ title: 'Ошибка', message: 'Не удалось получить геолокацию. Разрешите доступ в настройках.' });
        },
        { enableHighAccuracy: true }
    );
}

function watchLocation() {
    if (!navigator.geolocation) return;
    
    if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
        tg.showPopup({ title: '📍 Отслеживание', message: 'Отслеживание остановлено' });
        return;
    }
    
    locationWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (userLocationMarker) {
                userLocationMarker.setLatLng([lat, lng]);
            } else {
                userLocationMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-location',
                        html: '<div style="width:16px;height:16px;background:#e74c3c;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(231,76,60,0.5);animation:pulse 1.5s infinite"></div>',
                        iconSize: [16, 16]
                    })
                }).addTo(map);
            }
            map.setView([lat, lng], map.getZoom());
        },
        (err) => console.log('Watch error:', err),
        { enableHighAccuracy: true, maximumAge: 5000 }
    );
    tg.showPopup({ title: '📍 Отслеживание', message: 'Карта следует за вами. Нажмите ещё раз чтобы остановить.' });
}

// ==================== РЕЖИМЫ ====================
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    if (currentRoutePoints.length >= 2) updateRouteInfo();
}

function toggleRouteMode() {
    if (isMeasureMode) toggleMeasureMode();
    isRouteMode = !isRouteMode;
    currentRoutePoints = []; routeLayer.clearLayers();
    document.getElementById('route-panel').classList.remove('active');
    const btn = document.getElementById('route-btn');
    if (isRouteMode) {
        btn.querySelector('span').innerText = 'Готово';
        btn.style.background = '#e74c3c';
    } else {
        btn.querySelector('span').innerText = 'Построить маршрут';
        btn.style.background = 'var(--tg-theme-button-color)';
        if (currentRoutePoints.length < 2) { isRouteMode = true; return; }
        finishRouteBuilding();
    }
}

function toggleMeasureMode() {
    if (isRouteMode) toggleRouteMode();
    isMeasureMode = !isMeasureMode;
    currentRoutePoints = []; measureLayer.clearLayers(); routeLayer.clearLayers();
    document.getElementById('route-panel').classList.remove('active');
    const ml = document.getElementById('measure-line');
    if (isMeasureMode) {
        ml.classList.add('active');
        document.getElementById('measure-dist').innerText = '0';
        document.getElementById('measure-time').innerText = '0';
    } else { ml.classList.remove('active'); }
}

// ==================== КЛИКИ ПО КАРТЕ ====================
function handleMapClick(e) {
    if (isRouteMode) addRoutePoint(e.latlng);
    else if (isMeasureMode) addMeasurePoint(e.latlng);
}

function addRoutePoint(latlng) {
    currentRoutePoints.push(latlng);
    routeLayer.clearLayers();
    currentRoutePoints.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], { radius: 8, color: '#e74c3c', fillOpacity: 0.8 }).addTo(routeLayer);
    });
    if (currentRoutePoints.length > 1) {
        L.polyline(currentRoutePoints.map(p => [p.lat, p.lng]), { color: '#2ecc71', weight: 4 }).addTo(routeLayer);
        updateRouteInfo();
    }
}

function addMeasurePoint(latlng) {
    currentRoutePoints.push(latlng);
    measureLayer.clearLayers();
    currentRoutePoints.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 6, color: '#3498db', fillOpacity: 0.8 }).addTo(measureLayer));
    if (currentRoutePoints.length > 1) {
        L.polyline(currentRoutePoints.map(p => [p.lat, p.lng]), { color: '#3498db', weight: 3, dashArray: '10' }).addTo(measureLayer);
        updateMeasureInfo();
    }
}

// ==================== РАСЧЁТЫ ====================
function updateRouteInfo() {
    if (currentRoutePoints.length < 2) return;
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    document.getElementById('route-panel').classList.add('active');
    document.getElementById('route-dist').innerText = dist.toFixed(2) + ' км';
    const speed = currentMode === 'walk' ? 5 : 15;
    document.getElementById('route-time').innerText = Math.round((dist / speed) * 60) + ' мин';
    document.getElementById('route-cal').innerText = '~' + Math.round(dist * 50) + ' ккал';
}

function updateMeasureInfo() {
    if (currentRoutePoints.length < 2) return;
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    document.getElementById('measure-dist').innerText = dist.toFixed(2);
    document.getElementById('measure-time').innerText = Math.round((dist / (currentMode === 'walk' ? 5 : 15)) * 60);
}

// ==================== GPX ЭКСПОРТ ====================
function generateGPX(points, name) {
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpx += '<gpx version="1.1" creator="WalkerBot" xmlns="http://www.topografix.com/GPX/1/1">\n';
    gpx += `  <trk><name>${name}</name><trkseg>\n`;
    points.forEach(p => {
        gpx += `    <trkpt lat="${p.lat}" lon="${p.lng}"><ele>0</ele></trkpt>\n`;
    });
    gpx += '  </trkseg></trk>\n</gpx>';
    return gpx;
}

function downloadGPX() {
    if (currentRoutePoints.length < 2) {
        tg.showPopup({ title: 'Ошибка', message: 'Постройте маршрут сначала' });
        return;
    }
    const points = currentRoutePoints.map(p => ({ lat: p.lat, lng: p.lng }));
    const gpx = generateGPX(points, 'WalkerBot Route');
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'walkerbot_route.gpx';
    a.click();
    URL.revokeObjectURL(url);
    tg.showPopup({ title: '✅ Готово', message: 'GPX-файл скачан. Откройте в Maps.me или Google Earth' });
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadPoisFromApi() {
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/poi`);
        allPois = await res.json();
        renderPois('all');
    } catch (e) { allPois = []; }
}

async function loadGroups() {
    switchView('groups-view');
    const list = document.getElementById('groups-list');
    list.innerHTML = '<p class="loading">Загрузка...</p>';
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/groups`);
        const groups = await res.json();
        list.innerHTML = groups.length ? '' : '<p class="loading">Нет активных прогулок</p>';
        groups.forEach(g => {
            list.innerHTML += `<div class="card" onclick="joinGroup(${g.id})"><div class="card-icon"><i class="fas fa-users"></i></div><div class="card-info"><h4>${g.name}</h4><p>📍 ${g.place_name||''}</p></div></div>`;
        });
    } catch (e) { list.innerHTML = '<p class="loading">Ошибка</p>'; }
}

async function loadTracks() {
    switchView('tracks-view');
    const uid = tg.initDataUnsafe?.user?.id;
    if (!uid) return;
    const list = document.getElementById('tracks-list');
    list.innerHTML = '<p class="loading">Загрузка...</p>';
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/tracks/${uid}`);
        const tracks = await res.json();
        list.innerHTML = tracks.length ? '' : '<p class="loading">Нет треков</p>';
        tracks.forEach(t => {
            list.innerHTML += `<div class="card"><div class="card-icon"><i class="fas fa-route"></i></div><div class="card-info"><h4>${t.name||'Трек'}</h4><p>📍 ${t.distance_km} км | ⏱ ${t.duration_min} мин</p></div></div>`;
        });
    } catch (e) { list.innerHTML = '<p class="loading">Ошибка</p>'; }
}

async function loadLeaderboard() {
    switchView('leaderboard-view');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<p class="loading">Загрузка...</p>';
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/leaderboard`);
        const lb = await res.json();
        list.innerHTML = lb.map((u,i) => `<div class="card"><div class="card-icon">${i+1}</div><div class="card-info"><h4>${u.first_name||'Аноним'}</h4><p>📍 ${u.total_km||0} км | 🏆 ${u.points||0} баллов</p></div></div>`).join('');
    } catch (e) { list.innerHTML = '<p class="loading">Ошибка</p>'; }
}

async function loadProfile() {
    const uid = tg.initDataUnsafe?.user?.id;
    if (!uid) return;
    try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/profile?user_id=${uid}`);
        const user = await res.json();
        document.getElementById('user-name').innerText = user.first_name || 'Путешественник';
        document.getElementById('user-avatar').innerText = (user.first_name || 'U')[0].toUpperCase();
        document.getElementById('stat-dist').innerText = (user.total_km || 0).toFixed(0);
        document.getElementById('stat-tracks').innerText = user.total_walks || 0;
        document.getElementById('stat-rank').innerText = getRank(user.points || 0);

        const goals = user.goals || { steps: 15000, walks: 5, km: 15, period: 'week' };
        const p = goals.period === 'month' ? 'месяц' : 'неделю';
        document.getElementById('goal-steps').style.width = Math.min(((user.period_steps||0)/goals.steps)*100,100)+'%';
        document.getElementById('goal-steps-text').innerText = `${user.period_steps||0} / ${goals.steps} (${p})`;
        document.getElementById('goal-walks').style.width = Math.min(((user.period_walks||0)/goals.walks)*100,100)+'%';
        document.getElementById('goal-walks-text').innerText = `${user.period_walks||0} / ${goals.walks} (${p})`;
        document.getElementById('goal-km').style.width = Math.min(((user.period_km||0)/goals.km)*100,100)+'%';
        document.getElementById('goal-km-text').innerText = `${(user.period_km||0).toFixed(0)} / ${goals.km} (${p})`;

        const achList = document.getElementById('achievements-list');
        const achievements = [
            { icon: '🥇', label: 'Первый шаг', unlocked: (user.total_walks||0)>=1 },
            { icon: '🚶', label: '10 км', unlocked: (user.total_km||0)>=10 },
            { icon: '🌄', label: 'Закаты', unlocked: (user.points||0)>=50 },
            { icon: '🏆', label: '100 км', unlocked: (user.total_km||0)>=100 }
        ];
        achList.innerHTML = achievements.map(a => `<div class="achievement-item ${a.unlocked?'':'locked'}">${a.icon}<span class="achievement-label">${a.label}</span></div>`).join('');
    } catch (e) {}
}

// ==================== КАРТА ====================
function renderPois(filter) {
    markersLayer.clearLayers();
    allPois.forEach(poi => {
        if (filter === 'all' || poi.district === filter || (poi.tags||[]).includes(filter)) {
            const m = L.marker([poi.lat, poi.lon]);
            m.bindTooltip(poi.name);
            m.on('click', () => showDetails(poi));
            markersLayer.addLayer(m);
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
        const m = L.marker([poi.lat, poi.lon]); m.bindTooltip(poi.name); m.on('click', () => showDetails(poi)); markersLayer.addLayer(m);
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
    if (!isRouteMode) toggleRouteMode();
    addRoutePoint({ lat: map.getCenter().lat, lng: map.getCenter().lng });
    addRoutePoint({ lat, lng });
}

function sharePoi(name, lat, lng) { tg.sendData(JSON.stringify({ action: 'share_poi', data: { name, lat, lng } })); }

function finishRouteBuilding() {
    if (currentRoutePoints.length < 2) return;
    let dist = 0;
    for (let i = 0; i < currentRoutePoints.length - 1; i++) dist += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    
    // Показываем кнопку скачивания GPX
    const detailsContent = document.getElementById('details-content');
    detailsContent.innerHTML = `
        <h2>Маршрут построен</h2>
        <p>📍 ${dist.toFixed(2)} км | ⏱ ${Math.round((dist/(currentMode==='walk'?5:15))*60)} мин</p>
        <button class="primary-btn" onclick="downloadGPX()"><i class="fas fa-download"></i> Скачать GPX</button>
        <button class="primary-btn" style="margin-top:8px;background:#3498db" onclick="tg.sendData(JSON.stringify({action:'route_built',data:{points:currentRoutePoints.map(p=>({lat:p.lat,lng:p.lng})),length:dist.toFixed(2),mode:currentMode}}));tg.close()"><i class="fas fa-paper-plane"></i> Отправить в бот</button>
    `;
    document.getElementById('details-view').classList.add('open');
}

function editGoals() {
    tg.showPopup({ title: 'Настройка целей', message: 'Введи цели через запятую: шаги,прогулки,км,период\nПример: 15000,5,15,week\nПериод: week или month', buttons: [{ type: 'default', text: 'OK' }] });
}

function inviteFriend() {
    const link = `https://t.me/share/url?url=https://t.me/ТВОЙ_БОТ?start=invite_${tg.initDataUnsafe?.user?.id}`;
    tg.openLink(link);
}

// ==================== НАВИГАЦИЯ ====================
function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (id==='map-view') document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    if (id==='tracks-view') document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
    if (id==='groups-view') document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
    if (id==='leaderboard-view') document.querySelector('.nav-btn:nth-child(4)').classList.add('active');
    if (id==='profile-view') document.querySelector('.nav-btn:nth-child(5)').classList.add('active');
    if (id==='map-view') setTimeout(() => map?.invalidateSize(), 300);
}

function joinGroup(id) { tg.sendData(JSON.stringify({ action: 'join_group', id })); tg.showPopup({ title: 'Заявка отправлена!', message: 'Организатор рассмотрит.' }); }
function getRank(p) { if(p>=500)return'🏆 Легенда';if(p>=200)return'🥇 Мастер';if(p>=100)return'🥈 Опытный';if(p>=50)return'🥉 Любитель';return'🌱 Новичок'; }

initMap();
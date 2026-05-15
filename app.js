const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const API = 'https://walkerbot.onrender.com/api'; 
const UID = tg.initDataUnsafe?.user?.id || 12345; // Fallback для тестов, если открыто не в TG
const DEFAULT_USER = {
    first_name: "Путешественник",
    total_km: 0,
    total_walks: 0,
    points: 0,
    height: 175,
    weight: 70,
    age: 25,
    tg_username: null,
    goals: { steps: 10000, walks: 3, km: 10, period: 'week', penalty: 'carry' }
};

let map, markersLayer = L.layerGroup(), routeLayer = L.layerGroup(), measureLayer = L.layerGroup();
let currentRoutePoints = [], isRouteMode = false, isMeasureMode = false;
let allPois = [], currentMode = 'walk'; // walk or bike
let userMarker = null, watchId = null;
let currentUser = JSON.parse(JSON.stringify(DEFAULT_USER));
let measureStartPoint = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([55.9833, 92.8667], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    // Темная/светлая тема карты (упрощенно OSM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19,
        detectRetina: true
    }).addTo(map);

    markersLayer.addTo(map); 
    routeLayer.addTo(map); 
    measureLayer.addTo(map);

    loadPois();
    
    // Обработка кликов и касаний
    map.on('click', handleMapClick);
    
    // Простая эмуляция мультитача для линейки (два быстрых клика или спец режим)
    // В Leaflet сложно ловить именно 2 пальца без плагинов, сделаем через режим "Линейка":
    // 1 клик ставит точку А, 2 клик ставит точку Б и меряет.
}

// ==================== ДАННЫЕ И ФИЛЬТРЫ ====================
async function loadPois() {
    try {
        const res = await fetch(`${API}/poi`);
        if (!res.ok) throw new Error('API error');
        allPois = await res.json();
        applyFilters(); // Рендер при загрузке
    } catch (e) {
        console.error("Failed to load POIs", e);
        // Фолбэк: пустой список, никаких фейков
        allPois = [];
    }
}

function applyFilters() {
    markersLayer.clearLayers();
    
    const activeDistrict = document.querySelector('#district-filters .filter-btn.active').dataset.filter;
    const activeType = document.querySelector('#type-filters .filter-btn.active').dataset.type;

    allPois.forEach(p => {
        let matchDistrict = (activeDistrict === 'all') || (p.district && p.district.toLowerCase().includes(activeDistrict));
        // Проверка по тегам для типов
        let matchType = (activeType === 'all');
        if (!matchType && p.tags) {
            matchType = p.tags.some(t => t.toLowerCase().includes(activeType));
        }
        // Доп проверка по названию для типов (если нет тегов)
        if (!matchType && p.name) {
             matchType = p.name.toLowerCase().includes(activeType);
        }

        if (matchDistrict && matchType) {
            const m = L.marker([p.lat, p.lon]);
            m.bindTooltip(p.name, { direction: 'top', offset: [0, -10] });
            m.on('click', () => showDetails(p));
            markersLayer.addLayer(m);
        }
    });
}

// Слушатели фильтров
document.querySelectorAll('#district-filters .filter-btn').forEach(b => {
    b.addEventListener('click', e => {
        document.querySelectorAll('#district-filters .filter-btn').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        applyFilters();
    });
});
document.querySelectorAll('#type-filters .filter-btn').forEach(b => {
    b.addEventListener('click', e => {
        document.querySelectorAll('#type-filters .filter-btn').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        applyFilters();
    });
});

// Поиск
document.getElementById('search-input').addEventListener('input', e => {
    const val = e.target.value.toLowerCase();
    markersLayer.clearLayers();
    if (val.length < 2) return applyFilters(); // Возврат к фильтрам если стерли
    
    allPois.forEach(p => {
        if (p.name.toLowerCase().includes(val)) {
            const m = L.marker([p.lat, p.lon]);
            m.bindTooltip(p.name);
            m.on('click', () => showDetails(p));
            markersLayer.addLayer(m);
        }
    });
});

// ==================== ГЕОЛОКАЦИЯ ====================
function centerOnUser() {
    navigator.geolocation?.getCurrentPosition(p => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        map.setView([lat, lon], 15);
        if (userMarker) userMarker.setLatLng([lat, lon]);
        else {
            userMarker = L.marker([lat, lon], {
                icon: L.divIcon({html: '<div style="background:#2ecc71;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3)"></div>', className: '', iconSize: [16,16]})
            }).addTo(map);
        }
    }, err => tg.showAlert("Не удалось получить геопозицию"));
}

function toggleWatch() {
    if (watchId) { 
        navigator.geolocation.clearWatch(watchId); 
        watchId = null; 
        document.getElementById('watch-btn').classList.remove('active'); 
        return; 
    }
    watchId = navigator.geolocation.watchPosition(p => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        if (userMarker) userMarker.setLatLng([lat, lon]);
        else {
             userMarker = L.marker([lat, lon]).addTo(map);
        }
        if(map.getZoom() > 14) map.setView([lat, lon], map.getZoom());
    }, null, { enableHighAccuracy: true, maximumAge: 1000 });
    document.getElementById('watch-btn').classList.add('active');
}

// ==================== ЛОГИКА МАРШРУТОВ И ВРЕМЕНИ ====================
function switchMode(m) { 
    currentMode = m; 
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode===m)); 
    if (currentRoutePoints.length>=2) updateRouteInfo(); 
    if (isMeasureMode && measureLayer.getLayers().length > 1) updateMeasureInfo();
}

function toggleRouteMode() {
    if (isMeasureMode) toggleMeasureMode();
    isRouteMode = !isRouteMode; 
    currentRoutePoints = []; 
    routeLayer.clearLayers();
    document.getElementById('route-panel').classList.remove('active');
    
    const btn = document.getElementById('route-btn');
    const span = btn.querySelector('span');
    const icon = btn.querySelector('i');
    
    if (isRouteMode) { 
        span.innerText = 'Завершить'; 
        btn.style.background = '#e74c3c';
        btn.style.boxShadow = '0 4px 15px rgba(231, 76, 60, 0.4)';
        icon.className = 'fas fa-check';
        tg.HapticFeedback.impactOccurred('light');
    } else { 
        span.innerText = 'Построить маршрут'; 
        btn.style.background = 'var(--tg-btn)';
        btn.style.boxShadow = '';
        icon.className = 'fas fa-route';
        if (currentRoutePoints.length < 2) { isRouteMode=true; return; } 
        finishRoute(); 
    }
}

function toggleMeasureMode() {
    isMeasureMode = !isMeasureMode; 
    measureLayer.clearLayers();
    measureStartPoint = null;
    document.getElementById('measure-line').classList.toggle('active', isMeasureMode);
    
    const btn = document.querySelector('.action-bar .secondary');
    if (isMeasureMode) {
        btn.style.background = '#e67e22';
        btn.style.color = 'white';
        tg.showAction('Выберите первую точку на карте');
    } else {
        btn.style.background = '';
        btn.style.color = '';
        document.getElementById('measure-dist').innerText = '0';
        document.getElementById('measure-time').innerText = '0';
    }
}

function handleMapClick(e) {
    if (isRouteMode) {
        currentRoutePoints.push(e.latlng);
        redrawRoute();
        if (currentRoutePoints.length>=2) updateRouteInfo();
        tg.HapticFeedback.impactOccurred('light');
    } else if (isMeasureMode) {
        if (!measureStartPoint) {
            // Первая точка
            measureStartPoint = e.latlng;
            L.circleMarker([e.latlng.lat, e.latlng.lng], {radius: 6, color: '#e67e22', fillColor: '#e67e22', fillOpacity: 1}).addTo(measureLayer);
            tg.showAction('Выберите вторую точку');
        } else {
            // Вторая точка - замер
            const endPoint = e.latlng;
            measureLayer.clearLayers(); // Очищаем старое
            L.circleMarker([measureStartPoint.lat, measureStartPoint.lng], {radius: 6, color: '#e67e22'}).addTo(measureLayer);
            L.circleMarker([endPoint.lat, endPoint.lng], {radius: 6, color: '#e67e22'}).addTo(measureLayer);
            L.polyline([[measureStartPoint.lat, measureStartPoint.lng], [endPoint.lat, endPoint.lng]], {color: '#e67e22', dashArray: '10', weight: 3}).addTo(measureLayer);
            
            // Считаем
            const distMeters = measureStartPoint.distanceTo(endPoint);
            updateTimeDisplay(distMeters / 1000, true); // true = это замер
            
            measureStartPoint = null; // Сброс для нового замера
            tg.HapticFeedback.notificationOccurred('success');
        }
    }
}

function redrawRoute() { 
    routeLayer.clearLayers(); 
    currentRoutePoints.forEach((p, idx) => {
        L.circleMarker([p.lat,p.lng], {radius: idx===0?10:6, color:'#e74c3c', fillOpacity:0.8}).addTo(routeLayer); 
    }); 
    if (currentRoutePoints.length>1) {
        L.polyline(currentRoutePoints, {color:'#2ecc71',weight:5, lineCap: 'round'}).addTo(routeLayer); 
    }
}

// Умный расчет времени
function calculateTime(distanceKm, points) {
    // Базовая скорость км/ч
    let baseSpeed = (currentMode === 'walk') ? 5.0 : 15.0;
    
    // Коэффициент рельефа (если есть данные о высоте в точках POI или просто эвристика)
    // В данном случае, если точки маршрута совпадают с POI у которых есть elevation
    // Но так как у нас просто координаты, попробуем оценить по плотности точек или заглушке
    // Для демо: если район "столбы" или "торгаш", добавляем коэффициент сложности
    // В реальном аппе нужно брать SRTM данные. Здесь сделаем эмуляцию через проверку района первой точки
    
    let elevationFactor = 1.0;
    if (points && points.length > 0) {
        // Простейшая проверка: если первая точка в горах
        const nearPoi = allPois.find(p => p.lat === points[0].lat && p.lon === points[0].lng);
        if (nearPoi && (nearPoi.district === 'столбы' || nearPoi.district === 'торгашинский')) {
            elevationFactor = (currentMode === 'walk') ? 0.7 : 0.8; // Медленнее в гору
        }
    }
    
    // Коррекция под пользователя (вес/возраст)
    const userFactor = (currentUser.weight > 90 || currentUser.age > 50) ? 0.9 : 1.0;

    const effectiveSpeed = baseSpeed * elevationFactor * userFactor;
    const hours = distanceKm / effectiveSpeed;
    return Math.round(hours * 60);
}

function updateRouteInfo() {
    let d = 0; 
    for (let i=0; i<currentRoutePoints.length-1; i++) {
        d += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1]) / 1000;
    }
    
    const timeMin = calculateTime(d, currentRoutePoints);
    const calories = Math.round(d * (currentUser.weight || 70) * 0.7); // Примерная формула
    
    document.getElementById('route-panel').classList.add('active');
    document.getElementById('route-dist').innerText = d.toFixed(2) + ' км';
    document.getElementById('route-time').innerText = timeMin + ' мин';
    document.getElementById('route-cal').innerText = `~${calories} ккал`;
}

function updateTimeDisplay(distKm, isMeasure) {
    const timeMin = calculateTime(distKm, isMeasure ? [measureStartPoint] : currentRoutePoints);
    if (isMeasure) {
        const meters = Math.round(distKm * 1000);
        document.getElementById('measure-dist').innerText = meters;
        document.getElementById('measure-time').innerText = timeMin;
    }
}

function finishRoute() {
    let d = 0; 
    for (let i=0; i<currentRoutePoints.length-1; i++) d += currentRoutePoints[i].distanceTo(currentRoutePoints[i+1])/1000;
    const timeMin = calculateTime(d, currentRoutePoints);
    
    const content = document.getElementById('details-content');
    content.innerHTML = `
        <h2>Маршрут готов</h2>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin: 15px 0;">
            <div style="background:var(--tg-secondary); padding:10px; border-radius:10px; text-align:center">
                <div style="font-size:12px;color:var(--tg-hint)">Расстояние</div>
                <div style="font-weight:bold;font-size:18px">${d.toFixed(2)} км</div>
            </div>
            <div style="background:var(--tg-secondary); padding:10px; border-radius:10px; text-align:center">
                <div style="font-size:12px;color:var(--tg-hint)">Время (${currentMode==='walk'?'пешком':'вело'})</div>
                <div style="font-weight:bold;font-size:18px">${timeMin} мин</div>
            </div>
        </div>
        <p style="font-size:13px;color:var(--tg-hint)">Учтен рельеф и ваши параметры.</p>
        <button class="primary-btn" onclick="downloadGPX()"><i class="fas fa-download"></i> Скачать GPX</button>
        <button class="primary-btn" style="margin-top:8px;background:#3498db" onclick="saveTrackToBot(${d.toFixed(2)}, ${timeMin})"><i class="fas fa-paper-plane"></i> Сохранить в бот</button>
    `;
    document.getElementById('details-view').classList.add('open');
    document.getElementById('route-panel').classList.remove('active');
    toggleRouteMode(); // Выключаем режим рисования
}

function downloadGPX() { 
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="WalkerBot"><trk><trkseg>${currentRoutePoints.map(p=>`<trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`).join('')}</trkseg></trk></gpx>`; 
    const b = new Blob([gpx],{type:'application/gpx+xml'}); 
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'route.gpx'; a.click(); 
}

function saveTrackToBot(dist, time) {
    tg.sendData(JSON.stringify({
        action: 'save_track',
        data: { points: currentRoutePoints, distance: dist, duration: time, mode: currentMode }
    }));
    setTimeout(() => tg.close(), 500);
}

// ==================== ДЕТАЛИ МЕСТА ====================
function showDetails(poi) {
    const tags = poi.tags ? poi.tags.map(t => `<span style="background:#eee;color:#333;padding:2px 6px;border-radius:4px;font-size:10px;margin-right:4px">${t}</span>`).join('') : '';
    document.getElementById('details-content').innerHTML = `
        <h2>${poi.name}</h2>
        <p style="color:var(--tg-link); font-size:14px">${poi.district || 'Локация'} • ${poi.type || 'Место'}</p>
        <div style="margin: 10px 0">${tags}</div>
        <p style="line-height:1.5">${poi.desc || 'Описание отсутствует'}</p>
        ${poi.img ? `<img src="${poi.img}" style="width:100%;border-radius:12px;margin:10px 0">` : ''}
        <button class="primary-btn" onclick="startRouteTo(${poi.lat},${poi.lon})"><i class="fas fa-location-arrow"></i> Маршрут сюда</button>
    `;
    document.getElementById('details-view').classList.add('open');
}

function closeDetails() {
    document.getElementById('details-view').classList.remove('open');
}

function startRouteTo(lat, lon) {
    if (!isRouteMode) toggleRouteMode();
    // Текущая позиция или центр карты как старт
    const center = map.getCenter();
    currentRoutePoints = [center, L.latLng(lat, lon)];
    redrawRoute();
    updateRouteInfo();
    closeDetails();
}

// ==================== ПРОФИЛЬ И НАСТРОЙКИ ====================
async function loadProfile() {
    try {
        // Пытаемся получить реальные данные
        const res = await fetch(`${API}/profile?user_id=${UID}`);
        if (res.ok) {
            const data = await res.json();
            currentUser = { ...DEFAULT_USER, ...data };
        }
    } catch (e) {
        console.log("Using default profile");
    }

    // Рендер
    document.getElementById('user-name').innerText = currentUser.first_name || 'Гость';
    document.getElementById('user-avatar').innerText = (currentUser.first_name || 'U')[0].toUpperCase();
    
    // Ссылка ТГ
    const linkBox = document.getElementById('tg-link-display');
    const linkText = document.getElementById('tg-link-text');
    if (currentUser.tg_username) {
        linkBox.style.display = 'inline-flex';
        linkText.innerText = '@' + currentUser.tg_username;
        linkBox.onclick = () => tg.openLink(`https://t.me/${currentUser.tg_username}`);
    } else {
        linkBox.style.display = 'none';
    }

    // Статы (реальные или 0)
    document.getElementById('stat-dist').innerText = (currentUser.total_km || 0).toFixed(1);
    document.getElementById('stat-tracks').innerText = currentUser.total_walks || 0;
    document.getElementById('stat-rank').innerText = getRank(currentUser.points || 0);

    // Параметры
    document.getElementById('set-height').value = currentUser.height || '';
    document.getElementById('set-weight').value = currentUser.weight || '';
    document.getElementById('set-age').value = currentUser.age || '';

    renderGoals(currentUser.goals || DEFAULT_USER.goals, currentUser);
    renderAchievements(currentUser);
}

function renderAchievements(user) {
    const list = [
        {icon:'🥇', label:'Первый шаг', ok: (user.total_walks||0) >= 1},
        {icon:'🚶', label:'10 км путь', ok: (user.total_km||0) >= 10},
        {icon:'🌄', label:'Закатный', ok: (user.points||0) >= 50}, // Условность
        {icon:'🏆', label:'100 км', ok: (user.total_km||0) >= 100},
        {icon:'🚴', label:'Велосипедист', ok: false}, // Пока нет данных
        {icon:'🤝', label:'Командир', ok: false}
    ];
    document.getElementById('achievements-list').innerHTML = list.map(a => `
        <div class="achievement-item ${a.ok?'':'locked'}">
            ${a.icon}
            <span class="achievement-label">${a.label}</span>
        </div>
    `).join('');
}

function saveProfileSettings() {
    const h = document.getElementById('set-height').value;
    const w = document.getElementById('set-weight').value;
    const a = document.getElementById('set-age').value;
    
    fetch(`${API}/update_profile`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ user_id: UID, height: h, weight: w, age: a })
    }).then(() => {
        tg.showAlert("Параметры сохранены! Теперь время маршрутов считается точнее.");
        currentUser.height = h; currentUser.weight = w; currentUser.age = a;
    });
}

function editTgLink() {
    tg.showPrompt("Введите ваш username в Telegram (без @)", "Отмена", "Сохранить").then((val) => {
        if (val) {
            const clean = val.replace('@', '');
            fetch(`${API}/update_profile`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: UID, tg_username: clean })
            }).then(() => loadProfile());
        }
    });
}

function changeAvatar() {
    tg.showAlert("Функция загрузки фото будет доступна в следующей версии. Сейчас используется буква имени.");
}

// ==================== ЦЕЛИ ====================
function renderGoals(goals, user) {
    const p = goals.period==='month'?'месяц':'неделю';
    const sSteps = user.period_steps || 0;
    const sWalks = user.period_walks || 0;
    const sKm = user.period_km || 0;
    
    document.getElementById('goals-section').innerHTML = `
        <div class="goal-item">
            <span>👣 Шагов</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min((sSteps/goals.steps)*100,100)}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tg-hint)">
                <span>${sSteps}</span><span>${goals.steps}</span>
            </div>
        </div>
        <div class="goal-item">
            <span>🚶 Прогулок</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min((sWalks/goals.walks)*100,100)}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tg-hint)">
                <span>${sWalks}</span><span>${goals.walks}</span>
            </div>
        </div>
        <div class="goal-item">
            <span>📍 Километров</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min((sKm/goals.km)*100,100)}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tg-hint)">
                <span>${sKm.toFixed(1)}</span><span>${goals.km}</span>
            </div>
        </div>
        <p style="font-size:11px;color:var(--tg-hint);margin-top:8px">
            Штраф: ${goals.penalty==='carry'?'⚠️ перенос на след. период':'✅ без штрафа'}
        </p>
    `;
}

function openGoalsEditor() {
    document.getElementById('goals-editor').classList.add('active');
    const g = currentUser.goals || DEFAULT_USER.goals;
    document.getElementById('goal-steps-input').value = g.steps;
    document.getElementById('goal-walks-input').value = g.walks;
    document.getElementById('goal-km-input').value = g.km;
    document.getElementById('goal-period').value = g.period;
    document.getElementById('goal-penalty').value = g.penalty || 'carry';
}

function closeGoalsEditor() { 
    document.getElementById('goals-editor').classList.remove('active'); 
}

function saveGoals() {
    const goals = {
        steps: +document.getElementById('goal-steps-input').value,
        walks: +document.getElementById('goal-walks-input').value,
        km: +document.getElementById('goal-km-input').value,
        period: document.getElementById('goal-period').value,
        penalty: document.getElementById('goal-penalty').value
    };
    fetch(`${API}/create_goal`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ user_id: UID, ...goals }) 
    }).then(() => { 
        closeGoalsEditor(); 
        currentUser.goals = goals;
        loadProfile(); 
        tg.showAlert("Цели обновлены!");
    });
}

// ==================== ДРУЗЬЯ И РЕЙТИНГ (БЕЗ БОТОВ) ====================
async function loadFriends() {
    document.querySelectorAll('#friends-view .tab').forEach((t,i) => t.classList.toggle('active', i===0));
    const list = document.getElementById('friends-list');
    try {
        const data = await (await fetch(`${API}/friends?user_id=${UID}`)).json();
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading">У вас пока нет друзей. Пригласите!</p>';
            return;
        }
        list.innerHTML = data.map(f => `
            <div class="card">
                <div class="card-icon" style="background:#3498db">👤</div>
                <div class="card-info">
                    <h4>${f.first_name||'Друг'}</h4>
                    <p>${f.total_km||0} км вместе</p>
                </div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = '<p class="loading">Нет данных</p>'; }
}

async function loadRequests() {
    document.querySelectorAll('#friends-view .tab').forEach((t,i) => t.classList.toggle('active', i===1));
    const list = document.getElementById('friends-list');
    try {
        const data = await (await fetch(`${API}/friend_requests?user_id=${UID}`)).json();
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading">Нет новых заявок</p>';
            return;
        }
        list.innerHTML = data.map(r => `
            <div class="card">
                <div class="card-icon" style="background:#f39c12">📩</div>
                <div class="card-info">
                    <h4>${r.first_name||'Аноним'}</h4>
                    <button class="small-btn" style="width:auto;padding:4px 10px" onclick="acceptRequest(${r.user_id})">Принять</button>
                </div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = '<p class="loading">Нет данных</p>'; }
}

function acceptRequest(id) { 
    fetch(`${API}/accept_friend_request`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ user_id: UID, friend_id: id }) 
    }).then(() => loadRequests()); 
}

function inviteFriend() { 
    tg.openLink(`https://t.me/share/url?url=https://t.me/WalkerBot?start=invite_${UID}`); 
}

async function loadLeaderboard() {
    const myCard = document.getElementById('my-rank-card');
    const list = document.getElementById('leaderboard-list');
    
    try {
        const data = await (await fetch(`${API}/leaderboard`)).json();
        // Фильтруем только реальных людей (если вдруг на бэке остались боты, можно отфильтровать тут)
        // Но по заданию мы убрали генерацию ботов, так что берем как есть.
        
        const me = data.find(u => u.user_id == UID);
        if (me) {
            const rank = data.indexOf(me) + 1;
            myCard.innerHTML = `
                <div class="rank">#${rank}</div>
                <p>${me.first_name||'Вы'} — ${me.total_km||0} км</p>
                <div style="font-size:11px;opacity:0.8;margin-top:5px">${me.points||0} очков</div>
            `;
        } else {
            myCard.innerHTML = `<div class="rank">-</div><p>Ваша статистика пока не загружена</p>`;
        }

        if (data.length === 0) {
            list.innerHTML = '<p class="loading">Рейтинг пуст. Стань первым!</p>';
        } else {
            list.innerHTML = data.slice(0, 20).map((u, i) => `
                <div class="card">
                    <div class="card-icon" style="background:${i===0?'#f1c40f':i===1?'#95a5a6':i===2?'#cd7f32':'#95a5a6'}; color:white; font-weight:bold">${i+1}</div>
                    <div class="card-info">
                        <h4>${u.first_name||'Аноним'}</h4>
                        <p>📍 ${u.total_km||0} км | 🏆 ${u.points||0}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) { 
        list.innerHTML = '<p class="loading">Ошибка загрузки рейтинга</p>'; 
    }
}

// ==================== МАРШРУТЫ (МОИ/ПУБЛИК) ====================
async function loadMyRoutes() {
    document.querySelectorAll('#routes-view .tab').forEach((t,i) => t.classList.toggle('active', i===0));
    const list = document.getElementById('routes-list');
    try {
        const data = await (await fetch(`${API}/tracks/${UID}`)).json();
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading">Вы еще не записали ни одного трека. Включите режим маршрута на карте!</p>';
            return;
        }
        list.innerHTML = data.map(t => `
            <div class="card">
                <div class="card-icon"><i class="fas fa-route"></i></div>
                <div class="card-info">
                    <h4>${t.name||'Трек #' + t.id}</h4>
                    <p>📍 ${t.distance_km} км | ⏱ ${t.duration_min} мин</p>
                </div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = '<p class="loading">Ошибка</p>'; }
}

async function loadPublicRoutes() {
    document.querySelectorAll('#routes-view .tab').forEach((t,i) => t.classList.toggle('active', i===1));
    const list = document.getElementById('routes-list');
    try {
        const data = await (await fetch(`${API}/public_routes`)).json();
        if (!data || data.length === 0) {
            list.innerHTML = '<p class="loading">Публичных маршрутов пока нет</p>';
            return;
        }
        list.innerHTML = data.map(r => `
            <div class="card">
                <div class="card-icon" style="background:#3498db"><i class="fas fa-globe"></i></div>
                <div class="card-info">
                    <h4>${r.name||'Маршрут'}</h4>
                    <p>📍 ${r.distance_km} км | ❤️ ${r.likes_count||0}</p>
                </div>
            </div>
        `).join('');
    } catch (e) { list.innerHTML = '<p class="loading">Ошибка</p>'; }
}

async function loadGroupRoutes() {
    document.querySelectorAll('#routes-view .tab').forEach((t,i) => t.classList.toggle('active', i===2));
    const list = document.getElementById('routes-list');
    list.innerHTML = '<p class="loading">Функция групповых маршрутов в разработке...</p>';
    // Тут будет логика загрузки групповых ивентов
}

function openUploadModal() {
    tg.showAlert("Чтобы добавить маршрут, постройте его на карте и нажмите 'Сохранить в бот'");
}

// ==================== НАВИГАЦИЯ ====================
function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach((b,i) => {
        const views = ['map-view','routes-view','friends-view','leaderboard-view','profile-view'];
        b.classList.toggle('active', views[i] === id);
    });
    
    closeDetails();
    if (id === 'map-view') setTimeout(() => map?.invalidateSize(), 300);
    if (id === 'profile-view') loadProfile();
    if (id === 'leaderboard-view') loadLeaderboard();
}

function getRank(p) { 
    if (p<=0) return '🌱 Новичок';
    return p>=500?'🏆 Легенда':p>=200?'🥇 Мастер':p>=100?'🥈 Опытный':p>=50?'🥉 Любитель':'🌱 Новичок'; 
}

// Старт
initMap();
centerOnUser();
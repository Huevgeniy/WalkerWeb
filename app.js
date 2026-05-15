const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const API_URL = 'https://walkerbot.onrender.com/api'; // Замени на свой URL если нужно
const USER_ID = tg.initDataUnsafe?.user?.id || 12345; // Фолбэк для тестов

// Состояние
let map, markersLayer, routeLayer, measureLayer;
let currentRoute = [], isRouting = false, isMeasuring = false;
let watchId = null;
let poisData = [];

// ================= ИНИЦИАЛИЗАЦИЯ =================
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadPois();
    
    // Обработчик поиска
    document.getElementById('search-input').addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        markersLayer.clearLayers();
        poisData.filter(p => p.name.toLowerCase().includes(val)).forEach(p => addMarker(p));
    });
});

function switchTab(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Закрытие шторки при смене таба
    document.getElementById('details-sheet').classList.remove('open');

    // Подгрузка данных при переходе
    if(viewId === 'view-routes') loadRoutes();
    if(viewId === 'view-friends') loadFriends();
    if(viewId === 'view-leaderboard') loadLeaderboard();
    if(viewId === 'view-profile') loadProfile();
    
    if(viewId === 'view-map' && map) setTimeout(() => map.invalidateSize(), 300);
}

// ================= КАРТА =================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([56.0153, 92.8932], 13); // Красноярск дефолт
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    measureLayer = L.layerGroup().addTo(map);

    map.on('click', onMapClick);
}

async function loadPois() {
    try {
        // Эмуляция данных если API нет, чтобы ты видел работу
        // const res = await fetch(`${API_URL}/poi`);
        // poisData = await res.json();
        
        // ЗАГЛУШКА ДЛЯ ТЕСТА (Удали когда API заработает)
        poisData = [
            {name: "Коммунальный мост", lat: 56.005, lon: 92.86, district: "центр", desc: "Красивый вид"},
            {name: "Николаевская сопка", lat: 56.025, lon: 92.85, district: "центр", desc: "Высоко"},
            {name: "Торгашинский хребет", lat: 55.95, lon: 92.95, district: "торгашинский", desc: "Горы"}
        ];
        
        renderPois('all');
    } catch (e) {
        console.error("POI Load Error", e);
    }
}

function renderPois(filter) {
    markersLayer.clearLayers();
    poisData.filter(p => filter === 'all' || p.district === filter).forEach(addMarker);
}

function addMarker(p) {
    const m = L.marker([p.lat, p.lon]);
    m.bindTooltip(p.name);
    m.on('click', () => showPlaceDetails(p));
    markersLayer.addLayer(m);
}

function filterPois(cat) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    renderPois(cat);
}

// Режимы карты
function toggleRouteMode() {
    isRouting = !isRouting;
    isMeasuring = false;
    updateToolButtons();
    currentRoute = [];
    routeLayer.clearLayers();
    document.getElementById('route-info').classList.add('hidden');
    
    const btn = document.getElementById('btn-route-mode');
    btn.classList.toggle('active', isRouting);
    tg.HapticFeedback.impactOccurred('light');
}

function toggleMeasureMode() {
    isMeasuring = !isMeasuring;
    isRouting = false;
    updateToolButtons();
    currentRoute = [];
    measureLayer.clearLayers();
    
    const btn = document.getElementById('btn-measure-mode');
    btn.classList.toggle('active', isMeasuring);
    tg.HapticFeedback.impactOccurred('light');
}

function updateToolButtons() {
    // Сброс стилей handled in toggles
}

function onMapClick(e) {
    if (!isRouting && !isMeasuring) return;
    
    currentRoute.push(e.latlng);
    
    if (isRouting) {
        redrawRoute();
        calcRouteStats();
    } else {
        redrawMeasure();
        calcMeasureStats();
    }
    tg.HapticFeedback.impactOccurred('medium');
}

function redrawRoute() {
    routeLayer.clearLayers();
    const points = currentRoute.map(p => [p.lat, p.lng]);
    L.polyline(points, {color: '#2ecc71', weight: 5}).addTo(routeLayer);
    currentRoute.forEach(p => L.circleMarker([p.lat, p.lng], {radius: 6, color: '#fff', fillColor:'#2ecc71'}).addTo(routeLayer));
}

function redrawMeasure() {
    measureLayer.clearLayers();
    const points = currentRoute.map(p => [p.lat, p.lng]);
    L.polyline(points, {color: '#3498db', weight: 4, dashArray: '10'}).addTo(measureLayer);
}

function calcRouteStats() {
    const dist = getDistance(currentRoute);
    document.getElementById('route-info').classList.remove('hidden');
    document.getElementById('route-dist').innerText = dist.toFixed(2);
    document.getElementById('route-time').innerText = Math.round(dist / 5 * 60); // 5 км/ч
}

function calcMeasureStats() {
    const dist = getDistance(currentRoute);
    // Для измерения можно показать ту же плашку или alert
    tg.showAlert(`Расстояние: ${dist.toFixed(2)} км`);
}

function getDistance(points) {
    let d = 0;
    for(let i=0; i<points.length-1; i++) d += points[i].distanceTo(points[i+1]) / 1000;
    return d;
}

function finishRouteAction() {
    const dist = getDistance(currentRoute);
    tg.sendData(JSON.stringify({action: 'save_route', distance: dist, points: currentRoute}));
    tg.showPopup({title: 'Маршрут сохранен!', message: `${dist.toFixed(2)} км отправлено в бот.`});
    toggleRouteMode(); // выход из режима
}

// Геолокация
function centerOnUser() {
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(map).bindPopup("Вы здесь").openPopup();
    });
}

function toggleWatch() {
    const btn = document.getElementById('btn-watch');
    if(watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        btn.classList.remove('active');
    } else {
        watchId = navigator.geolocation.watchPosition(pos => {
            map.panTo([pos.coords.latitude, pos.coords.longitude]);
        }, null, {enableHighAccuracy: true});
        btn.classList.add('active');
    }
}

// ================= ШТОРКА =================
function showPlaceDetails(poi) {
    const content = `
        <h2 style="margin:0 0 5px 0">${poi.name}</h2>
        <p style="color:var(--hint); margin:0 0 15px 0">${poi.district || 'Локация'}</p>
        <p>${poi.desc || 'Описание отсутствует'}</p>
        <div style="display:flex; gap:10px; margin-top:20px">
            <button class="main-btn" onclick="startNav(${poi.lat}, ${poi.lon})">Маршрут</button>
        </div>
    `;
    document.getElementById('sheet-body').innerHTML = content;
    document.getElementById('details-sheet').classList.add('open');
    tg.HapticFeedback.selectionChanged();
}

function startNav(lat, lon) {
    document.getElementById('details-sheet').classList.remove('open');
    if(!isRouting) toggleRouteMode();
    // Логика старта маршрута к точке
    tg.showAlert("Маршрут строится к точке...");
}

// ================= ПРОФИЛЬ И ЦЕЛИ =================
async function loadProfile() {
    const container = document.getElementById('goals-display');
    container.innerHTML = '<div class="empty-state">Загрузка...</div>';
    
    try {
        // Попытка загрузки с API
        // const res = await fetch(`${API_URL}/profile?user_id=${USER_ID}`);
        // const data = await res.json();
        
        // ЗАГЛУШКА ДАННЫХ
        const data = {
            name: tg.initDataUnsafe?.user?.first_name || "Путешественник",
            km: 42.5,
            tracks: 12,
            points: 150,
            goals: {
                period: 'week',
                steps_target: 50000,
                steps_curr: 32000,
                km_target: 20,
                km_curr: 12.5,
                penalty: 'carry'
            }
        };

        // Рендер шапки
        document.getElementById('p-name').innerText = data.name;
        document.getElementById('p-avatar').innerText = data.name[0];
        document.getElementById('p-km').innerText = data.km;
        document.getElementById('p-tracks').innerText = data.tracks;
        document.getElementById('p-points').innerText = data.points;
        document.getElementById('p-rank').innerText = getRank(data.points);

        // Рендер целей
        renderGoalsUI(data.goals);
        
        // Рендер достижений
        renderAchievements(data);

    } catch (e) {
        container.innerHTML = '<div class="empty-state">Ошибка сети</div>';
    }
}

function renderGoalsUI(g) {
    if(!g) return;
    
    const stepsPct = Math.min((g.steps_curr / g.steps_target) * 100, 100);
    const kmPct = Math.min((g.km_curr / g.km_target) * 100, 100);
    const periodName = g.period === 'week' ? 'неделю' : 'месяц';
    const penaltyText = g.penalty === 'carry' ? '⚠️ Долг переносится' : '✅ Без штрафов';

    document.getElementById('goals-display').innerHTML = `
        <div class="goal-row">
            <div class="goal-label"><span>👣 Шаги</span> <small>${g.steps_curr} / ${g.steps_target}</small></div>
            <div class="progress-bg"><div class="progress-fill" style="width:${stepsPct}%"></div></div>
        </div>
        <div class="goal-row">
            <div class="goal-label"><span>📍 Километры</span> <small>${g.km_curr} / ${g.km_target}</small></div>
            <div class="progress-bg"><div class="progress-fill" style="width:${kmPct}%"></div></div>
        </div>
        <span class="penalty-tag">${penaltyText} (${periodName})</span>
    `;
}

function renderAchievements(user) {
    const list = document.getElementById('achievements-list');
    // Простая логика для примера
    const achs = [
        {icon: '🥇', name: 'Первый шаг', locked: user.tracks < 1},
        {icon: '🚀', name: '10 км', locked: user.km < 10},
        {icon: '🔥', name: 'Фанат', locked: user.points < 100},
        {icon: '🏔', name: 'Горец', locked: true} 
    ];
    
    list.innerHTML = achs.map(a => `
        <div style="text-align:center; width: 70px; display:inline-block; opacity:${a.locked?0.3:1}">
            <div style="font-size:24px">${a.icon}</div>
            <div style="font-size:10px; margin-top:4px">${a.name}</div>
        </div>
    `).join('');
}

function getRank(points) {
    if(points > 500) return "Легенда";
    if(points > 200) return "Мастер";
    if(points > 50) return "Любитель";
    return "Новичок";
}

// ================= МОДАЛКА ЦЕЛЕЙ =================
function openGoalsModal() {
    // Тут можно подгрузить текущие значения из API в инпуты
    document.getElementById('goals-modal').classList.add('active');
    tg.BackButton.show();
    tg.BackButton.onClick(closeGoalsModal);
}

function closeGoalsModal() {
    document.getElementById('goals-modal').classList.remove('active');
    tg.BackButton.hide();
    tg.BackButton.offClick(closeGoalsModal);
}

function saveGoalsSettings() {
    const newGoals = {
        period: document.getElementById('g-period').value,
        steps: document.getElementById('g-steps').value,
        km: document.getElementById('g-km').value,
        walks: document.getElementById('g-walks').value,
        penalty: document.getElementById('g-penalty').value
    };

    // Отправка на сервер
    /*
    fetch(`${API_URL}/update_goals`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user_id: USER_ID, ...newGoals})
    });
    */
   
    tg.showPopup({
        title: 'Готово!',
        message: `Цели обновлены. Штраф: ${newGoals.penalty === 'carry' ? 'перенос' : 'нет'}`,
        buttons: [{type: 'ok'}]
    });
    
    closeGoalsModal();
    loadProfile(); // Обновить вид
}

// ================= ДРУГИЕ ВКЛАДКИ (Заглушки) =================
function loadRoutes() {
    const c = document.getElementById('routes-container');
    c.innerHTML = `<div class="empty-state"><i class="fas fa-route" style="font-size:40px; margin-bottom:10px"></i><br>История маршрутов пуста</div>`;
    // Здесь будет fetch(API/tracks)
}

function loadFriends() {
    const c = document.getElementById('friends-list');
    c.innerHTML = `
        <div class="list-item">
            <div class="list-icon"><i class="fas fa-user"></i></div>
            <div class="list-info"><h4>Алексей</h4><p>125 км вместе</p></div>
        </div>
    `;
}

function loadLeaderboard() {
    const c = document.getElementById('leaderboard-list');
    c.innerHTML = `
        <div class="list-item">
            <div class="list-icon" style="background:#f1c40f">1</div>
            <div class="list-info"><h4>Иван Г.</h4><p>540 км</p></div>
        </div>
        <div class="list-item">
            <div class="list-icon" style="background:#95a5a6">2</div>
            <div class="list-info"><h4>Вы</h4><p>42 км</p></div>
        </div>
    `;
}

function inviteFriend() {
    tg.openTelegramLink(`https://t.me/share/url?url=Залетай в WalkerBot!`);
}
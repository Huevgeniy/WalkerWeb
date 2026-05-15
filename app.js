const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const API_URL = 'https://walkerbot.onrender.com/api'; // Замени на свой URL если другой
const USER_ID = tg.initDataUnsafe?.user?.id || 12345; // Фолбэк для тестов
const USER_NAME = tg.initDataUnsafe?.user?.first_name || 'Путешественник';
const USER_PHOTO = tg.initDataUnsafe?.user?.photo_url;

// Состояние приложения
let map, markersLayer, routeLayer, measureLayer;
let allPois = [];
let currentMode = 'walk'; // walk | bike
let isMeasureMode = false;
let isRouteBuilderMode = false;
let tempPoints = []; // Точки для линейки или построения маршрута
let userMarker = null;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadFilters();
    setupSearch();
    
    // Загрузка данных профиля при старте (если открыт профиль)
    // Но лучше ленивая загрузка при клике
});

// ==================== КАРТА И ТОЧКИ ====================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([56.0153, 92.8932], 13); // Красноярск по умолчанию
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    // Слой карты (можно поменять на спутник при желании)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    measureLayer = L.layerGroup().addTo(map);

    loadPois();
    centerOnUser();

    // Обработка кликов по карте
    map.on('click', (e) => handleMapClick(e));
}

async function loadPois() {
    try {
        // В реальном проекте раскомментируй fetch
        // const res = await fetch(`${API_URL}/poi`);
        // allPois = await res.json();
        
        // ЭМУЛЯЦИЯ ДАННЫХ (УДАЛИТЬ ПРИ РАБОТЕ С БЭКЕНДОМ)
        // Это просто заглушка, чтобы ты видел точки сразу
        allPois = [
            { id: 1, name: "Столбы", lat: 55.945, lon: 92.835, district: "столбы", type: "парк", tags: ["закат"] },
            { id: 2, name: "Торгашинский хребет", lat: 55.915, lon: 92.785, district: "торгашинский", type: "гора", tags: ["рассвет"] },
            { id: 3, name: "Николаевская сопка", lat: 56.025, lon: 92.855, district: "центр", type: "смотровая", tags: ["закат", "город"] },
            { id: 4, name: "Такмак", lat: 55.895, lon: 92.765, district: "гремячая", type: "скала", tags: [] },
            { id: 5, name: "Парк Гагарина", lat: 56.005, lon: 92.875, district: "центр", type: "парк", tags: [] }
        ];
        
        renderMarkers(allPois);
    } catch (e) {
        console.error("Ошибка загрузки точек:", e);
    }
}

function renderMarkers(pois) {
    markersLayer.clearLayers();
    pois.forEach(p => {
        const iconColor = getTypeColor(p.type);
        const marker = L.circleMarker([p.lat, p.lon], {
            radius: 6,
            fillColor: iconColor,
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        marker.bindTooltip(p.name, { direction: 'top' });
        marker.on('click', () => showDetails(p));
        markersLayer.addLayer(marker);
    });
}

function getTypeColor(type) {
    const colors = {
        'парк': '#2ecc71', 'гора': '#e74c3c', 'скала': '#9b59b6',
        'смотровая': '#f1c40f', 'вода': '#3498db', 'лес': '#27ae60'
    };
    return colors[type] || '#95a5a6';
}

// ==================== ФИЛЬТРЫ ====================
function loadFilters() {
    const districts = [...new Set(allPois.map(p => p.district))].filter(Boolean);
    const types = [...new Set(allPois.map(p => p.type))].filter(Boolean);
    const times = ['закат', 'рассвет'];

    const dContainer = document.getElementById('district-filters');
    const tContainer = document.getElementById('type-filters');
    const timeContainer = document.getElementById('time-filters');

    const createChip = (label, key, val) => {
        const chip = document.createElement('div');
        chip.className = 'f-chip';
        chip.innerText = label;
        chip.onclick = () => {
            chip.classList.toggle('active');
            applyFilters();
        };
        chip.dataset.key = key;
        chip.dataset.val = val;
        return chip;
    };

    districts.forEach(d => dContainer.appendChild(createChip(d, 'district', d)));
    types.forEach(t => tContainer.appendChild(createChip(t, 'type', t)));
    times.forEach(t => timeContainer.appendChild(createChip(t, 'tags', t)));
}

function toggleFilterMenu() {
    document.getElementById('filter-menu').classList.toggle('open');
}

function applyFilters() {
    const activeChips = document.querySelectorAll('.f-chip.active');
    if (activeChips.length === 0) {
        renderMarkers(allPois);
        return;
    }

    const filters = {};
    activeChips.forEach(c => {
        const k = c.dataset.key;
        if (!filters[k]) filters[k] = [];
        filters[k].push(c.dataset.val);
    });

    const filtered = allPois.filter(p => {
        let match = true;
        if (filters.district && !filters.district.includes(p.district)) match = false;
        if (filters.type && !filters.type.includes(p.type)) match = false;
        if (filters.tags) {
            const hasTag = filters.tags.some(t => p.tags && p.tags.includes(t));
            if (!hasTag) match = false;
        }
        return match;
    });

    renderMarkers(filtered);
    document.getElementById('filter-menu').classList.remove('open');
}

// ==================== ПОИСК ====================
function setupSearch() {
    const input = document.getElementById('search-input');
    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if (val.length < 2) {
            renderMarkers(allPois);
            return;
        }
        const found = allPois.filter(p => p.name.toLowerCase().includes(val));
        renderMarkers(found);
        if (found.length > 0) {
            map.setView([found[0].lat, found[0].lon], 14);
        }
    });
}

// ==================== ИНСТРУМЕНТЫ (ЛИНЕЙКА / МАРШРУТ) ====================
function setTransport(mode) {
    currentMode = mode;
    document.querySelectorAll('.t-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    recalcInfo(); // Пересчитать время если есть точки
}

function toggleMeasureMode() {
    resetTools();
    isMeasureMode = true;
    document.getElementById('measure-btn').classList.add('active');
    showHint("Касайтесь карты, чтобы рисовать тропу");
    document.getElementById('info-pill').style.display = 'flex';
}

function startRouteBuilder() {
    resetTools();
    isRouteBuilderMode = true;
    document.getElementById('route-btn-main').classList.add('active');
    showHint("1. Нажмите на СТАРТ (синяя точка)\n2. Нажмите на ФИНИШ (красная точка)");
    // В полной версии тут можно открыть выбор из списка друзей или точек
}

function resetTools() {
    isMeasureMode = false;
    isRouteBuilderMode = false;
    tempPoints = [];
    measureLayer.clearLayers();
    routeLayer.clearLayers();
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('info-pill').style.display = 'none';
    hideHint();
}

function handleMapClick(e) {
    if (!isMeasureMode && !isRouteBuilderMode) return;

    const ll = e.latlng;
    
    if (isMeasureMode) {
        // Рисуем тропу по точкам
        tempPoints.push(ll);
        drawPolyline(tempPoints, '#3498db', true);
        recalcInfo();
    } else if (isRouteBuilderMode) {
        // Логика построителя: первая точка старт, вторая финиш
        if (tempPoints.length === 0) {
            tempPoints.push(ll);
            L.marker(ll, { icon: createCustomIcon('blue') }).addTo(measureLayer);
            showHint("Теперь выберите точку назначения");
        } else if (tempPoints.length === 1) {
            tempPoints.push(ll);
            L.marker(ll, { icon: createCustomIcon('red') }).addTo(measureLayer);
            
            // Эмуляция построения маршрута (ломаная линия)
            // В идеале здесь запрос к OSRM или backend router
            setTimeout(() => {
                // Добавим пару промежуточных точек для реалистичности (просто смещение)
                const mid = L.latLng(
                    (tempPoints[0].lat + tempPoints[1].lat) / 2 + 0.005,
                    (tempPoints[0].lng + tempPoints[1].lng) / 2
                );
                const route = [tempPoints[0], mid, tempPoints[1]];
                drawPolyline(route, '#2ecc71', false);
                tempPoints = route; // заменяем на построенный путь
                recalcInfo();
                showHint("Маршрут построен! Можно добавить точку касанием.");
                isRouteBuilderMode = false; // завершаем режим выбора, но оставляем просмотр
                document.getElementById('route-btn-main').classList.remove('active');
            }, 500);
        } else {
            // Добавление промежуточной точки к готовому маршруту
            tempPoints.push(ll);
            // Сортировка точек была бы сложной, просто добавляем в конец для простоты
            drawPolyline(tempPoints, '#2ecc71', false);
            recalcInfo();
        }
    }
}

function drawPolyline(points, color, dashed) {
    measureLayer.clearLayers();
    // Очистим маркеры если они были (кроме случая билдера где мы их добавляли отдельно)
    // Для простоты перерисовываем линию
    
    const line = L.polyline(points.map(p => [p.lat, p.lng]), {
        color: color,
        weight: 4,
        dashArray: dashed ? '10, 10' : null,
        opacity: 0.8
    }).addTo(measureLayer);
    
    map.fitBounds(line.getBounds(), { padding: [50, 50] });
}

function createCustomIcon(color) {
    // Простая эмуляция кастомной иконки через divIcon
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px black;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

function recalcInfo() {
    if (tempPoints.length < 2) {
        updateInfoDisplay(0, 0);
        return;
    }

    let dist = 0;
    let elevationGain = 0; // Заглушка, пока нет данных о рельефе в точках

    for (let i = 0; i < tempPoints.length - 1; i++) {
        const d = tempPoints[i].distanceTo(tempPoints[i+1]);
        dist += d;
        // Тут можно добавить логику: если есть данные высот, считать угол
    }

    const distKm = dist / 1000;
    const speed = currentMode === 'walk' ? 5 : 15; // км/ч база
    
    // Коррекция на рельеф (упрощенно)
    // Если бы был уклон > 10%, скорость пешком падает до 3, велик до 10
    const terrainFactor = 1.0; 
    const timeHours = (distKm / (speed * terrainFactor));
    const timeMin = Math.round(timeHours * 60);

    updateInfoDisplay(distKm, timeMin);
}

function updateInfoDisplay(km, min) {
    document.getElementById('info-dist').innerText = (km < 1 ? Math.round(km*1000) + ' м' : km.toFixed(2) + ' км');
    document.getElementById('info-time').innerText = min + ' мин';
}

function showHint(text) {
    const h = document.getElementById('mode-hint');
    h.innerText = text;
    h.classList.add('show');
    setTimeout(() => h.classList.remove('show'), 4000);
}
function hideHint() {
    document.getElementById('mode-hint').classList.remove('show');
}

// ==================== ДЕТАЛИ МЕСТА ====================
function showDetails(poi) {
    const content = document.getElementById('details-content');
    content.innerHTML = `
        <h2>${poi.name}</h2>
        <div style="color:var(--hint); margin-bottom:15px">${poi.district} • ${poi.type}</div>
        <p>Отличное место для прогулки! ${poi.tags.includes('закат') ? 'Идеально для заката.' : ''}</p>
        <div style="display:flex; gap:10px; margin-top:20px">
            <button class="primary-btn" onclick="startRouteTo(${poi.lat},${poi.lon})"><i class="fas fa-location-arrow"></i> Сюда</button>
            <button class="secondary-btn" onclick="closeDetails()"><i class="fas fa-times"></i></button>
        </div>
    `;
    document.getElementById('details-sheet').classList.add('open');
}

function closeDetails() {
    document.getElementById('details-sheet').classList.remove('open');
}

function startRouteTo(lat, lon) {
    closeDetails();
    startRouteBuilder();
    // Автоматически ставим первую точку (текущую) и вторую (выбранную)
    // Для упрощения просто ждем клика пользователя или берем центр карты
    const center = map.getCenter();
    tempPoints = [center, L.latLng(lat, lon)];
    drawPolyline(tempPoints, '#2ecc71', false);
    recalcInfo();
    isRouteBuilderMode = false;
}

// ==================== НАВИГАЦИЯ И ВКЛАДКИ ====================
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const idx = ['map-view','routes-view','friends-view','leaderboard-view','profile-view'].indexOf(viewId);
    if(idx >= 0) document.querySelectorAll('.nav-btn')[idx].classList.add('active');

    if (viewId === 'map-view') setTimeout(() => map.invalidateSize(), 300);
    if (viewId === 'profile-view') loadProfile();
    if (viewId === 'routes-view') loadMyRoutes();
    if (viewId === 'leaderboard-view') loadLeaderboard();
    if (viewId === 'friends-view') loadFriends();
}

// ==================== ПРОФИЛЬ И ДАННЫЕ ====================
async function loadProfile() {
    try {
        // В реальности: const u = await fetch(`${API_URL}/profile?user_id=${USER_ID}`).then(r=>r.json());
        // Эмуляция ответа бэкенда (без фейковых цифр)
        const u = {
            first_name: USER_NAME,
            photo_url: USER_PHOTO,
            total_km: 0, // Пока 0, пока пользователь не запишет треки
            total_walks: 0,
            points: 0,
            age: null, height: null, weight: null,
            goals: { steps: 10000, walks: 3, km: 10, period: 'week', penalty: 'carry' },
            period_stats: { steps: 0, walks: 0, km: 0 }
        };

        document.getElementById('user-name').innerText = u.first_name;
        if (u.photo_url) {
            document.getElementById('user-avatar').innerHTML = `<img src="${u.photo_url}" alt="ava">`;
        } else {
            document.getElementById('user-avatar').innerText = u.first_name[0];
        }
        
        document.getElementById('tg-link').href = `https://t.me/${u.first_name}`; // Заглушка, нужен username

        document.getElementById('stat-dist').innerText = u.total_km;
        document.getElementById('stat-tracks').innerText = u.total_walks;
        document.getElementById('stat-rank').innerText = getRank(u.points);

        // Параметры
        document.getElementById('p-age').innerText = u.age || '-';
        document.getElementById('p-height').innerText = u.height ? u.height+' см' : '-';
        document.getElementById('p-weight').innerText = u.weight ? u.weight+' кг' : '-';

        // Цели
        renderGoals(u.goals, u.period_stats);
        
        // Достижения
        renderAchievements(u);

    } catch (e) {
        console.error("Profile load error", e);
    }
}

function editParams() {
    document.getElementById('params-display').style.display = 'none';
    document.getElementById('params-editor').style.display = 'block';
    // Заполнить текущими значениями если есть
    document.getElementById('edit-age').value = document.getElementById('p-age').innerText === '-' ? '' : document.getElementById('p-age').innerText;
    document.getElementById('edit-height').value = document.getElementById('p-height').innerText.replace(' см','');
    document.getElementById('edit-weight').value = document.getElementById('p-weight').innerText.replace(' кг','');
}

function cancelParams() {
    document.getElementById('params-display').style.display = 'block';
    document.getElementById('params-editor').style.display = 'none';
}

async function saveParams() {
    const data = {
        user_id: USER_ID,
        age: document.getElementById('edit-age').value,
        height: document.getElementById('edit-height').value,
        weight: document.getElementById('edit-weight').value
    };
    
    // Отправка на бэкенд
    // await fetch(`${API_URL}/update_profile`, { method:'POST', body: JSON.stringify(data) });
    
    alert("Параметры сохранены!");
    cancelParams();
    loadProfile(); // Обновить UI
}

async function uploadAvatar(input) {
    if (input.files && input.files[0]) {
        const formData = new FormData();
        formData.append('avatar', input.files[0]);
        formData.append('user_id', USER_ID);
        
        // await fetch(`${API_URL}/upload_avatar`, { method:'POST', body: formData });
        alert("Аватарка загружена (эмуляция)");
        loadProfile();
    }
}

function renderGoals(goals, stats) {
    const container = document.getElementById('goals-section');
    if (!goals) return;
    
    const items = [
        { l: 'Шаги', v: stats.steps, t: goals.steps, unit: '' },
        { l: 'Прогулки', v: stats.walks, t: goals.walks, unit: '' },
        { l: 'Км', v: stats.km, t: goals.km, unit: '' }
    ];
    
    container.innerHTML = items.map(i => {
        const pct = Math.min((i.v / i.t) * 100, 100);
        return `
            <div class="goal-item">
                <span>${i.l}: ${i.v} / ${i.t}</span>
                <div class="progress-bg"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

function openGoalsEditor() {
    // Заполнить инпуты текущими целями (нужно сохранить их в глобальной переменной или взять из профиля)
    document.getElementById('goals-modal').classList.add('active');
}

function saveGoals() {
    const goals = {
        steps: document.getElementById('g-steps').value,
        walks: document.getElementById('g-walks').value,
        km: document.getElementById('g-km').value,
        period: document.getElementById('goal-period').value,
        penalty: document.getElementById('g-penalty').value
    };
    // Save to API
    closeModal('goals-modal');
    loadProfile();
}

function renderAchievements(u) {
    const list = [
        { id: 'first', icon: '🥇', label: 'Старт', cond: u.total_walks >= 1 },
        { id: '10km', icon: '🚶', label: '10 км', cond: u.total_km >= 10 },
        { id: 'night', icon: '🌙', label: 'Сова', cond: false }, // Логика ночи
        { id: 'pro', icon: '🔥', label: 'Профи', cond: u.total_km >= 50 }
    ];
    
    document.getElementById('achievements-list').innerHTML = list.map(a => `
        <div class="ach-item ${a.cond ? 'unlocked' : ''}">
            ${a.icon}<span class="ach-label">${a.label}</span>
        </div>
    `).join('');
}

function getRank(p) {
    if (p >= 500) return '👑 Легенда';
    if (p >= 200) return '🦁 Мастер';
    if (p >= 50) return '🐯 Любитель';
    return '🐣 Новичок';
}

// ==================== ДРУЗЬЯ И РЕЙТИНГ (БЕЗ БОТОВ) ====================
async function loadFriends() {
    const container = document.getElementById('friends-content');
    // Реальный запрос: await fetch(`${API_URL}/friends?user_id=${USER_ID}`)
    // Если список пустой, показываем заглушку
    container.innerHTML = `<div class="loading-state">У вас пока нет друзей. Пригласите!</div>`;
}

function switchFriendsTab(tab) {
    document.querySelectorAll('#friends-view .tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    loadFriends(); // В реальной версии грузить заявки отдельно
}

function inviteFriend() {
    tg.openInlineButton(`https://t.me/share/url?url=Привет! Иди гулять со мной в WalkerBot`);
}

async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    // Реальный запрос: await fetch(`${API_URL}/leaderboard`)
    // Возвращаем пустой или только реальных людей
    list.innerHTML = `
        <div class="loading-state">
            <p>Рейтинг формируется по мере активности.</p>
            <p>Стань первым! 🚀</p>
        </div>
    `;
}

async function loadMyRoutes() {
    const list = document.getElementById('routes-list');
    list.innerHTML = `<div class="loading-state">Нет сохраненных маршрутов</div>`;
}

function loadPublicRoutesToggle() {
    alert("Функция публичных маршрутов в разработке");
}

// ==================== ИИ ЧАТ ====================
function openAIChat() {
    document.getElementById('ai-chat-modal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    if (!txt) return;
    
    const body = document.getElementById('chat-body');
    body.innerHTML += `<div class="msg user">${txt}</div>`;
    input.value = '';
    body.scrollTop = body.scrollHeight;
    
    // Имитация ответа
    setTimeout(() => {
        body.innerHTML += `<div class="msg bot">Я анализирую твой запрос: "${txt}". Скоро я научусь давать советы по маршрутам!</div>`;
        body.scrollTop = body.scrollHeight;
    }, 1000);
    
    // Реальный запрос: await fetch(`${API_URL}/chat`, { method:'POST', body: JSON.stringify({msg: txt, user_id: USER_ID}) })
}

// Геолокация
function centerOnUser() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 15);
        if (userMarker) userMarker.setLatLng([latitude, longitude]);
        else {
            userMarker = L.marker([latitude, longitude]).addTo(map);
            userMarker.bindPopup("Вы здесь").openPopup();
        }
    });
}
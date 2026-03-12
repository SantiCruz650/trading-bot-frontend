console.log('--- VERSION 3.8 - DASHBOARD FIXES ---');
/**
 * MCrypto v2 - Professional Trading Terminal
 * v2.5: Clean navigation, NaN protection, no render loops.
 */

// Format Date to short local time (e.g. HH:MM)
function formatTime(isoString) {
    if (!isoString) return "--:--";
    const timeStr = isoString.endsWith('Z') ? isoString : isoString + 'Z';
    const d = new Date(timeStr);
    const datePart = d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
}

const UPDATE_INTERVAL = 15000;

// 1. GLOBAL APP CONTROLLER
window.APP = {
    state: "BOOT",
    initialized: false,
    user: null,
    pollingTimeout: null,
    backoffDelay: 15000,
    maxBackoff: 60000,
    backendHealthy: true,
    mlHealthy: true,
    lastError: null
};

// 2. BOOTLOADER
document.addEventListener("DOMContentLoaded", startApp);

async function startApp() {
    if (APP.initialized) return;
    APP.initialized = true;

    // One-time localStorage reset to clear corrupted state from old versions
    if (!localStorage.getItem('terminal_v2_reset_final')) {
        console.warn("[System] First boot reset: clearing localStorage.");
        localStorage.clear();
        localStorage.setItem('terminal_v2_reset_final', 'true');
    }

    console.info("[App] Booting Terminal...");

    const token = localStorage.getItem("access_token");
    if (!token) {
        console.info("[App] No token. Showing login.");
        APP.state = "UNAUTHENTICATED";
        navigate("auth");
        return;
    }

    showLoadingScreen("Verificando sesión...");

    try {
        const user = await api.request("/auth/verify");
        if (user && user.authenticated !== false) {
            APP.user = user;
            // LINEAR FLOW: manual first, then dashboard. Never both.
            if (localStorage.getItem("manualAccepted") === "true") {
                console.info("[App] Session valid. Going to Dashboard.");
                startDashboard();
            } else {
                console.info("[App] Session valid. Manual required first.");
                APP.state = "ONBOARDING";
                navigate("manual");
                // Dashboard is NOT started here. Waits for btn click.
            }
        } else {
            console.warn("[App] Invalid session.");
            localStorage.removeItem("access_token");
            APP.state = "UNAUTHENTICATED";
            navigate("auth");
        }
    } catch (err) {
        console.error("[App] Auth error:", err.message);
        localStorage.removeItem("access_token");
        APP.state = "UNAUTHENTICATED";
        navigate("auth");
    }
}

// 3. DASHBOARD CONTROLLER
function startDashboard() {
    const previouslyInDashboard = (APP.state === "DASHBOARD");
    APP.state = "DASHBOARD";
    navigate("dashboard"); // Always navigate to ensure overlays (manual) are hidden

    if (!previouslyInDashboard) {
        console.info("[App] Initializing DASHBOARD mode.");
        refreshData();
        startPolling();
    }
}

// 4. POLLING CONTROL (Exponential Backoff)
function startPolling() {
    if (APP.pollingTimeout) return; // Guard: only one poller at a time
    console.info("[System] Starting Pollers...");
    APP.backoffDelay = UPDATE_INTERVAL;
    scheduleNextPoll(UPDATE_INTERVAL); // First poll after interval, not immediately
}

function stopPolling() {
    if (APP.pollingTimeout) {
        console.info("[System] Halting Pollers.");
        clearTimeout(APP.pollingTimeout);
        APP.pollingTimeout = null;
    }
}
window.stopPolling = stopPolling;

function scheduleNextPoll(delay) {
    if (APP.pollingTimeout) clearTimeout(APP.pollingTimeout);
    APP.pollingTimeout = setTimeout(async () => {
        APP.pollingTimeout = null; // Clear before running so guard works
        try {
            await refreshData();
            APP.backoffDelay = UPDATE_INTERVAL;
        } catch (err) {
            console.warn(`[System] Poll failed. Backoff. Error: ${err.message}`);
            APP.backoffDelay = Math.min(APP.backoffDelay * 2, APP.maxBackoff);
        }
        if (APP.state === "DASHBOARD") {
            scheduleNextPoll(APP.backoffDelay);
        }
    }, delay);
}

// 5. NAVIGATOR (Bulletproof visibility control)
function navigate(view) {
    console.info(`[Router] -> ${view}`);

    // Always use getElementById directly — never rely on els registry being non-null
    const VIEWS = [
        { id: 'loading-guard', show: view === 'loading', display: 'flex' },
        { id: 'auth-container', show: view === 'auth', display: 'flex' },
        { id: 'manual-container', show: view === 'manual', display: 'flex' },
        { id: 'dashboard-content', show: view === 'dashboard', display: 'grid' },
        { id: 'user-profile', show: view === 'dashboard', display: 'flex' },
    ];

    VIEWS.forEach(({ id, show, display }) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? display : 'none';
    });

    // Update username display when entering dashboard
    if (view === 'dashboard' && APP.user) {
        const ud = document.getElementById('user-display');
        if (ud) ud.textContent = APP.user.username;
    }
}
window.navigate = navigate;
window.ui = { navigate };

function showLoadingScreen(msg) {
    if (els.loadingGuard) {
        const p = els.loadingGuard.querySelector('p');
        if (p) p.textContent = msg;
        navigate('loading');
    }
}

// 6. ELEMENT REGISTRY
const els = {
    loadingGuard: document.querySelector('#loading-guard'),
    connStatus: document.querySelector('#connection-status'),
    sysState: document.querySelector('#system-state'),
    equity: document.querySelector('#equity-value'),
    dailyPnl: document.querySelector('#daily-pnl'),
    drawdown: document.querySelector('#current-drawdown'),
    balance: document.querySelector('#usdt-balance'),
    price: document.querySelector('#eth-price'),
    regime: document.querySelector('#market-regime'),
    confidence: document.querySelector('#ml-confidence'),
    shs: document.querySelector('#shs-score'),
    erBar: document.querySelector('#er-bar'),
    govMode: document.querySelector('#gov-mode'),
    tradesList: document.querySelector('#trades-list'),
    lastUpdateTs: document.querySelector('#last-update'),
    notifContainer: document.querySelector('#notification-container'),

    // Major View Containers
    authContainer: document.querySelector('#auth-container'),
    dashboardContent: document.querySelector('#dashboard-content'),
    manualContainer: document.querySelector('#manual-container'),
    userProfile: document.querySelector('#user-profile'),
    userDisplay: document.querySelector('#user-display'),

    // Forms
    loginForm: document.querySelector('#login-form'),
    registerForm: document.querySelector('#register-form'),
    tabLogin: document.querySelector('#tab-login'),
    tabRegister: document.querySelector('#tab-register'),

    // Buttons
    btnStart: document.querySelector('#btn-start'),
    btnStop: document.querySelector('#btn-stop'),
    btnKill: document.querySelector('#btn-kill'),
    btnUnlock: document.querySelector('#btn-unlock'),
    btnLogout: document.querySelector('#btn-logout'),
    btnAcceptManual: document.querySelector('#btn-accept-manual'),
    navManual: document.querySelector('#nav-manual'),
    btnResetManual: document.querySelector('#btn-reset-manual'),
    healthIcon: document.querySelector('#system-health-icon'),
    modeNormal: document.querySelector('#mode-normal'),
    modeConservative: document.querySelector('#mode-conservative')
};

// 7. DATA PIPELINE
async function refreshData() {
    if (APP.state !== "DASHBOARD") return;

    try {
        const results = await Promise.allSettled([
            api.request('/trading/balance'),
            api.request('/strategies')
        ]);

        if (results.some(r => r.value && r.value.authenticated === false)) return;

        const data = {
            balance: results[0].status === 'fulfilled' ? results[0].value : { balance: 0, prices: { ETH: 0 }, stats: {} },
            strategies: results[1].status === 'fulfilled' ? results[1].value : []
        };

        let executions = [];
        if (Array.isArray(data.strategies) && data.strategies.length > 0) {
            try {
                executions = await api.request(`/strategies/${data.strategies[0].id}/executions`);
            } catch (e) {
                console.warn("[Data] Strategy executions failed.");
            }
        } else {
            try {
                console.info("[Data] No strategies. Fetching paper trades...");
                const trades = await api.request('/trading/trades');
                // Map from backend PaperTrade model:
                // { id, ticker, type, amount, price, status, pnl, created_at }
                executions = (trades || []).map(t => ({
                    order_type: t.type || 'N/A',
                    ticker: t.ticker || '---',
                    amount: t.amount ?? 0,
                    price: t.price ?? 0,
                    pnl: t.pnl ?? null,
                    timestamp: t.created_at || null
                }));
            } catch (err) {
                console.warn("[Data] Trade fallback failed:", err.message);
            }
        }

        updateUI({
            balance: data.balance.balance || 0,
            price: data.balance.prices?.ETH || 0,
            equity: data.balance.equity || 0,
            drawdown: data.balance.stats?.daily_drawdown || 0,
            pnl: data.balance.stats?.pnl || 0,
            govMode: data.balance.stats?.gec_state || "NORMAL",
            riskProfile: data.balance.stats?.risk_profile || "NORMAL",
            er: data.balance.stats?.exposure || 0,
            executions: (executions || []).slice(0, 10)
        });

        markConnected(true);
        APP.backendHealthy = true;
        updateSystemHealthUI();
        refreshMLInsights();
    } catch (err) {
        console.error("[Data] Fault:", err.message);
        markConnected(false);
        APP.backendHealthy = false;
        APP.lastError = `Backend Fault: ${err.message}`;
        updateSystemHealthUI();
    }
}

async function refreshMLInsights() {
    try {
        const ml = await api.request('/ml/metrics/ETH');
        if (ml && ml.authenticated === false) return;
        els.regime.textContent = ml.regime || "N/A";
        els.confidence.textContent = ml.confidence != null ? ml.confidence : "---";
        // NaN protection: only compute if shs is a valid number
        const shsVal = (ml.shs != null && !isNaN(ml.shs)) ? `${Math.round(ml.shs)}/100` : "---";
        els.shs.textContent = shsVal;
        APP.mlHealthy = true;
        updateSystemHealthUI();
    } catch (error) {
        els.regime.textContent = "OFFLINE";
        els.confidence.textContent = "---";
        els.shs.textContent = "---";
        APP.mlHealthy = false;
        APP.lastError = `ML Service Fault: ${error.message}`;
        updateSystemHealthUI();
    }
}

function updateSystemHealthUI() {
    if (!els.healthIcon) return;
    const isHealthy = APP.backendHealthy && APP.mlHealthy;
    els.healthIcon.className = `status-icon ${isHealthy ? 'ok' : 'err'}`;
}

// 8. RENDERERS
function updateUI(data) {
    if (els.equity) els.equity.textContent = `${formatCurrency(data.equity)} USDT`;
    if (els.balance) els.balance.textContent = `${formatCurrency(data.balance)}`;
    if (els.drawdown) els.drawdown.textContent = `${(data.drawdown * 100).toFixed(2)}%`;
    if (els.dailyPnl) {
        els.dailyPnl.textContent = `${data.pnl >= 0 ? '+' : ''}${formatCurrency(data.pnl)}`;
        els.dailyPnl.className = `value ${data.pnl >= 0 ? 'positive' : 'negative'}`;
    }
    if (els.price) els.price.textContent = `$${data.price.toLocaleString()}`;
    if (els.govMode) els.govMode.textContent = data.govMode;
    if (els.erBar) {
        els.erBar.style.width = `${Math.min(100, data.er * 100)}%`;
        els.erBar.style.background = data.er > 0.8 ? 'var(--danger)' : data.er > 0.6 ? 'var(--warning)' : 'var(--accent)';
    }

    if (els.modeNormal && els.modeConservative) {
        if (data.riskProfile === "CONSERVATIVE") {
            els.modeConservative.classList.add('active');
            els.modeNormal.classList.remove('active');
        } else {
            els.modeNormal.classList.add('active');
            els.modeConservative.classList.remove('active');
        }
    }
    renderTrades(data.executions);
}

function renderTrades(executions) {
    const container = document.getElementById('trades-list');
    if (!container) return;

    if (!executions || executions.length === 0) {
        container.innerHTML = '<div class="log-item placeholder-text">No hay operaciones recientes</div>';
        return;
    }

    container.innerHTML = executions.map(ex => {
        const side = (ex.order_type || 'N/A').toUpperCase();
        const ticker = ex.ticker || 'ETH/USDT';
        const amount = ex.amount != null ? `${Number(ex.amount).toFixed(4)}` : '---';
        const price = ex.price != null ? `$${Number(ex.price).toLocaleString()}` : '---';
        const pnlStr = ex.pnl != null ? `${ex.pnl >= 0 ? '+' : ''}${Number(ex.pnl).toFixed(2)} USDT` : '';
        const timeStr = ex.timestamp ? formatTime(ex.timestamp) : '---';
        const sideClass = side === 'BUY' ? 'side-buy' : side === 'SELL' ? 'side-sell' : '';

        return `
        <div class="trade-row">
            <span class="${sideClass}">${side}</span>
            <span class="ticker">${ticker}</span>
            <span class="amount">${amount}</span>
            <span class="price">${price}</span>
            ${pnlStr ? `<span class="pnl ${ex.pnl >= 0 ? 'positive' : 'negative'}">${pnlStr}</span>` : ''}
            <span class="time">${timeStr}</span>
        </div>`;
    }).join('');
}

function markConnected(status) {
    if (!els.connStatus) return;
    els.connStatus.className = `status-item ${status ? 'active' : ''}`;
    const txt = els.connStatus.querySelector('.status-text');
    if (txt) txt.textContent = status ? "Online" : "Offline";
}

function formatCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '0.00';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function showNotification(msg, type = "info") {
    if (!els.notifContainer) return;
    const div = document.createElement('div');
    div.className = `notif ${type}`;
    div.textContent = msg;
    els.notifContainer.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); }, 5000);
}

// 9. EVENTS

els.loginForm && els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.querySelector('#login-username').value;
    const pass = document.querySelector('#login-password').value;
    try {
        await auth.login(user, pass);
        showNotification("Sesión iniciada correctamente", "success");
        APP.initialized = false;
        startApp();
    } catch (err) {
        // Clearer error for users (especially mobile)
        const msg = err.message.includes('401') ? "Usuario o contraseña incorrectos" : err.message;
        showNotification(msg, "error");
    }
});

els.registerForm && els.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.info("[UI] Registration form submitted.");
    const user = document.querySelector('#register-username').value;
    const pass = document.querySelector('#register-password').value;

    if (pass.length < 8) {
        showNotification("La contraseña debe tener al menos 8 caracteres", "error");
        return;
    }

    try {
        await auth.register(user, pass);
        showNotification("¡Cuenta creada! Ahora puedes iniciar sesión", "success");
        switchAuthTab('login');
    } catch (err) {
        showNotification(err.message, "error");
    }
});

els.btnLogout && els.btnLogout.addEventListener('click', () => {
    localStorage.removeItem('access_token');
    stopPolling();
    APP.state = "UNAUTHENTICATED";
    APP.user = null;
    APP.initialized = false;
    navigate('auth');
});

// Manual accept: ONLY this button transitions manual -> dashboard
els.btnAcceptManual && els.btnAcceptManual.addEventListener('click', async () => {
    localStorage.setItem("manualVisto", "true");
    localStorage.setItem("manualAccepted", "true");

    const token = localStorage.getItem("access_token");
    if (!token) {
        APP.state = "UNAUTHENTICATED";
        navigate("auth");
    } else if (APP.user) {
        startDashboard(); // The one and only path to dashboard from manual
    } else {
        APP.state = "UNAUTHENTICATED";
        navigate("auth");
    }

    api.request("/auth/accept-manual", { method: "POST" }).catch(() => { });
});

els.tabLogin && els.tabLogin.addEventListener('click', () => switchAuthTab('login'));
els.tabRegister && els.tabRegister.addEventListener('click', () => switchAuthTab('register'));

function switchAuthTab(tab) {
    if (tab === 'login') {
        els.tabLogin.classList.add('active'); els.tabRegister.classList.remove('active');
        els.loginForm.style.display = 'block'; els.registerForm.style.display = 'none';
    } else {
        els.tabRegister.classList.add('active'); els.tabLogin.classList.remove('active');
        els.registerForm.style.display = 'block'; els.loginForm.style.display = 'none';
    }
}

// Bot control actions
async function sendAction(endpoint, method = "POST", body = null) {
    try {
        const data = await api.request(endpoint, { method, body: body ? JSON.stringify(body) : null });
        if (data && data.authenticated === false) return;
        showNotification(data.message || "Éxito", "success");
        setTimeout(refreshData, 1000);
    } catch (err) {
        showNotification(err.message, "error");
    }
}

els.btnStart && els.btnStart.addEventListener('click', () => sendAction("/trading/start"));
els.btnStop && els.btnStop.addEventListener('click', () => sendAction("/trading/stop"));
els.btnKill && els.btnKill.addEventListener('click', () => sendAction("/trading/kill"));
els.btnUnlock && els.btnUnlock.addEventListener('click', () => sendAction("/trading/unlock"));

async function setRiskProfile(profile) {
    try {
        const data = await api.request("/trading/risk-profile", {
            method: "POST",
            body: JSON.stringify({ profile })
        });
        if (data && data.authenticated === false) return;
        showNotification(data.message || "Perfil actualizado", "success");
        refreshData();
    } catch (err) {
        showNotification(err.message, "error");
    }
}

els.modeNormal && els.modeNormal.addEventListener('click', () => setRiskProfile("NORMAL"));
els.modeConservative && els.modeConservative.addEventListener('click', () => setRiskProfile("CONSERVATIVE"));

// Nav Manual: just shows the manual overlay, doesn't restart the app
els.navManual && els.navManual.addEventListener('click', () => navigate('manual'));

// "Ver Manual" button: same — show manual overlay
els.btnResetManual && els.btnResetManual.addEventListener('click', () => navigate('manual'));

els.healthIcon && els.healthIcon.addEventListener('click', () => {
    if (APP.lastError) {
        alert(`Último error del sistema:\n\n${APP.lastError}`);
    } else {
        showNotification("Sistema operando normalmente", "success");
    }
});

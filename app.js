/**
 * MCrypto v2 - Professional Trading Terminal
 */

// 1. UTILITIES
function formatTime(isoString) {
    if (!isoString) return "--:--";
    const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    return `${d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '0.00';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function showNotification(msg, type = "info") {
    const container = document.querySelector('#notification-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `notif ${type}`;
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    setTimeout(() => {
        div.classList.remove('show');
        setTimeout(() => div.remove(), 300);
    }, 5000);
}

// 2. STATE
window.APP = {
    state: "BOOT",
    initialized: false,
    user: null,
    pollingTimeout: null,
};

// 3. ELEMENT REGISTRY
const els = {
    equity: document.querySelector('#equity-value'),
    dailyPnl: document.querySelector('#daily-pnl'),
    drawdown: document.querySelector('#current-drawdown'),
    balance: document.querySelector('#usdt-balance'),
    price: document.querySelector('#eth-price'),
    regime: document.querySelector('#market-regime'),
    confidence: document.querySelector('#ml-confidence'),
    shs: document.querySelector('#shs-score'),
    erBar: document.querySelector('#er-bar'),
    erPercentage: document.querySelector('#er-percentage'),
    govMode: document.querySelector('#gov-mode'),
    tradesList: document.querySelector('#trades-list'),
    
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
    btnResetManual: document.querySelector('#btn-reset-manual'),
    modeNormal: document.querySelector('#mode-normal'),
    modeConservative: document.querySelector('#mode-conservative'),
    
    // Indicators
    connStatus: document.querySelector('#connection-status'),
    sysState: document.querySelector('#system-state')
};

// 4. BOOTLOADER
document.addEventListener("DOMContentLoaded", startApp);

async function startApp() {
    if (APP.initialized) return;
    APP.initialized = true;

    const token = localStorage.getItem("access_token");
    if (!token) { navigate("auth"); return; }

    try {
        const user = await api.request("/auth/verify");
        if (user && user.authenticated !== false) {
            APP.user = user;
            if (localStorage.getItem("manualAccepted") === "true") {
                startDashboard();
            } else {
                navigate("manual");
            }
        } else {
            navigate("auth");
        }
    } catch (err) {
        navigate("auth");
    }
}

function startDashboard() {
    APP.state = "DASHBOARD";
    navigate("dashboard");
    refreshData();
    startPolling();
}

// 5. DATA PIPELINE
function startPolling() {
    if (APP.pollingTimeout) return;
    scheduleNextPoll(15000);
}

function scheduleNextPoll(delay) {
    if (APP.pollingTimeout) clearTimeout(APP.pollingTimeout);
    APP.pollingTimeout = setTimeout(async () => {
        try { await refreshData(); } catch (err) { }
        if (APP.state === "DASHBOARD") scheduleNextPoll(15000);
    }, delay);
}

async function refreshData() {
    if (APP.state !== "DASHBOARD") return;
    try {
        const [bal, strats] = await Promise.all([
            api.request('/trading/balance'),
            api.request('/strategies')
        ]);
        
        let executions = [];
        if (strats && strats.length > 0) {
            executions = await api.request(`/strategies/${strats[0].id}/executions`);
        } else {
            const trades = await api.request('/trading/trades');
            executions = (trades || []).map(t => ({ 
                order_type: t.type, ticker: t.ticker, amount: t.amount, price: t.price, pnl: t.pnl, timestamp: t.created_at 
            }));
        }

        updateUI({
            balance: bal.balance || 0,
            price: bal.prices?.ETH || 0,
            equity: bal.equity || 0,
            drawdown: bal.stats?.daily_drawdown || 0,
            pnl: bal.stats?.pnl || 0,
            govMode: bal.stats?.gec_state || "NORMAL",
            riskProfile: bal.stats?.risk_profile || "NORMAL",
            er: bal.stats?.exposure || 0,
            executions: (executions || []).slice(0, 10)
        });
        
        markConnected(true);
        refreshMLInsights();
    } catch (err) {
        markConnected(false);
    }
}

async function refreshMLInsights() {
    try {
        const ml = await api.request('/ml/metrics/ETH');
        if (els.regime) els.regime.textContent = ml.regime || "N/A";
        if (els.confidence) els.confidence.textContent = ml.confidence != null ? ml.confidence : "---";
        if (els.shs) els.shs.textContent = ml.shs != null ? `${Math.round(ml.shs)}/100` : "---";
    } catch (e) { }
}

function updateUI(data) {
    if (els.equity) els.equity.textContent = `${formatCurrency(data.equity)} USDT`;
    if (els.balance) els.balance.textContent = `${formatCurrency(data.balance)} USDT`;
    if (els.drawdown) {
        els.drawdown.textContent = `${(data.drawdown * 100).toFixed(2)}%`;
        els.drawdown.className = `value ${data.drawdown > 0 ? 'negative' : ''}`;
    }
    if (els.dailyPnl) {
        els.dailyPnl.textContent = `${data.pnl >= 0 ? '+' : ''}${formatCurrency(data.pnl)}`;
        els.dailyPnl.className = `value ${data.pnl >= 0 ? 'positive' : 'negative'}`;
    }
    if (els.price) els.price.textContent = `$${data.price.toLocaleString()}`;
    if (els.govMode) {
        els.govMode.textContent = data.govMode;
        if (els.sysState) {
             const sysTxt = els.sysState.querySelector('.status-text');
             if (sysTxt) sysTxt.textContent = data.govMode;
             els.sysState.classList.add('active');
        }
    }
    if (els.erBar) {
        const erVal = Math.min(100, data.er * 100);
        els.erBar.style.width = `${erVal}%`;
        if (els.erPercentage) els.erPercentage.textContent = `${erVal.toFixed(1)}%`;
        els.erBar.style.background = data.er > 0.8 ? 'var(--danger)' : data.er > 0.6 ? 'var(--warning)' : 'var(--accent)';
    }
    if (els.modeNormal && els.modeConservative) {
        els.modeConservative.classList.toggle('active', data.riskProfile === "CONSERVATIVE");
        els.modeNormal.classList.toggle('active', data.riskProfile !== "CONSERVATIVE");
    }
    renderTrades(data.executions);
}

function renderTrades(executions) {
    if (!els.tradesList) return;
    if (!executions || executions.length === 0) {
        els.tradesList.innerHTML = '<div class="placeholder-text">No hay operaciones recientes</div>';
        return;
    }
    els.tradesList.innerHTML = executions.map(ex => `
        <div class="trade-row">
            <span class="${ex.order_type === 'BUY' ? 'side-buy' : 'side-sell'}">${ex.order_type}</span>
            <span style="font-weight:700">${ex.ticker || 'ETH/USDT'}</span>
            <span>${Number(ex.amount).toFixed(4)}</span>
            <span>$${Number(ex.price).toLocaleString()}</span>
            <span style="color: var(--text-secondary); font-size: 0.8rem;">${formatTime(ex.timestamp)}</span>
        </div>`).join('');
}

function markConnected(status) {
    if (els.connStatus) {
        els.connStatus.classList.toggle('active', status);
        const txt = els.connStatus.querySelector('.status-text');
        if (txt) txt.textContent = status ? "Online" : "Offline";
    }
}

function navigate(view) {
    const VIEWS = [
        { id: 'loading-guard', show: view === 'loading', display: 'flex' },
        { id: 'auth-container', show: view === 'auth', display: 'flex' },
        { id: 'manual-container', show: view === 'manual', display: 'flex' },
        { id: 'dashboard-content', show: view === 'dashboard', display: 'flex' },
        { id: 'user-profile', show: view === 'dashboard', display: 'flex' },
    ];
    VIEWS.forEach(({ id, show, display }) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? display : 'none';
    });
    if (view === 'dashboard' && APP.user) {
        const ud = document.getElementById('user-display');
        if (ud) ud.textContent = APP.user.username;
    }
}

// 6. EVENT HANDLERS
els.loginForm && els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.querySelector('#login-username').value;
    const pass = document.querySelector('#login-password').value;
    try {
        await auth.login(user, pass);
        showNotification("Sesión iniciada con éxito", "success");
        APP.initialized = false;
        startApp();
    } catch (err) {
        showNotification(err.message, "error");
    }
});

els.registerForm && els.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.querySelector('#register-username').value;
    const pass = document.querySelector('#register-password').value;
    try {
        await auth.register(user, pass);
        showNotification("Cuenta creada. Inicia sesión para continuar.", "success");
        switchAuthTab('login');
    } catch (err) {
        showNotification(err.message, "error");
    }
});

function switchAuthTab(tab) {
    if (tab === 'login') {
        els.tabLogin.classList.add('active'); els.tabRegister.classList.remove('active');
        els.loginForm.style.display = 'block'; els.registerForm.style.display = 'none';
    } else {
        els.tabRegister.classList.add('active'); els.tabLogin.classList.remove('active');
        els.registerForm.style.display = 'block'; els.loginForm.style.display = 'none';
    }
}
els.tabLogin && els.tabLogin.addEventListener('click', () => switchAuthTab('login'));
els.tabRegister && els.tabRegister.addEventListener('click', () => switchAuthTab('register'));

els.btnLogout && els.btnLogout.addEventListener('click', () => {
    localStorage.removeItem('access_token');
    APP.state = "UNAUTHENTICATED";
    navigate('auth');
});

els.btnAcceptManual && els.btnAcceptManual.addEventListener('click', () => {
    localStorage.setItem("manualAccepted", "true");
    startDashboard();
    api.request("/auth/accept-manual", { method: "POST" }).catch(() => { });
});

async function sendAction(endpoint, label) {
    try {
        const data = await api.request(endpoint, { method: "POST" });
        showNotification(data.message || `${label} ejecutado`, "success");
        refreshData();
    } catch (err) {
        showNotification(err.message, "error");
    }
}

els.btnStart && els.btnStart.addEventListener('click', () => sendAction("/trading/start", "Start Bot"));
els.btnStop && els.btnStop.addEventListener('click', () => sendAction("/trading/stop", "Stop Bot"));
els.btnKill && els.btnKill.addEventListener('click', () => sendAction("/trading/kill", "Emergency Kill"));
els.btnUnlock && els.btnUnlock.addEventListener('click', () => sendAction("/trading/unlock", "Unlock"));
els.btnResetManual && els.btnResetManual.addEventListener('click', () => navigate('manual'));

els.modeNormal && els.modeNormal.addEventListener('click', () => setRiskProfile("NORMAL"));
els.modeConservative && els.modeConservative.addEventListener('click', () => setRiskProfile("CONSERVATIVE"));

async function setRiskProfile(profile) {
    try {
        await api.request("/trading/risk-profile", { method: "POST", body: JSON.stringify({ profile }) });
        showNotification(`Perfil cambiado a ${profile}`, "success");
        refreshData();
    } catch (err) {
        showNotification(err.message, "error");
    }
}

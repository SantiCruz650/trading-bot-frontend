/**
 * MCrypto v2 - Professional Trading Terminal
 */

// Format Date to short local time
function formatTime(isoString) {
    if (!isoString) return "--:--";
    const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    return `${d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const UPDATE_INTERVAL = 15000;

window.APP = {
    state: "BOOT",
    initialized: false,
    user: null,
    pollingTimeout: null,
    backendHealthy: true,
    mlHealthy: true,
    lastError: null
};

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

function startPolling() {
    if (APP.pollingTimeout) return;
    scheduleNextPoll(UPDATE_INTERVAL);
}

function stopPolling() {
    if (APP.pollingTimeout) { clearTimeout(APP.pollingTimeout); APP.pollingTimeout = null; }
}

function scheduleNextPoll(delay) {
    APP.pollingTimeout = setTimeout(async () => {
        try { await refreshData(); } catch (err) { }
        if (APP.state === "DASHBOARD") scheduleNextPoll(UPDATE_INTERVAL);
    }, delay);
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
    btnStart: document.querySelector('#btn-start'),
    btnStop: document.querySelector('#btn-stop'),
    btnKill: document.querySelector('#btn-kill'),
    btnUnlock: document.querySelector('#btn-unlock'),
    btnAcceptManual: document.querySelector('#btn-accept-manual'),
    btnResetManual: document.querySelector('#btn-reset-manual'),
    modeNormal: document.querySelector('#mode-normal'),
    modeConservative: document.querySelector('#mode-conservative'),
    connStatus: document.querySelector('#connection-status .dot')
};

async function refreshData() {
    if (APP.state !== "DASHBOARD") return;
    try {
        const [bal, strats] = await Promise.all([api.request('/trading/balance'), api.request('/strategies')]);
        let executions = [];
        if (strats && strats.length > 0) {
            executions = await api.request(`/strategies/${strats[0].id}/executions`);
        } else {
            const trades = await api.request('/trading/trades');
            executions = (trades || []).map(t => ({ order_type: t.type, ticker: t.ticker, amount: t.amount, price: t.price, pnl: t.pnl, timestamp: t.created_at }));
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
        refreshMLInsights();
    } catch (err) { }
}

async function refreshMLInsights() {
    try {
        const ml = await api.request('/ml/metrics/ETH');
        els.regime.textContent = ml.regime || "N/A";
        els.confidence.textContent = ml.confidence != null ? ml.confidence : "---";
        els.shs.textContent = ml.shs != null ? `${Math.round(ml.shs)}/100` : "---";
    } catch (e) { }
}

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
            <span>${ex.ticker || 'ETH/USDT'}</span>
            <span>${Number(ex.amount).toFixed(4)}</span>
            <span>$${Number(ex.price).toLocaleString()}</span>
        </div>`).join('');
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

// Events
els.btnAcceptManual && els.btnAcceptManual.addEventListener('click', () => {
    localStorage.setItem("manualAccepted", "true");
    startDashboard();
    api.request("/auth/accept-manual", { method: "POST" }).catch(() => { });
});

els.btnStart && els.btnStart.addEventListener('click', () => api.request("/trading/start", { method: "POST" }).then(refreshData));
els.btnStop && els.btnStop.addEventListener('click', () => api.request("/trading/stop", { method: "POST" }).then(refreshData));
els.btnKill && els.btnKill.addEventListener('click', () => api.request("/trading/kill", { method: "POST" }).then(refreshData));
els.btnUnlock && els.btnUnlock.addEventListener('click', () => api.request("/trading/unlock", { method: "POST" }).then(refreshData));
els.btnResetManual && els.btnResetManual.addEventListener('click', () => navigate('manual'));

els.modeNormal && els.modeNormal.addEventListener('click', () => setRiskProfile("NORMAL"));
els.modeConservative && els.modeConservative.addEventListener('click', () => setRiskProfile("CONSERVATIVE"));

async function setRiskProfile(profile) {
    await api.request("/trading/risk-profile", { method: "POST", body: JSON.stringify({ profile }) });
    refreshData();
}

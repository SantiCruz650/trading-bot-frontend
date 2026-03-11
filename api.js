console.log('--- VERSION 3.8 - DASHBOARD FIXES ---');
/**
 * api.js - Wrapper para fetch con autenticación
 */

// HARDCODED PRODUCTION URL - Eliminamos detección dinámica para máxima estabilidad
const API_BASE_URL = "https://trading-bot-kea3.onrender.com";
window.API_BASE_URL = API_BASE_URL;

const api = {
    async request(endpoint, options = {}) {
        const token = localStorage.getItem("access_token");

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        };

        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        try {
            const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
            const response = await fetch(`${window.API_BASE_URL}${apiEndpoint}`, config);

            if (response.status === 401) {
                console.info("[API Security] 401 Unauthorized. Triggering system lockdown.");
                localStorage.removeItem('access_token');
                if (window.stopPolling) window.stopPolling();
                window.location.hash = "#auth";
                return { authenticated: false };
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Error en la petición');
            }

            return data;
        } catch (error) {
            // Muffle CORS/Network errors during backend restarts
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                console.warn(`[API] Connection interrupted (${endpoint}). Server might be restarting.`);
                throw new Error("Connection interrupted");
            }
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }
};

// Exponer globalmente
window.api = api;

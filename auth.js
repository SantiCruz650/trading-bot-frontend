window.API_BASE_URL = "https://trading-bot-kea3.onrender.com";

const auth = {
    saveToken(token) {
        localStorage.setItem('access_token', token);
    },

    getToken() {
        return localStorage.getItem('access_token');
    },

    logout() {
        localStorage.removeItem('access_token');
        window.location.reload(); // Recargar para volver al estado de login
    },

    isAuthenticated() {
        const token = this.getToken();
        if (!token) return false;

        try {
            // Verificación básica de expiración del JWT (opcional pero recomendado)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000;
            if (Date.now() >= exp) {
                this.logout();
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    getUser() {
        const token = this.getToken();
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.sub; // username/email
        } catch (e) {
            return null;
        }
    },

    async login(username, password) {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        // OAuth2 standard expects application/x-www-form-urlencoded
        const response = await fetch(`${window.API_BASE_URL}/api/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'ngrok-skip-browser-warning': 'true'
            },
            body: params,
            credentials: 'include'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Error en el inicio de sesión');
        }

        this.saveToken(data.access_token);
        return data;
    },

    async register(username, password) {
        const url = `${window.API_BASE_URL}/api/auth/register`;
        console.log("[Auth] Sending Register request to:", url);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Error en el registro');
        }

        return data;
    }
};

// Exponer globalmente
window.auth = auth;

/**
 * ParkQR - API Client Layer
 * Real backend communication for all frontend modules
 */

const API = {
    async get(endpoint) {
        try {
            const resp = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' }
            });
            return await resp.json();
        } catch (err) {
            console.error(`API GET ${endpoint} error:`, err);
            return { success: false, message: 'Server connection error' };
        }
    },

    async post(endpoint, data = {}) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });
            return await resp.json();
        } catch (err) {
            console.error(`API POST ${endpoint} error:`, err);
            return { success: false, message: 'Server connection error' };
        }
    }
};


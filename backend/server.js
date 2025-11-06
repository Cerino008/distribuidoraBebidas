// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIG ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RANGE = process.env.RANGE || 'Hoja1!A:D';

// --- Cargar credenciales ---
let credentials;

try {
    if (process.env.GOOGLE_CREDENTIALS) {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        credentials = {
            type: 'service_account',
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
    } else {
        throw new Error('No se encontraron credenciales de Google.');
    }
} catch (err) {
    console.error('❌ No se pudieron leer las credenciales desde GOOGLE_CREDENTIALS.');
    console.error(err.message);
    process.exit(1);
}

// --- Inicializar Google Sheets ---
async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

// --- Endpoints ---
app.get('/api/catalogo', async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE,
        });

        const rows = response.data.values || [];
        if (rows.length === 0) return res.json([]);

        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const items = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((key, i) => obj[key] = row[i] ?? '');
            return {
                id: obj.id || '',
                producto: obj.producto || '',
                precio: Number(obj.precio) || 0,
                categoria: obj.categoria || obj['categoría'] || '',
            };
        });

        res.json(items);
    } catch (err) {
        console.error('Error leyendo Google Sheets:', err);
        res.status(500).json({ error: 'Error al leer Google Sheets' });
    }
});

// --- Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en puerto ${PORT}`);
});

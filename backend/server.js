// backend/server.js
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());


app.use(express.static(path.join(__dirname, '../public')));



// --- CONFIG ---
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const SPREADSHEET_ID = '1RmBaxknY_X12XPq0BDNBxj7tBn1uZUvfQa-PD0HV7gY';
const RANGE = 'Hoja1!A:D'; // lee A (ID), B (Producto), C (Precio), D (Categoría)
// --------------

// Carga credenciales
if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ credentials.json no encontrado en backend/. Colocalo ahi.');
    process.exit(1);
}
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}
app.get('/test', (req, res) => {
  res.send('✅ Express sirve correctamente rutas simples');
});

app.get('/api/catalogo', async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE,
        });

        const rows = response.data.values || [];
        if (rows.length === 0) return res.json([]);

        // Asumimos headers en la fila 1 (ID, Producto, Precio, Categoría)
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const items = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((key, i) => {
                obj[key] = row[i] !== undefined ? row[i] : '';
            });
            return {
                id: obj.id || '',
                producto: obj.producto || '',
                precio: Number(obj.precio) || 0,
                categoria: obj.categoria || obj['categoría'] || ''
            };
        });

        res.json(items);
    } catch (err) {
        console.error('Error leyendo Google Sheets:', err.message || err);
        res.status(500).json({ error: 'Error al leer Google Sheets' });
        console.error(err.stack);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
    console.log('GET /api/catalogo -> devuelve el catálogo desde Google Sheets');
});

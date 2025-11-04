// backend/server.js
require('dotenv').config(); // 👈 Carga las variables del archivo .env

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir el frontend desde /public
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIGURACIÓN ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RANGE = 'Hoja1!A:D'; // lee columnas: ID | Producto | Precio | Categoría

// Leer las credenciales desde la variable de entorno
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (err) {
  console.error('❌ No se pudieron leer las credenciales desde GOOGLE_CREDENTIALS.');
  console.error(err.message);
  process.exit(1);
}

// --- AUTENTICACIÓN CON GOOGLE SHEETS ---
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// --- RUTAS ---
app.get('/test', (req, res) => {
  res.send('✅ Express funciona correctamente');
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

    // Asumimos headers en la fila 1
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
    console.error('❌ Error leyendo Google Sheets:', err.message);
    res.status(500).json({ error: 'Error al leer Google Sheets' });
  }
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
  console.log('GET /api/catalogo -> devuelve el catálogo desde Google Sheets');
});

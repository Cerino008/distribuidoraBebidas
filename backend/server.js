// backend/server.js
// Servidor Express que expone:
//  - GET /api/catalogo  -> { items: [...], ultimaModificacion: "ISOdate" }
//  - GET /api/info      -> { lastUpdate: "ISOdate" }  (opcional, compatibilidad)
// Además sirve estáticos desde ../public
//
// Requiere en /backend/.env las variables:
//   SPREADSHEET_ID=tu_spreadsheet_id
//   GOOGLE_CREDENTIALS={"type":...}   (o usar GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY separados)
//   (opcional) RANGE=Hoja1!A:F
//
// IMPORTANTE: no subir .env ni credentials.json al repo (usar .gitignore)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend estático desde /public
app.use(express.static(path.join(__dirname, '../public')));

// -------------------- CONFIG --------------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RANGE = process.env.RANGE || 'Hoja1!A:F'; // A..F: ID, Producto, Precio, Categoría, ImagenURL, Descripción

// Cargar credenciales desde variables de entorno (dos formas soportadas)
let credentials;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    // GOOGLE_CREDENTIALS debe contener el JSON completo (una línea o con \n)
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    credentials = {
      type: 'service_account',
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      // si en el panel la private key vino con \n, reemplazar
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  } else {
    throw new Error('No se encontraron credenciales de Google en variables de entorno.');
  }
} catch (err) {
  console.error('❌ No se pudieron leer las credenciales desde GOOGLE_CREDENTIALS / GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.');
  console.error(err.message || err);
  process.exit(1);
}

// -------------------- Helpers: inicializar clientes --------------------
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
  });
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

// -------------------- Endpoint: /api/catalogo --------------------
// Devuelve { items: [...], ultimaModificacion: "ISOdate" }
// items -> objetos con: id, producto, precio, categoria, imagen, descripcion
app.get('/api/catalogo', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return res.json({ items: [], ultimaModificacion: null });
    }

    // Obtener metadata de archivo (fecha de modificación) mediante Drive API
    const drive = await getDriveClient();
    const file = await drive.files.get({
      fileId: SPREADSHEET_ID,
      fields: 'modifiedTime'
    });
    const ultimaModificacion = file.data.modifiedTime || null;

    // Mapear filas: la primera fila se asume como encabezados
    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const items = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((key, i) => {
        obj[key] = row[i] !== undefined ? row[i] : '';
      });

      // Normalizar nombres de campo (apoya nombres: imagen, imagenurl, descripcion)
      return {
        id: obj.id || '',
        producto: obj.producto || '',
        precio: Number((obj.precio || obj.price || '').toString().replace(/\./g, '').replace(/,/g, '.')) || 0,
        categoria: obj.categoria || obj['categoría'] || '',
        imagen: obj.imagen || obj.imagenurl || '',
        descripcion: obj.descripcion || obj.desc || ''
      };
    });

    res.json({ items, ultimaModificacion });
  } catch (err) {
    console.error('❌ Error leyendo Google Sheets:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Error al leer Google Sheets' });
  }
});


// -------------------- Endpoint opcional /api/info --------------------
// Devuelve solo la fecha de última modificación: { lastUpdate: "ISOdate" }
// Útil si el frontend prefiere pedir solo la info.
app.get('/api/info', async (req, res) => {
  try {
    const drive = await getDriveClient();
    const file = await drive.files.get({
      fileId: SPREADSHEET_ID,
      fields: 'modifiedTime'
    });
    res.json({ lastUpdate: file.data.modifiedTime });
  } catch (err) {
    console.error('❌ Error obteniendo metadata Drive:', err);
    res.status(500).json({ error: 'Error obteniendo info' });
  }
});

// -------------------- Iniciar servidor --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en puerto ${PORT}`);
  console.log(`📊 SPREADSHEET_ID: ${SPREADSHEET_ID ? SPREADSHEET_ID.slice(0,8) + '...' : 'NO CONFIGURADO'}`);
  console.log(`🔗 GET /api/catalogo`);
  console.log(`🔗 GET /api/info`);
});

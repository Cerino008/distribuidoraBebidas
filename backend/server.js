// backend/server.js
require('dotenv').config(); // Carga variables de entorno desde archivo .env
const express = require('express'); // Framework web para Node.js
const cors = require('cors'); // Permite peticiones entre diferentes dominios (CORS)
const { google } = require('googleapis'); // Librería oficial de Google APIs
const path = require('path'); // Utilidad para manejar rutas de archivos

// Inicializar la aplicación Express
const app = express();

// Configurar middlewares (capas de procesamiento)
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Permite recibir datos JSON en las peticiones
app.use(express.static(path.join(__dirname, '../public'))); // Sirve archivos estáticos (HTML, CSS, JS)

// --- CONFIGURACIÓN DE GOOGLE SHEETS ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // ID de la hoja de cálculo de Google
const RANGE = process.env.RANGE || 'Hoja1!A:D'; // Rango de celdas a leer (por defecto A:D de Hoja1)

// --- CARGA DE CREDENCIALES DE GOOGLE ---
let credentials; // Variable para almacenar las credenciales de servicio

try {
    // Diferentes formas de cargar credenciales según la configuración:
    
    // 1. Desde variable de entorno GOOGLE_CREDENTIALS (JSON completo)
    if (process.env.GOOGLE_CREDENTIALS) {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } 
    // 2. Desde variables separadas (email + clave privada)
    else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        credentials = {
            type: 'service_account', // Tipo de cuenta de servicio
            client_email: process.env.GOOGLE_CLIENT_EMAIL, // Email de la cuenta de servicio
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Clave privada (arregla saltos de línea)
        };
    } 
    // 3. Error si no hay credenciales
    else {
        throw new Error('No se encontraron credenciales de Google.');
    }
} catch (err) {
    // Manejo de errores en la carga de credenciales
    console.error('❌ No se pudieron leer las credenciales desde GOOGLE_CREDENTIALS.');
    console.error(err.message);
    process.exit(1); // Termina la aplicación si no hay credenciales
}

// --- INICIALIZACIÓN DEL CLIENTE DE GOOGLE SHEETS ---
/**
 * Crea y autentica el cliente para acceder a Google Sheets API
 * @returns {Object} Cliente autenticado de Google Sheets
 */
async function getSheetsClient() {
    // Configura la autenticación con las credenciales
    const auth = new google.auth.GoogleAuth({
        credentials, // Credenciales cargadas anteriormente
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], // Solo permiso de lectura
    });
    
    // Obtiene el cliente autenticado
    const client = await auth.getClient();
    
    // Retorna la instancia de Google Sheets API
    return google.sheets({ version: 'v4', auth: client });
}

// --- ENDPOINTS (RUTAS) DE LA API ---

/**
 * ENDPOINT: /api/catalogo
 * Método: GET
 * Propósito: Obtener los productos desde Google Sheets
 * Respuesta: Array de objetos con información de productos
 */
app.get('/api/catalogo', async (req, res) => {
    try {
        // Obtiene el cliente autenticado de Google Sheets
        const sheets = await getSheetsClient();
        
        // Hace la petición a Google Sheets API para obtener los valores
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, // ID de la hoja de cálculo
            range: RANGE, // Rango de celdas a leer
        });

        // Extrae las filas de datos (o array vacío si no hay datos)
        const rows = response.data.values || [];
        
        // Si no hay filas, retorna array vacío
        if (rows.length === 0) return res.json([]);

        // Procesamiento de datos:
        
        // 1. Obtiene los encabezados (primera fila) y los normaliza
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        
        // 2. Convierte las filas de datos en objetos estructurados
        const items = rows.slice(1).map(row => {
            const obj = {};
            
            // Asigna cada valor a su propiedad correspondiente según el encabezado
            headers.forEach((key, i) => obj[key] = row[i] ?? ''); // ?? '' para valores nulos/undefined
            
            // Retorna objeto normalizado con propiedades esperadas
            return {
                id: obj.id || '', // ID del producto
                producto: obj.producto || '', // Nombre del producto
                precio: Number(obj.precio) || 0, // Precio (convertido a número)
                categoria: obj.categoria || obj['categoría'] || '', // Categoría (compatible con tilde)
            };
        });

        // Envía la respuesta JSON con los productos procesados
        res.json(items);
        
    } catch (err) {
        // Manejo de errores específicos de Google Sheets
        console.error('Error leyendo Google Sheets:', err);
        
        // Posibles errores:
        // - Credenciales inválidas
        // - Hoja de cálculo no encontrada
        // - Sin permisos de acceso
        // - Problemas de red
        
        res.status(500).json({ error: 'Error al leer Google Sheets' });
    }
});

// --- INICIALIZACIÓN DEL SERVIDOR ---
const PORT = process.env.PORT || 3000; // Puerto desde variable de entorno o 3000 por defecto

// Inicia el servidor
app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en puerto ${PORT}`);
    console.log(`📊 Conectado a Google Sheets: ${SPREADSHEET_ID}`);
    console.log(`🔗 API disponible en: http://localhost:${PORT}/api/catalogo`);
});
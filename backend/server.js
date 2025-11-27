// backend/server.js
// Servidor Express que sirve el catálogo desde Google Sheets y archivos estáticos
// Endpoints:
//   - GET /api/catalogo  -> { items: [...], ultimaModificacion: "ISOdate" }
//   - GET /api/info      -> { lastUpdate: "ISOdate" }  (opcional, compatibilidad)
// Sirve archivos estáticos desde ../public
//
// Variables de entorno requeridas en /backend/.env:
//   SPREADSHEET_ID=tu_spreadsheet_id
//   GOOGLE_CREDENTIALS={"type":...}   (o usar GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY separados)
//   (opcional) RANGE=Hoja1!A:F
//
// IMPORTANTE: No subir .env ni credentials.json al repositorio (usar .gitignore)

// ===== CONFIGURACIÓN INICIAL =====
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIGURACIÓN DE MIDDLEWARES =====
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Parsea JSON en las requests

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// ===== CONFIGURACIÓN DE GOOGLE SHEETS =====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RANGO_HOJA = process.env.RANGE || 'Hoja1!A:F'; // Columnas A-F: ID, Producto, Precio, Categoría, ImagenURL, Descripción

// ===== CARGA Y VALIDACIÓN DE CREDENCIALES =====
/**
 * Carga y valida las credenciales de Google desde variables de entorno
 * Soporta dos formatos: JSON completo o email + clave privada separados
 * @returns {Object} Credenciales configuradas para Google APIs
 * @throws {Error} Si no se encuentran credenciales válidas
 */
function cargarCredencialesGoogle() {
  try {
    if (process.env.GOOGLE_CREDENTIALS) {
      // GOOGLE_CREDENTIALS debe contener el JSON completo
      return JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      // Credenciales por separado (formato común en servicios como Railway)
      return {
        type: 'service_account',
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Convierte \n a saltos de línea reales
      };
    } else {
      throw new Error('No se encontraron credenciales de Google en las variables de entorno');
    }
  } catch (error) {
    console.error('❌ Error cargando credenciales de Google:', error.message);
    console.error('💡 Asegúrate de configurar GOOGLE_CREDENTIALES o GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }
}

const CREDENCIALES_GOOGLE = cargarCredencialesGoogle();

// ===== CLIENTES DE GOOGLE APIS =====
/**
 * Inicializa y retorna un cliente autenticado de Google Sheets
 * @returns {Object} Cliente de Google Sheets configurado
 */
async function obtenerClienteSheets() {
  const autenticacion = new google.auth.GoogleAuth({
    credentials: CREDENCIALES_GOOGLE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  
  const cliente = await autenticacion.getClient();
  return google.sheets({ version: 'v4', auth: cliente });
}

/**
 * Inicializa y retorna un cliente autenticado de Google Drive
 * @returns {Object} Cliente de Google Drive configurado
 */
async function obtenerClienteDrive() {
  const autenticacion = new google.auth.GoogleAuth({
    credentials: CREDENCIALES_GOOGLE,
    scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
  });
  
  const cliente = await autenticacion.getClient();
  return google.drive({ version: 'v3', auth: cliente });
}

/**
 * Obtiene la fecha de última modificación del archivo de Google Sheets
 * @param {string} idArchivo - ID del spreadsheet
 * @returns {string|null} Fecha de modificación en formato ISO o null si hay error
 */
async function obtenerUltimaModificacion(idArchivo) {
  try {
    const drive = await obtenerClienteDrive();
    const archivo = await drive.files.get({
      fileId: idArchivo,
      fields: 'modifiedTime'
    });
    
    return archivo.data.modifiedTime || null;
  } catch (error) {
    console.error('⚠️ No se pudo obtener la fecha de modificación:', error.message);
    return null;
  }
}

/**
 * Normaliza y limpia los datos de un producto del spreadsheet
 * @param {Object} producto - Objeto con datos crudos del producto
 * @returns {Object} Producto normalizado con campos estandarizados
 */
function normalizarProducto(producto) {
  // Convertir precio a número (soporta formatos con . y ,)
  const precioCrudo = (producto.precio || producto.price || '').toString();
  const precioLimpio = Number(precioCrudo.replace(/\./g, '').replace(/,/g, '.')) || 0;

  return {
    id: producto.id || '',
    producto: producto.producto || '',
    precio: precioLimpio,
    categoria: producto.categoria || producto['categoría'] || '',
    imagen: producto.imagen || producto.imagenurl || '',
    descripcion: producto.descripcion || producto.desc || ''
  };
}

// ===== ENDPOINTS DE LA API =====

/**
 * Endpoint: /api/catalogo
 * Devuelve todos los productos del spreadsheet con metadata
 * Response: { items: Array, ultimaModificacion: string }
 */
app.get('/api/catalogo', async (req, res) => {
  try {
    // Validar configuración básica
    if (!SPREADSHEET_ID) {
      return res.status(500).json({ 
        error: 'SPREADSHEET_ID no configurado en las variables de entorno' 
      });
    }

    // Obtener datos del spreadsheet
    const sheets = await obtenerClienteSheets();
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGO_HOJA,
    });

    const filas = respuesta.data.values || [];
    
    // Si no hay datos, retornar array vacío
    if (filas.length <= 1) {
      return res.json({ 
        items: [], 
        ultimaModificacion: null 
      });
    }

    // Obtener fecha de última modificación
    const ultimaModificacion = await obtenerUltimaModificacion(SPREADSHEET_ID);

    // Procesar filas: primera fila son encabezados, el resto son datos
    const encabezados = filas[0].map(encabezado => 
      String(encabezado).toLowerCase().trim()
    );
    
    const productos = filas.slice(1).map(fila => {
      const productoCrudo = {};
      encabezados.forEach((encabezado, indice) => {
        productoCrudo[encabezado] = fila[indice] !== undefined ? fila[indice] : '';
      });
      
      return normalizarProducto(productoCrudo);
    });

    // Filtrar productos vacíos (filas completamente vacías)
    const productosFiltrados = productos.filter(producto => 
      producto.producto || producto.precio > 0
    );

    res.json({ 
      items: productosFiltrados, 
      ultimaModificacion 
    });

  } catch (error) {
    console.error('❌ Error en /api/catalogo:', error.message);
    
    // Mensajes de error más específicos según el tipo de error
    let mensajeError = 'Error al leer Google Sheets';
    if (error.message.includes('PERMISSION_DENIED')) {
      mensajeError = 'Sin permisos para acceder al spreadsheet. Verifica las credenciales.';
    } else if (error.message.includes('NOT_FOUND')) {
      mensajeError = 'Spreadsheet no encontrado. Verifica el SPREADSHEET_ID.';
    }
    
    res.status(500).json({ 
      error: mensajeError,
      detalle: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Endpoint: /api/info
 * Devuelve solo la metadata del spreadsheet (fecha de modificación)
 * Response: { lastUpdate: string }
 */
app.get('/api/info', async (req, res) => {
  try {
    if (!SPREADSHEET_ID) {
      return res.status(500).json({ 
        error: 'SPREADSHEET_ID no configurado' 
      });
    }

    const ultimaModificacion = await obtenerUltimaModificacion(SPREADSHEET_ID);
    
    res.json({ 
      lastUpdate: ultimaModificacion 
    });

  } catch (error) {
    console.error('❌ Error en /api/info:', error.message);
    res.status(500).json({ 
      error: 'Error obteniendo información del spreadsheet' 
    });
  }
});

/**
 * Endpoint de salud/health check
 * Útil para monitoreo y despliegues
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    spreadsheetConfigurado: !!SPREADSHEET_ID
  });
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    rutasDisponibles: ['/api/catalogo', '/api/info', '/api/health']
  });
});

// ===== INICIALIZACIÓN DEL SERVIDOR =====
app.listen(PORT, () => {
  console.log('🚀 ===== SERVIDOR INICIADO =====');
  console.log(`✅ Backend corriendo en puerto ${PORT}`);
  console.log(`📊 Spreadsheet ID: ${SPREADSHEET_ID ? SPREADSHEET_ID.slice(0, 8) + '...' : 'NO CONFIGURADO'}`);
  console.log(`📝 Rango configurado: ${RANGO_HOJA}`);
  console.log('🔗 Endpoints disponibles:');
  console.log('   GET /api/catalogo    - Lista completa de productos');
  console.log('   GET /api/info        - Información del spreadsheet');
  console.log('   GET /api/health      - Estado del servidor');
  console.log('   GET /*               - Archivos estáticos del frontend');
  console.log('================================');
});
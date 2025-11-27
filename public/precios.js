// public/precios.js
// Carga catálogo desde /api/catalogo y genera PDF con los productos
// Asume que /api/catalogo devuelve { items: [...], ultimaModificacion: "ISOdate" }

// ===== VARIABLES GLOBALES =====
const tablaBody = document.querySelector('#tablaCatalogo tbody');
const fechaEl = document.getElementById('fechaActualizacion');
const btnRefrescar = document.getElementById('btnRefrescar');
const btnDescargar = document.getElementById('btnDescargar');
const tablaWrapper = document.getElementById('tablaWrapper');

let catalogo = [];
let ultimaMod = null;

// ===== FUNCIONES DE UTILIDAD =====

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} str - Cadena a escapar
 * @returns {string} Cadena escapada
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Normaliza URLs de imágenes para diferentes servicios (Google Drive, Imgur, etc.)
 * @param {string} url - URL de la imagen a normalizar
 * @returns {string} URL normalizada o cadena vacía si no hay URL
 */
function normalizarImagen(url) {
  if (!url) return '';
  url = String(url).trim();

  // Si ya es data URI o URL directa, retornar tal cual
  if (url.startsWith('data:') || /\.(png|jpe?g|gif|webp|svg)(?:$|\?|#)/i.test(url)) {
    return url;
  }

  // Google Drive: extraer ID de diferentes formatos de URL
  let match = url.match(/\/d\/([^/?#]+)/i) || url.match(/[?&]id=([^&]+)/i) || 
              url.match(/\/uc\?export=download&id=([^&]+)/i);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }

  // Imgur: convertir URLs de página a URLs directas de imagen
  match = url.match(/https?:\/\/(?:i\.)?imgur\.com\/(?:gallery\/)?([A-Za-z0-9]+)(?:\.\w+)?/i);
  if (match && match[1]) {
    const extMatch = url.match(/\.([a-zA-Z0-9]{3,4})(?:$|\?|#)/);
    const extension = extMatch ? extMatch[1] : 'png';
    return `https://i.imgur.com/${match[1]}.${extension}`;
  }

  // Googleusercontent: retornar tal cual
  if (/googleusercontent\.com/i.test(url)) {
    return url;
  }

  // Por defecto, retornar URL original
  return url;
}

// ===== FUNCIONES PRINCIPALES =====

/**
 * Carga el catálogo desde la API y actualiza la interfaz
 */
async function cargarCatalogo() {
  try {
    const respuesta = await fetch('/api/catalogo');
    if (!respuesta.ok) throw new Error('Error al obtener el catálogo');
    
    const datos = await respuesta.json();

    // Manejar diferentes formatos de respuesta (compatibilidad)
    if (datos.items) {
      catalogo = datos.items;
      ultimaMod = datos.ultimaModificacion || null;
    } else {
      catalogo = datos;
      ultimaMod = null;
    }

    renderizarFecha();
    renderizarTabla();
  } catch (error) {
    console.error('Error cargando catálogo:', error);
    tablaBody.innerHTML = `<tr><td colspan="5">Error cargando catálogo</td></tr>`;
    fechaEl.textContent = 'Última actualización: —';
  }
}

/**
 * Renderiza la fecha de última actualización en la interfaz
 */
function renderizarFecha() {
  if (ultimaMod) {
    const fechaFormateada = new Date(ultimaMod).toLocaleString('es-AR');
    fechaEl.textContent = `Última actualización: ${fechaFormateada}`;
  } else {
    fechaEl.textContent = 'Última actualización: —';
  }
}

/**
 * Renderiza la tabla con los productos del catálogo
 */
function renderizarTabla() {
  tablaBody.innerHTML = '';

  // Verificar si hay productos para mostrar
  if (!catalogo || catalogo.length === 0) {
    tablaBody.innerHTML = '<tr><td colspan="5">No hay productos</td></tr>';
    return;
  }

  // Generar filas para cada producto
  catalogo.forEach(producto => {
    const nombre = producto.producto || '';
    const imagen = normalizarImagen(producto.imagen || '');
    const descripcion = producto.descripcion || '';
    const categoria = producto.categoria || '';
    const precio = Number(producto.precio || 0);

    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td class="col-prod"><strong>${escapeHtml(nombre)}</strong></td>
      <td class="col-foto">
        ${imagen 
          ? `<img class="prod-img" src="${escapeHtml(imagen)}" alt="${escapeHtml(nombre)}">`
          : `<div class="sin-imagen">NO IMG</div>`
        }
      </td>
      <td class="col-desc"><small>${escapeHtml(descripcion)}</small></td>
      <td class="col-cat">${escapeHtml(categoria)}</td>
      <td class="col-precio">$ ${precio.toLocaleString('es-AR')}</td>
    `;
    tablaBody.appendChild(fila);
  });
}

/**
 * Genera y descarga un PDF con el catálogo actual
 */
async function descargarPDF() {
  try {
    // Actualizar estado del botón
    btnDescargar.disabled = true;
    btnDescargar.textContent = 'Generando...';

    // Configuración para html2canvas (alta resolución)
    const opcionesCanvas = { 
      scale: 2, 
      useCORS: true, 
      backgroundColor: '#ffffff' 
    };
    
    const canvas = await html2canvas(tablaWrapper, opcionesCanvas);
    const imagenData = canvas.toDataURL('image/png');

    // Crear documento PDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

    const anchoPagina = pdf.internal.pageSize.getWidth();
    const altoPagina = pdf.internal.pageSize.getHeight();
    const margen = 28;

    const anchoImagen = anchoPagina - margen * 2;
    const altoImagen = (canvas.height * anchoImagen) / canvas.width;

    // Manejar contenido de una o múltiples páginas
    if (altoImagen <= altoPagina - margen * 2) {
      // Contenido cabe en una sola página
      pdf.addImage(imagenData, 'PNG', margen, margen, anchoImagen, altoImagen);
    } else {
      // Dividir contenido en múltiples páginas
      const pixelesPorPunto = canvas.height / altoImagen;
      const altoTrozoPuntos = altoPagina - margen * 2;
      const altoTrozoPixeles = Math.floor(altoTrozoPuntos * pixelesPorPunto);

      let posicionY = 0;
      let numeroPagina = 0;

      while (posicionY < canvas.height) {
        const canvasTemporal = document.createElement('canvas');
        canvasTemporal.width = canvas.width;
        canvasTemporal.height = Math.min(altoTrozoPixeles, canvas.height - posicionY);
        
        const contexto = canvasTemporal.getContext('2d');
        contexto.drawImage(
          canvas, 
          0, posicionY, canvas.width, canvasTemporal.height,
          0, 0, canvas.width, canvasTemporal.height
        );

        const datosTrozo = canvasTemporal.toDataURL('image/png');
        const altoTrozoPt = (canvasTemporal.height * anchoImagen) / canvas.width;

        if (numeroPagina > 0) pdf.addPage();
        pdf.addImage(datosTrozo, 'PNG', margen, margen, anchoImagen, altoTrozoPt);

        posicionY += canvasTemporal.height;
        numeroPagina++;
      }
    }

    // Agregar fecha de actualización en la primera página
    if (ultimaMod) {
      const fechaActualizacion = new Date(ultimaMod).toLocaleString('es-AR');
      pdf.setFontSize(9);
      pdf.setTextColor(80);
      pdf.text(`Última actualización: ${fechaActualizacion}`, margen, 18);
    }

    // Descargar el PDF
    pdf.save('catalogo_distribuidora.pdf');
  } catch (error) {
    console.error('Error generando PDF:', error);
    alert('No se pudo generar el PDF. Revisa la consola.');
  } finally {
    // Restaurar estado del botón
    btnDescargar.disabled = false;
    btnDescargar.textContent = 'Descargar PDF';
  }
}

// ===== CONFIGURACIÓN DE EVENTOS =====
btnRefrescar.addEventListener('click', cargarCatalogo);
btnDescargar.addEventListener('click', descargarPDF);

// ===== INICIALIZACIÓN =====
// Cargar catálogo al iniciar la página
cargarCatalogo();
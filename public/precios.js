// public/precios.js
// Carga catálogo desde /api/catalogo y soporta descarga a PDF.
// Asume que /api/catalogo devuelve { items: [...], ultimaModificacion: "ISOdate" }

const tablaBody = document.querySelector('#tablaCatalogo tbody');
const fechaEl = document.getElementById('fechaActualizacion');
const btnRefrescar = document.getElementById('btnRefrescar');
const btnDescargar = document.getElementById('btnDescargar');
const tablaWrapper = document.getElementById('tablaWrapper');

let catalogo = [];
let ultimaMod = null;

async function cargarCatalogo() {
  try {
    const res = await fetch('/api/catalogo');
    if (!res.ok) throw new Error('Error al pedir catálogo');
    const data = await res.json();

    // data puede ser { items, ultimaModificacion } o solo items (compatibilidad)
    if (data.items) {
      catalogo = data.items;
      ultimaMod = data.ultimaModificacion || null;
    } else {
      catalogo = data;
      ultimaMod = null;
    }

    renderFecha();
    renderTabla();
  } catch (err) {
    console.error(err);
    tablaBody.innerHTML = `<tr><td colspan="5">Error cargando catálogo</td></tr>`;
    fechaEl.textContent = 'Última actualización: —';
  }
}

function renderFecha(){
  if (ultimaMod) {
    fechaEl.textContent = 'Última actualización: ' + new Date(ultimaMod).toLocaleString('es-AR');
  } else {
    fechaEl.textContent = 'Última actualización: —';
  }
}

function renderTabla(){
  tablaBody.innerHTML = '';
  if(!catalogo || catalogo.length === 0) {
    tablaBody.innerHTML = '<tr><td colspan="5">No hay productos</td></tr>';
    return;
  }

  catalogo.forEach(item => {
    const producto = item.producto || '';
    const imagen = normalizarImagen(item.imagen || '');
    const descripcion = item.descripcion || '';
    const categoria = item.categoria || '';
    const precio = Number(item.precio || 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-prod"><strong>${escapeHtml(producto)}</strong></td>
      <td class="col-foto">
        ${imagen ? `<img class="prod-img" src="${escapeHtml(imagen)}" alt="${escapeHtml(producto)}">`
                : `<div style="width:80px;height:80px;border-radius:8px;background:#f3f3f3;display:flex;align-items:center;justify-content:center;color:#9aa3ab">NO IMG</div>`}
      </td>
      <td class="col-desc"><small>${escapeHtml(descripcion)}</small></td>
      <td class="col-cat">${escapeHtml(categoria)}</td>
      <td class="col-precio">$ ${precio.toLocaleString('es-AR')}</td>
    `;
    tablaBody.appendChild(tr);
  });
}

function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Eventos
btnRefrescar.addEventListener('click', () => cargarCatalogo());
btnDescargar.addEventListener('click', () => descargarPDF());

// carga inicial
cargarCatalogo();


// ------- Generar PDF desde la tabla (manteniendo estilo) -------
async function descargarPDF() {
  try {
    btnDescargar.disabled = true;
    btnDescargar.textContent = 'Generando...';

    // clonamos el wrapper para limpiar UI antes de render
    const elemento = tablaWrapper;

    // Opciones: scale para mejorar resolución
    const canvas = await html2canvas(elemento, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;

    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight - margin * 2) {
      // cabe en una página
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
    } else {
      // Slice del canvas en trozos para múltiples páginas
      const pxPerPt = canvas.height / imgHeight;
      const sliceHeightPts = pageHeight - margin * 2;
      const sliceHeightPx = Math.floor(sliceHeightPts * pxPerPt);

      let y = 0;
      let page = 0;
      while (y < canvas.height) {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = canvas.width;
        tmpCanvas.height = Math.min(sliceHeightPx, canvas.height - y);
        const ctx = tmpCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, y, canvas.width, tmpCanvas.height, 0, 0, canvas.width, tmpCanvas.height);

        const sliceData = tmpCanvas.toDataURL('image/png');
        const sliceHeightPt = (tmpCanvas.height * imgWidth) / canvas.width;

        if (page > 0) pdf.addPage();
        pdf.addImage(sliceData, 'PNG', margin, margin, imgWidth, sliceHeightPt);

        y += tmpCanvas.height;
        page++;
      }
    }

    // Añadir la fecha de última modificación en la primera página (arriba)
    if (ultimaMod) {
      pdf.setFontSize(9);
      pdf.setTextColor(80);
      pdf.text(`Última actualización: ${new Date(ultimaMod).toLocaleString('es-AR')}`, margin, 18);
    }

    pdf.save('catalogo_distribuidora.pdf');
  } catch (err) {
    console.error('Error generando PDF:', err);
    alert('No se pudo generar el PDF. Revisa la consola.');
  } finally {
    btnDescargar.disabled = false;
    btnDescargar.textContent = 'Descargar PDF';
  }
}

function normalizarImagen(url) {
  if (!url) return '';

  // Trim
  url = String(url).trim();

  // Si ya es data:image...
  if (url.startsWith('data:')) return url;

  // 1) Google Drive: /file/d/ID/...  -> uc?id=ID
  let m = url.match(/\/d\/([^/?#]+)/i);
  if (m && m[1]) {
    return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  }

  // 1b) Share links that sometimes come as /open?id=ID
  m = url.match(/[?&]id=([^&]+)/i);
  if (m && m[1]) {
    return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  }

  // 2) imgur page links like imgur.com/ABC or imgur.com/gallery/ABC
  //    convert to i.imgur.com/ID.png (try png then jpg fallback handled by browser)
  m = url.match(/https?:\/\/(?:i\.)?imgur\.com\/(?:gallery\/)?([A-Za-z0-9]+)(?:\.\w+)?/i);
  if (m && m[1]) {
    // If it already has extension, keep it
    const extMatch = url.match(/\.([a-zA-Z0-9]{3,4})(?:$|\?|#)/);
    if (extMatch) {
      return `https://i.imgur.com/${m[1]}.${extMatch[1]}`;
    }
    // default to png (browser will 404->try fallback)
    return `https://i.imgur.com/${m[1]}.png`;
  }

  // 3) If it's a googleusercontent direct link, return as is
  if (/googleusercontent\.com/i.test(url)) return url;

  // 4) If it's already a direct image URL (ends with image ext) return as is
  if (/\.(png|jpe?g|gif|webp|svg)(?:$|\?|#)/i.test(url)) return url;

  // 5) If it's a Drive preview link with export=download etc, try to extract id
  m = url.match(/\/uc\?export=download&id=([^&]+)/i);
  if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

  // Default: return original (best effort)
  return url;
}





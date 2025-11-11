// pedidos.js - Sistema de generación de Remitos X

// ===== ELEMENTOS DEL DOM =====
// Obtenemos referencias a todos los elementos HTML que necesitamos manipular
const customerName = document.getElementById('customerName');
const customerPhone = document.getElementById('customerPhone');
const address = document.getElementById('address');
const notes = document.getElementById('notes');
const productSelect = document.getElementById('productSelect');
const quantityInput = document.getElementById('quantityInput');
const addProductBtn = document.getElementById('addProductBtn');
const itemsList = document.getElementById('itemsList');
const previewContent = document.getElementById('previewContent');
const btnGenerate = document.getElementById('btnGenerate');
const btnDownload = document.getElementById('btnDownload');
const btnWhatsAppLink = document.getElementById('btnWhatsAppLink');
const remitoNumberEl = document.getElementById('remitoNumber');

// ===== VARIABLES GLOBALES =====
let catalogo = [];      // Almacena los productos disponibles
let carrito = [];       // Almacena los productos seleccionados
let lastPdfBlob = null; // Guarda el último PDF generado para reutilizar

// ===== SISTEMA DE NUMERACIÓN =====
// Carga el último número de remito usado desde localStorage, o empieza en 1
let numeroRemito = parseInt(localStorage.getItem('numeroRemito') || '1');

/**
 * Obtiene el número de remito actual y prepara el siguiente
 * @returns {string} Número de remito formateado (ej: "0001")
 */
function obtenerNumeroRemito() {
  const actual = numeroRemito;  // Guarda el número actual
  numeroRemito++;               // Prepara el siguiente número
  localStorage.setItem('numeroRemito', numeroRemito); // Guarda en localStorage
  return String(actual).padStart(4, '0'); // Formatea a 4 dígitos
}

// ===== CARGA DEL CATÁLOGO =====
/**
 * Carga los productos desde el backend (Google Sheets)
 */
async function cargarCatalogo() {
    try {
        // Hace una petición a la API del backend
        const res = await fetch('/api/catalogo');
        catalogo = await res.json(); // Convierte la respuesta a JSON
        
        // Limpia el selector de productos
        productSelect.innerHTML = '';
        
        // Por cada producto en el catálogo, crea una opción en el select
        catalogo.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.producto;           // Valor interno
            opt.textContent = `${item.producto} - $${item.precio}`; // Texto visible
            opt.dataset.precio = item.precio;    // Guarda el precio como atributo data
            productSelect.appendChild(opt);      // Agrega al selector
        });
    } catch (err) {
        // Manejo de errores si falla la carga del catálogo
        console.error('Error cargando catálogo:', err);
        productSelect.innerHTML = '<option disabled>Error cargando catálogo</option>';
    }
}

// Cargar el catálogo cuando se inicia la página
cargarCatalogo();

// ===== AGREGAR PRODUCTOS AL CARRITO =====
/**
 * Event listener para el botón "Agregar"
 */
addProductBtn.addEventListener('click', () => {
    // Obtiene los valores del formulario
    const producto = productSelect.value;
    if (!producto) return alert('Seleccioná un producto.');
    
    const precio = parseFloat(productSelect.selectedOptions[0].dataset.precio) || 0;
    const cantidad = parseFloat(quantityInput.value) || 1;

    // Verifica si el producto ya está en el carrito
    const existente = carrito.find(p => p.producto === producto);
    if (existente) {
        // Si existe, suma la cantidad
        existente.cantidad += cantidad;
    } else {
        // Si no existe, lo agrega como nuevo item
        carrito.push({ producto, cantidad, precio });
    }

    // Actualiza la interfaz
    renderCarrito();
    renderPreview();
});

// ===== RENDERIZADO DEL CARRITO =====
/**
 * Muestra los productos en la lista lateral
 */
function renderCarrito() {
    itemsList.innerHTML = ''; // Limpia la lista
    
    // Si no hay productos, muestra mensaje y deshabilita botones
    if (carrito.length === 0) {
        itemsList.innerHTML = '<div class="empty">No hay productos agregados.</div>';
        btnDownload.disabled = true;
        btnWhatsAppLink.disabled = true;
        return;
    }

    // Crea una fila por cada producto en el carrito
    carrito.forEach((item, index) => {
        const row = document.createElement('div');
        row.classList.add('item-row');
        row.innerHTML = `
            <div>${item.cantidad} × ${item.producto}</div>
            <div>
                $${(item.cantidad * item.precio).toFixed(2)}
                <button class="remove-btn" data-index="${index}" aria-label="Eliminar item">✕</button>
            </div>
        `;
        itemsList.appendChild(row);
    });

    // Agrega event listeners a los botones de eliminar
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const index = Number(e.target.dataset.index);
            if (!Number.isNaN(index)) {
                carrito.splice(index, 1); // Elimina el producto del carrito
                renderCarrito();  // Vuelve a renderizar
                renderPreview();  // Actualiza la previsualización
            }
        });
    });
}

// ===== PREVISUALIZACIÓN DEL REMITO =====
/**
 * Genera la vista previa del remito en tiempo real
 */
function renderPreview() {
    // Calcula el total sumando todos los productos
    let total = carrito.reduce((sum, p) => sum + p.cantidad * p.precio, 0);
    
    // Obtiene valores de los campos (con valores por defecto)
    const name = customerName.value || 'Cliente';
    const phone = customerPhone.value || '-';
    const addr = address.value || '-';
    const notesVal = notes.value || '-';

    // Muestra el número de remito actual (para previsualización)
    const remitoPreviewNum = String(parseInt(localStorage.getItem('numeroRemito') || numeroRemito)).padStart(4, '0');
    if (remitoNumberEl) remitoNumberEl.textContent = remitoPreviewNum;

    // Genera HTML para cada producto en el carrito
    let itemsHtml = carrito.map(p =>
        `<div class="preview-row"><div>${p.cantidad} × ${p.producto}</div><div>$${(p.cantidad * p.precio).toFixed(2)}</div></div>`
    ).join('');

    // Construye el contenido completo de la previsualización
    previewContent.innerHTML = `
        <div class="remito-header">
            <strong>Distribuidora Malvinas</strong><br>
            CUIT: XX-XXXXXXXX-X<br>
            Tel: (completar)<br>
            Domicilio: Pablo Areguati 2178 – Grand Bourg – Buenos Aires
        </div>

        <h3 style="margin-top:.6rem">REMITO X</h3>
        <div class="small">No válido como factura</div>
        <div class="small">Remito Nº <strong>${remitoPreviewNum}</strong> — Fecha: ${new Date().toLocaleDateString()}</div>

        <hr />

        <div><strong>Cliente:</strong> ${escapeHtml(name)}</div>
        <div class="small">${escapeHtml(phone)}</div>
        <div class="small">Dirección de entrega: ${escapeHtml(addr)}</div>

        <hr />

        ${itemsHtml || '<div class="empty">No hay productos.</div>'}

        <div class="preview-row total-row">
            <strong>Total</strong><strong>$${total.toFixed(2)}</strong>
        </div>

        <hr />

        <div class="small"><strong>Nota:</strong> ${escapeHtml(notesVal)}</div>

        <br><br>
        <div class="firma">
            ______________________________________<br>
            Firma del receptor / Aclaración / DNI
        </div>
    `;
}

// ===== SEGURIDAD: ESCAPE DE HTML =====
/**
 * Previene inyección de HTML/CSS malicioso desde los inputs
 * @param {string} text - Texto a escapar
 * @returns {string} Texto seguro para mostrar en HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

// ===== ACTUALIZACIÓN EN TIEMPO REAL =====
// Actualiza la previsualización cada vez que se escribe en los campos
[customerName, customerPhone, address, notes].forEach(el =>
    el.addEventListener('input', renderPreview)
);

// ===== GENERACIÓN DE PDF =====
/**
 * Event listener para el botón "Generar PDF"
 * - Consume un número de remito definitivo
 * - Genera el PDF a partir de la previsualización
 * - Habilita botones de descarga y WhatsApp
 */
btnGenerate.addEventListener('click', async () => {
    // Validación: debe haber productos en el carrito
    if (carrito.length === 0) return alert('Agregá al menos un producto.');
    
    // Feedback visual: deshabilita el botón durante la generación
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generando...';

    // Obtiene y consume el número de remito definitivo
    const remitoN = obtenerNumeroRemito();
    if (remitoNumberEl) remitoNumberEl.textContent = remitoN;

    // Actualiza la previsualización con el número definitivo
    renderPreview();

    try {
        // Convierte el HTML a imagen usando html2canvas
        const node = document.getElementById('orderPreview');
        const canvas = await html2canvas(node, { scale: 2 }); // scale:2 para mejor calidad
        const imgData = canvas.toDataURL('image/png');
        
        // Crea un nuevo PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        
        // Calcula dimensiones para que la imagen quepa en el PDF
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pageWidth - 60; // Margen de 30pt cada lado
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Agrega la imagen al PDF
        pdf.addImage(imgData, 'PNG', 30, 40, imgWidth, imgHeight);

        // Convierte el PDF a Blob para poder descargarlo y compartirlo
        const blob = pdf.output('blob');
        lastPdfBlob = blob;

        // Habilita los botones de descarga y WhatsApp
        btnDownload.disabled = false;
        btnWhatsAppLink.disabled = false;

        // ===== DESCARGAR PDF =====
        btnDownload.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            // Crea un nombre de archivo seguro: remito_0001_Juan_Perez.pdf
            const safeName = (customerName.value || 'cliente').replace(/\s+/g, '_');
            a.href = url;
            a.download = `remito_${remitoN}_${safeName}.pdf`;
            a.click(); // Simula click en el enlace para descargar
            URL.revokeObjectURL(url); // Libera memoria
        };

        // ===== COMPARTIR POR WHATSAPP =====
        btnWhatsAppLink.onclick = () => {
            if (carrito.length === 0) {
                alert('Agregá al menos un producto antes de enviar por WhatsApp.');
                return;
            }

            // Construye el mensaje para WhatsApp
            const mensaje = [
                ' *Nuevo pedido / Remito:*',
                '',
                ` *Cliente:* ${customerName.value || 'No especificado'}`,
                ` *Teléfono:* ${customerPhone.value || '-'}`,
                ` *Dirección:* ${address.value || '-'}`,
                '',
                ' *Productos:*',
                ...carrito.map(p => `- ${p.cantidad} × ${p.producto} ($${p.precio}) = $${(p.cantidad * p.precio).toFixed(2)}`),
                '',
                ` *Total:* $${carrito.reduce((s, p) => s + p.cantidad * p.precio, 0).toFixed(2)}`,
                notes.value ? ` *Nota:* ${notes.value}` : '',
                '',
                `Remito Nº: ${remitoN}`,
                '',
                'Pedido generado desde la web de la distribuidora'
            ].join('\n');
            
            // Número de WhatsApp (cambiar por el número deseado)
            const numero = "5491141615828";
            const waUrl = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
            window.open(waUrl, '_blank'); // Abre en nueva pestaña
        };

        alert('✅ Remito (PDF) generado correctamente.');
    } catch (err) {
        // Manejo de errores en la generación del PDF
        console.error(err);
        alert('Error generando PDF: ' + (err.message || err));
    } finally {
        // Siempre se ejecuta: restaura el estado del botón
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Generar PDF';
        renderPreview(); // Vuelve a renderizar la previsualización
    }
});
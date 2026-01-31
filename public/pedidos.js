// pedidos.js - Sistema de generación de Pedidos
// Maneja la carga de productos, gestión del carrito y generación de PDF/WhatsApp

// ===== ELEMENTOS DEL DOM =====
// Referencias a todos los elementos HTML que necesitamos manipular
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

// ===== VARIABLES GLOBALES =====
let catalogo = [];          // Almacena los productos disponibles del catálogo
let carrito = [];           // Almacena los productos seleccionados para el pedido
let ultimoPdfBlob = null;   // Guarda el último PDF generado para reutilizar

// ===== FUNCIONES DE UTILIDAD =====

/**
 * Previene inyección de HTML/CSS malicioso desde los inputs
 * @param {string} texto - Texto a escapar
 * @returns {string} Texto seguro para mostrar en HTML
 */
function escaparHtml(texto) {
    if (!texto) return '';
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// ===== CARGA DEL CATÁLOGO =====

/**
 * Carga los productos desde el backend (Google Sheets)
 */
async function cargarCatalogo() {
    try {
        const respuesta = await fetch('/api/catalogo');
        const datos = await respuesta.json();

        catalogo = datos.items || [];
        productSelect.innerHTML = '';

        // Llena el selector de productos con los datos del catálogo
        catalogo.forEach(producto => {
            const opcion = document.createElement('option');
            opcion.value = producto.producto;
            opcion.textContent = `${producto.producto} - $${producto.precio}`;
            opcion.dataset.precio = producto.precio;
            productSelect.appendChild(opcion);
        });

    } catch (error) {
        console.error('Error cargando catálogo:', error);
        productSelect.innerHTML = '<option disabled>Error cargando catálogo</option>';
    }
}

// ===== GESTIÓN DEL CARRITO =====

/**
 * Agrega un producto al carrito o incrementa la cantidad si ya existe
 */
function agregarProductoAlCarrito() {
    const productoSeleccionado = productSelect.value;
    if (!productoSeleccionado) {
        alert('Seleccioná un producto.');
        return;
    }
    
    const precio = parseFloat(productSelect.selectedOptions[0].dataset.precio) || 0;
    const cantidad = parseFloat(quantityInput.value) || 1;

    // Verifica si el producto ya está en el carrito
    const productoExistente = carrito.find(item => item.producto === productoSeleccionado);
    
    if (productoExistente) {
        productoExistente.cantidad += cantidad;
    } else {
        carrito.push({ 
            producto: productoSeleccionado, 
            cantidad: cantidad, 
            precio: precio 
        });
    }

    renderizarCarrito();
    renderizarPrevisualizacion();
}

/**
 * Elimina un producto del carrito por su índice
 */
function eliminarProductoDelCarrito(indice) {
    carrito.splice(indice, 1);
    renderizarCarrito();
    renderizarPrevisualizacion();
}

/**
 * Muestra los productos en la lista lateral del carrito
 */
function renderizarCarrito() {
    itemsList.innerHTML = '';
    
    if (carrito.length === 0) {
        itemsList.innerHTML = '<div class="empty">No hay productos agregados.</div>';
        btnDownload.disabled = true;
        btnWhatsAppLink.disabled = true;
        return;
    }

    carrito.forEach((producto, indice) => {
        const fila = document.createElement('div');
        fila.classList.add('item-row');
        fila.innerHTML = `
            <div>${producto.cantidad} × ${producto.producto}</div>
            <div>
                $${(producto.cantidad * producto.precio).toFixed(2)}
                <button class="remove-btn" data-index="${indice}">✕</button>
            </div>
        `;
        itemsList.appendChild(fila);
    });

    document.querySelectorAll('.remove-btn').forEach(boton => {
        boton.addEventListener('click', e => {
            eliminarProductoDelCarrito(Number(e.target.dataset.index));
        });
    });
}

// ===== PREVISUALIZACIÓN DEL PEDIDO =====

/**
 * Genera la vista previa del pedido en tiempo real
 */
function renderizarPrevisualizacion() {
    const total = carrito.reduce(
        (acc, p) => acc + p.cantidad * p.precio, 0
    );

    const nombreCliente = customerName.value || 'Cliente';
    const telefonoCliente = customerPhone.value || '-';
    const direccionCliente = address.value || '-';
    const notasCliente = notes.value || '-';

    const htmlProductos = carrito.map(producto =>
        `<div class="preview-row">
            <div>${producto.cantidad} × ${producto.producto}</div>
            <div>$${(producto.cantidad * producto.precio).toFixed(2)}</div>
        </div>`
    ).join('');

    previewContent.innerHTML = `
        <div class="remito-header">
            <strong>Distribuidora Malvinas</strong><br>
            Pedido de mercadería<br>
            Domicilio: Pablo Areguati 2178 – Grand Bourg – Buenos Aires
        </div>

        <h3 style="margin-top:.6rem">PEDIDO</h3>
        <div class="small">Documento interno – no válido como comprobante fiscal</div>
        <div class="small">Fecha: ${new Date().toLocaleDateString()}</div>

        <hr />

        <div><strong>Cliente:</strong> ${escaparHtml(nombreCliente)}</div>
        <div class="small">${escaparHtml(telefonoCliente)}</div>
        <div class="small">Dirección de entrega: ${escaparHtml(direccionCliente)}</div>

        <hr />

        ${htmlProductos || '<div class="empty">No hay productos.</div>'}

        <div class="preview-row total-row">
            <strong>Total</strong><strong>$${total.toFixed(2)}</strong>
        </div>

        <hr />

        <div class="small"><strong>Nota:</strong> ${escaparHtml(notasCliente)}</div>
    `;
}

// ===== GENERACIÓN DE PDF =====

/**
 * Genera el PDF del pedido
 */
async function generarPdf() {
    if (carrito.length === 0) {
        alert('Agregá al menos un producto.');
        return;
    }

    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generando...';

    try {
        const elemento = document.getElementById('orderPreview');
        const canvas = await html2canvas(elemento, { scale: 2 });

        const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
        const ancho = pdf.internal.pageSize.getWidth() - 60;
        const alto = (canvas.height * ancho) / canvas.width;

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 30, 40, ancho, alto);

        const blob = pdf.output('blob');
        ultimoPdfBlob = blob;

        configurarBotonesDescarga(blob);

        alert('✅ Pedido generado correctamente.');

    } catch (e) {
        console.error(e);
        alert('Error generando PDF');
    } finally {
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Generar PDF';
    }
}

/**
 * Configura descarga y envío por WhatsApp
 */
function configurarBotonesDescarga(blob) {
    btnDownload.disabled = false;
    btnWhatsAppLink.disabled = false;

    btnDownload.onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pedido_${(customerName.value || 'cliente').replace(/\s+/g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    btnWhatsAppLink.onclick = () => {
        const mensaje = construirMensajeWhatsApp();
        window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
    };
}

/**
 * Construye el mensaje para WhatsApp
 */
function construirMensajeWhatsApp() {
    return [
        '*Nuevo Pedido*',
        '',
        `Cliente: ${customerName.value || '-'}`,
        `Teléfono: ${customerPhone.value || '-'}`,
        `Dirección: ${address.value || '-'}`,
        '',
        'Productos:',
        ...carrito.map(p =>
            `- ${p.cantidad} × ${p.producto} = $${(p.cantidad * p.precio).toFixed(2)}`
        ),
        '',
        `Total: $${carrito.reduce((t, p) => t + p.cantidad * p.precio, 0).toFixed(2)}`,
        notes.value ? `Nota: ${notes.value}` : ''
    ].join('\n');
}

// ===== EVENTOS =====
addProductBtn.addEventListener('click', agregarProductoAlCarrito);
btnGenerate.addEventListener('click', generarPdf);
[customerName, customerPhone, address, notes].forEach(e =>
    e.addEventListener('input', renderizarPrevisualizacion)
);

// ===== INICIALIZACIÓN =====
cargarCatalogo();
renderizarPrevisualizacion();

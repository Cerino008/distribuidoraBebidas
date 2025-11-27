// pedidos.js - Sistema de generación de Remitos X
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
const remitoNumberEl = document.getElementById('remitoNumber');

// ===== VARIABLES GLOBALES =====
let catalogo = [];          // Almacena los productos disponibles del catálogo
let carrito = [];           // Almacena los productos seleccionados para el remito
let ultimoPdfBlob = null;   // Guarda el último PDF generado para reutilizar
let numeroRemito = parseInt(localStorage.getItem('numeroRemito') || '1'); // Sistema de numeración

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

/**
 * Obtiene el número de remito actual y prepara el siguiente
 * @returns {string} Número de remito formateado (ej: "0001")
 */
function obtenerNumeroRemito() {
    const numeroActual = numeroRemito;  // Guarda el número actual
    numeroRemito++;                     // Prepara el siguiente número
    localStorage.setItem('numeroRemito', numeroRemito.toString()); // Guarda en localStorage
    return String(numeroActual).padStart(4, '0'); // Formatea a 4 dígitos
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
        // Si existe, suma la cantidad
        productoExistente.cantidad += cantidad;
    } else {
        // Si no existe, lo agrega como nuevo item
        carrito.push({ 
            producto: productoSeleccionado, 
            cantidad: cantidad, 
            precio: precio 
        });
    }

    // Actualiza la interfaz
    renderizarCarrito();
    renderizarPrevisualizacion();
}

/**
 * Elimina un producto del carrito por su índice
 * @param {number} indice - Posición del producto en el carrito
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
    
    // Si no hay productos, muestra mensaje y deshabilita botones
    if (carrito.length === 0) {
        itemsList.innerHTML = '<div class="empty">No hay productos agregados.</div>';
        btnDownload.disabled = true;
        btnWhatsAppLink.disabled = true;
        return;
    }

    // Crea una fila por cada producto en el carrito
    carrito.forEach((producto, indice) => {
        const fila = document.createElement('div');
        fila.classList.add('item-row');
        fila.innerHTML = `
            <div>${producto.cantidad} × ${producto.producto}</div>
            <div>
                $${(producto.cantidad * producto.precio).toFixed(2)}
                <button class="remove-btn" data-index="${indice}" aria-label="Eliminar item">✕</button>
            </div>
        `;
        itemsList.appendChild(fila);
    });

    // Agrega event listeners a los botones de eliminar
    document.querySelectorAll('.remove-btn').forEach(boton => {
        boton.addEventListener('click', evento => {
            const indice = Number(evento.target.dataset.index);
            if (!isNaN(indice)) {
                eliminarProductoDelCarrito(indice);
            }
        });
    });
}

// ===== PREVISUALIZACIÓN DEL REMITO =====

/**
 * Genera la vista previa del remito en tiempo real
 */
function renderizarPrevisualizacion() {
    // Calcula el total sumando todos los productos
    const total = carrito.reduce((acumulador, producto) => 
        acumulador + producto.cantidad * producto.precio, 0
    );
    
    // Obtiene valores de los campos (con valores por defecto)
    const nombreCliente = customerName.value || 'Cliente';
    const telefonoCliente = customerPhone.value || '-';
    const direccionCliente = address.value || '-';
    const notasCliente = notes.value || '-';

    // Muestra el número de remito actual (para previsualización)
    const numeroPrevisualizacion = String(
        parseInt(localStorage.getItem('numeroRemito') || numeroRemito)
    ).padStart(4, '0');
    
    if (remitoNumberEl) {
        remitoNumberEl.textContent = numeroPrevisualizacion;
    }

    // Genera HTML para cada producto en el carrito
    const htmlProductos = carrito.map(producto =>
        `<div class="preview-row">
            <div>${producto.cantidad} × ${producto.producto}</div>
            <div>$${(producto.cantidad * producto.precio).toFixed(2)}</div>
        </div>`
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
        <div class="small">Remito Nº <strong>${numeroPrevisualizacion}</strong> — Fecha: ${new Date().toLocaleDateString()}</div>

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

        <br><br>
        <div class="firma">
            ______________________________________<br>
            Firma del receptor / Aclaración / DNI
        </div>
    `;
}

// ===== GENERACIÓN DE PDF =====

/**
 * Genera el PDF a partir de la previsualización y habilita las opciones de descarga
 */
async function generarPdf() {
    // Validación: debe haber productos en el carrito
    if (carrito.length === 0) {
        alert('Agregá al menos un producto.');
        return;
    }
    
    // Feedback visual: deshabilita el botón durante la generación
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generando...';

    // Obtiene y consume el número de remito definitivo
    const numeroRemitoDefinitivo = obtenerNumeroRemito();
    if (remitoNumberEl) {
        remitoNumberEl.textContent = numeroRemitoDefinitivo;
    }

    // Actualiza la previsualización con el número definitivo
    renderizarPrevisualizacion();

    try {
        // Convierte el HTML a imagen usando html2canvas
        const elementoPrevisualizacion = document.getElementById('orderPreview');
        const canvas = await html2canvas(elementoPrevisualizacion, { 
            scale: 2 // Mejor calidad
        });
        
        const datosImagen = canvas.toDataURL('image/png');
        
        // Crea un nuevo PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        
        // Calcula dimensiones para que la imagen quepa en el PDF
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoImagen = anchoPagina - 60; // Margen de 30pt cada lado
        const altoImagen = (canvas.height * anchoImagen) / canvas.width;
        
        // Agrega la imagen al PDF
        pdf.addImage(datosImagen, 'PNG', 30, 40, anchoImagen, altoImagen);

        // Convierte el PDF a Blob para poder descargarlo y compartirlo
        const blob = pdf.output('blob');
        ultimoPdfBlob = blob;

        // Configura los botones de descarga y WhatsApp
        configurarBotonesDescarga(blob, numeroRemitoDefinitivo);

        alert('✅ Remito (PDF) generado correctamente.');

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Error generando PDF: ' + (error.message || error));
    } finally {
        // Siempre se ejecuta: restaura el estado del botón
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Generar PDF';
        renderizarPrevisualizacion();
    }
}

/**
 * Configura los botones de descarga y WhatsApp con el PDF generado
 * @param {Blob} blob - Archivo PDF en formato Blob
 * @param {string} numeroRemito - Número de remito para el nombre del archivo
 */
function configurarBotonesDescarga(blob, numeroRemito) {
    // Habilita los botones
    btnDownload.disabled = false;
    btnWhatsAppLink.disabled = false;

    // Configura descarga directa del PDF
    btnDownload.onclick = () => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        
        // Crea un nombre de archivo seguro: remito_0001_Juan_Perez.pdf
        const nombreSeguro = (customerName.value || 'cliente').replace(/\s+/g, '_');
        enlace.href = url;
        enlace.download = `remito_${numeroRemito}_${nombreSeguro}.pdf`;
        enlace.click();
        
        URL.revokeObjectURL(url); // Libera memoria
    };

    // Configura envío por WhatsApp
    btnWhatsAppLink.onclick = () => {
        if (carrito.length === 0) {
            alert('Agregá al menos un producto antes de enviar por WhatsApp.');
            return;
        }

        const mensaje = construirMensajeWhatsApp(numeroRemito);
        const numeroWhatsApp = "5491141615828"; // Número de WhatsApp (cambiar por el deseado)
        const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
        
        window.open(urlWhatsApp, '_blank'); // Abre en nueva pestaña
    };
}

/**
 * Construye el mensaje para compartir por WhatsApp
 * @param {string} numeroRemito - Número del remito
 * @returns {string} Mensaje formateado para WhatsApp
 */
function construirMensajeWhatsApp(numeroRemito) {
    return [
        ' *Nuevo pedido / Remito:*',
        '',
        ` *Cliente:* ${customerName.value || 'No especificado'}`,
        ` *Teléfono:* ${customerPhone.value || '-'}`,
        ` *Dirección:* ${address.value || '-'}`,
        '',
        ' *Productos:*',
        ...carrito.map(producto => 
            `- ${producto.cantidad} × ${producto.producto} ($${producto.precio}) = $${(producto.cantidad * producto.precio).toFixed(2)}`
        ),
        '',
        ` *Total:* $${carrito.reduce((total, producto) => total + producto.cantidad * producto.precio, 0).toFixed(2)}`,
        notes.value ? ` *Nota:* ${notes.value}` : '',
        '',
        `Remito Nº: ${numeroRemito}`,
        '',
        'Pedido generado desde la web de la distribuidora'
    ].join('\n');
}

// ===== CONFIGURACIÓN DE EVENT LISTENERS =====

// Evento para agregar productos al carrito
addProductBtn.addEventListener('click', agregarProductoAlCarrito);

// Evento para generar PDF
btnGenerate.addEventListener('click', generarPdf);

// Actualiza la previsualización en tiempo real cuando se escriben los campos
[customerName, customerPhone, address, notes].forEach(elemento => {
    elemento.addEventListener('input', renderizarPrevisualizacion);
});

// ===== INICIALIZACIÓN =====

// Cargar el catálogo cuando se inicia la página
cargarCatalogo();

// Renderizar previsualización inicial
renderizarPrevisualizacion();
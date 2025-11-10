// pedidos.js - Remito X integrado
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

let catalogo = [];
let carrito = [];
let lastPdfBlob = null;

// Numeración automática guardada en localStorage
let numeroRemito = parseInt(localStorage.getItem('numeroRemito') || '1');

function obtenerNumeroRemito() {
  const actual = numeroRemito;
  numeroRemito++;
  localStorage.setItem('numeroRemito', numeroRemito);
  return String(actual).padStart(4, '0'); // 0001, 0002...
}

// Cargar catálogo desde Google Sheets (backend) - no tocar si ya funciona
async function cargarCatalogo() {
    try {
        const res = await fetch('/api/catalogo');
        catalogo = await res.json();
        productSelect.innerHTML = '';
        catalogo.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.producto;
            opt.textContent = `${item.producto} - $${item.precio}`;
            opt.dataset.precio = item.precio;
            productSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Error cargando catálogo:', err);
        productSelect.innerHTML = '<option disabled>Error cargando catálogo</option>';
    }
}
cargarCatalogo();

// Agregar productos al carrito
addProductBtn.addEventListener('click', () => {
    const producto = productSelect.value;
    if (!producto) return alert('Seleccioná un producto.');
    const precio = parseFloat(productSelect.selectedOptions[0].dataset.precio) || 0;
    const cantidad = parseFloat(quantityInput.value) || 1;

    const existente = carrito.find(p => p.producto === producto);
    if (existente) {
        existente.cantidad += cantidad;
    } else {
        carrito.push({ producto, cantidad, precio });
    }

    renderCarrito();
    renderPreview();
});

// Render de la lista de items (panel lateral)
function renderCarrito() {
    itemsList.innerHTML = '';
    if (carrito.length === 0) {
        itemsList.innerHTML = '<div class="empty">No hay productos agregados.</div>';
        btnDownload.disabled = true;
        btnWhatsAppLink.disabled = true;
        return;
    }

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

    // Activar botones de eliminar
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const index = Number(e.target.dataset.index);
            if (!Number.isNaN(index)) {
                carrito.splice(index, 1); // elimina el producto del carrito
                renderCarrito();
                renderPreview();
            }
        });
    });
}

// Previsualizar pedido - ahora como REMITO X
function renderPreview() {
    let total = carrito.reduce((sum, p) => sum + p.cantidad * p.precio, 0);
    const name = customerName.value || 'Cliente';
    const phone = customerPhone.value || '-';
    const addr = address.value || '-';
    const notesVal = notes.value || '-';

    // Mostrar el número de remito actual (sólo para preview; la numeración final se consumirá al generar el PDF)
    const remitoPreviewNum = String(parseInt(localStorage.getItem('numeroRemito') || numeroRemito)).padStart(4, '0');
    if (remitoNumberEl) remitoNumberEl.textContent = remitoPreviewNum;

    let itemsHtml = carrito.map(p =>
        `<div class="preview-row"><div>${p.cantidad} × ${p.producto}</div><div>$${(p.cantidad * p.precio).toFixed(2)}</div></div>`
    ).join('');

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

// Escape simple para evitar inyección de HTML desde inputs
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

// Actualizar preview al escribir
[customerName, customerPhone, address, notes].forEach(el =>
    el.addEventListener('input', renderPreview)
);

// Generar PDF (consume la numeración real del remito)
btnGenerate.addEventListener('click', async () => {
    if (carrito.length === 0) return alert('Agregá al menos un producto.');
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generando...';

    // Consumir número de remito (se incrementa y se guarda)
    const remitoN = obtenerNumeroRemito();
    if (remitoNumberEl) remitoNumberEl.textContent = remitoN;

    // Actualizar la preview visible con el número definitivo antes de generar el PDF
    renderPreview();

    try {
        const node = document.getElementById('orderPreview');
        // Aumentar escala para mejor resolución
        const canvas = await html2canvas(node, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pageWidth - 60;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 30, 40, imgWidth, imgHeight);

        const blob = pdf.output('blob');
        lastPdfBlob = blob;

        btnDownload.disabled = false;
        btnWhatsAppLink.disabled = false;

        // Descargar
        btnDownload.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeName = (customerName.value || 'cliente').replace(/\s+/g, '_');
            a.href = url;
            a.download = `remito_${remitoN}_${safeName}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        };

        // Enviar por WhatsApp (texto + link opcional)
        btnWhatsAppLink.onclick = () => {
            if (carrito.length === 0) {
                alert('Agregá al menos un producto antes de enviar por WhatsApp.');
                return;
            }

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
            const waUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
            window.open(waUrl, '_blank');
        };

        alert('✅ Remito (PDF) generado correctamente.');
    } catch (err) {
        console.error(err);
        alert('Error generando PDF: ' + (err.message || err));
        // Si falla la generación, no perdemos el número: podés decidir si querés decrementarlo.
    } finally {
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Generar PDF';
        renderPreview(); // volver a mostrar preview actual
    }
});

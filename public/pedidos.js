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

let catalogo = [];
let carrito = [];
let lastPdfBlob = null;

// Cargar catálogo desde Google Sheets (backend)
async function cargarCatalogo() {
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
}
cargarCatalogo();

//  Agregar productos
addProductBtn.addEventListener('click', () => {
    const producto = productSelect.value;
    const precio = parseFloat(productSelect.selectedOptions[0].dataset.precio);
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

function renderCarrito() {
    itemsList.innerHTML = '';
    carrito.forEach((item, index) => {
        const row = document.createElement('div');
        row.classList.add('item-row');
        row.innerHTML = `
            <div>${item.cantidad} × ${item.producto}</div>
            <div>$${(item.cantidad * item.precio).toFixed(2)}</div>
        `;
        itemsList.appendChild(row);
    });
}

// Previsualizar pedido
function renderPreview() {
    let total = carrito.reduce((sum, p) => sum + p.cantidad * p.precio, 0);
    const name = customerName.value || 'Cliente';
    const phone = customerPhone.value || '';
    const addr = address.value || '';
    const notesVal = notes.value || '';

    let itemsHtml = carrito.map(p =>
        `<div class="preview-row"><div>${p.cantidad} × ${p.producto}</div><div>$${(p.cantidad * p.precio).toFixed(2)}</div></div>`
    ).join('');

    previewContent.innerHTML = `
        <div><strong>${name}</strong></div>
        <div class="small">${phone}</div>
        <div class="small">${addr}</div>
        <hr />
        ${itemsHtml}
        <div class="preview-row"><strong>Total</strong><strong>$${total.toFixed(2)}</strong></div>
        <hr />
        <div class="small">Nota: ${notesVal}</div>
        <div class="small" style="margin-top:.5rem">Generado: ${new Date().toLocaleString()}</div>
    `;
}

[customerName, customerPhone, address, notes].forEach(el =>
    el.addEventListener('input', renderPreview)
);

// Generar PDF
btnGenerate.addEventListener('click', async () => {
    if (carrito.length === 0) return alert('Agregá al menos un producto.');
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generando...';
    try {
        const node = document.getElementById('orderPreview');
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

        btnDownload.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pedido_${(customerName.value || 'cliente').replace(/\s+/g, '_')}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        };

        btnWhatsAppLink.onclick = () => {
            if (carrito.length === 0) {
                alert('Agregá al menos un producto antes de enviar por WhatsApp.');
                return;
            }

            const mensaje = [
                ' *Nuevo pedido:*',
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
                'Pedido generado desde la web de la distribuidora '
            ].join('\n');
            const waUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

            console.log('Abriendo WhatsApp con:', waUrl);
            window.open(waUrl, '_blank'); 
        };


        alert('✅ PDF generado correctamente.');
        } catch (err) {
            alert('Error generando PDF: ' + err.message);
        } finally {
            btnGenerate.disabled = false;
            btnGenerate.textContent = 'Generar PDF';
        }
});

function renderCarrito() {
    itemsList.innerHTML = '';

    carrito.forEach((item, index) => {
        const row = document.createElement('div');
        row.classList.add('item-row');
        row.innerHTML = `
            <div>${item.cantidad} × ${item.producto}</div>
            <div>
                $${(item.cantidad * item.precio).toFixed(2)}
                <button class="remove-btn" data-index="${index}">✕</button>
            </div>
        `;
        itemsList.appendChild(row);

        if (carrito.length === 0) {
            btnDownload.disabled = true;
            btnWhatsAppLink.disabled = true;
        }

    });

    // Activar botones de eliminar
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const index = e.target.dataset.index;
            carrito.splice(index, 1); // elimina el producto del carrito
            renderCarrito();
            renderPreview();
        });
    });
}

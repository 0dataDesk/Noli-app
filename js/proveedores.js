const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const EXTENSIONES_ARCHIVO_PERMITIDAS = ['pdf', 'xlsx', 'xls'];
const MAX_ARCHIVOS_PROVEEDOR = 3;

const vistaLista = document.getElementById('vista-lista');
const vistaDetalle = document.getElementById('vista-detalle');
const contenidoLista = document.getElementById('contenido-lista');
const buscador = document.getElementById('buscador');
const pageTitle = document.getElementById('page-title');
const topLink = document.getElementById('top-link');

const modalOverlay = document.getElementById('modal-overlay');
const formProveedor = document.getElementById('form-proveedor');

const modalPrecioOverlay = document.getElementById('modal-precio-overlay');
const modalPrecioTitle = document.getElementById('modal-precio-title');
const formPrecio = document.getElementById('form-precio');

const modalArchivoOverlay = document.getElementById('modal-archivo-overlay');
const formArchivo = document.getElementById('form-archivo');

let proveedoresCache = [];
let proveedorActualId = null;
let insumosParaSelector = [];
let insumosByIdSelector = {};

// ---------- Routing ----------

function rutaActual() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('proveedor/')) {
    return { vista: 'detalle', id: hash.slice('proveedor/'.length) };
  }
  return { vista: 'lista' };
}

window.addEventListener('hashchange', render);

function render() {
  const ruta = rutaActual();
  if (ruta.vista === 'detalle') {
    vistaLista.hidden = true;
    vistaDetalle.hidden = false;
    pageTitle.textContent = 'Proveedor';
    topLink.textContent = '← Proveedores';
    topLink.href = '#';
    renderDetalle(ruta.id);
  } else {
    vistaLista.hidden = false;
    vistaDetalle.hidden = true;
    pageTitle.textContent = 'Proveedores';
    topLink.textContent = '← Inicio';
    topLink.href = 'index.html';
    renderLista();
  }
}

// ---------- Vista lista ----------

async function cargarProveedores() {
  const { data, error } = await supabaseClient
    .from('proveedores')
    .select('*')
    .eq('activo', true)
    .order('nombre_corto', { ascending: true });

  if (error) {
    contenidoLista.innerHTML = `<div class="empty-state">Error al cargar proveedores: ${error.message}</div>`;
    return;
  }

  proveedoresCache = data;
}

function renderLista() {
  contenidoLista.innerHTML = '<div class="loading">Cargando proveedores…</div>';
  cargarProveedores().then(() => pintarLista(proveedoresCache));
}

function pintarLista(lista) {
  if (lista.length === 0) {
    contenidoLista.innerHTML = '<div class="empty-state">No se encontraron proveedores.</div>';
    return;
  }

  const cards = lista.map((p) => {
    const contacto = [p.contacto_nombre, p.telefono, p.email].filter(Boolean).join(' · ');
    return `
      <a class="proveedor-card" href="#proveedor/${p.id}">
        <h3>${p.nombre_corto}</h3>
        <p class="proveedor-contacto" style="margin:0;">${p.nombre}</p>
        ${contacto ? `<p class="proveedor-contacto">${contacto}</p>` : ''}
      </a>
    `;
  }).join('');

  contenidoLista.innerHTML = `<div class="proveedor-grid">${cards}</div>`;
}

buscador.addEventListener('input', () => {
  const q = buscador.value.trim().toLowerCase();
  const filtrados = q
    ? proveedoresCache.filter((p) => p.nombre.toLowerCase().includes(q) || p.nombre_corto.toLowerCase().includes(q))
    : proveedoresCache;
  pintarLista(filtrados);
});

async function siguienteIdProveedor() {
  const { data, error } = await supabaseClient
    .from('proveedores')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 'PROV-001';

  const maxNum = parseInt(data[0].id.split('-')[1], 10);
  const siguiente = (maxNum + 1).toString().padStart(3, '0');
  return `PROV-${siguiente}`;
}

document.getElementById('btn-nuevo').addEventListener('click', () => {
  formProveedor.reset();
  modalOverlay.hidden = false;
});

document.getElementById('btn-cancelar').addEventListener('click', () => { modalOverlay.hidden = true; });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.hidden = true; });

formProveedor.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    id: await siguienteIdProveedor(),
    nombre: document.getElementById('f-nombre').value.trim(),
    nombre_corto: document.getElementById('f-nombre-corto').value.trim(),
    contacto_nombre: document.getElementById('f-contacto').value.trim() || null,
    telefono: document.getElementById('f-telefono').value.trim() || null,
    email: document.getElementById('f-email').value.trim() || null,
    notas: document.getElementById('f-notas').value.trim() || null,
    activo: true,
  };

  const { error } = await supabaseClient.from('proveedores').insert(payload);
  if (error) {
    alert(`Error al crear proveedor: ${error.message}`);
    return;
  }

  modalOverlay.hidden = true;
  renderLista();
});

// ---------- Vista detalle ----------

async function renderDetalle(id) {
  vistaDetalle.innerHTML = '<div class="loading">Cargando proveedor…</div>';

  const [{ data: proveedor, error: errP }, { data: precios, error: errPr }, { data: archivos, error: errA }, { data: insumosActivos, error: errI }] = await Promise.all([
    supabaseClient.from('proveedores').select('*').eq('id', id).single(),
    supabaseClient.from('precios_proveedores').select('*').eq('proveedor_id', id).order('insumo_id', { ascending: true }),
    supabaseClient.from('proveedor_archivos').select('*').eq('proveedor_id', id).order('created_at', { ascending: true }),
    supabaseClient.from('insumos').select('id, nombre, unidad_medida').eq('activo', true).order('nombre', { ascending: true }),
  ]);

  if (errP || !proveedor) {
    vistaDetalle.innerHTML = '<div class="empty-state">No se encontró el proveedor.</div>';
    return;
  }
  if (errPr || errA || errI) {
    vistaDetalle.innerHTML = '<div class="empty-state">Error al cargar datos del proveedor.</div>';
    return;
  }

  insumosParaSelector = insumosActivos;
  insumosByIdSelector = {};
  insumosActivos.forEach((i) => { insumosByIdSelector[i.id] = i; });

  pintarDetalle(proveedor, precios, archivos);
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span class="meta-label">${label}</span>
      <span class="meta-value">${value}</span>
    </div>
  `;
}

function filaPrecioHtml(pr) {
  const insumo = insumosByIdSelector[pr.insumo_id] || { nombre: '(insumo inactivo)', unidad_medida: '' };
  const costoUnitario = pr.cantidad_base > 0 ? pr.costo_presentacion / pr.cantidad_base : null;
  const hoy = new Date().toISOString().slice(0, 10);
  const vigente = !pr.fecha_fin || pr.fecha_fin >= hoy;
  const estadoBadge = !pr.activo
    ? '<span class="badge badge-inactivo">Inactivo</span>'
    : (vigente ? '<span class="badge badge-vigente">Vigente</span>' : '<span class="badge badge-vencido">Vencido</span>');

  return `
    <tr class="${pr.activo ? '' : 'inactive'}">
      <td>${insumo.nombre}</td>
      <td>${pr.presentacion}</td>
      <td>${pr.cantidad_base} ${insumo.unidad_medida}</td>
      <td>${moneyFmt.format(pr.costo_presentacion)}</td>
      <td>${costoUnitario != null ? `${moneyFmt.format(costoUnitario)}/${insumo.unidad_medida}` : '—'}</td>
      <td>${pr.fecha_inicio}</td>
      <td>${pr.fecha_fin || '—'}</td>
      <td>${estadoBadge}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn-ghost btn-sm precio-editar" data-id="${pr.id}">Editar</button>
        ${pr.activo ? `<button type="button" class="btn-ghost btn-sm precio-inactivar" data-id="${pr.id}">Inactivar</button>` : ''}
      </td>
    </tr>
  `;
}

function filaArchivoHtml(a) {
  return `
    <div class="ingrediente-row" data-id="${a.id}" style="grid-template-columns:1fr auto auto;align-items:center;">
      <div>
        ${a.nombre_archivo}
        <div style="font-size:12px;color:var(--text-muted);">Vigente hasta: ${a.fecha_vigencia}</div>
      </div>
      <button type="button" class="btn-ghost btn-sm archivo-ver" data-path="${a.storage_path}">Ver</button>
      <button type="button" class="btn-ghost btn-sm archivo-eliminar" data-id="${a.id}" data-path="${a.storage_path}">Eliminar</button>
    </div>
  `;
}

function pintarDetalle(proveedor, precios, archivos) {
  const filasPrecios = precios.map(filaPrecioHtml).join('')
    || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Sin precios capturados.</td></tr>';

  const filasArchivos = archivos.map(filaArchivoHtml).join('')
    || '<p style="color:var(--text-muted);font-size:14px;">Sin archivos subidos.</p>';

  const archivosLlenos = archivos.length >= MAX_ARCHIVOS_PROVEEDOR;

  vistaDetalle.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h2>${proveedor.nombre_corto}</h2>
      <p style="color:var(--text-muted);margin-top:4px;">${proveedor.nombre}</p>
      <div class="meta-list">
        ${proveedor.contacto_nombre ? metaItem('Contacto', proveedor.contacto_nombre) : ''}
        ${proveedor.telefono ? metaItem('Teléfono', proveedor.telefono) : ''}
        ${proveedor.email ? metaItem('Email', proveedor.email) : ''}
      </div>
      ${proveedor.notas ? `<p style="margin-top:16px;color:var(--text-muted);font-size:14px;">${proveedor.notas}</p>` : ''}
    </div>

    <div class="card" style="margin-bottom:20px;overflow-x:auto;">
      <div class="toolbar" style="margin-bottom:12px;">
        <div class="section-title" style="margin:0;">Precios</div>
        <div class="spacer"></div>
        <button type="button" class="btn-primary btn-sm" id="btn-agregar-precio">+ Agregar precio</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Insumo</th><th>Presentación</th><th>Cant. base</th><th>Costo present.</th>
            <th>Costo unitario</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>${filasPrecios}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="toolbar" style="margin-bottom:12px;">
        <div class="section-title" style="margin:0;">Archivos (listas de precios)</div>
        <div class="spacer"></div>
        <button type="button" class="btn-primary btn-sm" id="btn-subir-archivo" ${archivosLlenos ? 'disabled' : ''}>+ Subir archivo</button>
      </div>
      ${archivosLlenos ? '<p style="font-size:13px;color:var(--amber);margin-top:0;">Máximo 3 archivos — elimina uno para subir otro.</p>' : ''}
      <div id="lista-archivos">${filasArchivos}</div>
    </div>
  `;

  attachDetalleHandlers(proveedor.id, precios, archivos.length);
}

function attachDetalleHandlers(proveedorId, precios, archivosCount) {
  document.getElementById('btn-agregar-precio').addEventListener('click', () => abrirModalPrecio(proveedorId));

  document.querySelectorAll('.precio-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pr = precios.find((p) => String(p.id) === btn.dataset.id);
      abrirModalPrecio(proveedorId, pr);
    });
  });

  document.querySelectorAll('.precio-inactivar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Inactivar este precio? No se eliminará.')) return;
      const { error } = await supabaseClient.from('precios_proveedores').update({ activo: false }).eq('id', btn.dataset.id);
      if (error) { alert(`Error al inactivar: ${error.message}`); return; }
      renderDetalle(proveedorId);
    });
  });

  document.getElementById('btn-subir-archivo').addEventListener('click', () => abrirModalArchivo(proveedorId, archivosCount));

  document.querySelectorAll('.archivo-ver').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { data, error } = await supabaseClient.storage.from('listas_precios').createSignedUrl(btn.dataset.path, 60);
      if (error) { alert(`No se pudo abrir el archivo: ${error.message}`); return; }
      window.open(data.signedUrl, '_blank');
    });
  });

  document.querySelectorAll('.archivo-eliminar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este archivo?')) return;
      const { error: errStorage } = await supabaseClient.storage.from('listas_precios').remove([btn.dataset.path]);
      if (errStorage) { alert(`Error al eliminar el archivo: ${errStorage.message}`); return; }
      const { error: errDb } = await supabaseClient.from('proveedor_archivos').delete().eq('id', btn.dataset.id);
      if (errDb) { alert(`Error al eliminar el registro: ${errDb.message}`); return; }
      renderDetalle(proveedorId);
    });
  });
}

// ---------- Modal: agregar/editar precio ----------

function poblarSelectInsumos(filtro) {
  const q = (filtro || '').trim().toLowerCase();
  const lista = q ? insumosParaSelector.filter((i) => i.nombre.toLowerCase().includes(q)) : insumosParaSelector;
  const select = document.getElementById('np-insumo-select');
  select.innerHTML = lista.length
    ? lista.map((i) => `<option value="${i.id}">${i.nombre} (${i.unidad_medida})</option>`).join('')
    : '<option value="">Sin resultados</option>';
  actualizarUnidadCantidadBase();
}

function actualizarUnidadCantidadBase() {
  const select = document.getElementById('np-insumo-select');
  const insumo = insumosByIdSelector[select.value];
  document.getElementById('np-cantidad-base-unidad').textContent = insumo ? `(en ${insumo.unidad_medida})` : '';
}

document.getElementById('np-insumo-buscar').addEventListener('input', (e) => poblarSelectInsumos(e.target.value));
document.getElementById('np-insumo-select').addEventListener('change', actualizarUnidadCantidadBase);

function abrirModalPrecio(proveedorId, precioExistente) {
  proveedorActualId = proveedorId;
  formPrecio.reset();
  document.getElementById('np-id').value = precioExistente ? precioExistente.id : '';
  modalPrecioTitle.textContent = precioExistente ? 'Editar precio' : 'Agregar precio';
  document.getElementById('np-insumo-buscar').value = '';
  poblarSelectInsumos('');

  if (precioExistente) {
    document.getElementById('np-insumo-select').value = precioExistente.insumo_id;
    document.getElementById('np-presentacion').value = precioExistente.presentacion;
    document.getElementById('np-cantidad-base').value = precioExistente.cantidad_base;
    document.getElementById('np-costo').value = precioExistente.costo_presentacion;
    document.getElementById('np-fecha-inicio').value = precioExistente.fecha_inicio;
    document.getElementById('np-fecha-fin').value = precioExistente.fecha_fin || '';
  } else {
    document.getElementById('np-fecha-inicio').value = new Date().toISOString().slice(0, 10);
  }

  actualizarUnidadCantidadBase();
  modalPrecioOverlay.hidden = false;
}

document.getElementById('btn-cancelar-precio').addEventListener('click', () => { modalPrecioOverlay.hidden = true; });
modalPrecioOverlay.addEventListener('click', (e) => { if (e.target === modalPrecioOverlay) modalPrecioOverlay.hidden = true; });

formPrecio.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('np-id').value;
  const insumoId = document.getElementById('np-insumo-select').value;
  if (!insumoId) { alert('Selecciona un insumo.'); return; }

  const payload = {
    proveedor_id: proveedorActualId,
    insumo_id: insumoId,
    presentacion: document.getElementById('np-presentacion').value.trim(),
    cantidad_base: parseFloat(document.getElementById('np-cantidad-base').value),
    costo_presentacion: parseFloat(document.getElementById('np-costo').value),
    fecha_inicio: document.getElementById('np-fecha-inicio').value,
    fecha_fin: document.getElementById('np-fecha-fin').value || null,
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from('precios_proveedores').update(payload).eq('id', id));
  } else {
    payload.activo = true;
    ({ error } = await supabaseClient.from('precios_proveedores').insert(payload));
  }

  if (error) {
    alert(`Error al guardar el precio: ${error.message}`);
    return;
  }

  modalPrecioOverlay.hidden = true;
  renderDetalle(proveedorActualId);
});

// ---------- Modal: subir archivo ----------

function abrirModalArchivo(proveedorId, archivosCountActual) {
  if (archivosCountActual >= MAX_ARCHIVOS_PROVEEDOR) {
    alert('Máximo 3 archivos — elimina uno para subir otro.');
    return;
  }
  proveedorActualId = proveedorId;
  formArchivo.reset();
  document.getElementById('fa-vigencia').value = new Date().toISOString().slice(0, 10);
  modalArchivoOverlay.hidden = false;
}

document.getElementById('btn-cancelar-archivo').addEventListener('click', () => { modalArchivoOverlay.hidden = true; });
modalArchivoOverlay.addEventListener('click', (e) => { if (e.target === modalArchivoOverlay) modalArchivoOverlay.hidden = true; });

formArchivo.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('fa-file');
  const file = fileInput.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!EXTENSIONES_ARCHIVO_PERMITIDAS.includes(ext)) {
    alert('Solo se aceptan archivos PDF, XLSX o XLS.');
    return;
  }

  const btnGuardar = document.getElementById('btn-guardar-archivo');
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Subiendo…';

  // Revalida el límite justo antes de subir (no solo el estado visual del botón),
  // por si se subió un archivo desde otra pestaña/sesión mientras este modal estaba abierto.
  const { count, error: errCount } = await supabaseClient
    .from('proveedor_archivos')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor_id', proveedorActualId);

  if (errCount) {
    alert(`Error al validar archivos existentes: ${errCount.message}`);
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Subir';
    return;
  }

  if (count >= MAX_ARCHIVOS_PROVEEDOR) {
    alert('Máximo 3 archivos — elimina uno para subir otro.');
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Subir';
    modalArchivoOverlay.hidden = true;
    renderDetalle(proveedorActualId);
    return;
  }

  const path = `${proveedorActualId}/${file.name}`;
  const { error: errUpload } = await supabaseClient.storage.from('listas_precios').upload(path, file, { upsert: true });

  if (errUpload) {
    alert(`Error al subir el archivo: ${errUpload.message}`);
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Subir';
    return;
  }

  const { error: errDb } = await supabaseClient.from('proveedor_archivos').insert({
    proveedor_id: proveedorActualId,
    nombre_archivo: file.name,
    storage_path: path,
    fecha_vigencia: document.getElementById('fa-vigencia').value,
  });

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Subir';

  if (errDb) {
    alert(`Error al registrar el archivo: ${errDb.message}`);
    return;
  }

  modalArchivoOverlay.hidden = true;
  renderDetalle(proveedorActualId);
});

(async () => {
  const session = await requireSession();
  if (!session) return;
  wireSessionUI(session);
  render();
})();

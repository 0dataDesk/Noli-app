const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const numFmt = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EXTENSIONES_ARCHIVO_PERMITIDAS = ['pdf', 'xlsx', 'xls'];
const MAX_ARCHIVOS_PROVEEDOR = 3;

const vistaLista = document.getElementById('vista-lista');
const vistaDetalle = document.getElementById('vista-detalle');
const vistaPedido = document.getElementById('vista-pedido');
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
let precioEnEdicion = null;
let insumosParaSelector = [];
let insumosByIdSelector = {};
let pedidoBuilderState = null;

// ---------- Routing ----------

function rutaActual() {
  const hash = location.hash.replace(/^#\/?/, '');
  const partes = hash.split('/');
  if (partes[0] === 'proveedor' && partes[1]) {
    if (partes[2] === 'pedido' && partes[3]) {
      return { vista: 'pedido', proveedorId: partes[1], pedidoId: partes[3] };
    }
    return { vista: 'detalle', id: partes[1] };
  }
  return { vista: 'lista' };
}

window.addEventListener('hashchange', render);

function render() {
  const ruta = rutaActual();
  if (ruta.vista === 'pedido') {
    vistaLista.hidden = true;
    vistaDetalle.hidden = true;
    vistaPedido.hidden = false;
    pageTitle.textContent = 'Pedido';
    topLink.textContent = '← Proveedor';
    topLink.href = `#proveedor/${ruta.proveedorId}`;
    renderPedido(ruta.proveedorId, ruta.pedidoId);
  } else if (ruta.vista === 'detalle') {
    vistaLista.hidden = true;
    vistaDetalle.hidden = false;
    vistaPedido.hidden = true;
    pageTitle.textContent = 'Proveedor';
    topLink.textContent = '← Proveedores';
    topLink.href = '#';
    renderDetalle(ruta.id);
  } else {
    vistaLista.hidden = false;
    vistaDetalle.hidden = true;
    vistaPedido.hidden = true;
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

  const [{ data: proveedor, error: errP }, { data: precios, error: errPr }, { data: archivos, error: errA }, { data: insumosActivos, error: errI }, { data: pedidos, error: errPe }] = await Promise.all([
    supabaseClient.from('proveedores').select('*').eq('id', id).single(),
    supabaseClient.from('precios_proveedores').select('*').eq('proveedor_id', id).order('insumo_id', { ascending: true }),
    supabaseClient.from('proveedor_archivos').select('*').eq('proveedor_id', id).order('created_at', { ascending: true }),
    supabaseClient.from('insumos').select('id, nombre, unidad_medida').eq('activo', true).order('nombre', { ascending: true }),
    supabaseClient.from('v_pedido_resumen').select('*').eq('proveedor_id', id).order('fecha_pedido', { ascending: false }),
  ]);

  if (errP || !proveedor) {
    vistaDetalle.innerHTML = '<div class="empty-state">No se encontró el proveedor.</div>';
    return;
  }
  if (errPr || errA || errI || errPe) {
    vistaDetalle.innerHTML = '<div class="empty-state">Error al cargar datos del proveedor.</div>';
    return;
  }

  insumosParaSelector = insumosActivos;
  insumosByIdSelector = {};
  insumosActivos.forEach((i) => { insumosByIdSelector[i.id] = i; });

  pintarDetalle(proveedor, precios, archivos, pedidos || []);
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span class="meta-label">${label}</span>
      <span class="meta-value">${value}</span>
    </div>
  `;
}

function badgeClasePedido(estado) {
  return { Borrador: 'badge-inactivo', Enviado: 'badge-pendiente', Recibido: 'badge-vigente', Cancelado: 'badge-vencido' }[estado] || 'badge-inactivo';
}

function filaPedidoHtml(p) {
  return `
    <tr>
      <td>${p.fecha_pedido}</td>
      <td><span class="badge ${badgeClasePedido(p.estado)}">${p.estado}</span></td>
      <td>$${numFmt(p.total_pedido || 0)}</td>
      <td><a class="btn-ghost btn-sm" href="#proveedor/${p.proveedor_id}/pedido/${p.id}">Ver/Editar</a></td>
    </tr>
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
      <td>${numFmt(pr.cantidad_base)} ${insumo.unidad_medida}</td>
      <td>$${numFmt(pr.costo_presentacion)}</td>
      <td>${costoUnitario != null ? `$${numFmt(costoUnitario)}/${insumo.unidad_medida}` : '—'}</td>
      <td>${estadoBadge}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn-ghost btn-sm precio-editar" data-id="${pr.id}">Editar</button>
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

function pintarDetalle(proveedor, precios, archivos, pedidos) {
  const filasPrecios = precios.map(filaPrecioHtml).join('')
    || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Sin precios capturados.</td></tr>';

  const filasArchivos = archivos.map(filaArchivoHtml).join('')
    || '<p style="color:var(--text-muted);font-size:14px;">Sin archivos subidos.</p>';

  const filasPedidos = pedidos.map(filaPedidoHtml).join('')
    || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Sin pedidos capturados.</td></tr>';

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
            <th>Costo unitario</th><th>Estado</th><th></th>
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

    <div class="card" style="margin-top:20px;overflow-x:auto;">
      <div class="toolbar" style="margin-bottom:12px;">
        <div class="section-title" style="margin:0;">Pedidos</div>
        <div class="spacer"></div>
        <button type="button" class="btn-primary btn-sm" id="btn-nuevo-pedido">+ Nuevo pedido</button>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Estado</th><th>Total</th><th></th></tr></thead>
        <tbody>${filasPedidos}</tbody>
      </table>
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

  document.getElementById('btn-subir-archivo').addEventListener('click', () => abrirModalArchivo(proveedorId, archivosCount));

  document.getElementById('btn-nuevo-pedido').addEventListener('click', () => {
    location.hash = `#proveedor/${proveedorId}/pedido/nuevo`;
  });

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

const btnInactivarPrecio = document.getElementById('btn-inactivar-precio');

function abrirModalPrecio(proveedorId, precioExistente) {
  proveedorActualId = proveedorId;
  precioEnEdicion = precioExistente || null;
  formPrecio.reset();
  document.getElementById('np-id').value = precioExistente ? precioExistente.id : '';
  modalPrecioTitle.textContent = precioExistente ? 'Editar precio' : 'Agregar precio';
  document.getElementById('np-insumo-buscar').value = '';
  poblarSelectInsumos('');

  btnInactivarPrecio.hidden = !precioExistente;

  if (precioExistente) {
    document.getElementById('np-insumo-select').value = precioExistente.insumo_id;
    document.getElementById('np-presentacion').value = precioExistente.presentacion;
    document.getElementById('np-cantidad-base').value = precioExistente.cantidad_base;
    document.getElementById('np-costo').value = precioExistente.costo_presentacion;
    document.getElementById('np-fecha-inicio').value = precioExistente.fecha_inicio;
    document.getElementById('np-fecha-fin').value = precioExistente.fecha_fin || '';
    btnInactivarPrecio.textContent = precioExistente.activo ? 'Inactivar' : 'Reactivar';
  } else {
    document.getElementById('np-fecha-inicio').value = new Date().toISOString().slice(0, 10);
  }

  actualizarUnidadCantidadBase();
  modalPrecioOverlay.hidden = false;
}

document.getElementById('btn-cancelar-precio').addEventListener('click', () => { modalPrecioOverlay.hidden = true; });
modalPrecioOverlay.addEventListener('click', (e) => { if (e.target === modalPrecioOverlay) modalPrecioOverlay.hidden = true; });

btnInactivarPrecio.addEventListener('click', async () => {
  if (!precioEnEdicion) return;

  const activarse = !precioEnEdicion.activo;
  const mensaje = activarse
    ? '¿Reactivar este precio?'
    : '¿Inactivar este precio? No se eliminará.';
  if (!confirm(mensaje)) return;

  const { error } = await supabaseClient.from('precios_proveedores').update({ activo: activarse }).eq('id', precioEnEdicion.id);
  if (error) {
    alert(`Error al actualizar estado: ${error.message}`);
    return;
  }

  modalPrecioOverlay.hidden = true;
  renderDetalle(proveedorActualId);
});

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

// ---------- Vista pedido (builder / pedido guardado) ----------

async function renderPedido(proveedorId, pedidoId) {
  vistaPedido.innerHTML = '<div class="loading">Cargando…</div>';

  const { data: proveedor, error: errP } = await supabaseClient.from('proveedores').select('*').eq('id', proveedorId).single();
  if (errP || !proveedor) {
    vistaPedido.innerHTML = '<div class="empty-state">No se encontró el proveedor.</div>';
    return;
  }

  if (pedidoId === 'nuevo') {
    await renderBuilderPedido(proveedor);
  } else {
    await renderPedidoGuardado(proveedor, pedidoId);
  }
}

// ---------- Builder de pedido nuevo ----------

async function renderBuilderPedido(proveedor) {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: precios, error: errPr } = await supabaseClient
    .from('precios_proveedores')
    .select('*')
    .eq('proveedor_id', proveedor.id)
    .eq('activo', true)
    .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`);

  if (errPr) {
    vistaPedido.innerHTML = `<div class="empty-state">Error al cargar precios: ${errPr.message}</div>`;
    return;
  }

  const insumoIds = [...new Set((precios || []).map((p) => p.insumo_id))];
  let insumosDisponibles = [];
  if (insumoIds.length) {
    const { data } = await supabaseClient.from('insumos').select('id, nombre, unidad_medida').in('id', insumoIds).order('nombre', { ascending: true });
    insumosDisponibles = data || [];
  }

  const preciosPorInsumo = {};
  (precios || []).forEach((pr) => {
    if (!preciosPorInsumo[pr.insumo_id]) preciosPorInsumo[pr.insumo_id] = [];
    preciosPorInsumo[pr.insumo_id].push(pr);
  });

  pedidoBuilderState = { proveedor, insumosDisponibles, preciosPorInsumo, lineas: [] };
  pintarBuilderPedido();
}

function pintarBuilderPedido() {
  const { proveedor, insumosDisponibles, lineas } = pedidoBuilderState;

  const opcionesInsumo = insumosDisponibles.map((i) => `<option value="${i.id}">${i.nombre}</option>`).join('');

  const filasLineas = lineas.map((l, idx) => `
    <tr>
      <td>${l.insumoNombre}</td>
      <td>${l.presentacion}</td>
      <td>${l.cantidad}</td>
      <td>$${numFmt(l.subtotal)}</td>
      <td><button type="button" class="btn-ghost btn-sm builder-quitar-linea" data-idx="${idx}">Quitar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Sin líneas agregadas.</td></tr>';

  const total = lineas.reduce((s, l) => s + l.subtotal, 0);

  vistaPedido.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h2>Nuevo pedido — ${proveedor.nombre_corto}</h2>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="section-title" style="margin-top:0;">Agregar insumo</div>
      ${insumosDisponibles.length === 0 ? '<p style="color:var(--text-muted);font-size:14px;">Este proveedor no tiene precios vigentes capturados.</p>' : `
      <div class="field-row">
        <div class="field">
          <label for="bp-insumo">Insumo</label>
          <select id="bp-insumo">
            <option value="">Selecciona…</option>
            ${opcionesInsumo}
          </select>
        </div>
        <div class="field" id="bp-presentacion-box" hidden>
          <label for="bp-presentacion">Presentación</label>
          <select id="bp-presentacion"></select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="bp-cantidad">Cantidad de presentaciones</label>
          <input type="number" id="bp-cantidad" min="1" step="1" value="1" />
        </div>
        <div class="field" style="display:flex;align-items:flex-end;">
          <button type="button" class="btn-primary" id="btn-agregar-linea" style="width:100%;">+ Agregar</button>
        </div>
      </div>
      `}
    </div>

    <div class="card" style="margin-bottom:20px;overflow-x:auto;">
      <div class="section-title" style="margin-top:0;">Líneas del pedido</div>
      <table>
        <thead><tr><th>Insumo</th><th>Presentación</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${filasLineas}</tbody>
      </table>
      <div class="precio-final" style="margin-top:16px;">
        <span class="label">Total</span>
        <span class="value">$${numFmt(total)}</span>
      </div>
    </div>

    <div class="modal-actions" style="justify-content:flex-start;border-top:none;padding-top:0;">
      <button type="button" class="btn-primary" id="btn-guardar-pedido" ${lineas.length === 0 ? 'disabled' : ''}>Guardar pedido</button>
      <button type="button" class="btn-ghost" id="btn-cancelar-pedido">Cancelar</button>
    </div>
  `;

  attachBuilderHandlers();
}

function attachBuilderHandlers() {
  const selInsumo = document.getElementById('bp-insumo');

  if (selInsumo) {
    selInsumo.addEventListener('change', () => {
      const precios = pedidoBuilderState.preciosPorInsumo[selInsumo.value] || [];
      const box = document.getElementById('bp-presentacion-box');
      const selPres = document.getElementById('bp-presentacion');
      if (precios.length > 1) {
        box.hidden = false;
        selPres.innerHTML = precios.map((p) => `<option value="${p.id}">${p.presentacion} — $${numFmt(p.costo_presentacion)}</option>`).join('');
      } else {
        box.hidden = true;
        selPres.innerHTML = precios.length ? `<option value="${precios[0].id}">${precios[0].presentacion}</option>` : '';
      }
    });
  }

  const btnAgregar = document.getElementById('btn-agregar-linea');
  if (btnAgregar) {
    btnAgregar.addEventListener('click', () => {
      const insumoId = selInsumo.value;
      if (!insumoId) { alert('Selecciona un insumo.'); return; }

      const precios = pedidoBuilderState.preciosPorInsumo[insumoId] || [];
      const selPres = document.getElementById('bp-presentacion');
      const precioId = precios.length > 1 ? selPres.value : (precios[0] && precios[0].id);
      const precio = precios.find((p) => String(p.id) === String(precioId));
      if (!precio) { alert('No se encontró el precio seleccionado.'); return; }

      const cantidad = parseFloat(document.getElementById('bp-cantidad').value);
      if (!cantidad || cantidad <= 0) { alert('Ingresa una cantidad válida.'); return; }

      const insumo = pedidoBuilderState.insumosDisponibles.find((i) => i.id === insumoId);

      pedidoBuilderState.lineas.push({
        insumoId,
        insumoNombre: insumo ? insumo.nombre : insumoId,
        precioId: precio.id,
        presentacion: precio.presentacion,
        costoPresentacion: precio.costo_presentacion,
        cantidad,
        subtotal: cantidad * precio.costo_presentacion,
      });

      pintarBuilderPedido();
    });
  }

  document.querySelectorAll('.builder-quitar-linea').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      pedidoBuilderState.lineas.splice(idx, 1);
      pintarBuilderPedido();
    });
  });

  const btnGuardar = document.getElementById('btn-guardar-pedido');
  if (btnGuardar) btnGuardar.addEventListener('click', guardarPedido);

  document.getElementById('btn-cancelar-pedido').addEventListener('click', () => {
    location.hash = `#proveedor/${pedidoBuilderState.proveedor.id}`;
  });
}

async function siguienteIdPedido() {
  const { data, error } = await supabaseClient
    .from('pedidos_proveedor')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 'PED-001';

  const maxNum = parseInt(data[0].id.split('-')[1], 10);
  const siguiente = (maxNum + 1).toString().padStart(3, '0');
  return `PED-${siguiente}`;
}

async function guardarPedido() {
  const { proveedor, lineas } = pedidoBuilderState;
  if (!lineas.length) return;

  const btnGuardar = document.getElementById('btn-guardar-pedido');
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando…';

  const pedidoId = await siguienteIdPedido();

  const { error: errPedido } = await supabaseClient.from('pedidos_proveedor').insert({
    id: pedidoId,
    proveedor_id: proveedor.id,
    fecha_pedido: new Date().toISOString().slice(0, 10),
    estado: 'Borrador',
  });

  if (errPedido) {
    alert(`Error al crear el pedido: ${errPedido.message}`);
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar pedido';
    return;
  }

  // Snapshot: se copian presentación y costo (ya capturados al construir el pedido),
  // nunca una referencia viva a precios_proveedores.
  const itemsPayload = lineas.map((l) => ({
    pedido_id: pedidoId,
    insumo_id: l.insumoId,
    precio_id: l.precioId,
    presentacion_snapshot: l.presentacion,
    costo_presentacion_snapshot: l.costoPresentacion,
    cantidad_presentaciones: l.cantidad,
    activo: true,
  }));

  const { error: errItems } = await supabaseClient.from('pedido_items').insert(itemsPayload);

  if (errItems) {
    alert(`Error al guardar las líneas del pedido: ${errItems.message}`);
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar pedido';
    return;
  }

  location.hash = `#proveedor/${proveedor.id}/pedido/${pedidoId}`;
}

// ---------- Vista de pedido guardado ----------

async function renderPedidoGuardado(proveedor, pedidoId) {
  vistaPedido.innerHTML = '<div class="loading">Cargando pedido…</div>';

  const [{ data: resumen, error: errR }, { data: items, error: errI }] = await Promise.all([
    supabaseClient.from('v_pedido_resumen').select('*').eq('id', pedidoId).single(),
    supabaseClient.from('v_pedido_items_costeo').select('*').eq('pedido_id', pedidoId).order('insumo_nombre', { ascending: true }),
  ]);

  if (errR || !resumen) {
    vistaPedido.innerHTML = '<div class="empty-state">No se encontró el pedido.</div>';
    return;
  }
  if (errI) {
    vistaPedido.innerHTML = `<div class="empty-state">Error al cargar las líneas del pedido: ${errI.message}</div>`;
    return;
  }

  pintarPedidoGuardado(proveedor, resumen, items || []);
}

function construirTextoWhatsapp(proveedor, resumen, items) {
  const lineas = items.map((it) => `- ${it.presentacion_snapshot} x${it.cantidad_presentaciones} — ${it.insumo_nombre}`);
  return [`Pedido para ${proveedor.nombre_corto}`, ...lineas, `Total: $${numFmt(resumen.total_pedido || 0)}`].join('\n');
}

function pintarPedidoGuardado(proveedor, resumen, items) {
  const filasItems = items.map((it) => `
    <tr>
      <td>${it.insumo_nombre}</td>
      <td>${it.presentacion_snapshot}</td>
      <td>${it.cantidad_presentaciones}</td>
      <td>$${numFmt(it.costo_presentacion_snapshot)}</td>
      <td>$${numFmt(it.costo_linea)}</td>
      <td><button type="button" class="btn-ghost btn-sm pedido-item-quitar" data-id="${it.id}">Quitar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Sin líneas.</td></tr>';

  const telefonoLimpio = (resumen.proveedor_telefono || '').replace(/[\s\-()]/g, '');
  const linkWhatsapp = telefonoLimpio ? `https://wa.me/52${telefonoLimpio}` : null;

  vistaPedido.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h2>${resumen.id} — ${proveedor.nombre_corto}</h2>
      <div class="meta-list">
        ${metaItem('Fecha', resumen.fecha_pedido)}
        ${metaItem('Estado', `<span class="badge ${badgeClasePedido(resumen.estado)}">${resumen.estado}</span>`)}
      </div>
      <div class="field" style="margin-top:16px;max-width:240px;">
        <label for="bp-estado">Cambiar estado</label>
        <select id="bp-estado">
          <option value="Borrador" ${resumen.estado === 'Borrador' ? 'selected' : ''}>Borrador</option>
          <option value="Enviado" ${resumen.estado === 'Enviado' ? 'selected' : ''}>Enviado</option>
          <option value="Recibido" ${resumen.estado === 'Recibido' ? 'selected' : ''}>Recibido</option>
          <option value="Cancelado" ${resumen.estado === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div class="modal-actions" style="justify-content:flex-start;border-top:none;padding-top:16px;">
        <button type="button" class="btn-primary btn-sm" id="btn-copiar-whatsapp">Copiar para WhatsApp</button>
        ${linkWhatsapp ? `<a class="btn-ghost btn-sm" href="${linkWhatsapp}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''}
      </div>
    </div>

    <div class="card" style="overflow-x:auto;">
      <div class="section-title" style="margin-top:0;">Líneas del pedido</div>
      <table>
        <thead><tr><th>Insumo</th><th>Presentación</th><th>Cantidad</th><th>Costo unit.</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${filasItems}</tbody>
      </table>
      <div class="precio-final" style="margin-top:16px;">
        <span class="label">Total</span>
        <span class="value">$${numFmt(resumen.total_pedido || 0)}</span>
      </div>
    </div>
  `;

  attachPedidoGuardadoHandlers(proveedor, resumen, items);
}

function attachPedidoGuardadoHandlers(proveedor, resumen, items) {
  document.getElementById('bp-estado').addEventListener('change', async (e) => {
    const nuevoEstado = e.target.value;
    const { error } = await supabaseClient
      .from('pedidos_proveedor')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', resumen.id);
    if (error) { alert(`Error al actualizar estado: ${error.message}`); return; }
    renderPedidoGuardado(proveedor, resumen.id);
  });

  document.getElementById('btn-copiar-whatsapp').addEventListener('click', () => {
    const texto = construirTextoWhatsapp(proveedor, resumen, items);
    navigator.clipboard.writeText(texto).then(() => {
      alert('Texto copiado — pégalo en WhatsApp.');
    }).catch(() => {
      alert('No se pudo copiar automáticamente. Copia el texto manualmente:\n\n' + texto);
    });
  });

  document.querySelectorAll('.pedido-item-quitar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Quitar esta línea del pedido?')) return;
      const { error } = await supabaseClient.from('pedido_items').update({ activo: false }).eq('id', btn.dataset.id);
      if (error) { alert(`Error al quitar la línea: ${error.message}`); return; }
      renderPedidoGuardado(proveedor, resumen.id);
    });
  });
}

(async () => {
  const session = await requireSession();
  if (!session) return;
  wireSessionUI(session);
  render();
})();

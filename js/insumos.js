const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let insumos = [];
let insumoEnEdicion = null;
let soloPendientes = false;
let costoFinalPorInsumo = {};

const contenido = document.getElementById('contenido');
const buscador = document.getElementById('buscador');
const btnSoloPendientes = document.getElementById('btn-solo-pendientes');
const chkMostrarInactivos = document.getElementById('chk-mostrar-inactivos');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const form = document.getElementById('form-insumo');
const fId = document.getElementById('f-id');
const fNombre = document.getElementById('f-nombre');
const fUnidad = document.getElementById('f-unidad');
const fCosto = document.getElementById('f-costo');
const costoEfectivoBox = document.getElementById('costo-efectivo-box');
const costoEfectivoValue = document.getElementById('costo-efectivo-value');
const proveedorPreferidoBox = document.getElementById('proveedor-preferido-box');
const fProveedorPreferido = document.getElementById('f-proveedor-preferido');
const sinPreciosBox = document.getElementById('sin-precios-box');
const notasBox = document.getElementById('notas-revision-box');
const estadoActualBox = document.getElementById('estado-actual-box');
const btnEliminar = document.getElementById('btn-eliminar');

async function cargarInsumos() {
  let query = supabaseClient.from('insumos').select('*').order('nombre', { ascending: true });
  if (!chkMostrarInactivos.checked) {
    query = query.eq('activo', true);
  }

  const [{ data, error }, { data: costosFinal }] = await Promise.all([
    query,
    supabaseClient.from('v_insumo_costo_final').select('insumo_id, proveedor_nombre_corto, fuente'),
  ]);

  if (error) {
    contenido.innerHTML = `<div class="empty-state">Error al cargar insumos: ${error.message}</div>`;
    return;
  }

  costoFinalPorInsumo = {};
  (costosFinal || []).forEach((c) => { costoFinalPorInsumo[c.insumo_id] = c; });

  insumos = data;
  renderAcordeon(aplicarFiltros(insumos));
}

function aplicarFiltros(lista) {
  const q = buscador.value.trim().toLowerCase();
  return lista.filter((i) => {
    if (q && !i.nombre.toLowerCase().includes(q)) return false;
    if (soloPendientes && i.costo_unitario !== null) return false;
    return true;
  });
}

function celdaProveedor(i) {
  const info = costoFinalPorInsumo[i.id];
  if (info && info.fuente === 'proveedor' && info.proveedor_nombre_corto) {
    return info.proveedor_nombre_corto;
  }
  return '<span class="badge badge-pendiente">Falta proveedor</span>';
}

function filaHtml(i) {
  const pendiente = i.costo_unitario === null;
  return `
    <tr data-id="${i.id}" class="${i.activo ? '' : 'inactive'}">
      <td>${i.nombre}</td>
      <td>${i.unidad_medida}</td>
      <td>${pendiente ? '<span class="badge badge-pendiente">Costo pendiente</span>' : moneyFmt.format(i.costo_unitario)}</td>
      <td>${celdaProveedor(i)}</td>
      <td>
        ${pendiente ? '<span class="badge badge-pendiente">Pendiente</span>' : '<span class="badge" style="color:var(--olive);border:1px solid var(--olive);background:rgba(107,125,62,0.15);">OK</span>'}
        ${i.activo ? '' : '<span class="badge badge-inactivo">Inactivo</span>'}
      </td>
    </tr>
  `;
}

function renderAcordeon(lista) {
  if (lista.length === 0) {
    contenido.innerHTML = '<div class="empty-state">No se encontraron insumos.</div>';
    return;
  }

  const grupos = {};
  lista.forEach((i) => {
    if (!grupos[i.categoria]) grupos[i.categoria] = [];
    grupos[i.categoria].push(i);
  });

  const categorias = Object.keys(grupos).sort();
  const filtroActivo = buscador.value.trim() !== '' || soloPendientes;

  contenido.innerHTML = categorias.map((cat) => {
    const items = grupos[cat];
    const filas = items.map(filaHtml).join('');

    return `
      <div class="categoria-group${filtroActivo ? '' : ' collapsed'}">
        <div class="categoria-header">
          <h2>${cat}</h2>
          <span class="count">${items.length} insumo${items.length === 1 ? '' : 's'}</span>
          <span class="chevron">▾</span>
        </div>
        <div class="categoria-body">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Costo unitario</th>
                <th>Proveedor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  contenido.querySelectorAll('.categoria-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  contenido.querySelectorAll('tbody tr').forEach((tr) => {
    tr.addEventListener('click', () => abrirEdicion(tr.dataset.id));
  });
}

buscador.addEventListener('input', () => {
  renderAcordeon(aplicarFiltros(insumos));
});

btnSoloPendientes.addEventListener('click', () => {
  soloPendientes = !soloPendientes;
  btnSoloPendientes.classList.toggle('active', soloPendientes);
  renderAcordeon(aplicarFiltros(insumos));
});

chkMostrarInactivos.addEventListener('change', () => {
  cargarInsumos();
});

function abrirModal(modo, insumo) {
  form.reset();
  notasBox.hidden = true;
  estadoActualBox.hidden = true;
  costoEfectivoBox.hidden = true;
  proveedorPreferidoBox.hidden = true;
  sinPreciosBox.hidden = true;
  fProveedorPreferido.innerHTML = '';
  insumoEnEdicion = modo === 'editar' ? insumo : null;
  btnEliminar.hidden = modo === 'nuevo';

  if (modo === 'nuevo') {
    modalTitle.textContent = 'Nuevo insumo';
    fId.value = '';
    fUnidad.value = 'g';
  } else {
    modalTitle.textContent = 'Editar insumo';
    fId.value = insumo.id;
    fNombre.value = insumo.nombre;
    fUnidad.value = insumo.unidad_medida;
    fCosto.value = insumo.costo_unitario ?? '';
    btnEliminar.textContent = insumo.activo ? 'Desactivar' : 'Reactivar';

    estadoActualBox.hidden = false;
    estadoActualBox.innerHTML = `Estado actual: <strong>${insumo.activo ? 'Activo' : 'Inactivo'}</strong>`;

    if (insumo.notas_revision) {
      notasBox.hidden = false;
      notasBox.textContent = `Nota de revisión: ${insumo.notas_revision}`;
    }

    cargarInfoProveedorInsumo(insumo);
  }

  modalOverlay.hidden = false;
}

async function cargarInfoProveedorInsumo(insumo) {
  const hoy = new Date().toISOString().slice(0, 10);

  const [{ data: efectivo }, { data: preciosVigentes }] = await Promise.all([
    supabaseClient.from('v_insumo_costo_final').select('*').eq('insumo_id', insumo.id).maybeSingle(),
    supabaseClient
      .from('precios_proveedores')
      .select('proveedor_id')
      .eq('insumo_id', insumo.id)
      .eq('activo', true)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`),
  ]);

  costoEfectivoBox.hidden = false;
  if (efectivo && efectivo.costo_final != null) {
    const tipoTexto = efectivo.fuente === 'manual'
      ? 'manual'
      : (efectivo.es_preferido_manual ? 'fijado manualmente' : 'automático');
    const prefijoProveedor = efectivo.proveedor_nombre_corto ? `${efectivo.proveedor_nombre_corto}, ` : '';
    costoEfectivoValue.textContent = `${moneyFmt.format(efectivo.costo_final)}/${insumo.unidad_medida} (${prefijoProveedor}${tipoTexto})`;
  } else {
    costoEfectivoValue.textContent = 'Costo pendiente — sin precio de proveedor ni costo manual.';
  }

  const proveedorIdsConPrecio = [...new Set((preciosVigentes || []).map((p) => p.proveedor_id))];

  if (proveedorIdsConPrecio.length === 0) {
    proveedorPreferidoBox.hidden = true;
    sinPreciosBox.hidden = false;
    return;
  }

  sinPreciosBox.hidden = true;
  proveedorPreferidoBox.hidden = false;

  const { data: proveedoresConPrecio } = await supabaseClient
    .from('proveedores')
    .select('id, nombre_corto')
    .in('id', proveedorIdsConPrecio)
    .order('nombre_corto', { ascending: true });

  fProveedorPreferido.innerHTML = '<option value="">Automático (más barato)</option>'
    + (proveedoresConPrecio || []).map((p) => `<option value="${p.id}">${p.nombre_corto}</option>`).join('');
  fProveedorPreferido.value = insumo.proveedor_preferido_id || '';
}

function cerrarModal() {
  modalOverlay.hidden = true;
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal('nuevo'));
document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) cerrarModal();
});

function abrirEdicion(id) {
  const insumo = insumos.find((i) => i.id === id);
  if (insumo) abrirModal('editar', insumo);
}

async function siguienteId() {
  const { data, error } = await supabaseClient
    .from('insumos')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 'INS-001';

  const maxNum = parseInt(data[0].id.split('-')[1], 10);
  const siguiente = (maxNum + 1).toString().padStart(3, '0');
  return `INS-${siguiente}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const costo = fCosto.value === '' ? null : parseFloat(fCosto.value);
  const payload = {
    nombre: fNombre.value.trim(),
    unidad_medida: fUnidad.value,
    costo_unitario: costo,
  };

  if (fId.value) {
    payload.updated_at = new Date().toISOString();
    payload.proveedor_preferido_id = fProveedorPreferido.value || null;
    const { error } = await supabaseClient.from('insumos').update(payload).eq('id', fId.value);
    if (error) {
      alert(`Error al guardar: ${error.message}`);
      return;
    }
  } else {
    payload.id = await siguienteId();
    const { error } = await supabaseClient.from('insumos').insert(payload);
    if (error) {
      alert(`Error al crear: ${error.message}`);
      return;
    }
  }

  cerrarModal();
  await cargarInsumos();
});

btnEliminar.addEventListener('click', async () => {
  if (!fId.value || !insumoEnEdicion) return;

  const activarse = !insumoEnEdicion.activo;
  const mensaje = activarse
    ? '¿Reactivar este insumo?'
    : '¿Desactivar este insumo? No se eliminará el historial.';
  if (!confirm(mensaje)) return;

  const { error } = await supabaseClient
    .from('insumos')
    .update({ activo: activarse, updated_at: new Date().toISOString() })
    .eq('id', fId.value);

  if (error) {
    alert(`Error al actualizar estado: ${error.message}`);
    return;
  }

  cerrarModal();
  await cargarInsumos();
});

(async () => {
  const session = await requireSession();
  if (!session) return;
  wireSessionUI(session);
  cargarInsumos();
})();

const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let insumos = [];

const contenido = document.getElementById('contenido');
const buscador = document.getElementById('buscador');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const form = document.getElementById('form-insumo');
const fId = document.getElementById('f-id');
const fNombre = document.getElementById('f-nombre');
const fUnidad = document.getElementById('f-unidad');
const fCosto = document.getElementById('f-costo');
const fProveedor = document.getElementById('f-proveedor');
const fActivo = document.getElementById('f-activo');
const campoActivo = document.getElementById('campo-activo');
const notasBox = document.getElementById('notas-revision-box');
const btnEliminar = document.getElementById('btn-eliminar');

async function cargarInsumos() {
  const { data, error } = await supabaseClient
    .from('insumos')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (error) {
    contenido.innerHTML = `<div class="empty-state">Error al cargar insumos: ${error.message}</div>`;
    return;
  }

  insumos = data;
  renderTabla(insumos);
}

function renderTabla(lista) {
  if (lista.length === 0) {
    contenido.innerHTML = '<div class="empty-state">No se encontraron insumos.</div>';
    return;
  }

  const filas = lista.map((i) => {
    const pendiente = i.costo_unitario === null;
    return `
      <tr data-id="${i.id}">
        <td>${i.nombre}</td>
        <td>${i.unidad_medida}</td>
        <td>${pendiente ? '<span class="badge badge-pendiente">Costo pendiente</span>' : moneyFmt.format(i.costo_unitario)}</td>
        <td>${i.proveedor || '—'}</td>
        <td>${pendiente ? '<span class="badge badge-pendiente">Pendiente</span>' : '<span class="badge" style="color:var(--olive);border:1px solid var(--olive);background:rgba(107,125,62,0.15);">OK</span>'}</td>
      </tr>
    `;
  }).join('');

  contenido.innerHTML = `
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
  `;

  contenido.querySelectorAll('tbody tr').forEach((tr) => {
    tr.addEventListener('click', () => abrirEdicion(tr.dataset.id));
  });
}

buscador.addEventListener('input', () => {
  const q = buscador.value.trim().toLowerCase();
  const filtrados = q ? insumos.filter((i) => i.nombre.toLowerCase().includes(q)) : insumos;
  renderTabla(filtrados);
});

function abrirModal(modo, insumo) {
  form.reset();
  notasBox.hidden = true;
  campoActivo.hidden = modo === 'nuevo';
  btnEliminar.hidden = modo === 'nuevo';

  if (modo === 'nuevo') {
    modalTitle.textContent = 'Nuevo insumo';
    fId.value = '';
    fUnidad.value = 'g';
    fActivo.checked = true;
  } else {
    modalTitle.textContent = 'Editar insumo';
    fId.value = insumo.id;
    fNombre.value = insumo.nombre;
    fUnidad.value = insumo.unidad_medida;
    fCosto.value = insumo.costo_unitario ?? '';
    fProveedor.value = insumo.proveedor || '';
    fActivo.checked = insumo.activo;

    if (insumo.notas_revision) {
      notasBox.hidden = false;
      notasBox.textContent = `Nota de revisión: ${insumo.notas_revision}`;
    }
  }

  modalOverlay.hidden = false;
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
    proveedor: fProveedor.value.trim() || null,
  };

  if (fId.value) {
    payload.activo = fActivo.checked;
    payload.updated_at = new Date().toISOString();
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
  if (!fId.value) return;
  if (!confirm('¿Desactivar este insumo? No se eliminará el historial.')) return;

  const { error } = await supabaseClient
    .from('insumos')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', fId.value);

  if (error) {
    alert(`Error al desactivar: ${error.message}`);
    return;
  }

  cerrarModal();
  await cargarInsumos();
});

cargarInsumos();

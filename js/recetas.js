const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const vistaLista = document.getElementById('vista-lista');
const vistaDetalle = document.getElementById('vista-detalle');
const contenidoLista = document.getElementById('contenido-lista');
const buscador = document.getElementById('buscador');
const pageTitle = document.getElementById('page-title');
const topLink = document.getElementById('top-link');

let recetasCache = [];
let resumenCache = {};

// ---------- Routing ----------

function rutaActual() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('receta/')) {
    return { vista: 'detalle', id: hash.slice('receta/'.length) };
  }
  return { vista: 'lista' };
}

window.addEventListener('hashchange', render);

function render() {
  const ruta = rutaActual();
  if (ruta.vista === 'detalle') {
    vistaLista.hidden = true;
    vistaDetalle.hidden = false;
    pageTitle.textContent = 'Receta';
    topLink.textContent = '← Recetas';
    topLink.href = '#';
    renderDetalle(ruta.id);
  } else {
    vistaLista.hidden = false;
    vistaDetalle.hidden = true;
    pageTitle.textContent = 'Recetas';
    topLink.textContent = '← Inicio';
    topLink.href = 'index.html';
    renderLista();
  }
}

// ---------- Vista lista ----------

async function cargarRecetas() {
  const { data: recetas, error: errR } = await supabaseClient
    .from('recetas')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (errR) {
    contenidoLista.innerHTML = `<div class="empty-state">Error al cargar recetas: ${errR.message}</div>`;
    return;
  }

  recetasCache = recetas;

  const ids = recetas.map((r) => r.id);
  const { data: resumen, error: errS } = await supabaseClient
    .from('v_receta_resumen')
    .select('*')
    .in('id', ids.length ? ids : ['__none__']);

  if (errS) {
    contenidoLista.innerHTML = `<div class="empty-state">Error al cargar costeo: ${errS.message}</div>`;
    return;
  }

  resumenCache = {};
  resumen.forEach((r) => { resumenCache[r.id] = r; });
}

function renderLista() {
  contenidoLista.innerHTML = '<div class="loading">Cargando recetas…</div>';
  cargarRecetas().then(() => pintarLista(recetasCache));
}

function pintarLista(lista) {
  if (lista.length === 0) {
    contenidoLista.innerHTML = '<div class="empty-state">No se encontraron recetas.</div>';
    return;
  }

  const grupos = {};
  lista.forEach((r) => {
    if (!grupos[r.categoria]) grupos[r.categoria] = [];
    grupos[r.categoria].push(r);
  });

  const categorias = Object.keys(grupos).sort();
  const buscando = buscador.value.trim() !== '';

  contenidoLista.innerHTML = categorias.map((cat) => {
    const items = grupos[cat];
    const cards = items.map((r) => {
      const res = resumenCache[r.id] || {};
      const badges = [];
      if (r.tipo === 'Subreceta') badges.push('<span class="badge badge-subreceta">Subreceta</span>');
      if (res.tiene_costos_pendientes) badges.push('<span class="badge badge-pendiente">Costo pendiente</span>');

      return `
        <a class="receta-card" href="#receta/${r.id}">
          <div class="badges">${badges.join('')}</div>
          <h3>${r.nombre}</h3>
          <p>${r.descripcion || ''}</p>
          <div class="precio">${res.precio_final != null ? moneyFmt.format(res.precio_final) : '—'}</div>
        </a>
      `;
    }).join('');

    return `
      <div class="categoria-group${buscando ? '' : ' collapsed'}">
        <div class="categoria-header">
          <h2>${cat}</h2>
          <span class="count">${items.length} receta${items.length === 1 ? '' : 's'}</span>
          <span class="chevron">▾</span>
        </div>
        <div class="receta-grid">${cards}</div>
      </div>
    `;
  }).join('');

  contenidoLista.querySelectorAll('.categoria-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });
}

buscador.addEventListener('input', () => {
  const q = buscador.value.trim().toLowerCase();
  const filtrados = q ? recetasCache.filter((r) => r.nombre.toLowerCase().includes(q)) : recetasCache;
  pintarLista(filtrados);
});

// ---------- Vista detalle ----------

async function renderDetalle(id) {
  vistaDetalle.innerHTML = '<div class="loading">Cargando receta…</div>';

  const [{ data: receta, error: errR }, { data: resumenRows, error: errS }, { data: ingredientes, error: errI }, { data: pasos, error: errP }, { data: insumosActivos, error: errIns }] = await Promise.all([
    supabaseClient.from('recetas').select('*').eq('id', id).single(),
    supabaseClient.from('v_receta_resumen').select('*').eq('id', id).single(),
    supabaseClient.from('receta_ingredientes').select('*').eq('receta_id', id).eq('activo', true).order('orden', { ascending: true }),
    supabaseClient.from('receta_procedimientos').select('*').eq('receta_id', id).order('orden', { ascending: true }),
    supabaseClient.from('insumos').select('id, nombre, unidad_medida, costo_unitario').eq('activo', true).order('nombre', { ascending: true }),
  ]);

  if (errR || !receta) {
    vistaDetalle.innerHTML = `<div class="empty-state">No se encontró la receta.</div>`;
    return;
  }
  if (errS || errI || errP || errIns) {
    vistaDetalle.innerHTML = `<div class="empty-state">Error al cargar datos de la receta.</div>`;
    return;
  }

  const resumen = resumenRows || {};
  const insumosById = {};
  insumosActivos.forEach((i) => { insumosById[i.id] = i; });

  const lineas = ingredientes.map((ing) => {
    const insumo = insumosById[ing.insumo_id] || { nombre: '(insumo inactivo)', unidad_medida: '', costo_unitario: null };
    const costoLinea = insumo.costo_unitario != null ? Math.round(ing.cantidad * insumo.costo_unitario * 100) / 100 : null;
    return { ...ing, insumo, costoLinea };
  });

  pintarDetalle(receta, resumen, lineas, pasos, insumosActivos);
}

function pintarDetalle(receta, resumen, lineas, pasos, insumosActivos) {
  const badges = [];
  if (receta.tipo === 'Subreceta') badges.push('<span class="badge badge-subreceta">Subreceta</span>');
  if (resumen.tiene_costos_pendientes) badges.push('<span class="badge badge-pendiente">Costo pendiente</span>');

  const filasIngredientes = lineas.map((l) => `
    <div class="ingrediente-row" data-ing-id="${l.id}">
      <div>
        ${l.insumo.nombre}
        <div style="font-size:12px;color:var(--text-muted);">
          ${l.insumo.unidad_medida} · ${l.insumo.costo_unitario != null ? moneyFmt.format(l.insumo.costo_unitario) : 'sin costo'} c/u ·
          línea: ${l.costoLinea != null ? moneyFmt.format(l.costoLinea) : '—'}
        </div>
      </div>
      <input type="number" step="0.001" min="0" class="ing-cantidad" value="${l.cantidad}" />
      <button type="button" class="btn-ghost btn-sm ing-eliminar" title="Eliminar">✕</button>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:14px;">Sin ingredientes.</p>';

  const opcionesInsumo = insumosActivos.map((i) => `<option value="${i.id}">${i.nombre}</option>`).join('');

  const filasPasos = pasos.map((p) => `
    <div class="ingrediente-row" data-paso-id="${p.id}" style="grid-template-columns:1fr 32px;">
      <textarea class="paso-texto" rows="2">${p.texto}</textarea>
      <button type="button" class="btn-ghost btn-sm paso-eliminar" title="Eliminar">✕</button>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:14px;">Sin pasos de procedimiento.</p>';

  vistaDetalle.innerHTML = `
    ${receta.notas_revision ? `<div class="card" style="border-color:var(--amber);margin-bottom:16px;color:var(--amber);font-size:14px;">Nota de revisión: ${receta.notas_revision}</div>` : ''}

    <div class="badges" style="margin-bottom:10px;">${badges.join('')}</div>

    <div class="detalle-grid">
      <div class="card">
        <form id="form-receta">
          <div class="field">
            <label for="d-nombre">Nombre</label>
            <input type="text" id="d-nombre" value="${receta.nombre}" required />
          </div>
          <div class="field">
            <label for="d-descripcion">Descripción</label>
            <textarea id="d-descripcion">${receta.descripcion || ''}</textarea>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="d-porcion">Porción</label>
              <input type="text" id="d-porcion" value="${receta.porcion_desc || ''}" />
            </div>
            <div class="field">
              <label for="d-peso">Peso terminado</label>
              <input type="text" id="d-peso" value="${receta.peso_terminado || ''}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="d-tiempo">Tiempo</label>
              <input type="text" id="d-tiempo" value="${receta.tiempo || ''}" />
            </div>
            <div class="field">
              <label for="d-tecnica">Técnica</label>
              <input type="text" id="d-tecnica" value="${receta.tecnica || ''}" />
            </div>
          </div>

          <div class="section-title">Procedimiento</div>
          <div id="lista-pasos">${filasPasos}</div>
          <button type="button" class="btn-ghost btn-sm" id="btn-agregar-paso" style="margin-top:8px;">+ Agregar paso</button>

          <div class="modal-actions" style="justify-content:space-between;">
            <button type="button" class="btn-danger" id="btn-desactivar-receta">Desactivar receta</button>
            <button type="submit" class="btn-primary">Guardar cambios</button>
          </div>
        </form>
      </div>

      <div>
        <div class="card" style="margin-bottom:20px;">
          <div class="section-title" style="margin-top:0;">Ingredientes</div>
          <div id="lista-ingredientes">${filasIngredientes}</div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <select id="nuevo-ingrediente-insumo" style="flex:2;">
              <option value="">Agregar insumo…</option>
              ${opcionesInsumo}
            </select>
            <input type="number" id="nuevo-ingrediente-cantidad" placeholder="Cant." step="0.001" min="0" style="flex:1;" />
            <button type="button" class="btn-ghost btn-sm" id="btn-agregar-ingrediente">+</button>
          </div>
        </div>

        <div class="card">
          <div class="section-title" style="margin-top:0;">Costeo</div>
          <div class="costeo-summary">
            <div class="costeo-row"><span>Costo total insumos</span><strong>${resumen.costo_total != null ? moneyFmt.format(resumen.costo_total) : '—'}</strong></div>
            <div class="field">
              <label for="d-porcentaje">% Costo objetivo</label>
              <input type="number" id="d-porcentaje" step="0.1" min="0.1" value="${receta.porcentaje_costo_objetivo}" form="form-receta" />
              <small class="field-hint">Qué porcentaje del precio final debe representar el costo de los ingredientes. Define el factor multiplicador y el precio sugerido.</small>
            </div>
            <div class="costeo-row"><span>Factor multiplicador</span><strong id="factor-multiplicador">${resumen.factor_multiplicador ?? '—'}×</strong></div>
            <div class="costeo-row"><span>Precio sugerido</span><strong id="precio-sugerido">${resumen.precio_sugerido != null ? moneyFmt.format(resumen.precio_sugerido) : '—'}</strong></div>
            <div class="field">
              <label for="d-precio-manual">Precio de venta manual (override)</label>
              <input type="number" id="d-precio-manual" step="0.01" min="0" placeholder="Usar precio sugerido" value="${receta.precio_venta_manual ?? ''}" form="form-receta" />
              <small class="field-hint">Opcional. Si lo defines, este precio se usa como precio final en vez del sugerido. Déjalo vacío para usar siempre el precio sugerido.</small>
            </div>
            <div class="precio-final">
              <span class="label">Precio final</span>
              <span class="value" id="precio-final-value">${resumen.precio_final != null ? moneyFmt.format(resumen.precio_final) : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  attachDetalleHandlers(receta.id, resumen.costo_total);
}

function attachDetalleHandlers(recetaId, costoTotal) {
  function recalcularCosteo() {
    const porcentaje = parseFloat(document.getElementById('d-porcentaje').value);
    const precioManualRaw = document.getElementById('d-precio-manual').value;
    const precioManual = precioManualRaw === '' ? null : parseFloat(precioManualRaw);

    const factorEl = document.getElementById('factor-multiplicador');
    const sugeridoEl = document.getElementById('precio-sugerido');
    const finalEl = document.getElementById('precio-final-value');

    if (costoTotal == null || isNaN(porcentaje) || porcentaje <= 0) {
      factorEl.textContent = '—×';
      sugeridoEl.textContent = '—';
      finalEl.textContent = '—';
      return;
    }

    const factor = 100 / porcentaje;
    const precioSugerido = Math.round(costoTotal * factor * 100) / 100;
    const precioFinal = (precioManual != null && !isNaN(precioManual)) ? precioManual : precioSugerido;

    factorEl.textContent = `${Math.round(factor * 100) / 100}×`;
    sugeridoEl.textContent = moneyFmt.format(precioSugerido);
    finalEl.textContent = moneyFmt.format(precioFinal);
  }

  document.getElementById('d-porcentaje').addEventListener('input', recalcularCosteo);
  document.getElementById('d-precio-manual').addEventListener('input', recalcularCosteo);

  const form = document.getElementById('form-receta');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById('d-nombre').value.trim(),
      descripcion: document.getElementById('d-descripcion').value.trim() || null,
      porcion_desc: document.getElementById('d-porcion').value.trim() || null,
      peso_terminado: document.getElementById('d-peso').value.trim() || null,
      tiempo: document.getElementById('d-tiempo').value.trim() || null,
      tecnica: document.getElementById('d-tecnica').value.trim() || null,
      porcentaje_costo_objetivo: parseFloat(document.getElementById('d-porcentaje').value),
      precio_venta_manual: document.getElementById('d-precio-manual').value === '' ? null : parseFloat(document.getElementById('d-precio-manual').value),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient.from('recetas').update(payload).eq('id', recetaId);
    if (error) {
      alert(`Error al guardar: ${error.message}`);
      return;
    }
    renderDetalle(recetaId);
  });

  document.getElementById('btn-desactivar-receta').addEventListener('click', async () => {
    if (!confirm('¿Desactivar esta receta? No se eliminará el historial.')) return;
    const { error } = await supabaseClient.from('recetas').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', recetaId);
    if (error) {
      alert(`Error al desactivar: ${error.message}`);
      return;
    }
    location.hash = '';
  });

  // Ingredientes: cantidad
  document.querySelectorAll('.ing-cantidad').forEach((input) => {
    input.addEventListener('change', async () => {
      const row = input.closest('.ingrediente-row');
      const ingId = row.dataset.ingId;
      const cantidad = parseFloat(input.value);
      if (isNaN(cantidad) || cantidad <= 0) { alert('Cantidad inválida.'); return; }
      const { error } = await supabaseClient.from('receta_ingredientes').update({ cantidad }).eq('id', ingId);
      if (error) { alert(`Error al actualizar cantidad: ${error.message}`); return; }
      renderDetalle(recetaId);
    });
  });

  document.querySelectorAll('.ing-eliminar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.ingrediente-row');
      const ingId = row.dataset.ingId;
      if (!confirm('¿Eliminar este ingrediente de la receta?')) return;
      const { error } = await supabaseClient.from('receta_ingredientes').update({ activo: false }).eq('id', ingId);
      if (error) { alert(`Error al eliminar: ${error.message}`); return; }
      renderDetalle(recetaId);
    });
  });

  document.getElementById('btn-agregar-ingrediente').addEventListener('click', async () => {
    const select = document.getElementById('nuevo-ingrediente-insumo');
    const cantidadInput = document.getElementById('nuevo-ingrediente-cantidad');
    const insumoId = select.value;
    const cantidad = parseFloat(cantidadInput.value);

    if (!insumoId) { alert('Selecciona un insumo.'); return; }
    if (isNaN(cantidad) || cantidad <= 0) { alert('Ingresa una cantidad válida.'); return; }

    const { data: existentes } = await supabaseClient
      .from('receta_ingredientes')
      .select('orden')
      .eq('receta_id', recetaId)
      .eq('activo', true)
      .order('orden', { ascending: false })
      .limit(1);

    const siguienteOrden = existentes && existentes.length ? existentes[0].orden + 1 : 1;

    const { error } = await supabaseClient.from('receta_ingredientes').insert({
      receta_id: recetaId,
      insumo_id: insumoId,
      cantidad,
      orden: siguienteOrden,
      activo: true,
    });

    if (error) { alert(`Error al agregar ingrediente: ${error.message}`); return; }
    renderDetalle(recetaId);
  });

  // Procedimiento
  document.querySelectorAll('.paso-texto').forEach((textarea) => {
    textarea.addEventListener('change', async () => {
      const row = textarea.closest('.ingrediente-row');
      const pasoId = row.dataset.pasoId;
      const texto = textarea.value.trim();
      if (!texto) { alert('El paso no puede quedar vacío.'); return; }
      const { error } = await supabaseClient.from('receta_procedimientos').update({ texto }).eq('id', pasoId);
      if (error) alert(`Error al guardar el paso: ${error.message}`);
    });
  });

  document.querySelectorAll('.paso-eliminar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.ingrediente-row');
      const pasoId = row.dataset.pasoId;
      if (!confirm('¿Eliminar este paso?')) return;
      const { error } = await supabaseClient.from('receta_procedimientos').delete().eq('id', pasoId);
      if (error) { alert(`Error al eliminar el paso: ${error.message}`); return; }
      renderDetalle(recetaId);
    });
  });

  document.getElementById('btn-agregar-paso').addEventListener('click', async () => {
    const { data: existentes } = await supabaseClient
      .from('receta_procedimientos')
      .select('orden')
      .eq('receta_id', recetaId)
      .order('orden', { ascending: false })
      .limit(1);

    const siguienteOrden = existentes && existentes.length ? existentes[0].orden + 1 : 1;

    const { error } = await supabaseClient.from('receta_procedimientos').insert({
      receta_id: recetaId,
      orden: siguienteOrden,
      texto: 'Nuevo paso…',
    });

    if (error) { alert(`Error al agregar el paso: ${error.message}`); return; }
    renderDetalle(recetaId);
  });
}

(async () => {
  const session = await requireSession();
  if (!session) return;
  wireSessionUI(session);
  render();
})();

// Estudio de recetas para empleados — página autónoma, sin sesión.
// Protegida por geo-valla (Geolocation API): solo carga dentro de NOLI.

const NOLI_LAT = 19.396257;
const NOLI_LNG = -99.176315;
const RADIO_METROS = 40;

const gateLoading = document.getElementById('gate-loading');
const gateBlocked = document.getElementById('gate-blocked');
const app = document.getElementById('app');

const vistaLista = document.getElementById('vista-lista');
const vistaDetalle = document.getElementById('vista-detalle');
const contenidoLista = document.getElementById('contenido-lista');
const buscador = document.getElementById('buscador');

let recetasCache = [];
let ingredientesPorReceta = {};
let procedimientosPorReceta = {};
let pasoActual = 0;

// ---------- Geo-valla ----------

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bloquear() {
  gateLoading.hidden = true;
  gateBlocked.hidden = false;
}

function permitir() {
  gateLoading.hidden = true;
  app.hidden = false;
  iniciarApp();
}

function verificarUbicacion() {
  if (!navigator.geolocation) {
    bloquear();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const distancia = distanciaMetros(
        pos.coords.latitude,
        pos.coords.longitude,
        NOLI_LAT,
        NOLI_LNG,
      );
      if (distancia <= RADIO_METROS) {
        permitir();
      } else {
        bloquear();
      }
    },
    () => bloquear(),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

// ---------- Datos ----------

async function cargarDatos() {
  const [
    { data: recetas, error: errR },
    { data: ingredientes, error: errI },
    { data: pasos, error: errP },
  ] = await Promise.all([
    supabaseClient.from('v_estudio_recetas').select('*').order('nombre', { ascending: true }),
    supabaseClient.from('v_estudio_ingredientes').select('*').order('orden', { ascending: true }),
    supabaseClient.from('v_estudio_procedimientos').select('*').order('orden', { ascending: true }),
  ]);

  if (errR || errI || errP) {
    contenidoLista.innerHTML = '<div class="empty-state">No se pudieron cargar las recetas.</div>';
    return;
  }

  recetasCache = recetas;

  ingredientesPorReceta = {};
  ingredientes.forEach((ing) => {
    if (!ingredientesPorReceta[ing.receta_id]) ingredientesPorReceta[ing.receta_id] = [];
    ingredientesPorReceta[ing.receta_id].push(ing);
  });

  procedimientosPorReceta = {};
  pasos.forEach((p) => {
    if (!procedimientosPorReceta[p.receta_id]) procedimientosPorReceta[p.receta_id] = [];
    procedimientosPorReceta[p.receta_id].push(p);
  });
}

async function iniciarApp() {
  await cargarDatos();
  render();
}

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
    renderDetalle(ruta.id);
  } else {
    vistaLista.hidden = false;
    vistaDetalle.hidden = true;
    const q = buscador.value.trim().toLowerCase();
    const filtradas = q ? recetasCache.filter((r) => r.nombre.toLowerCase().includes(q)) : recetasCache;
    pintarLista(filtradas);
  }
}

buscador.addEventListener('input', render);

// ---------- Vista lista ----------

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
    const cards = items.map((r) => `
      <a class="receta-card" href="#receta/${r.id}">
        <h3>${r.nombre}</h3>
        <p>${r.descripcion || ''}</p>
      </a>
    `).join('');

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

// ---------- Vista detalle ----------

function renderDetalle(id) {
  const receta = recetasCache.find((r) => String(r.id) === String(id));

  if (!receta) {
    vistaDetalle.innerHTML = '<div class="empty-state">No se encontró la receta.</div>';
    return;
  }

  const ingredientes = ingredientesPorReceta[receta.id] || [];
  const pasos = procedimientosPorReceta[receta.id] || [];
  pasoActual = 0;

  const filasIngredientes = ingredientes.map((ing, idx) => `
    <label class="estudio-ing-row" data-idx="${idx}">
      <input type="checkbox" class="estudio-ing-check" />
      <span class="estudio-ing-texto">${ing.insumo_nombre} — ${ing.cantidad} ${ing.unidad_medida}</span>
    </label>
  `).join('') || '<p class="field-hint">Sin ingredientes.</p>';

  vistaDetalle.innerHTML = `
    <button type="button" class="btn-ghost btn-sm" id="btn-volver-lista">← Recetas</button>

    <div class="estudio-header">
      <div class="estudio-categoria">${receta.categoria || ''}</div>
      <h1 class="estudio-nombre">${receta.nombre}</h1>
      ${receta.descripcion ? `<p class="estudio-descripcion">${receta.descripcion}</p>` : ''}
      <div class="estudio-meta">
        <span><strong>Porción:</strong> ${receta.porcion_desc || '—'}</span>
        <span><strong>Peso terminado:</strong> ${receta.peso_terminado || '—'}</span>
        <span><strong>Tiempo:</strong> ${receta.tiempo || '—'}</span>
        <span><strong>Técnica:</strong> ${receta.tecnica || '—'}</span>
      </div>
    </div>

    <div class="detalle-grid">
      <div class="card">
        <div class="section-title" style="margin-top:0;">Ingredientes</div>
        <div id="estudio-ingredientes">${filasIngredientes}</div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0;">Procedimiento</div>
        <div class="estudio-paso-indicador" id="estudio-paso-indicador"></div>
        <div class="estudio-paso-texto" id="estudio-paso-texto"></div>
        <div class="estudio-paso-dots" id="estudio-paso-dots"></div>
        <div class="estudio-paso-nav">
          <button type="button" class="btn-ghost" id="btn-paso-anterior">← Anterior</button>
          <button type="button" class="btn-primary" id="btn-paso-siguiente">Siguiente →</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-volver-lista').addEventListener('click', () => {
    location.hash = '';
  });

  document.querySelectorAll('.estudio-ing-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      chk.closest('.estudio-ing-row').classList.toggle('tachado', chk.checked);
    });
  });

  const indicadorEl = document.getElementById('estudio-paso-indicador');
  const textoEl = document.getElementById('estudio-paso-texto');
  const dotsEl = document.getElementById('estudio-paso-dots');
  const btnAnterior = document.getElementById('btn-paso-anterior');
  const btnSiguiente = document.getElementById('btn-paso-siguiente');

  function pintarPaso() {
    const total = pasos.length;

    if (total === 0) {
      indicadorEl.textContent = '';
      textoEl.textContent = 'Sin pasos de procedimiento.';
      dotsEl.innerHTML = '';
      btnAnterior.disabled = true;
      btnSiguiente.disabled = true;
      return;
    }

    indicadorEl.textContent = `Paso ${pasoActual + 1} de ${total}`;
    textoEl.textContent = pasos[pasoActual].texto;
    dotsEl.innerHTML = pasos.map((_, i) => `<span class="estudio-dot${i === pasoActual ? ' activo' : ''}"></span>`).join('');
    btnAnterior.disabled = pasoActual === 0;
    btnSiguiente.disabled = pasoActual === total - 1;
  }

  btnAnterior.addEventListener('click', () => {
    if (pasoActual > 0) {
      pasoActual -= 1;
      pintarPaso();
    }
  });

  btnSiguiente.addEventListener('click', () => {
    if (pasoActual < pasos.length - 1) {
      pasoActual += 1;
      pintarPaso();
    }
  });

  pintarPaso();
}

verificarUbicacion();

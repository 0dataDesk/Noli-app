let modo = 'login';

const form = document.getElementById('form-auth');
const emailInput = document.getElementById('a-email');
const passwordInput = document.getElementById('a-password');
const messageBox = document.getElementById('auth-message');
const authTitle = document.getElementById('auth-title');
const btnSubmit = document.getElementById('btn-submit');
const toggleText = document.getElementById('toggle-text');
const toggleLink = document.getElementById('toggle-link');

function setModo(nuevo) {
  modo = nuevo;
  messageBox.textContent = '';

  if (modo === 'login') {
    authTitle.textContent = 'Iniciar sesión';
    btnSubmit.textContent = 'Iniciar sesión';
    toggleText.textContent = '¿No tienes cuenta?';
    toggleLink.textContent = 'Crear cuenta';
  } else {
    authTitle.textContent = 'Crear cuenta';
    btnSubmit.textContent = 'Crear cuenta';
    toggleText.textContent = '¿Ya tienes cuenta?';
    toggleLink.textContent = 'Iniciar sesión';
  }
}

toggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  setModo(modo === 'login' ? 'signup' : 'login');
});

function mostrarMensaje(texto, tipo) {
  messageBox.textContent = texto;
  messageBox.style.color = tipo === 'error' ? 'var(--danger)' : 'var(--olive)';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnSubmit.disabled = true;
  messageBox.textContent = '';

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (modo === 'login') {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      mostrarMensaje(error.message, 'error');
      btnSubmit.disabled = false;
      return;
    }
    window.location.href = 'index.html';
  } else {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      mostrarMensaje(error.message, 'error');
      btnSubmit.disabled = false;
      return;
    }
    if (data.session) {
      window.location.href = 'index.html';
    } else {
      mostrarMensaje('Cuenta creada. Revisa tu correo para confirmar tu cuenta.', 'ok');
      btnSubmit.disabled = false;
    }
  }
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'index.html';
});

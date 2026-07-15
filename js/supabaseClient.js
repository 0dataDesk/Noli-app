const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

async function wireSessionUI(session) {
  const nameEl = document.getElementById('session-name');
  if (nameEl) {
    let nombre = session.user.email;
    const { data, error } = await supabaseClient
      .from('perfiles')
      .select('nombre_corto')
      .eq('id', session.user.id)
      .single();
    if (!error && data && data.nombre_corto) {
      nombre = data.nombre_corto;
    }
    nameEl.textContent = nombre;
  }

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });
  }
}

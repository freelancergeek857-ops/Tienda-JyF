/**
 * auth.js - Versión Blindada (Cases A, B, C + Seguridad de Link)
 */

const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variable global para controlar el flujo de UI
window.accesoConcedido = false;
let registrando = false;
let usuarioPendiente = null;

/**
 * Genera una huella digital única para el dispositivo
 */
async function generarHashDispositivo(email, whatsapp, salEspecial = "fija") {
    const hardwareInfo = [screen.width, navigator.language].join('|');
    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${salEspecial}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Lógica principal de acceso
 */
async function solicitarAccesoMágico() {
    const btn = document.getElementById('btn-acceso');
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) {
        return mostrarNotificacion("Error", "Por favor, ingresá un correo de Gmail válido.");
    }

    btn.disabled = true;
    btn.style.opacity = "0.5";
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span>Procesando...</span>`;

    try {
        const { data: perfil } = await client.from('perfiles').select('*').eq('email', email).maybeSingle();
        const localHash = localStorage.getItem('jyf_DB_key');

        if (perfil && perfil.hash_dispositivo === localHash) {
            return entrarAlCatalogo(perfil); 
        }

        const nonce = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('jyf_auth_pending_email', email);
        localStorage.setItem('jyf_auth_nonce', nonce);

        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.href }
        });

        if (error) throw error;

        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('email-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.innerHTML = originalText;
        mostrarNotificacion("Error", "No pudimos procesar la entrada: " + err.message);
    }
}

/**
 * Listener de Auth de Supabase
 */
client.auth.onAuthStateChange(async (event, session) => {
    console.log("Evento Auth:", event);
    
    // Si detectamos que viene de un link o hay sesión, bloqueamos el login preventivamente
    if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
        window.accesoConcedido = true;
    }

    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const localNonce = localStorage.getItem('jyf_auth_nonce');
        const emailCheck = localStorage.getItem('jyf_auth_pending_email');

        if (!localNonce || emailCheck !== session.user.email) {
            if (!localNonce && emailCheck === null) {
                const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
                if (perfil) return entrarAlCatalogo(perfil);
            }
            mostrarNotificacion("⚠️ Seguridad", "Este link no es válido o ya fue usado.");
            return client.auth.signOut();
        }

        localStorage.removeItem('jyf_auth_nonce');
        localStorage.removeItem('jyf_auth_pending_email');

        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            registrando = true;
            usuarioPendiente = session.user;
            entrarAlCatalogo({ pesos_jyf: 500, nombre_google: "Nuevo Usuario" });
            document.getElementById('modal-registro').classList.remove('hidden');
        } else if (perfil.hash_dispositivo !== localHash) {
            await manejarRecuperacionCuenta(perfil);
        } else {
            entrarAlCatalogo(perfil);
        }
    }
    
    if (event === 'INITIAL_SESSION' && session?.user) {
        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        if (perfil) entrarAlCatalogo(perfil);
    }

    if (event === 'SIGNED_OUT') {
        window.accesoConcedido = false;
        window.location.reload();
    }
});

async function procesarRegistroFinal() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const wa = document.getElementById('reg-whatsapp').value.trim();
    
    if (!nombre || !wa) {
        return alert("Por favor, completá tu nombre y WhatsApp.");
    }

    const miHash = await generarHashDispositivo(usuarioPendiente.email, wa, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    
    await client.from('perfiles').insert({ 
        id: usuarioPendiente.id, 
        email: usuarioPendiente.email, 
        nombre_google: nombre, 
        whatsapp: wa, 
        hash_dispositivo: miHash, 
        pesos_jyf: 500 
    });
    
    document.getElementById('modal-registro').classList.add('hidden');
    registrando = false;
    const { data: nuevoPerfil } = await client.from('perfiles').select('*').eq('id', usuarioPendiente.id).single();
    entrarAlCatalogo(nuevoPerfil);
}

async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;

    entrarAlCatalogo(perfil);

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0;
        mostrarNotificacion("⚠️ Seguridad: Puntos Reseteados", "Has alcanzado el límite de 3 recuperaciones. Por seguridad, tus Pesos JyF se han reseteado a 0.");
    } else {
        const restantes = 3 - nuevoContador;
        mostrarNotificacion("Recuperación de Cuenta", `Detectamos un nuevo dispositivo. Esta es tu recuperación ${nuevoContador}/3. Te queda ${restantes} intento${restantes === 1 ? '' : 's'} antes de que tus puntos se reseteen.`);
    }

    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    
    await client.from('perfiles').update({ 
        hash_dispositivo: miHash, 
        nro_recuperacion: nuevoContador, 
        pesos_jyf: nuevosPesos 
    }).eq('id', perfil.id);

    actualizarSaldoUI();
}

function mostrarNotificacion(titulo, mensaje) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').innerText = titulo;
    document.getElementById('modal-text').innerText = mensaje;
    document.getElementById('modal-cancel').classList.add('hidden');
    document.getElementById('modal-confirm').onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

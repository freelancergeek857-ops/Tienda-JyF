/**
 * auth.js - Versión Estática Blindada
 */

const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

async function generarHashDispositivo(email, whatsapp, salEspecial = "fija") {
    const hardwareInfo = [navigator.userAgent, screen.width, navigator.language].join('|');
    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${salEspecial}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solicitarAccesoMágico() {
    const btn = document.getElementById('btn-acceso');
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) {
        return mostrarNotificacion("Error", "Por favor, ingresá un correo de Gmail válido.");
    }

    // --- BLOQUEO ANTI-SPAM ---
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span>Procesando...</span>`;

    try {
        // 1. PRE-CHECK: Consultamos la tabla 'perfiles'
        const { data: perfil } = await client
            .from('perfiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        const localHash = localStorage.getItem('jyf_DB_key');

        // --- CASO A: DISPOSITIVO RECONOCIDO ---
        if (perfil && perfil.hash_dispositivo === localHash) {
            console.log("Caso A: Llave reconocida. Acceso instantáneo.");
            return entrarAlCatalogo(); 
        }

        // --- CASO B y C: REQUIEREN VALIDACIÓN ---
        await enviarOTP(email, btn, originalText);

    } catch (err) {
        console.error(err);
        // Si algo falla antes de enviar el OTP, rehabilitamos
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.innerHTML = originalText;
        mostrarNotificacion("Error", "Ocurrió un error inesperado.");
    }
}

/**
 * Envía el Magic Link y maneja el estado del botón
 */
async function enviarOTP(email, btn, originalText) {
    localStorage.setItem('jyf_auth_pending_email', email);
    localStorage.setItem('jyf_auth_request_origin', 'true');

    const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (error) {
        mostrarNotificacion("Error", "No pudimos enviar el acceso: " + error.message);
        // REHABILITAR EN CASO DE ERROR
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.innerHTML = originalText;
    } else {
        // ÉXITO: Ocultamos los controles
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('email-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const originCheck = localStorage.getItem('jyf_auth_request_origin');
        const emailCheck = localStorage.getItem('jyf_auth_pending_email');

        if (!originCheck || emailCheck !== session.user.email) {
            mostrarNotificacion("⚠️ Seguridad", "Link no válido en este dispositivo.");
            return client.auth.signOut();
        }

        localStorage.removeItem('jyf_auth_request_origin');
        localStorage.removeItem('jyf_auth_pending_email');

        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            registrando = true;
            await registrarNuevoUsuario(session.user);
        } else if (perfil.hash_dispositivo !== localHash) {
            await manejarRecuperacionCuenta(perfil);
        } else {
            entrarAlCatalogo();
        }
    }
    if (event === 'INITIAL_SESSION' && session?.user) entrarAlCatalogo();
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("¿Tu nombre?");
    const wa = prompt("¿Tu WhatsApp?");
    if (!nombre || !wa) return client.auth.signOut();

    const miHash = await generarHashDispositivo(user.email, wa, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    await client.from('perfiles').insert({ id: user.id, email: user.email, nombre_google: nombre, whatsapp: wa, hash_dispositivo: miHash, pesos_jyf: 500 });
    entrarAlCatalogo();
}

async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = nuevoContador >= 3 ? 0 : perfil.pesos_jyf;
    if (nuevoContador >= 3) nuevoContador = 0;

    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    await client.from('perfiles').update({ hash_dispositivo: miHash, nro_recuperacion: nuevoContador, pesos_jyf: nuevosPesos }).eq('id', perfil.id);
    entrarAlCatalogo();
}

function mostrarNotificacion(titulo, mensaje) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').innerText = titulo;
    document.getElementById('modal-text').innerText = mensaje;
    document.getElementById('modal-cancel').classList.add('hidden');
    document.getElementById('modal-confirm').onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

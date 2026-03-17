/**
 * auth.js - Versión Blindada (Cases A, B, C + Seguridad de Link)
 */

const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

/**
 * Genera una huella digital única para el dispositivo
 */
async function generarHashDispositivo(email, whatsapp, salEspecial = "fija") {
    // Usamos info estable del hardware y navegador
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

    // --- BLOQUEO ANTI-SPAM ---
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span>Procesando...</span>`;

    try {
        // 1. PRE-CHECK: Consultamos el perfil
        const { data: perfil } = await client.from('perfiles').select('*').eq('email', email).maybeSingle();
        const localHash = localStorage.getItem('jyf_DB_key');

        // --- CASO A: DISPOSITIVO RECONOCIDO (Acceso Instantáneo) ---
        if (perfil && perfil.hash_dispositivo === localHash) {
            console.log("Caso A: Llave reconocida. Acceso instantáneo.");
            return entrarAlCatalogo(perfil); 
        }

        // --- CASO B y C: REQUIEREN VALIDACIÓN ---
        // Generamos un ID temporal (nonce) para asegurar que el link solo abra aquí
        const nonce = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('jyf_auth_pending_email', email);
        localStorage.setItem('jyf_auth_nonce', nonce);

        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.href }
        });

        if (error) throw error;

        // Éxito: Ocultamos controles
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('email-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.innerHTML = originalText;
        mostrarNotificacion("Error", "No pudimos procesar la entrada: " + err.message);
    }
}

/**
 * Listener de Auth de Supabase
 */
client.auth.onAuthStateChange(async (event, session) => {
    if (accesoConcedido && event !== 'SIGNED_OUT') return;

    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const localNonce = localStorage.getItem('jyf_auth_nonce');
        const emailCheck = localStorage.getItem('jyf_auth_pending_email');

        // SEGURIDAD: El link debe abrirse en el mismo dispositivo/navegador que lo pidió
        if (!localNonce || emailCheck !== session.user.email) {
            mostrarNotificacion("⚠️ Seguridad", "Este link no es válido o ya fue usado en otro dispositivo.");
            return client.auth.signOut();
        }

        // Limpiamos rastro de seguridad
        localStorage.removeItem('jyf_auth_nonce');
        localStorage.removeItem('jyf_auth_pending_email');

        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            // CASO C: Registro nuevo
            registrando = true;
            await registrarNuevoUsuario(session.user);
        } else if (perfil.hash_dispositivo !== localHash) {
            // CASO B: Recuperación (Nuevo dispositivo)
            await manejarRecuperacionCuenta(perfil);
        } else {
            // CASO A (Vía link): Hash coincide
            entrarAlCatalogo(perfil);
        }
    }
    
    // Persistencia tras F5
    if (event === 'INITIAL_SESSION' && session?.user) {
        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        if (perfil) entrarAlCatalogo(perfil);
    }

    if (event === 'SIGNED_OUT') {
        window.location.reload();
    }
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("¡Bienvenido! ¿Cómo te llamas?");
    const wa = prompt("WhatsApp para acreditar tus 500 Pesos JyF de regalo:");
    if (!nombre || !wa) { registrando = false; return client.auth.signOut(); }

    const miHash = await generarHashDispositivo(user.email, wa, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    
    await client.from('perfiles').insert({ 
        id: user.id, 
        email: user.email, 
        nombre_google: nombre, 
        whatsapp: wa, 
        hash_dispositivo: miHash, 
        pesos_jyf: 500 
    });
    
    const { data: nuevoPerfil } = await client.from('perfiles').select('*').eq('id', user.id).single();
    entrarAlCatalogo(nuevoPerfil);
}

async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0;
        mostrarNotificacion("⚠️ Alerta", "Superaste el límite de recuperaciones. Tus puntos han sido reseteados por seguridad.");
    } else {
        mostrarNotificacion("Recuperación", `Dispositivo nuevo detectado. Recuperación ${nuevoContador}/3.`);
    }

    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp, Math.random().toString());
    localStorage.setItem('jyf_DB_key', miHash);
    
    await client.from('perfiles').update({ 
        hash_dispositivo: miHash, 
        nro_recuperacion: nuevoContador, 
        pesos_jyf: nuevosPesos 
    }).eq('id', perfil.id);

    const { data: perfilActualizado } = await client.from('perfiles').select('*').eq('id', perfil.id).single();
    entrarAlCatalogo(perfilActualizado);
}

function mostrarNotificacion(titulo, mensaje) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').innerText = titulo;
    document.getElementById('modal-text').innerText = mensaje;
    document.getElementById('modal-cancel').classList.add('hidden');
    document.getElementById('modal-confirm').onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

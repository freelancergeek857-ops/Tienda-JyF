/**
 * auth.js - Versión Blindada (Cases A, B, C + Seguridad de Link)
 */

const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente para identificación (sin persistencia de sesión para evitar bloqueos de Locks)
const identClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

// Variables globales para controlar el flujo de UI
window.accesoConcedido = false;
let registrando = false;
let usuarioPendiente = null;
let loginEnProgreso = false;

// Limpiar fragmentos de la URL (evita errores de link usado al recargar)
if (window.location.hash || window.location.search.includes('type=magiclink')) {
    setTimeout(() => {
        window.history.replaceState(null, null, window.location.pathname);
    }, 2000);
}

/**
 * Obtiene o crea las semillas (tiempo y número aleatorio) para el hash del dispositivo.
 * Se guardan en localStorage para persistencia.
 */
function obtenerOcrearSemillaDispositivo(forzarNueva = false) {
    let time = localStorage.getItem('jyf_time');
    let rand = localStorage.getItem('jyf_rand');

    if (forzarNueva || !time || !rand) {
        time = Date.now().toString();
        rand = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('jyf_time', time);
        localStorage.setItem('jyf_rand', rand);
    }

    return { time, rand };
}

/**
 * Genera una huella digital única para el dispositivo usando hardware, navegador y semillas locales.
 */
async function generarHashDispositivo() {
    const hardwareInfo = [screen.width, screen.height, navigator.language, navigator.platform].join('|');
    const { time, rand } = obtenerOcrearSemillaDispositivo();
    const semilla = `${hardwareInfo}-${time}-${rand}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Lógica principal de acceso
 */
async function solicitarAccesoMágico() {
    if (loginEnProgreso) {
        console.log("⏳ Ya hay un proceso de login en curso, ignorando clic.");
        return;
    }

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
    loginEnProgreso = true;

    try {
        console.log("🔍 [Caso A] Buscando perfil para:", email);
        // Usamos identClient para evitar bloqueos de sesión (Locks)
        const { data: perfil, error: errP } = await identClient.from('perfiles').select('*').eq('email', email).maybeSingle();
        
        if (errP) throw errP;

        const currentHash = await generarHashDispositivo();
        console.log("🔑 Hash actual del dispositivo:", currentHash);

        // CASO A: El mail existe y el hash coincide (Dispositivo reconocido)
        if (perfil && perfil.hash_dispositivo === currentHash) {
            console.log("🚀 CASO A: Dispositivo reconocido. Entrando directo...");
            return entrarAlCatalogo(perfil); 
        }

        console.log("📧 CASO B/C: Requiere validación por Magic Link.");
        obtenerOcrearSemillaDispositivo(true);

        localStorage.setItem('jyf_auth_pending_email', email);
        localStorage.setItem('jyf_auth_nonce', Math.random().toString(36).substring(2, 15));

        console.log("📨 Enviando Magic Link a Supabase...");
        const { error: errOtp } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: https://freelancergeek857-ops.github.io/Tienda-JyF/ }
        });

        if (errOtp) throw errOtp;

        console.log("📩 Magic Link enviado con éxito.");
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('email-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');

    } catch (err) {
        console.error("💥 Error en solicitarAccesoMágico:", err);
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.innerHTML = originalText;
        mostrarNotificacion("Error de Acceso", err.message || "Error desconocido.");
    } finally {
        loginEnProgreso = false;
    }
}

/**
 * Listener de Auth de Supabase
 */
client.auth.onAuthStateChange(async (event, session) => {
    console.log("🔔 Evento Auth:", event);
    
    if (event === 'SIGNED_IN' && session?.user && !registrando && !loginEnProgreso) {
        loginEnProgreso = true;
        try {
            const localNonce = localStorage.getItem('jyf_auth_nonce');
            const emailCheck = localStorage.getItem('jyf_auth_pending_email');

            if (localNonce) {
                if (emailCheck && emailCheck !== session.user.email) {
                    mostrarNotificacion("⚠️ Seguridad", "Este link no corresponde al correo solicitado.");
                    return client.auth.signOut();
                }
                localStorage.removeItem('jyf_auth_nonce');
                localStorage.removeItem('jyf_auth_pending_email');
            }

            const { data: perfil, error } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
            const newHash = await generarHashDispositivo();

            if (error) throw error;

            if (!perfil) {
                registrando = true;
                usuarioPendiente = session.user;
                entrarAlCatalogo({ pesos_jyf: 500, nombre_google: "Nuevo Usuario" });
                document.getElementById('modal-registro').classList.remove('hidden');
            } else if (perfil.hash_dispositivo !== newHash) {
                await manejarRecuperacionCuenta(perfil, newHash);
            } else {
                entrarAlCatalogo(perfil);
            }
        } catch (err) {
            console.error("💥 Error en onAuthStateChange:", err);
        } finally {
            loginEnProgreso = false;
        }
    }
    
    if (event === 'SIGNED_OUT') {
        window.accesoConcedido = false;
        document.getElementById('seccion-login').classList.remove('hidden');
        document.getElementById('seccion-catalogo').classList.add('hidden');
    }
});

async function procesarRegistroFinal() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const wa = document.getElementById('reg-whatsapp').value.trim();
    
    if (!nombre || !wa) {
        return alert("Por favor, completá tu nombre y WhatsApp.");
    }

    const miHash = await generarHashDispositivo();
    
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

async function manejarRecuperacionCuenta(perfil, newHash) {
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

    await client.from('perfiles').update({ 
        hash_dispositivo: newHash, 
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

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
        
        // Generamos el hash actual con las semillas que ya existen en localStorage
        const currentHash = await generarHashDispositivo();

        // CASO A: El mail existe y el hash coincide (Dispositivo reconocido)
        if (perfil && perfil.hash_dispositivo === currentHash) {
            console.log("Caso A: Dispositivo reconocido.");
            return entrarAlCatalogo(perfil); 
        }

        // CASO B o C: No coincide el hash o es nuevo usuario.
        // Forzamos la creación de nuevas semillas para el nuevo hash que se validará tras el Magic Link.
        obtenerOcrearSemillaDispositivo(true);

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
    
    // Si es un ingreso fresco por Magic Link
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const localNonce = localStorage.getItem('jyf_auth_nonce');
        const emailCheck = localStorage.getItem('jyf_auth_pending_email');

        // Solo validamos el nonce si realmente estamos esperando un login por link
        if (localNonce) {
            if (emailCheck !== session.user.email) {
                mostrarNotificacion("⚠️ Seguridad", "Este link no corresponde al correo solicitado.");
                return client.auth.signOut();
            }
            localStorage.removeItem('jyf_auth_nonce');
            localStorage.removeItem('jyf_auth_pending_email');
        }

        const { data: perfil } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        const newHash = await generarHashDispositivo();

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
    }
    
    // Si ya hay una sesión pero el usuario recargó la página
    // NO entramos automáticamente al catálogo para respetar el deseo del usuario de pedir el mail
    if (event === 'INITIAL_SESSION' && session?.user) {
        console.log("Sesión inicial detectada. Esperando validación de mail.");
    }

    if (event === 'SIGNED_OUT') {
        window.accesoConcedido = false;
        // No recargar automáticamente para evitar loops, solo asegurar que el login sea visible
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

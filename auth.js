const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

/**
 * Genera un hash SHA-256 único para el dispositivo.
 * @param {string} email 
 * @param {string} whatsapp 
 * @param {string} salEspecial 
 */
async function generarHashDispositivo(email, whatsapp, salEspecial = "fija") {
    const hardwareInfo = [
        navigator.userAgent,
        screen.width,
        screen.height,
        navigator.language,
        navigator.hardwareConcurrency || 'unknown'
    ].join('|');
    
    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${salEspecial}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Inicia el proceso de Magic Link con Supabase.
 */
async function solicitarAccesoMágico() {
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) {
        return mostrarNotificacion("Error", "Por favor, ingresá un correo de Gmail válido.");
    }

    const { error } = await client.auth.signInWithOtp({
        email,
        options: { 
            emailRedirectTo: window.location.origin 
        }
    });

    if (error) {
        mostrarNotificacion("Error", "No pudimos enviar el acceso: " + error.message);
    } else {
        document.getElementById('btn-acceso').classList.add('hidden');
        emailInput.classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

/**
 * Escucha cambios en el estado de autenticación.
 */
client.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth Event:", event);
    
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && !registrando) {
        const user = session.user;
        
        // Buscamos el perfil en la base de datos
        const { data: perfil, error } = await client
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        
        if (error) {
            console.error("Error al obtener perfil:", error);
            return;
        }

        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            // Usuario nuevo
            registrando = true;
            await registrarNuevoUsuario(user);
        } else if (perfil.hash_dispositivo !== localHash) {
            // Cambio de dispositivo detectado
            await manejarRecuperacionCuenta(perfil);
        } else {
            // Acceso rutinario exitoso
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});

/**
 * Registra un nuevo usuario y genera su huella digital inicial.
 */
async function registrarNuevoUsuario(user) {
    const nombre = prompt("¡Bienvenido al Búnker! ¿Cómo te llamas?");
    const wa = prompt("WhatsApp para acreditar tus 500 Pesos JyF de regalo:");
    
    if (!nombre || !wa) {
        mostrarNotificacion("Registro Cancelado", "Necesitamos tus datos para crear la cuenta.");
        registrando = false;
        return client.auth.signOut();
    }

    const nroRandom = Math.random().toString();
    const miHash = await generarHashDispositivo(user.email, wa, nroRandom);
    
    // Guardamos localmente
    localStorage.setItem('jyf_DB_key', miHash);

    const { error } = await client.from('perfiles').insert({ 
        id: user.id, 
        email: user.email, 
        nombre_google: nombre, 
        whatsapp: wa, 
        hash_dispositivo: miHash, 
        pesos_jyf: 500,
        nro_recuperacion: 0
    });

    if (error) {
        mostrarNotificacion("Error", "No pudimos crear tu perfil: " + error.message);
        registrando = false;
    } else {
        mostrarNotificacion("¡Éxito!", `Bienvenido ${nombre}. Se han acreditado 500 Pesos JyF.`);
        entrarAlCatalogo();
    }
}

/**
 * Maneja la lógica de recuperación cuando se detecta un nuevo dispositivo.
 */
async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0; // Reiniciamos contador tras el reset de puntos
        mostrarNotificacion("⚠️ Límite Alcanzado", "Has alcanzado el límite de dispositivos. Tus Pesos JyF se han reseteado a 0 por seguridad.");
    } else {
        mostrarNotificacion("Nuevo Dispositivo", `¡Hola ${perfil.nombre_google}! Detectamos un nuevo dispositivo (${nuevoContador}/3).`);
    }

    // Generamos un nuevo hash para este dispositivo
    const nroRandom = Math.random().toString();
    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp, nroRandom);
    
    localStorage.setItem('jyf_DB_key', miHash);

    const { error } = await client.from('perfiles').update({
        hash_dispositivo: miHash, 
        nro_recuperacion: nuevoContador, 
        pesos_jyf: nuevosPesos
    }).eq('id', perfil.id);

    if (error) {
        console.error("Error en recuperación:", error);
    } else {
        entrarAlCatalogo();
    }
}

/**
 * Utilidad para mostrar notificaciones sin usar alert()
 */
function mostrarNotificacion(titulo, mensaje) {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mText = document.getElementById('modal-text');
    const mCancel = document.getElementById('modal-cancel');
    const mConfirm = document.getElementById('modal-confirm');

    mTitle.innerText = titulo;
    mText.innerText = mensaje;
    mCancel.classList.add('hidden');
    mConfirm.onclick = () => modal.classList.add('hidden');
    
    modal.classList.remove('hidden');
}

/**
 * Utilidad para confirmaciones personalizadas
 */
function solicitarConfirmacion(titulo, mensaje, onConfirm) {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mText = document.getElementById('modal-text');
    const mCancel = document.getElementById('modal-cancel');
    const mConfirm = document.getElementById('modal-confirm');

    mTitle.innerText = titulo;
    mText.innerText = mensaje;
    mCancel.classList.remove('hidden');
    
    mCancel.onclick = () => modal.classList.add('hidden');
    mConfirm.onclick = () => {
        modal.classList.add('hidden');
        onConfirm();
    };
    
    modal.classList.remove('hidden');
}

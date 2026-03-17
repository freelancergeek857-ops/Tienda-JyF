const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

/**
 * 1. GENERADOR DE HASH (La huella digital del dispositivo)
 * Mezcla hardware, datos del usuario, tiempo y un factor aleatorio.
 */
async function generarHashDispositivo(email, whatsapp) {
    const hardwareInfo = [
        navigator.userAgent,
        screen.width + "x" + screen.height,
        navigator.language,
        navigator.hardwareConcurrency || 'unknown'
    ].join('|');

    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${Date.now()}-${Math.random()}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 2. SOLICITUD DE ACCESO (Botón Principal)
 * Verifica si el dispositivo es conocido antes de enviar el Magic Link.
 */
async function solicitarAccesoMágico() {
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) return alert("Por favor, ingresá un Gmail válido.");

    console.log("Buscando acceso rápido para:", email);

    // 1. Intentamos el acceso por Hash (aprovechando tu política 'verificar_existencia_anonimo')
    const { data: perfil, error } = await client
        .from('perfiles')
        .select('id, email, hash_dispositivo, pesos_jyf')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error("Error de DB:", error.message);
    }

    const localHash = localStorage.getItem('jyf_DB_key');

    // 2. Lógica de entrada directa
    if (perfil && localHash && localHash === perfil.hash_dispositivo) {
        console.log("✅ Dispositivo reconocido. Entrando al búnker...");
        
        // Seteamos el usuario manual para que app.js lo reconozca
        window.usuarioLogueadoManual = perfil;
        
        // Llamamos a la función de app.js para mostrar el catálogo
        if (typeof entrarAlCatalogo === "function") {
            return entrarAlCatalogo();
        }
    }

    // 3. Si no coincide el Hash, mandamos el Magic Link (Registro o Dispositivo Nuevo)
    console.log("📩 Mandando Magic Link por seguridad...");
    
    const { error: authError } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (authError) {
        alert("Error al enviar el link: " + authError.message);
    } else {
        alert("¡Hola! Por seguridad, enviamos un link de acceso a tu Gmail para validar este dispositivo.");
        document.getElementById('btn-acceso').classList.add('hidden');
        emailInput.classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

/**
 * 3. DETECTOR DE ESTADO (Auth Listener)
 * Se activa al volver del mail o al cargar la página si ya hay sesión.
 */
client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const user = session.user;
        
        const { data: perfil } = await client
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            // Caso: Usuario nuevo
            registrando = true;
            await registrarNuevoUsuario(user);
        } else if (perfil.hash_dispositivo !== localHash) {
            // Caso: Cambio de dispositivo (Recuperación)
            await manejarRecuperacionCuenta(perfil);
        } else {
            // Caso: Todo OK
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});

/**
 * 4. REGISTRO DE NUEVO USUARIO
 * Crea la fila inicial con los 500 Pesos JyF de regalo.
 */
async function registrarNuevoUsuario(user) {
    const nombre = prompt("¿Cómo te llamas?");
    const wa = prompt("WhatsApp para tus 500 Pesos JyF:");
    
    if (!nombre || !wa) return client.auth.signOut();

    const miHash = await generarHashDispositivo(user.email, wa);
    localStorage.setItem('jyf_DB_key', miHash);

    // DEBUG para ver qué estamos mandando
    console.log("Intentando registrar a:", user.id);

    // USAMOS EL CLIENTE CON UNA PEQUEÑA ESPERA O FORZANDO EL ID
    const { data, error: insError } = await client
        .from('perfiles')
        .insert({ 
            id: user.id, 
            email: user.email, 
            nombre_google: nombre, 
            whatsapp: wa, 
            hash_dispositivo: miHash,
            pesos_jyf: 500,
            nro_recuperacion: 0
        })
        .select(); // El .select() ayuda a confirmar que la fila se creó

    if (insError) {
        console.error("ERROR DETALLADO:", insError);
        alert("Error de registro: " + insError.message);
        registrando = false;
    } else {
        alert("¡USUARIO CREADO EXITOSAMENTE!");
        window.location.reload();
    }
}

/**
 * 5. MANEJO DE RECUPERACIÓN
 * Controla el límite de cambios de dispositivo (3 veces).
 */
async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;
    let advertencia = "";

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0;
        advertencia = "\n\n⚠️ LÍMITE DE RECUPERACIONES ALCANZADO. Tus Pesos JyF se han reseteado a 0 por seguridad.";
    } else {
        advertencia = `\n\nTe quedan ${3 - nuevoContador} intentos antes del reseteo de puntos.`;
    }

    alert(`¡Hola de nuevo ${perfil.nombre_google}! Detectamos un cambio de dispositivo. Acceso restablecido.${advertencia}`);

    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp);
    localStorage.setItem('jyf_DB_key', miHash);

    // Actualizamos la fila existente con el nuevo hash y contador
    await client.from('perfiles').update({
        hash_dispositivo: miHash,
        nro_recuperacion: nuevoContador,
        pesos_jyf: nuevosPesos
    }).eq('id', perfil.id);

    window.location.reload();
}
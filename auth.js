const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

// 1. GENERADOR DE HASH (Hardware + Datos + Tiempo + Random)
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

// 2. BOTÓN PRINCIPAL: Acceso Directo o Solicitud de Mail
async function solicitarAccesoMágico() {
    const email = document.getElementById('email-acceso').value.trim();
    if (!email.endsWith('@gmail.com')) return alert("Solo Gmail");

    const { data: perfil } = await client
        .from('perfiles')
        .select('id, hash_dispositivo')
        .eq('email', email)
        .maybeSingle();

    if (perfil) {
        const localHash = localStorage.getItem('jyf_DB_key');
        if (localHash && localHash === perfil.hash_dispositivo) {
            alert("¡Identidad confirmada! Entrando a la tienda...");
            if (typeof entrarAlCatalogo === "function") return entrarAlCatalogo();
        } else {
            alert("Dispositivo nuevo detectado. Se requiere validación por email.");
        }
    }

    const { error: authError } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (authError) alert(authError.message);
    else {
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

// 3. DETECTOR DE ESTADO (Gestión de Identidad)
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
            registrando = true;
            await registrarNuevoUsuario(user);
        } else if (perfil.hash_dispositivo !== localHash) {
            await manejarRecuperacionCuenta(perfil);
        } else {
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});

// 4. REGISTRO DE NUEVO USUARIO
async function registrarNuevoUsuario(user) {
    const nombre = prompt("¿Cómo te llamas?");
    const wa = prompt("Ingresá tu WhatsApp para activar tus 500 Pesos JyF:");
    
    if (!nombre || !wa) {
        alert("Datos obligatorios.");
        return client.auth.signOut();
    }

    const miHash = await generarHashDispositivo(user.email, wa);
    localStorage.setItem('jyf_DB_key', miHash);

    const { error: insError } = await client.from('perfiles').insert([
        { 
            id: user.id, 
            email: user.email, 
            nombre_google: nombre, 
            whatsapp: wa, 
            hash_dispositivo: miHash
        }
    ]);

    if (insError) {
        alert("Error al crear cuenta: " + insError.message);
        registrando = false;
    } else {
        alert("¡USUARIO CREADO EXITOSAMENTE! Recibiste 500 Pesos JyF de regalo.");
        location.reload();
    }
}

// 5. MANEJO DE RECUPERACIÓN (Finalizado)
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

    await client.from('perfiles').update({
        hash_dispositivo: miHash,
        nro_recuperacion: nuevoContador,
        pesos_jyf: nuevosPesos
    }).eq('id', perfil.id);

    location.reload();
}
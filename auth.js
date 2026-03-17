const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

// Ahora el hash recibe una "sal". Si no se la pasas, usa una por defecto (para consultas)
async function generarHashDispositivo(email, whatsapp, salEspecial = "fija") {
    const hardwareInfo = [navigator.userAgent, screen.width, navigator.language].join('|');
    // Si es registro/recuperación, salEspecial será un nro random. Si no, será algo fijo.
    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${salEspecial}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solicitarAccesoMágico() {
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    if (!email.endsWith('@gmail.com')) return alert("Ingresá un Gmail válido.");

    const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (error) alert("Error: " + error.message);
    else {
        document.getElementById('btn-acceso').classList.add('hidden');
        emailInput.classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const user = session.user;
        const { data: perfil } = await client.from('perfiles').select('*').eq('id', user.id).maybeSingle();
        
        // LEEMOS EL HASH QUE YA EXISTE EN EL DISPOSITIVO
        const localHash = localStorage.getItem('jyf_DB_key');

        if (!perfil) {
            registrando = true;
            await registrarNuevoUsuario(user);
        } else if (perfil.hash_dispositivo !== localHash) {
            // Si el hash de la DB es distinto al que tiene el navegador guardado...
            await manejarRecuperacionCuenta(perfil);
        } else {
            // SI COINCIDEN, ADENTRO
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("¡Bienvenido! ¿Cómo te llamas?");
    const wa = prompt("WhatsApp para tus 500 Pesos JyF:");
    if (!nombre || !wa) return client.auth.signOut();

    // AQUÍ USAMOS EL RANDOM SOLO POR ÚNICA VEZ
    const nroRandom = Math.random().toString();
    const miHash = await generarHashDispositivo(user.email, wa, nroRandom);
    
    // Lo guardamos en el navegador del usuario para siempre
    localStorage.setItem('jyf_DB_key', miHash);

    const { error } = await client.from('perfiles').insert({ 
        id: user.id, email: user.email, nombre_google: nombre, 
        whatsapp: wa, hash_dispositivo: miHash, pesos_jyf: 500 
    });

    if (error) alert(error.message);
    else entrarAlCatalogo();
}

async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0;
        alert("⚠️ Límite de dispositivos alcanzado. Puntos reseteados a 0.");
    } else {
        alert(`¡Hola ${perfil.nombre_google}! Cambio de dispositivo detectado (${nuevoContador}/3).`);
    }

    // GENERAMOS UN NUEVO HASH RANDOM PARA ESTE NUEVO DISPOSITIVO
    const nroRandom = Math.random().toString();
    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp, nroRandom);
    
    localStorage.setItem('jyf_DB_key', miHash);

    await client.from('perfiles').update({
        hash_dispositivo: miHash, nro_recuperacion: nuevoContador, pesos_jyf: nuevosPesos
    }).eq('id', perfil.id);

    entrarAlCatalogo();
}
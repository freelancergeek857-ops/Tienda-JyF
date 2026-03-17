const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

async function generarHashDispositivo(email, whatsapp) {
    const hardwareInfo = [navigator.userAgent, screen.width + "x" + screen.height, navigator.language].join('|');
    const semilla = `${hardwareInfo}-${email}-${whatsapp}-${Date.now()}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solicitarAccesoMágico() {
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) return alert("Por favor, ingresá un Gmail válido.");

    // Siempre mandamos Magic Link por seguridad y para crear la sesión oficial
    const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
    });

    if (error) {
        alert("Error: " + error.message);
    } else {
        document.getElementById('btn-acceso').classList.add('hidden');
        emailInput.classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

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
            // RECUPERACIÓN AUTOMÁTICA (Sin pedir nombre/WA)
            await manejarRecuperacionCuenta(perfil);
        } else {
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("Bienvenido! ¿Cómo te llamas?");
    const wa = prompt("WhatsApp (para enviarte premios):");
    
    if (!nombre || !wa) return client.auth.signOut();

    const miHash = await generarHashDispositivo(user.email, wa);
    localStorage.setItem('jyf_DB_key', miHash);

    const { error } = await client.from('perfiles').insert({ 
        id: user.id, email: user.email, nombre_google: nombre, 
        whatsapp: wa, hash_dispositivo: miHash, pesos_jyf: 500 
    });

    if (error) alert(error.message);
    else window.location.reload();
}

async function manejarRecuperacionCuenta(perfil) {
    let nuevoContador = (perfil.nro_recuperacion || 0) + 1;
    let nuevosPesos = perfil.pesos_jyf;
    let msg = `¡Hola ${perfil.nombre_google}! Detectamos nuevo dispositivo.`;

    if (nuevoContador >= 3) {
        nuevosPesos = 0;
        nuevoContador = 0;
        msg += "\n⚠️ Límite de cambios alcanzado. Pesos JyF reseteados a 0.";
    } else {
        msg += `\nTe quedan ${3 - nuevoContador} cambios antes del reseteo.`;
    }

    alert(msg);

    // Generamos nuevo hash basado en sus datos ya existentes
    const miHash = await generarHashDispositivo(perfil.email, perfil.whatsapp);
    localStorage.setItem('jyf_DB_key', miHash);

    await client.from('perfiles').update({
        hash_dispositivo: miHash,
        nro_recuperacion: nuevoContador,
        pesos_jyf: nuevosPesos
    }).eq('id', perfil.id);

    window.location.reload();
}
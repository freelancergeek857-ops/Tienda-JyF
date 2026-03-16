const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

// 1. SOLICITAR MAGIC LINK
async function solicitarAccesoMágico() {
    const email = document.getElementById('email-acceso').value.trim();
    if (!email.endsWith('@gmail.com')) return alert("Solo Gmail");
    
    const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: "https://freelancergeek857-ops.github.io/Tienda-JyF/" }
    });

    if (error) alert(error.message);
    else {
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

// 2. GENERADOR DE HASH (La huella digital del dispositivo)
async function generarHashDispositivo(email, whatsapp) {
    const hardwareInfo = [
        navigator.userAgent,
        screen.width + "x" + screen.height,
        navigator.language,
        navigator.hardwareConcurrency || 'unknown'
    ].join('|');

    const semilla = `${hardwareInfo}-${email}-${whatsapp}`;
    const msgUint8 = new TextEncoder().encode(semilla);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 3. DETECTOR DE ESTADO (LOGIN)
client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const user = session.user;
        
        // IMPORTANTE: Solo pedimos las columnas que el RLS permite ver
        const { data: perfil, error } = await client
            .from('perfiles')
            .select('id, nro_user, email, nombre_google, whatsapp, pesos_jyf') 
            .eq('id', user.id)
            .maybeSingle();

        if (!perfil) {
            registrando = true;
            await registrarNuevoUsuario(user);
        } else {
            // Si ya existe, entramos directo
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

    // Generamos el hash para este dispositivo
    const miHash = await generarHashDispositivo(user.email, wa);
    
    // Lo guardamos en el navegador del usuario (local)
    localStorage.setItem('jyf_DB_key', miHash);

    const { error } = await client.from('perfiles').insert([
        { 
            id: user.id, 
            email: user.email, 
            nombre_google: nombre, 
            whatsapp: wa, 
            hash_dispositivo: miHash, // Se guarda en la DB
        }
    ]);

    if (error) {
        alert("Error al registrar: " + error.message);
        registrando = false;
    } else {
        alert("¡Bienvenido! Recibiste 500 Pesos JyF.");
        location.reload();
    }
}
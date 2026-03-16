const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. SOLICITAR MAGIC LINK
async function solicitarAccesoMágico() {
    const email = document.getElementById('email-acceso').value.trim();
    const btn = document.getElementById('btn-acceso');
    const aviso = document.getElementById('aviso-mail');

    if (!email.endsWith('@gmail.com')) {
        return alert("Lo sentimos, solo aceptamos cuentas @gmail.com");
    }

    btn.disabled = true;
    btn.innerText = "Validando...";
	
	// --- AQUÍ ESTÁ EL CAMBIO ---
    // Forzamos la URL completa para que GitHub Pages no se pierda
    const urlRedireccion = "https://freelancergeek857-ops.github.io/Tienda-JyF/";

    const { error } = await client.auth.signInWithOtp({
        email: email,
        options: { 
            emailRedirectTo: urlRedireccion 
        }
    });
    // ---------------------------

    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.innerText = "Pedir Llave Mágica ✨";
    } else {
        btn.classList.add('hidden');
        aviso.classList.remove('hidden');
    }

    /* const { error } = await client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.innerText = "Pedir Llave Mágica ✨";
    } else {
        btn.classList.add('hidden');
        aviso.classList.remove('hidden');
    }
} */

// 2. GENERADOR DE HASH SHA-256 (El "DNI" del hardware)
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

// 3. DETECTOR DE REGRESO DEL MAIL
client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
        const user = session.user;

        // Buscamos el perfil en la DB
        const { data: perfil, error } = await client
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!perfil) {
            // USUARIO NUEVO: Registro y creación de Hash
            await registrarNuevoUsuario(user);
        } else {
            // USUARIO EXISTENTE: Verificar Blindaje de Dispositivo
            verificarDispositivo(perfil);
        }
    }
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("¿Cómo te llamas?");
    const whatsapp = prompt("Ingresá tu WhatsApp para activar tus 500 Pesos JyF:");
    
    if (!whatsapp || !nombre) {
        alert("Datos obligatorios para la tienda.");
        return client.auth.signOut();
    }

    const miHash = await generarHashDispositivo(user.email, whatsapp);
    
    // Guardamos el Hash localmente en este navegador
    localStorage.setItem('jyf_bunker_key', miHash);

    const { error } = await client.from('perfiles').insert([{
        id: user.id,
        email: user.email,
        nombre_google: nombre,
        whatsapp: whatsapp,
        hash_dispositivo: miHash,
        pesos_jyf: 500 // Regalo inicial
    }]);

    if (error) {
        alert("Error al registrar: " + error.message);
    } else {
        alert("¡Bienvenido! Recibiste 500 Pesos JyF.");
        window.location.reload();
    }
}

function verificarDispositivo(perfil) {
    const hashLocal = localStorage.getItem('jyf_bunker_key');

    if (hashLocal === perfil.hash_dispositivo) {
        // COINCIDE: Pasa al catálogo
        if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
    } else {
        // NO COINCIDE: Posible intruso o cambio de dispositivo
        alert("Acceso Denegado: Este dispositivo no coincide con el registrado para esta cuenta.");
        client.auth.signOut();
    }
}
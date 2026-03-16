const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let procesandoRegistro = false; 

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
    
    const urlRedireccion = "https://freelancergeek857-ops.github.io/Tienda-JyF/";

    const { error } = await client.auth.signInWithOtp({
        email: email,
        options: { 
            emailRedirectTo: urlRedireccion 
        }
    });

    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.innerText = "Pedir Llave Mágica ✨";
    } else {
        btn.classList.add('hidden');
        aviso.classList.remove('hidden');
    }
}

// 2. GENERADOR DE HASH SHA-256
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

// 3. DETECTOR DE ESTADO
client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !procesandoRegistro) {
        const user = session.user;

        const { data: perfil, error } = await client
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(); 

        if (!perfil) {
            procesandoRegistro = true; 
            await registrarNuevoUsuario(user);
        } else {
            verificarDispositivo(perfil);
        }
    }
});

async function registrarNuevoUsuario(user) {
    const nombre = prompt("¿Cómo te llamas?");
    const whatsapp = prompt("Ingresá tu WhatsApp para activar tus 500 Pesos JyF:");
    
    if (!whatsapp || !nombre) {
        alert("Datos obligatorios.");
        return client.auth.signOut();
    }

    const miHash = await generarHashDispositivo(user.email, whatsapp);
    localStorage.setItem('jyf_bunker_key', miHash);

    const { error } = await client.from('perfiles').insert([{
        id: user.id,
        email: user.email,
        nombre_google: nombre,
        whatsapp: whatsapp,
        hash_dispositivo: miHash,
        pesos_jyf: 500 
    }]);

    if (error) {
        alert("Error al registrar: " + error.message);
        procesandoRegistro = false; // Liberamos por si quiere reintentar
    } else {
        alert("¡Bienvenido! Recibiste 500 Pesos JyF.");
        window.location.reload();
    }
}

function verificarDispositivo(perfil) {
    const hashLocal = localStorage.getItem('jyf_bunker_key');
    if (hashLocal === perfil.hash_dispositivo) {
        if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
    } else {
        alert("Acceso Denegado: Dispositivo no reconocido.");
        client.auth.signOut();
    }
}
/**
 * auth.js - Versión Blindada (Cases A, B, C + Seguridad de Link)
 */

const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';

// Cliente principal de Supabase (Configuración estándar y estable)
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'jyf-auth-token',
        storage: window.localStorage
    }
});

/**
 * Función auxiliar para buscar perfil sin usar el SDK de Auth (evita bloqueos y conflictos)
 */
async function buscarPerfilPorEmail(email) {
    try {
        const url = `${SUPABASE_URL}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=*`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data[0] || null;
    } catch (e) {
        console.error("❌ Error en fetch de perfil:", e);
        return null;
    }
}

// Variables globales para controlar el flujo de UI
window.accesoConcedido = false;
let registrando = false;
let usuarioPendiente = null;
let loginEnProgreso = false;
let sistemaListo = false;

// Bloqueo inicial de seguridad para estabilizar Supabase
setTimeout(() => {
    sistemaListo = true;
    const btn = document.getElementById('btn-acceso');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = "1";
        console.log("✅ Sistema listo para ingreso manual.");
    }
}, 1500);

// Función de seguridad para resetear el estado si algo se cuelga
function resetearEstadoLogin() {
    loginEnProgreso = false;
    const btn = document.getElementById('btn-acceso');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.innerHTML = `<span>Ingresar</span>`;
    }
}

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
 * Abre Gmail de forma inteligente: App en Android, Web en PC.
 */
function abrirGmailInteligente() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    if (isAndroid) {
        // Intenta abrir la APP de Gmail directamente (Intent de Android)
        window.location.href = "intent://#Intent;package=com.google.android.gm;scheme=https;end";
    } else {
        // En PC abre la web normal en la misma pestaña
        window.location.href = "https://mail.google.com";
    }
}

/**
 * Lógica principal de acceso - 100% Manual
 */
async function solicitarAccesoMágico() {
    if (!sistemaListo) return console.log("⏳ Esperando estabilización inicial...");
    if (loginEnProgreso) return console.log("⏳ Ya hay un proceso en curso...");

    const btn = document.getElementById('btn-acceso');
    const emailInput = document.getElementById('email-acceso');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email.endsWith('@gmail.com')) {
        return mostrarNotificacion("Error", "Por favor, ingresá un correo de Gmail válido.");
    }

    // Bloqueo manual al hacer clic
    btn.disabled = true;
    btn.style.opacity = "0.5";
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span>Procesando...</span>`;
    loginEnProgreso = true;

    try {
        console.log("🔍 [Caso A] Verificando Mail y Hash...");
        const perfil = await buscarPerfilPorEmail(email);
        const currentHash = await generarHashDispositivo();
        
        // CASO A: Usuario registrado + Hash correcto = ACCESO DIRECTO
        if (perfil && perfil.hash_dispositivo === currentHash) {
            console.log("🚀 CASO A: Coincidencia total. Entrando...");
            return entrarAlCatalogo(perfil); 
        }

        // Si llegamos acá, es CASO B (Hash distinto) o CASO C (No registrado)
        console.log("📧 CASO B/C: Se requiere validación por Magic Link.");
        
        // Generamos nuevas semillas para el nuevo dispositivo/sesión
        obtenerOcrearSemillaDispositivo(true);

        localStorage.setItem('jyf_auth_pending_email', email);
        localStorage.setItem('jyf_auth_nonce', Math.random().toString(36).substring(2, 15));

        const { error: errOtp } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: 'https://freelancergeek857-ops.github.io/Tienda-JyF/' }
        });

        if (errOtp) {
            if (errOtp.status === 429) {
                throw new Error("Por seguridad, debés esperar un momento antes de pedir otro link (aprox. 60 seg).");
            }
            throw errOtp;
        }

        console.log("📩 Magic Link enviado.");
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('email-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');

    } catch (err) {
        console.error("💥 Error en solicitarAccesoMágico:", err);
        mostrarNotificacion("Error", err.message || "Error desconocido.");
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.innerHTML = originalText;
    } finally {
        loginEnProgreso = false;
    }
}

/**
 * Listener de Auth de Supabase
 */
client.auth.onAuthStateChange(async (event, session) => {
    console.log("🔔 Evento Auth:", event);
    
    // Solo procesamos SIGNED_IN si hay un nonce (viene de un Magic Link)
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const localNonce = localStorage.getItem('jyf_auth_nonce');
        
        if (!localNonce) {
            console.log("ℹ️ Sesión restaurada detectada. Ignorando para flujo manual.");
            return;
        }

        try {
            const emailCheck = localStorage.getItem('jyf_auth_pending_email');
            if (emailCheck && emailCheck !== session.user.email) {
                mostrarNotificacion("⚠️ Seguridad", "Este link no corresponde al correo solicitado.");
                return client.auth.signOut();
            }

            localStorage.removeItem('jyf_auth_nonce');
            localStorage.removeItem('jyf_auth_pending_email');

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

document.addEventListener('DOMContentLoaded', () => {
    const inputEmail = document.getElementById('email-acceso');
    const aviso = document.getElementById('aviso-autocompletar');
    
    if (inputEmail) {
        // 1. BLOQUEO DE TECLADO (BLINDADO TOTAL)
        inputEmail.addEventListener('keydown', (e) => {
            const teclasPermitidas = ['Tab', 'Enter'];
            if (!teclasPermitidas.includes(e.key)) {
                e.preventDefault();
            }
        });

        // 2. BLOQUEO DE PEGADO (PASTE)
        inputEmail.addEventListener('paste', (e) => {
            e.preventDefault();
            console.log("🚫 Pegado bloqueado. Usá el autocompletado de Google.");
        });

        // 3. DETECTOR DE AUTOCOMPLETADO
        const manejarCambio = (e) => {
            const el = e.target;
            const valor = el.value.trim().toLowerCase();
            
            if (valor.includes('@gmail.com') && valor.length > 5) {
                el.readOnly = true; 
                el.classList.remove('border-slate-700', 'focus:border-sky-500');
                el.classList.add('border-emerald-500', 'bg-slate-900', 'text-emerald-400', 'ring-2', 'ring-emerald-500/50');
                
                if(aviso) {
                    aviso.classList.remove('hidden');
                    aviso.classList.add('animate-bounce');
                }
                
                console.log("✅ Autocompletado detectado:", valor);
            } else {
                if (valor !== '') el.value = '';
            }
        };

        inputEmail.addEventListener('input', manejarCambio);
        inputEmail.addEventListener('change', manejarCambio);
    }
});

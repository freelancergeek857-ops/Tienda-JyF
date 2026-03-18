/**
 * app.js - Gestión de la Tienda y UI
 */

let totalPesosJyF = 0;

window.revelarCuerpo = function() {
    document.body.style.opacity = "1";
    
    // Revelar imagen de homenaje
    setTimeout(() => {
        const img = document.getElementById('img-homenaje');
        if (img) img.classList.add('revelada');
    }, 500);

    // Transición a la siguiente pantalla
    setTimeout(() => {
        const pantalla = document.getElementById('pantalla-carga');
        if (pantalla) {
            pantalla.style.opacity = "0";
            setTimeout(() => {
                pantalla.classList.add('hidden');
                
                // Solo mostramos el login si NO se ha concedido acceso ya
                const accesoPersistido = sessionStorage.getItem('jyf_acceso_concedido') === 'true';
                
                // Detectamos si venimos de un Magic Link (Supabase pone tokens en el hash)
                const esFlujoMagicLink = window.location.hash.includes('access_token') || 
                                         window.location.hash.includes('type=recovery') ||
                                         window.location.hash.includes('type=signup') ||
                                         window.location.hash.includes('type=invite');

                if (!window.accesoConcedido && !esFlujoMagicLink) {
                    // Siempre mostramos el login al iniciar (Caso A, B o C)
                    // El usuario debe poner su correo para verificar el Hash
                    const login = document.getElementById('seccion-login');
                    if (login) {
                        login.classList.remove('hidden');
                        setTimeout(() => login.style.opacity = "1", 50);
                    }
                }
                // Si es flujo Magic Link, no hacemos nada, auth.js se encarga
            }, 1000);
        }
    }, 3000);
}

// Eliminamos chequearSesionActiva() ya que causaba conflictos de "Locks" con auth.js
// y el usuario prefiere que se le pida el correo siempre por seguridad.

// El acceso concedido NO se persiste al recargar la página para forzar el login manual (Caso A)
window.accesoConcedido = false;

let catalogoCargado = false;

function entrarAlCatalogo(perfilExistente = null) {
    if (catalogoCargado && !perfilExistente) return; // Evitar doble carga si ya está listo
    
    window.accesoConcedido = true;
    sessionStorage.setItem('jyf_acceso_concedido', 'true');
    catalogoCargado = true;
    
    // Limpiamos la URL para que no queden tokens de Magic Link a la vista
    // y para que el botón "atrás" no vuelva al login
    window.history.replaceState(null, null, window.location.pathname);

    document.getElementById('seccion-login').classList.add('hidden');
    const cat = document.getElementById('seccion-catalogo');
    cat.classList.remove('hidden');
    setTimeout(() => cat.style.opacity = "1", 50);

    // Visualización instantánea de puntos
    if (perfilExistente) {
        totalPesosJyF = perfilExistente.pesos_jyf || 0;
        const saldoElement = document.getElementById('saldo');
        if (saldoElement) saldoElement.innerText = totalPesosJyF.toLocaleString();
    } else {
        actualizarSaldoUI();
    }
    
    cargarProductos();
}

async function actualizarSaldoUI() {
    const { data: { session } } = await client.auth.getSession();
    let query;

    if (session) {
        query = client.from('perfiles').select('pesos_jyf').eq('id', session.user.id);
    } else {
        const localHash = await generarHashDispositivo();
        query = client.from('perfiles').select('pesos_jyf').eq('hash_dispositivo', localHash);
    }

    const { data: p } = await query.maybeSingle();
    if (p) {
        totalPesosJyF = p.pesos_jyf || 0;
        const saldoElement = document.getElementById('saldo');
        if (saldoElement) saldoElement.innerText = totalPesosJyF.toLocaleString();
    }
}

async function cargarProductos() {
    const { data: productos } = await client.from('productos').select('*');
    if (!productos) return;
    
    const grilla = document.getElementById('grilla');
    if (!grilla) return;

    grilla.innerHTML = productos.map(p => `
        <div class="card rounded-2xl p-4 shadow-lg flex flex-col h-full">
            <img src="${p.imagen_url}" class="w-full h-48 object-cover rounded-xl mb-4" 
                onerror="this.src='https://picsum.photos/seed/${p.id}/400/300'">
            <h2 class="text-lg font-bold mb-2 text-white">${p.nombre}</h2>
            <div class="mt-auto">
                <span class="text-2xl font-black text-sky-400 mb-1 block">$${p.precio_venta.toLocaleString()}</span>
                <span class="text-xs text-emerald-400 font-bold mb-4 block">✨ Ganás $${(p.pesos_jyf_regalo || 0).toLocaleString()} Pesos JyF</span>
                
                <div class="flex flex-col gap-2">
                    <button onclick="comprarProducto('${p.id}', ${p.precio_venta})" 
                        class="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-sky-100 transition active:scale-95">
                        Comprar Directo 🛒
                    </button>
                    <button onclick="pedirPorWhatsApp('${p.nombre}', ${p.precio_venta})" 
                        class="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 transition active:scale-95">
                        Pedir por WhatsApp 💬
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function pedirPorWhatsApp(nombre, precio) {
    const mensaje = `¡Hola! 👋 Me interesa comprar: ${nombre} ($${precio.toLocaleString()})`;
    const url = `https://wa.me/5491112345678?text=${encodeURIComponent(mensaje)}`; // Reemplazar con el número real si es necesario
    window.open(url, '_blank');
}

function comprarProducto(id, precio) {
    if (totalPesosJyF < precio) {
        return mostrarNotificacion("Saldo Insuficiente", `Necesitás $${precio.toLocaleString()} Pesos JyF para este artículo.`);
    }
    mostrarNotificacion("Confirmar Compra", `¿Querés comprar este artículo por $${precio.toLocaleString()}?`);
}

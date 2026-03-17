/**
 * app.js - Gestión de la Tienda y UI
 */

let totalPesosJyF = 0;
let accesoConcedido = false;

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
                if (!accesoConcedido) chequearSesionActiva();
            }, 1000);
        }
    }, 3000);
}

async function chequearSesionActiva() {
    const { data: { session } } = await client.auth.getSession();
    
    if (session) {
        const { data: p } = await client.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
        if (p) return entrarAlCatalogo(p);
    }

    const localHash = localStorage.getItem('jyf_DB_key');
    if (localHash) {
        const { data: p } = await client.from('perfiles').select('*').eq('hash_dispositivo', localHash).maybeSingle();
        if (p) return entrarAlCatalogo(p);
    }

    const login = document.getElementById('seccion-login');
    if (login) {
        login.classList.remove('hidden');
        setTimeout(() => login.style.opacity = "1", 50);
    }
}

function entrarAlCatalogo(perfilExistente = null) {
    accesoConcedido = true;
    
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
        const localHash = localStorage.getItem('jyf_DB_key');
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
                <span class="text-2xl font-black text-sky-400 mb-4 block">$${p.precio_venta.toLocaleString()}</span>
                <button onclick="comprarProducto('${p.id}', ${p.precio_venta})" 
                    class="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-sky-100 transition active:scale-95">
                    Comprar 🛒
                </button>
            </div>
        </div>
    `).join('');
}

function comprarProducto(id, precio) {
    if (totalPesosJyF < precio) {
        return mostrarNotificacion("Saldo Insuficiente", `Necesitás $${precio.toLocaleString()} Pesos JyF para este artículo.`);
    }
    mostrarNotificacion("Confirmar Compra", `¿Querés comprar este artículo por $${precio.toLocaleString()}?`);
}

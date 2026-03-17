/**
 * app.js - Gestión Estática de la Tienda
 */

let totalPesosJyF = 0;

window.revelarCuerpo = function() {
    document.body.style.opacity = "1";
    setTimeout(() => document.getElementById('img-homenaje').classList.add('revelada'), 500);
    setTimeout(() => {
        document.getElementById('pantalla-carga').style.opacity = "0";
        setTimeout(() => {
            document.getElementById('pantalla-carga').classList.add('hidden');
            chequearSesionActiva();
        }, 1000);
    }, 3000);
}

async function chequearSesionActiva() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        const login = document.getElementById('seccion-login');
        login.classList.remove('hidden');
        setTimeout(() => login.style.opacity = "1", 50);
    }
}

function entrarAlCatalogo() {
    document.getElementById('seccion-login').classList.add('hidden');
    const cat = document.getElementById('seccion-catalogo');
    cat.classList.remove('hidden');
    setTimeout(() => cat.style.opacity = "1", 50);
    cargarProductos();
    actualizarSaldoUI();
}

async function actualizarSaldoUI() {
    const { data: { session } } = await client.auth.getSession();
    let userId = session ? session.user.id : null;
    
    if (!userId) {
        const localHash = localStorage.getItem('jyf_DB_key');
        const { data: p } = await client.from('perfiles').select('pesos_jyf').eq('hash_dispositivo', localHash).maybeSingle();
        if (p) totalPesosJyF = p.pesos_jyf;
    } else {
        const { data: p } = await client.from('perfiles').select('pesos_jyf').eq('id', userId).maybeSingle();
        if (p) totalPesosJyF = p.pesos_jyf;
    }
    document.getElementById('saldo').innerText = totalPesosJyF.toLocaleString();
}

async function cargarProductos() {
    const { data: productos } = await client.from('productos').select('*');
    if (!productos) return;
    document.getElementById('grilla').innerHTML = productos.map(p => `
        <div class="card rounded-2xl p-4 shadow-lg flex flex-col h-full">
            <img src="${p.imagen_url}" class="w-full h-48 object-cover rounded-xl mb-4" onerror="this.src='https://picsum.photos/seed/item/400/300'">
            <h2 class="text-lg font-bold mb-2 text-white">${p.nombre}</h2>
            <span class="text-2xl font-black text-sky-400 mb-4">$${p.precio_venta.toLocaleString()}</span>
            <button class="bg-white text-black py-3 rounded-xl font-bold hover:bg-sky-100 transition">Comprar 🛒</button>
        </div>
    `).join('');
}

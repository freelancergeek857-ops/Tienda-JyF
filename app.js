// Variables Globales
let totalPesosJyF = 0; 
const IMG_PLACEHOLDER = "https://picsum.photos/seed/placeholder/400/300";

/**
 * Maneja la animación de entrada y el inicio de la app.
 */
window.revelarCuerpo = function() {
    document.body.style.opacity = "1";
    const imgHomenaje = document.getElementById('img-homenaje');
    const pantalla = document.getElementById('pantalla-carga');

    // Efecto de revelado de imagen
    setTimeout(() => { 
        if (imgHomenaje) imgHomenaje.classList.add('revelada'); 
    }, 500);

    // Desvanecimiento de pantalla de carga
    setTimeout(() => {
        if (pantalla) {
            pantalla.style.opacity = "0";
            setTimeout(() => {
                pantalla.classList.add('hidden');
                chequearSesionActiva(); 
            }, 1000);
        }
    }, 3000);
}

/**
 * Verifica si hay una sesión activa y valida el hash.
 */
async function chequearSesionActiva() {
    const { data: { session } } = await client.auth.getSession();
    const login = document.getElementById('seccion-login');
    
    if (session) {
        const { data: perfil } = await client
            .from('perfiles')
            .select('id, hash_dispositivo')
            .eq('id', session.user.id)
            .maybeSingle();
            
        const localHash = localStorage.getItem('jyf_DB_key');

        // Solo entra directo si ya tiene perfil y el hash coincide
        if (perfil && perfil.hash_dispositivo === localHash) {
            entrarAlCatalogo();
        } else {
            login.classList.remove('hidden');
            login.style.opacity = "1";
        }
    } else {
        login.classList.remove('hidden');
        login.style.opacity = "1";
    }
}

/**
 * Muestra el catálogo con transiciones suaves.
 */
function entrarAlCatalogo() {
    const login = document.getElementById('seccion-login');
    const catalogo = document.getElementById('seccion-catalogo');

    if (login) login.classList.add('hidden');
    
    if (catalogo) {
        catalogo.classList.remove('hidden');
        // Delay para activar la transición de opacidad
        setTimeout(() => {
            catalogo.style.opacity = "1";
            catalogo.classList.add('opacity-100');
        }, 50);
    }
    
    cargarProductos();
    actualizarSaldoUI(); 
}

/**
 * Sincroniza el saldo del usuario desde la DB.
 */
async function actualizarSaldoUI() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const { data: perfil } = await client
        .from('perfiles')
        .select('pesos_jyf')
        .eq('id', session.user.id)
        .maybeSingle();

    if (perfil) {
        totalPesosJyF = perfil.pesos_jyf || 0;
        document.getElementById('saldo').innerText = totalPesosJyF.toLocaleString();
    }
}

/**
 * Carga y renderiza los productos.
 */
async function cargarProductos() {
    const grilla = document.getElementById('grilla');
    if (!grilla) return;
    
    // Skeleton de Carga
    grilla.innerHTML = Array(4).fill(0).map(() => `
        <div class="card rounded-2xl overflow-hidden p-4 shadow-lg flex flex-col h-full animate-pulse">
            <div class="w-full h-48 bg-slate-800 rounded-xl mb-4"></div>
            <div class="h-6 bg-slate-800 rounded w-3/4 mb-4"></div>
            <div class="h-4 bg-slate-800 rounded w-1/2 mb-4"></div>
            <div class="h-10 bg-slate-800 rounded mt-auto"></div>
        </div>`).join('');

    const { data, error } = await client.from('productos').select('*');
    
    if (error) {
        grilla.innerHTML = `<p class="text-red-400 col-span-full">Error al conectar con el búnker: ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        grilla.innerHTML = `<p class="text-slate-400 col-span-full text-center py-12">No hay productos disponibles en este momento.</p>`;
        return;
    }

    grilla.innerHTML = data.map(p => {
        const linkWS = `https://wa.me/+5492216567905?text=${encodeURIComponent('¡Hola! Me interesa ' + p.nombre)}`;
        return `
        <div class="card rounded-2xl overflow-hidden p-4 shadow-lg flex flex-col h-full animate-fade-in">
            <img src="${p.imagen_url}" class="w-full h-48 object-cover rounded-xl mb-4" onerror="this.src='${IMG_PLACEHOLDER}'" loading="lazy">
            <h2 class="text-lg font-bold mb-2 flex-grow text-white">${p.nombre}</h2>
            <div class="flex justify-between items-center mb-4">
                <span class="text-2xl font-black text-sky-400">$${p.precio_venta.toLocaleString()}</span>
            </div>
            <div class="flex flex-col gap-2">
                <a href="${linkWS}" target="_blank" class="bg-green-600 text-white text-center py-3 rounded-xl font-bold hover:bg-green-500 transition shadow-lg">WhatsApp 📱</a>
                <button onclick="intentarCompra('${p.nombre}', ${p.precio_venta}, ${p.pesos_jyf_regalo})" class="bg-white text-black py-3 rounded-xl font-bold hover:bg-sky-100 transition shadow-lg">Comprar Directo 🛒</button>
            </div>
            <div class="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 text-center mt-4">
                <span class="text-sky-400 font-bold text-xs tracking-wider">🎁 +${p.pesos_jyf_regalo} PESOS JYF DE REGALO</span>
            </div>
        </div>`;
    }).join('');
}

/**
 * Inicia el proceso de compra con confirmación personalizada.
 */
function intentarCompra(nombre, precio, regalo) {
    solicitarConfirmacion(
        "Confirmar Compra", 
        `¿Deseas adquirir ${nombre} por $${precio.toLocaleString()}?`,
        () => procesarCompra(nombre, precio, regalo)
    );
}

/**
 * Procesa la lógica de puntos y actualiza la DB.
 */
async function procesarCompra(nombre, precio, regalo) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return mostrarNotificacion("Sesión Expirada", "Por favor, ingresa de nuevo.");
    
    const userId = session.user.id;
    let nuevoSaldo = totalPesosJyF;
    let montoMovimiento = 0;
    let motivo = "";

    // Preguntar si desea usar puntos si tiene saldo
    if (totalPesosJyF > 0) {
        solicitarConfirmacion(
            "Usar Pesos JyF",
            `Tienes ${totalPesosJyF} Pesos JyF disponibles. ¿Deseas usarlos para esta compra?`,
            async () => {
                // Lógica usando puntos
                if (totalPesosJyF >= precio) {
                    montoMovimiento = -precio;
                    nuevoSaldo -= precio;
                    motivo = `Compra total con puntos: ${nombre}`;
                } else {
                    montoMovimiento = -totalPesosJyF;
                    nuevoSaldo = 0;
                    motivo = `Pago parcial con puntos: ${nombre}`;
                }
                await ejecutarTransaccion(userId, nuevoSaldo, montoMovimiento, motivo);
            },
            async () => {
                // Lógica sin usar puntos (gana regalo)
                montoMovimiento = regalo;
                nuevoSaldo += regalo;
                motivo = `Regalo por compra: ${nombre}`;
                await ejecutarTransaccion(userId, nuevoSaldo, montoMovimiento, motivo);
            }
        );
    } else {
        // No tiene puntos, gana regalo directamente
        montoMovimiento = regalo;
        nuevoSaldo += regalo;
        motivo = `Regalo por compra: ${nombre}`;
        await ejecutarTransaccion(userId, nuevoSaldo, montoMovimiento, motivo);
    }
}

/**
 * Ejecuta los updates en Supabase.
 */
async function ejecutarTransaccion(userId, nuevoSaldo, monto, motivo) {
    try {
        const { error: err1 } = await client
            .from('perfiles')
            .update({ pesos_jyf: nuevoSaldo })
            .eq('id', userId);
            
        const { error: err2 } = await client
            .from('historial_pesos')
            .insert([{ perfil_id: userId, monto, motivo }]);

        if (err1 || err2) throw new Error("Error de sincronización");

        totalPesosJyF = nuevoSaldo;
        document.getElementById('saldo').innerText = totalPesosJyF.toLocaleString();
        mostrarNotificacion("¡Compra Exitosa!", `Gracias por tu compra. Tu nuevo saldo es ${totalPesosJyF} Pesos JyF.`);
    } catch (e) {
        mostrarNotificacion("Error", "No pudimos procesar la transacción. Intenta de nuevo.");
    }
}

/**
 * Sobrescribimos solicitarConfirmacion para manejar el caso de "No usar puntos"
 */
function solicitarConfirmacion(titulo, mensaje, onConfirm, onCancel) {
    const modal = document.getElementById('custom-modal');
    const mTitle = document.getElementById('modal-title');
    const mText = document.getElementById('modal-text');
    const mCancel = document.getElementById('modal-cancel');
    const mConfirm = document.getElementById('modal-confirm');

    mTitle.innerText = titulo;
    mText.innerText = mensaje;
    mCancel.classList.remove('hidden');
    
    mCancel.onclick = () => {
        modal.classList.add('hidden');
        if (onCancel) onCancel();
    };
    mConfirm.onclick = () => {
        modal.classList.add('hidden');
        onConfirm();
    };
    
    modal.classList.remove('hidden');
}

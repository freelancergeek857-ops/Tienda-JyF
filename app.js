// Usamos la constante 'client' que ya viene de auth.js, no la creamos de nuevo
const IMG_PLACEHOLDER = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx5RMPoanaRwX5s3ytHXNmVHD-QKcyR_5Aeg&s";

window.revelarCuerpo = function() {
    document.body.style.opacity = "1";
    const imgHomenaje = document.getElementById('img-homenaje');
    const pantalla = document.getElementById('pantalla-carga');
    const login = document.getElementById('seccion-login');

    setTimeout(() => {
        if (imgHomenaje) imgHomenaje.classList.add('revelada');
    }, 750);

    const quitarPantallaCarga = () => {
        setTimeout(() => {
            if (pantalla) {
                pantalla.style.opacity = "0";
                setTimeout(() => {
                    pantalla.classList.add('hidden');
                    if (login) {
                        login.classList.remove('hidden');
                        login.style.opacity = '1';
                    }
                    // IMPORTANTE: Al cargar la web, chequeamos si ya hay sesión
                    chequearSesionActiva(); 
                }, 1200);
            }
        }, 3000);
    };

    if (document.readyState === 'complete') {
        quitarPantallaCarga();
    } else {
        window.addEventListener('load', quitarPantallaCarga);
    }
}

// Esta función se encarga de mostrar el catálogo si el usuario ya está logueado
async function chequearSesionActiva() {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        entrarAlCatalogo();
    }
}

// Función central para cambiar de pantalla
function entrarAlCatalogo() {
    document.getElementById('seccion-login').classList.add('hidden');
    const catalogo = document.getElementById('seccion-catalogo');
    catalogo.classList.remove('hidden');
    catalogo.style.opacity = '1';
    cargarProductos();
    actualizarSaldoUI(); // Traerá los pesos reales de la DB
}

async function actualizarSaldoUI() {
    // 1. Obtenemos el usuario logueado actualmente
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // 2. Pedimos a la tabla 'perfiles' el saldo de ese ID
    const { data: perfil, error } = await client
        .from('perfiles')
        .select('pesos_jyf')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error("Error al obtener saldo:", error.message);
        return;
    }

    if (perfil) {
        // ¡ESTA ES LA CLAVE! 
        // Actualizamos la variable global para que simularCompra() funcione bien
        totalPesosJyF = perfil.pesos_jyf; 
        
        // Actualizamos el numerito que ve el usuario en la pantalla
        const elSaldo = document.getElementById('saldo');
        if (elSaldo) elSaldo.innerText = totalPesosJyF;
    }
}

// Cargar Productos
async function cargarProductos() {
    const grilla = document.getElementById('grilla');
    if (!grilla) return;
    
    grilla.innerHTML = Array(4).fill(0).map(() => `
        <div class="card rounded-xl overflow-hidden p-4 shadow-lg flex flex-col h-full animate-pulse">
            <div class="w-full h-48 bg-slate-700 rounded-lg mb-4"></div>
            <div class="h-6 bg-slate-700 rounded w-3/4 mb-4"></div>
            <div class="h-10 bg-slate-700 rounded mt-auto"></div>
        </div>`).join('');

    const { data, error } = await client.from('productos').select('*');
    if (error) {
        grilla.innerHTML = `<p class="text-red-400 col-span-full">Error al conectar con la base de datos.</p>`;
        return;
    }

    grilla.innerHTML = data.map(p => {
        const linkWS = `https://wa.me/+5492216567905?text=${encodeURIComponent('¡Hola! Me interesa ' + p.nombre)}`;
        return `
        <div class="card rounded-xl overflow-hidden p-4 shadow-lg flex flex-col h-full">
            <img src="${p.imagen_url}" class="w-full h-48 object-cover rounded-lg mb-4" onerror="this.src='${IMG_PLACEHOLDER}'" loading="lazy">
            <h2 class="text-lg font-semibold mb-2 flex-grow">${p.nombre}</h2>
            <div class="flex justify-between items-center mb-4">
                <span class="text-2xl font-bold">$${p.precio_venta}</span>
            </div>
            <a href="${linkWS}" target="_blank" class="bg-green-600 text-center py-2 rounded-lg mb-2 font-bold hover:bg-green-500 transition">WhatsApp 📱</a>
            <button onclick="procesarCompraReal('${p.nombre}', ${p.precio_venta}, ${p.pesos_jsf_regalo})" class="bg-sky-600 py-2 rounded-lg font-bold hover:bg-sky-500 transition">Comprar Directo 🛒</button>
            <div class="bg-sky-500/10 border border-sky-500/50 rounded-lg p-2 text-center mt-4">
                <span class="text-sky-400 font-bold text-xs">🎁 +${p.pesos_jsf_regalo} Pesos JyF</span>
            </div>
        </div>`;
    }).join('');
}

/* function simularCompra(nombre, precio, regalo) {
    // 1. PRIMERA PREGUNTA: ¿Confirma la compra?
    const confirmar = confirm(`¿Confirmás la compra de ${nombre} por $${precio}?`);
    
    if (!confirmar) return; // Si cancela, no hacemos nada.

    let pagoConPuntos = false;

    // 2. SEGUNDA PREGUNTA: ¿Quiere usar puntos? (Solo si tiene saldo > 0)
    if (totalPesosJyF > 0) {
        pagoConPuntos = confirm(`Tenés ${totalPesosJyF} Pesos JyF disponibles.\n\n¿Querés usar tus puntos para pagar (o descontar) esta compra?\n(Si usás puntos, no sumarás nuevos en esta operación).`);
    }

    // 3. PROCESAR EL PAGO
    if (pagoConPuntos) {
        // Lógica de pago con puntos (No suma regalo)
        if (totalPesosJyF >= precio) {
            // Caso A: Los puntos cubren todo
            totalPesosJyF -= precio;
            alert(`¡Excelente! Pagaste el total con tus Pesos JyF.\nSaldo restante: ${totalPesosJyF}`);
        } else {
            // Caso B: Los puntos cubren una parte
            const resto = precio - totalPesosJyF;
            totalPesosJyF = 0;
            alert(`Usaste todos tus puntos. El saldo restante a pagar es de $${resto} ARS.`);
        }
    } else {
        // Lógica de pago tradicional (SÍ suma regalo)
        totalPesosJyF += regalo;
        alert(`¡Compra realizada con éxito!\nHas sumado ${regalo} Pesos JyF a tu cuenta.`);
    }

    // 4. ACTUALIZAR LA INTERFAZ
    const elementoSaldo = document.getElementById('saldo');
    if (elementoSaldo) {
        elementoSaldo.innerText = totalPesosJyF;
    }
}*/

async function procesarCompraReal(nombre, precio, regalo) {
    const confirmar = confirm(`¿Confirmás la compra de ${nombre} por $${precio}?`);
    if (!confirmar) return;

    // 1. Obtenemos el usuario actual
    const { data: { user } } = await client.auth.getUser();
    if (!user) return alert("Debes estar logueado para comprar.");

    let nuevoSaldo = totalPesosJyF;
    let montoMovimiento = 0;
    let motivo = "";

    // 2. Lógica de Puntos
    let usoPuntos = false;
    if (totalPesosJyF > 0) {
        usoPuntos = confirm(`Tenés ${totalPesosJyF} Pesos JyF. ¿Querés usarlos?`);
    }

    if (usoPuntos) {
        if (totalPesosJyF >= precio) {
            montoMovimiento = -precio;
            nuevoSaldo -= precio;
            motivo = `Compra total: ${nombre}`;
        } else {
            montoMovimiento = -totalPesosJyF;
            const resto = precio - totalPesosJyF;
            nuevoSaldo = 0;
            motivo = `Pago parcial: ${nombre}. Restante: $${resto}`;
        }
    } else {
        // Pago tradicional: Suma el regalo
        montoMovimiento = regalo;
        nuevoSaldo += regalo;
        motivo = `Regalo por compra: ${nombre}`;
    }

    // --- BLOQUE DE BASE DE DATOS ---
    
    // A. Actualizamos el saldo en la tabla 'perfiles'
    const { error: errPerfil } = await client
        .from('perfiles')
        .update({ pesos_jyf: nuevoSaldo })
        .eq('id', user.id);

    // B. Registramos el movimiento en 'historial_pesos'
    const { error: errHistorial } = await client
        .from('historial_pesos')
        .insert([
            { 
                perfil_id: user.id, 
                monto: montoMovimiento, 
                motivo: motivo 
            }
        ]);

    if (errPerfil || errHistorial) {
        alert("Error al sincronizar con la tienda. Reintentando...");
        console.error(errPerfil, errHistorial);
    } else {
        // C. Si todo salió bien en el Back, actualizamos el Front
        totalPesosJyF = nuevoSaldo;
        document.getElementById('saldo').innerText = totalPesosJyF;
        alert(usoPuntos ? "Puntos debitados con éxito." : `¡Ganaste ${regalo} Pesos JyF!`);
    }
}
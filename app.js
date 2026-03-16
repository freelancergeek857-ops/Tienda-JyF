let totalPesosJyF = 0;
const URL_DB = 'https://itkuzqbjofryhatachyz.supabase.co';
const KEY_DB = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(URL_DB, KEY_DB);
const IMG_PLACEHOLDER = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx5RMPoanaRwX5s3ytHXNmVHD-QKcyR_5Aeg&s";

	window.revelarCuerpo = function() {
		// 1. Encendemos el body
		document.body.style.opacity = "1";
		const imgHomenaje = document.getElementById('img-homenaje');
		const pantalla = document.getElementById('pantalla-carga');
		const login = document.getElementById('seccion-login');

		// 2. Iniciamos el efecto visual de la imagen (blur/color)
		setTimeout(() => {
			if (imgHomenaje) imgHomenaje.classList.add('revelada');
		}, 750);

		// 3. FUNCIÓN PARA QUITAR EL TELÓN
		const quitarPantallaCarga = () => {
			// Pausa de 1.5s para que vean la imagen nítida antes de irse
			setTimeout(() => {
				if (pantalla) {
					pantalla.style.opacity = "0";
					setTimeout(() => {
						pantalla.classList.add('hidden');
						if (login) {
							login.classList.remove('hidden');
							login.style.opacity = '1';
						}
					}, 1200); // Duración del desvanecimiento
				}
			}, 3000);
		};

    // 4. LA LÓGICA DE CARGA REAL
    if (document.readyState === 'complete') {
        // Si el sitio YA cargó todo, quitamos la pantalla
        quitarPantallaCarga();
    } else {
        // Si todavía está cargando algo, esperamos al evento 'load'
        window.addEventListener('load', quitarPantallaCarga);
    }
}

// Simular Ingreso
window.simularIngreso = function(e) {
    const btn = e.currentTarget;
    btn.innerHTML = `Verificando Hardware ID...`;
    btn.classList.add('opacity-50', 'pointer-events-none');
    setTimeout(() => {
        document.getElementById('seccion-login').classList.add('hidden');
        const catalogo = document.getElementById('seccion-catalogo');
        catalogo.classList.remove('hidden');
        catalogo.style.opacity = '1';
        cargarProductos(); 
    }, 1500);
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
        grilla.innerHTML = `<p class="text-red-400 col-span-full">Error al conectar con el búnker de datos.</p>`;
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
            <button onclick="simularCompra('${p.nombre}', ${p.precio_venta}, ${p.pesos_jsf_regalo})" class="bg-sky-600 py-2 rounded-lg font-bold hover:bg-sky-500 transition">Comprar Directo 🛒</button>
            <div class="bg-sky-500/10 border border-sky-500/50 rounded-lg p-2 text-center mt-4">
                <span class="text-sky-400 font-bold text-xs">🎁 +${p.pesos_jsf_regalo} Pesos JyF</span>
            </div>
        </div>`;
    }).join('');
}

function simularCompra(nombre, precio, regalo) {
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
}
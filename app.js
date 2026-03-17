// Usamos la constante 'client' que ya viene de auth.js
let totalPesosJyF = 0; 
const IMG_PLACEHOLDER = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx5RMPoanaRwX5s3ytHXNmVHD-QKcyR_5Aeg&s";

	window.revelarCuerpo = function() {
		document.body.style.opacity = "1";
		const imgHomenaje = document.getElementById('img-homenaje');
		const pantalla = document.getElementById('pantalla-carga');

		setTimeout(() => { if (imgHomenaje) imgHomenaje.classList.add('revelada'); }, 750);

		setTimeout(() => {
			if (pantalla) {
				pantalla.style.opacity = "0";
				setTimeout(() => {
					pantalla.classList.add('hidden');
					chequearSesionActiva(); 
				}, 1200);
			}
		}, 3000);
	}

	async function chequearSesionActiva() {
		const { data: { session } } = await client.auth.getSession();
		const login = document.getElementById('seccion-login');
		
		if (session) {
			const { data: perfil } = await client.from('perfiles').select('id, hash_dispositivo').eq('id', session.user.id).maybeSingle();
			const localHash = localStorage.getItem('jyf_DB_key');

			// Solo entra directo si ya tiene perfil y el hash coincide
			if (perfil && perfil.hash_dispositivo === localHash) {
				entrarAlCatalogo();
			} else {
				login.classList.remove('hidden'); // Necesita validar hash o registrarse
			}
		} else {
			login.classList.remove('hidden');
		}
	}

	function entrarAlCatalogo() {
		const login = document.getElementById('seccion-login');
		const catalogo = document.getElementById('seccion-catalogo');

		if (login) login.classList.add('hidden');
		
		if (catalogo) {
			catalogo.classList.remove('hidden');
			// Forzamos un pequeño delay para que la transición de Tailwind funcione
			setTimeout(() => {
				catalogo.style.opacity = "1";
				catalogo.classList.add('opacity-100');
			}, 50);
		}
		
		cargarProductos();
		actualizarSaldoUI(); 
	}

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
        document.getElementById('saldo').innerText = totalPesosJyF;
    }
}

	async function cargarProductos() {
		const grilla = document.getElementById('grilla');
		if (!grilla) return;
		
		// Skeleton/Carga
		grilla.innerHTML = Array(4).fill(0).map(() => `
			<div class="card rounded-xl overflow-hidden p-4 shadow-lg flex flex-col h-full animate-pulse">
				<div class="w-full h-48 bg-slate-700 rounded-lg mb-4"></div>
				<div class="h-6 bg-slate-700 rounded w-3/4 mb-4"></div>
				<div class="h-10 bg-slate-700 rounded mt-auto"></div>
			</div>`).join('');

		const { data, error } = await client.from('productos').select('*');
		
		if (error) {
			grilla.innerHTML = `<p class="text-red-400 col-span-full">Error al conectar: ${error.message}</p>`;
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
				<button onclick="procesarCompra('${p.nombre}', ${p.precio_venta}, ${p.pesos_jyf_regalo})" class="bg-sky-600 py-2 rounded-lg font-bold hover:bg-sky-500 transition">Comprar Directo 🛒</button>
				<div class="bg-sky-500/10 border border-sky-500/50 rounded-lg p-2 text-center mt-4">
					<span class="text-sky-400 font-bold text-xs">🎁 +${p.pesos_jyf_regalo} Pesos JyF</span>
				</div>
			</div>`;
		}).join('');
	}

	async function procesarCompra(nombre, precio, regalo) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return alert("Sesión expirada.");
    const user = session.user;

    const confirmar = confirm(`¿Confirmás la compra de ${nombre} por $${precio}?`);
    if (!confirmar) return;

    let nuevoSaldo = totalPesosJyF;
    let montoMovimiento = 0;
    let motivo = "";

    let usoPuntos = totalPesosJyF > 0 ? confirm(`¿Usar tus ${totalPesosJyF} Pesos JyF?`) : false;

    if (usoPuntos) {
        if (totalPesosJyF >= precio) {
            montoMovimiento = -precio;
            nuevoSaldo -= precio;
            motivo = `Compra: ${nombre}`;
        } else {
            montoMovimiento = -totalPesosJyF;
            nuevoSaldo = 0;
            motivo = `Pago parcial: ${nombre}`;
        }
    } else {
        montoMovimiento = regalo;
        nuevoSaldo += regalo;
        motivo = `Regalo: ${nombre}`;
    }

    // ACTUALIZACIÓN CORREGIDA USANDO user.id
    const { error: err1 } = await client.from('perfiles').update({ pesos_jyf: nuevoSaldo }).eq('id', user.id);
    const { error: err2 } = await client.from('historial_pesos').insert([{ perfil_id: user.id, monto: montoMovimiento, motivo }]);

    if (err1 || err2) alert("Error al sincronizar.");
    else {
        totalPesosJyF = nuevoSaldo;
        document.getElementById('saldo').innerText = totalPesosJyF;
        alert("¡Operación exitosa!");
    }
}
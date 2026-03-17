// Usamos la constante 'client' que ya viene de auth.js
let totalPesosJyF = 0; 

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
						// Iniciamos chequeo de sesión
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

	async function chequearSesionActiva() {
		const { data: { session } } = await client.auth.getSession();
		if (session) {
			// Si hay sesión, verificamos si tiene perfil creado antes de entrar
			const { data: perfil } = await client
				.from('perfiles')
				.select('id')
				.eq('id', session.user.id)
				.maybeSingle();

			if (perfil) entrarAlCatalogo();
		}
	}

	function entrarAlCatalogo() {
		// 1. Ocultar Login con efecto
		const login = document.getElementById('seccion-login');
		if (login) {
			login.style.opacity = '0';
			setTimeout(() => login.classList.add('hidden'), 500);
		}

		// 2. Mostrar Catálogo
		const catalogo = document.getElementById('seccion-catalogo');
		if (catalogo) {
			catalogo.classList.remove('hidden');
			setTimeout(() => catalogo.style.opacity = '1', 100);
		}
		
		// 3. Cargar datos reales
		cargarProductos();
		actualizarSaldoUI(); 
	}

	async function actualizarSaldoUI() {
		const { data: { user } } = await client.auth.getUser();
		if (!user) return;

		const { data: perfil, error } = await client
			.from('perfiles')
			.select('pesos_jyf')
			.eq('id', user.id)
			.maybeSingle(); // Usamos maybeSingle para evitar errores si aún no existe la fila

		if (error) {
			console.warn("Saldo no disponible aún:", error.message);
			return;
		}

		if (perfil) {
			totalPesosJyF = perfil.pesos_jyf || 0;
			const elSaldo = document.getElementById('saldo');
			if (elSaldo) elSaldo.innerText = totalPesosJyF;
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
				<button onclick="procesarCompra('${p.nombre}', ${p.precio_venta}, ${p.pesos_jsf_regalo})" class="bg-sky-600 py-2 rounded-lg font-bold hover:bg-sky-500 transition">Comprar Directo 🛒</button>
				<div class="bg-sky-500/10 border border-sky-500/50 rounded-lg p-2 text-center mt-4">
					<span class="text-sky-400 font-bold text-xs">🎁 +${p.pesos_jsf_regalo} Pesos JyF</span>
				</div>
			</div>`;
		}).join('');
	}

	async function procesarCompra(nombre, precio, regalo) {
		const { data: { user } } = await client.auth.getUser();
		if (!user) return alert("Debes estar logueado para comprar.");

		const confirmar = confirm(`¿Confirmás la compra de ${nombre} por $${precio}?`);
		if (!confirmar) return;

		let nuevoSaldo = totalPesosJyF;
		let montoMovimiento = 0;
		let motivo = "";

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
			montoMovimiento = regalo;
			nuevoSaldo += regalo;
			motivo = `Regalo por compra: ${nombre}`;
		}

		// Actualización en DB
		const { error: errPerfil } = await client
			.from('perfiles')
			.update({ pesos_jyf: nuevoSaldo })
			.eq('id', user.id);

		const { error: errHistorial } = await client
			.from('historial_pesos')
			.insert([{ perfil_id: user.id, monto: montoMovimiento, motivo: motivo }]);

		if (errPerfil || errHistorial) {
			alert("Error al sincronizar. Por favor, reintentá.");
		} else {
			totalPesosJyF = nuevoSaldo;
			const elSaldo = document.getElementById('saldo');
			if (elSaldo) elSaldo.innerText = totalPesosJyF;
			alert(usoPuntos ? "Puntos aplicados correctamente." : `¡Sumaste ${regalo} Pesos JyF!`);
		}
	}
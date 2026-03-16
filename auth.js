const SUPABASE_URL = 'https://itkuzqbjofryhatachyz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FYhPcYO61lzuv-Y2P9LmaQ_miOQ2cVH';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let registrando = false;

async function solicitarAccesoMágico() {
    const email = document.getElementById('email-acceso').value.trim();
    if (!email.endsWith('@gmail.com')) return alert("Solo Gmail");
    
    const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: "https://freelancergeek857-ops.github.io/Tienda-JyF/" }
    });

    if (error) alert(error.message);
    else {
        document.getElementById('btn-acceso').classList.add('hidden');
        document.getElementById('aviso-mail').classList.remove('hidden');
    }
}

client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !registrando) {
        const user = session.user;
        const { data: perfil } = await client.from('perfiles').select('id').eq('id', user.id).maybeSingle();

        if (!perfil) {
            registrando = true;
            const nombre = prompt("Tu nombre:");
            const wa = prompt("Tu WhatsApp:");
            
            if (!nombre || !wa) return client.auth.signOut();

            const { error } = await client.from('perfiles').insert([
                { id: user.id, email: user.email, nombre_google: nombre, whatsapp: wa, pesos_jyf: 500 }
            ]);

            if (error) {
                alert("Fallo RLS: " + error.message);
                registrando = false;
            } else {
                location.reload();
            }
        } else {
            if (typeof entrarAlCatalogo === "function") entrarAlCatalogo();
        }
    }
});
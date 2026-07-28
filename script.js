// ==============================================
// ⚠️ DADOS DO SUPABASE (MANTIDO)
// ==============================================
const SUPABASE_URL = "https://SEU_PROJETO.supabase.co";
const SUPABASE_KEY = "SUA_CHAVE_ANON";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================================
// 🚍 CONFIGURAÇÕES DA ROTA (ADICIONADO)
// ==============================================
const API_ITINERARIO = "https://info-bus-fortaleza.vercel.app/api/pontos-itinerarios/";
const MAX_TENTATIVAS = 5;
const TEMPO_ESPERA = 1000;
let rotaDesenhada = null;

// ==============================================
// 🗺️ MAPA (ORIGINAL)
// ==============================================
const mapa = L.map('mapa').setView([-3.7327, -38.5270], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa);
const RAIO_METROS = 5;
let camadasParadas = [], camadasRelatos = [];

// ==============================================
// 🔄 FUNÇÃO DE BUSCA DE ROTA (ADICIONADA EXATAMENTE COMO VOCÊ ENVIOU)
// ==============================================
async function buscarComTentativas(url, tentativa = 1) {
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);
        const texto = await resposta.text();
        let dados;
        try {
            const json = JSON.parse(texto);
            if (json.contents) dados = JSON.parse(json.contents);
            else dados = json;
            if (Array.isArray(dados)) return dados;
            if (Array.isArray(dados?.data)) return dados.data;
            if (Array.isArray(dados?.itinerario)) return dados.itinerario;
            if (Array.isArray(dados?.pontos)) return dados.pontos;
            throw new Error("Formato não reconhecido");
        } catch { throw new Error("Conteúdo inválido"); }
    } catch (erro) {
        if (tentativa < MAX_TENTATIVAS) {
            await new Promise(r => setTimeout(r, TEMPO_ESPERA));
            return buscarComTentativas(url, tentativa + 1);
        }
        throw new Error(`Falha após ${MAX_TENTATIVAS} tentativas: ${erro.message}`);
    }
}

async function carregarRota(forcar = false) {
    const numLinha = document.getElementById("linha-rota").value.trim();
    const sentido = document.getElementById("sentido-rota").value;
    const info = document.getElementById("info-rota");
    if (!numLinha) return alert("Digite a linha!");

    const chave = `rota_${numLinha}_${sentido}`;
    let dados;
    try {
        if (localStorage.getItem(chave) && !forcar) {
            dados = JSON.parse(localStorage.getItem(chave));
            info.innerHTML = `<p class="text-green-600">⚡ Carregado da memória</p>`;
        } else {
            try { dados = await buscarComTentativas(API_ITINERARIO + numLinha); }
            catch { dados = await buscarComTentativas(`https://api.allorigins.win/get?url=${encodeURIComponent(API_ITINERARIO + numLinha)}`); }
            localStorage.setItem(chave, JSON.stringify(dados));
            info.innerHTML = `<p class="text-blue-600">🌐 Baixado e salvo</p>`;
        }

        const pontos = dados.filter(p => p.latitude && p.longitude && p.sentido?.trim().toLowerCase() === sentido);
        if (!pontos.length) return info.innerHTML = `<p class="text-red-600">Nenhum ponto encontrado</p>`;

        const coords = pontos.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);
        if (rotaDesenhada) mapa.removeLayer(rotaDesenhada);
        rotaDesenhada = L.polyline(coords, { color: '#2563eb', weight: 5 }).addTo(mapa);
        mapa.fitBounds(rotaDesenhada.getBounds());
        info.innerHTML += `<p>Linha ${numLinha} - ${sentido}<br>Pontos: ${pontos.length}</p>`;
        info.classList.remove('hidden');

    } catch (e) {
        info.innerHTML = `<p class="text-red-600">Erro: ${e.message}</p>`;
        info.classList.remove('hidden');
    }
}

// ==============================================
// 🚏 PARADAS E RELATOS (TUDO ORIGINAL)
// ==============================================
function desenharParada(p) {
    L.circle([p.lat,p.lng], {color:'#C2185B',fillColor:'#EC407A',fillOpacity:0.5,radius:RAIO_METROS}).addTo(mapa)
     .bindPopup(`🚏 ${p.nome}<br>Raio 5m`);
}
function desenharRelato(r) {
    L.circle([r.lat,r.lng], {color:'#B71C1C',fillColor:'#EF5350',fillOpacity:0.5,radius:RAIO_METROS}).addTo(mapa)
     .bindPopup(`🚨 ${r.descricao}<br>Raio 5m`);
}
async function salvarParada() {
    const n = document.getElementById('nome-parada').value;
    const la = parseFloat(document.getElementById('lat-parada').value);
    const lo = parseFloat(document.getElementById('lng-parada').value);
    await supabaseClient.from('paradas_manuais').insert([{nome:n,lat:la,lng:lo}]);
    carregarDados();
}
async function salvarRelato() {
    await supabaseClient.from('relatos').insert([{descricao:document.getElementById('descricao-problema').value}]);
    carregarDados();
}
async function carregarDados() {
    camadasParadas.forEach(c=>mapa.removeLayer(c)); camadasParadas=[];
    camadasRelatos.forEach(c=>mapa.removeLayer(c)); camadasRelatos=[];
    const {data:p} = await supabaseClient.from('paradas_manuais').select('*');
    const {data:r} = await supabaseClient.from('relatos').select('*');
    p?.forEach(desenharParada); r?.forEach(desenharRelato);
}

// ==============================================
// 🚀 INICIALIZAÇÃO (ORIGINAL + BOTÕES DA ROTA)
// ==============================================
window.onload = () => {
    carregarDados();
    document.getElementById('btn-carregar-rota').onclick = () => carregarRota(false);
    document.getElementById('btn-atualizar-rota').onclick = () => carregarRota(true);
    document.getElementById('btn-salvar-parada').onclick = salvarParada;
    document.getElementById('btn-adicionar-problema').onclick = salvarRelato;
};
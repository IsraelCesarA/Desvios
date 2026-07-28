// ==============================================
// ⚠️ DADOS DO SUPABASE
// ==============================================
const SUPABASE_URL = "https://SEU_PROJETO.supabase.co";
const SUPABASE_KEY = "SUA_CHAVE_ANON";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================================
// 🚍 CONFIGURAÇÕES DE ROTAS (FUNCIONANDO)
// ==============================================
const API_ITINERARIO = "https://info-bus-fortaleza.vercel.app/api/pontos-itinerarios/";
const MAX_TENTATIVAS = 5;
const TEMPO_ESPERA = 1000;
let rotaDesenhada = null;

// ==============================================
// 🗺️ MAPA E CONFIGURAÇÕES GERAIS
// ==============================================
const mapa = L.map('mapa').setView([-3.7327, -38.5270], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa);
const RAIO_METROS = 5;
let camadasParadas = [], camadasRelatos = [], pontoClicado = null;

// ==============================================
// 🔄 FUNÇÃO DE BUSCA DE ROTAS
// ==============================================
async function buscarComTentativas(url, tentativa = 1) {
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);
        const texto = await resposta.text();
        let dados;
        try {
            const json = JSON.parse(texto);
            dados = json.contents ? JSON.parse(json.contents) : json;
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

    info.classList.add('hidden');
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
        if (!pontos.length) return info.innerHTML += `<p class="text-red-600">Nenhum ponto encontrado</p>`;

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
// 🚨 SISTEMA DE RELATOS RESTAURADO COMPLETO
// ==============================================
function desenharRelato(r) {
    const cor = r.tipo === 'fixo' ? '#ffcc00' : '#F57C00';
    const circulo = L.circle([r.lat, r.lng], {
        color: '#B71C1C', fillColor: cor, fillOpacity: 0.6, radius: RAIO_METROS
    }).addTo(mapa);

    circulo.bindPopup(`
        <strong>${r.tipo === 'fixo' ? '🚧 Problema Fixo' : '💥 Ocorrência do Dia'}</strong><br>
        ${r.descricao}<br>
        <button onclick="removerRelato(${r.id})" style="color:red; font-size:11px; border:none; background:none; cursor:pointer; font-weight:bold;">❌ REMOVER</button>
    `);
    circulo.id = r.id;
    camadasRelatos.push(circulo);
}

async function salvarRelato() {
    if (!pontoClicado) return alert("❗ Primeiro clique no mapa para definir o local!");
    
    const tipo = document.querySelector('input[name="tipo-problema"]:checked').value;
    const descricao = document.getElementById('descricao-problema').value.trim() || 
        (tipo === 'fixo' ? 'Problema Fixo / Obra' : 'Ocorrência do Dia');

    await supabaseClient.from('relatos').insert([{
        tipo, lat: pontoClicado.lat, lng: pontoClicado.lng, descricao, data: new Date()
    }]);

    alert("✅ Relato salvo!");
    document.getElementById('descricao-problema').value = '';
    pontoClicado = null;
    carregarRelatos();
}

async function removerRelato(id) {
    if (!confirm("Remover este relato?")) return;
    await supabaseClient.from('relatos').delete().eq('id', id);
    carregarRelatos();
}

async function carregarRelatos() {
    camadasRelatos.forEach(c => mapa.removeLayer(c));
    camadasRelatos = [];

    const { data: relatos } = await supabaseClient.from('relatos').select('*').order('data', {ascending:false});
    const lista = document.getElementById('lista-relatos');

    if (!relatos || relatos.length === 0) {
        lista.innerHTML = '<p class="text-gray-500 text-xs">Nenhum relato ativo.</p>';
        return;
    }

    lista.innerHTML = '';
    relatos.forEach(r => {
        lista.innerHTML += `
            <div class="p-1 border-b border-gray-100 flex justify-between items-center">
                <span class="text-xs">${r.tipo === 'fixo' ? '🚧' : '💥'} ${r.descricao.length > 25 ? r.descricao.substring(0,25)+'...' : r.descricao}</span>
                <button onclick="removerRelato(${r.id})" class="text-red-500 text-[10px] font-bold">X</button>
            </div>
        `;
        desenharRelato(r);
    });
}

// ==============================================
// 🧹 LIMPEZA AUTOMÁTICA À MEIA-NOITE
// ==============================================
function agendarLimpezaDiaria() {
    const agora = new Date();
    const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 0);
    setTimeout(() => {
        supabaseClient.from('relatos').delete().eq('tipo','diario').then(() => {
            carregarRelatos();
            agendarLimpezaDiaria();
        });
    }, meiaNoite - agora);
}

// ==============================================
// 🚏 PARADAS
// ==============================================
function desenharParada(p) {
    L.circle([p.lat,p.lng], {color:'#C2185B',fillColor:'#EC407A',fillOpacity:0.5,radius:RAIO_METROS}).addTo(mapa)
     .bindPopup(`🚏 ${p.nome}<br>Raio 5m`);
}
async function salvarParada() {
    const n = document.getElementById('nome-parada').value;
    const la = parseFloat(document.getElementById('lat-parada').value);
    const lo = parseFloat(document.getElementById('lng-parada').value);
    if (!n || isNaN(la) || isNaN(lo)) return alert("Preencha todos os campos!");
    await supabaseClient.from('paradas_manuais').insert([{nome:n,lat:la,lng:lo,data_cadastro:new Date()}]);
    carregarDados();
}
async function carregarDados() {
    camadasParadas.forEach(c=>mapa.removeLayer(c)); camadasParadas=[];
    const {data:p} = await supabaseClient.from('paradas_manuais').select('*');
    p?.forEach(desenharParada);
    carregarRelatos();
}

// ==============================================
// 📍 CLIQUE NO MAPA PARA RELATOS
// ==============================================
mapa.on('click', e => {
    pontoClicado = { lat: e.latlng.lat, lng: e.latlng.lng };
    document.getElementById('lat-parada').value = e.latlng.lat.toFixed(6);
    document.getElementById('lng-parada').value = e.latlng.lng.toFixed(6);
});

// ==============================================
// 🚀 INICIALIZAÇÃO GERAL
// ==============================================
window.onload = () => {
    carregarDados();
    agendarLimpezaDiaria();
    
    document.getElementById('btn-carregar-rota').onclick = () => carregarRota(false);
    document.getElementById('btn-atualizar-rota').onclick = () => carregarRota(true);
    document.getElementById('btn-salvar-parada').onclick = salvarParada;
    document.getElementById('btn-adicionar-problema').onclick = salvarRelato;

    window.removerRelato = removerRelato;
};

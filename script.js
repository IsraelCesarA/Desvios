// ==============================================
// ⚠️ DADOS DO SEU PROJETO
// ==============================================
const SUPABASE_URL = "https://olildoampoutbtuaaqyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_wpT3O6lz7Hr5IkxN9sTIwA_FEHD7wZc";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================================
// 📝 MOTIVOS E ÍCONES
// ==============================================
const MOTIVOS_PADRAO = [
    "Colisão", "Obra da Cagece", "Serviço Enel", "Feira", "Manifestação",
    "Via Acidentada", "Poda de Árvore", "Ação Policial", "Ação AMC", "Festas Juninas"
];

const ICONE_POR_MOTIVO = {
    "Colisão": "🚗💥🚙",
    "Ação Policial": "🚔",
    "Ação AMC": "🚛",
    "Feira": "🏪",
    "Manifestação": "👥👥👥",
    "Via Acidentada": "🚧",
    "Obra da Cagece": "🚧",
    "Serviço Enel": "⚡",
    "Poda de Árvore": "🌳✂️",
    "Festas Juninas": "🎇🔥",
    "Padrão": "📍"
};

// ==============================================
// 🚍 ROTAS
// ==============================================
const API_ITINERARIO = "https://info-bus-fortaleza.vercel.app/api/pontos-itinerarios/";
const MAX_TENTATIVAS = 5;
const TEMPO_ESPERA = 1000;
let rotaDesenhada = null;

// ==============================================
// 🗺️ MAPA E FILTROS
// ==============================================
const mapa = L.map('mapa').setView([-3.7327, -38.5270], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa);
let camadasDesvios = [], pontoClicado = null;
let todosOsDesvios = [];
let filtroAtual = { tipo: 'todos', motivo: '', linha: '' };

// ==============================================
// 🔄 BUSCA DE ROTAS
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
// 🚨 DESVIOS COM RAIO DE ALCANCE
// ==============================================
function desenharDesvio(d) {
    const cor = d.tipo === 'provisorio' ? '#F57C00' : '#D32F2F';
    const icone = ICONE_POR_MOTIVO[d.motivo] || ICONE_POR_MOTIVO["Padrão"];
    const raio = d.raio ? Number(d.raio) : 100;

    // Círculo mostrando a área afetada
    const circulo = L.circle([d.lat, d.lng], {
        color: cor,
        fillColor: cor,
        fillOpacity: 0.2,
        radius: raio,
        weight: 2
    }).addTo(mapa);
    camadasDesvios.push(circulo);

    // Ícone no centro
    const marcador = L.marker([d.lat, d.lng], {
        icon: L.divIcon({
            className: 'icone-desvio',
            html: `<div style="font-size:22px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${icone}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        })
    }).addTo(mapa);

    marcador.bindPopup(`
        <strong>${icone} ${d.motivo}</strong><br>
        <strong>Tipo:</strong> ${d.tipo === 'provisorio' ? '🟡 Provisório' : '🔴 Permanente'}<br>
        <strong>Raio afetado:</strong> ${raio} metros<br>
        <strong>Linhas:</strong> ${d.linhas_afetadas}<br>
        <strong>Horário:</strong> ${d.horario_inicio} às ${d.horario_final}<br>
        <button onclick="removerDesvio(${d.id})" style="color:red; font-size:11px; margin-top:5px;">❌ Remover</button>
    `);
    camadasDesvios.push(marcador);
}

function atualizarListaMotivos() {
    const filtroSelect = document.getElementById('filtro-motivo');
    const cadastroSelect = document.getElementById('motivo-lista');
    const atualFiltro = filtroAtual.motivo;

    const todosMotivos = [...new Set([...MOTIVOS_PADRAO, ...todosOsDesvios.map(d => d.motivo)])].sort();

    filtroSelect.innerHTML = `<option value="">Todos os motivos</option>`;
    todosMotivos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = `${ICONE_POR_MOTIVO[m]||'📍'} ${m}`;
        if (m === atualFiltro) opt.selected = true;
        filtroSelect.appendChild(opt);
    });

    cadastroSelect.innerHTML = `<option value="">Escolha ou digite abaixo</option>`;
    todosMotivos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = `${ICONE_POR_MOTIVO[m]||'📍'} ${m}`;
        cadastroSelect.appendChild(opt);
    });
}

function aplicarFiltros() {
    camadasDesvios.forEach(c => mapa.removeLayer(c));
    camadasDesvios = [];
    const lista = document.getElementById('lista-desvios');
    lista.innerHTML = '';

    const filtrados = todosOsDesvios.filter(d => {
        if (filtroAtual.tipo !== 'todos' && d.tipo !== filtroAtual.tipo) return false;
        if (filtroAtual.motivo !== '' && d.motivo !== filtroAtual.motivo) return false;
        if (filtroAtual.linha !== '' && !d.linhas_afetadas.includes(filtroAtual.linha)) return false;
        return true;
    });

    if (filtrados.length === 0) {
        lista.innerHTML = `<p class="text-gray-500">Nenhum desvio corresponde aos filtros</p>`;
        return;
    }

    filtrados.forEach(d => {
        const icone = ICONE_POR_MOTIVO[d.motivo] || '📍';
        lista.innerHTML += `
            <div class="p-2 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <strong class="${d.tipo==='provisorio'?'text-provisorio':'text-permanente'}">
                        ${icone} ${d.linhas_afetadas}
                    </strong>
                    <div class="text-gray-600">${d.motivo} | Raio: ${d.raio||100}m | ${d.horario_inicio} - ${d.horario_final}</div>
                </div>
                <button onclick="removerDesvio(${d.id})" class="text-red-500 font-bold">X</button>
            </div>
        `;
        desenharDesvio(d);
    });
}

async function salvarDesvio() {
    if (!pontoClicado) return alert("❗ Clique primeiro no mapa!");

    const motivoEscolhido = document.getElementById('motivo-lista').value;
    const motivoDigitado = document.getElementById('motivo-desvio').value.trim();
    const motivoFinal = motivoEscolhido || motivoDigitado || 'Sem informação';
    const raioValor = Number(document.getElementById('raio-desvio').value) || 100;

    const dados = {
        tipo: document.querySelector('input[name="tipo-desvio"]:checked').value,
        lat: pontoClicado.lat,
        lng: pontoClicado.lng,
        raio: raioValor,
        linhas_afetadas: document.getElementById('linhas-afetadas').value.trim(),
        motivo: motivoFinal,
        horario_inicio: document.getElementById('horario-inicio').value || 'Não informado',
        horario_final: document.getElementById('horario-final').value || 'Não informado',
        data_cadastro: new Date()
    };
    if (!dados.linhas_afetadas) return alert("Informe as linhas afetadas!");

    await supabaseClient.from('desvios').insert([dados]);
    alert("✅ Desvio cadastrado!");
    
    document.getElementById('raio-desvio').value = '100';
    document.getElementById('linhas-afetadas').value = '';
    document.getElementById('motivo-lista').value = '';
    document.getElementById('motivo-desvio').value = '';
    document.getElementById('horario-inicio').value = '';
    document.getElementById('horario-final').value = '';
    pontoClicado = null;

    await carregarDesvios();
}

async function removerDesvio(id) {
    if (!confirm("Remover este desvio?")) return;
    await supabaseClient.from('desvios').delete().eq('id', id);
    await carregarDesvios();
}

async function carregarDesvios() {
    const { data } = await supabaseClient.from('desvios').select('*').order('data_cadastro', {ascending:false});
    todosOsDesvios = data || [];
    atualizarListaMotivos();
    aplicarFiltros();
}

mapa.on('click', e => {
    pontoClicado = { lat: e.latlng.lat, lng: e.latlng.lng };
    document.getElementById('lat-desvio').value = e.latlng.lat.toFixed(6);
    document.getElementById('lng-desvio').value = e.latlng.lng.toFixed(6);
});

// ==============================================
// 🖥️ TELA CHEIA - CORRIGIDO
// ==============================================
const containerMapa = document.querySelector(".lg\\:col-span-3");
const btnTelaCheia = document.getElementById("btn-tela-cheia");
let modoCheio = false;

function alternarTelaCheia() {
    if (!modoCheio) {
        containerMapa.classList.add("fixed", "inset-0", "z-[9999]", "rounded-none", "w-full", "h-full");
        containerMapa.classList.remove("lg:col-span-3");
        document.getElementById("mapa").style.height = "100vh";
        document.getElementById("mapa").style.width = "100vw";
        btnTelaCheia.innerHTML = `<i class="fa fa-compress text-primary"></i> <span class="ml-1 text-xs font-medium">Voltar</span>`;
        modoCheio = true;
        setTimeout(() => mapa.invalidateSize({ animate: false }), 50);
    } else {
        containerMapa.classList.remove("fixed", "inset-0", "z-[9999]", "rounded-none", "w-full", "h-full");
        containerMapa.classList.add("lg:col-span-3");
        document.getElementById("mapa").style.height = "75vh";
        document.getElementById("mapa").style.width = "100%";
        btnTelaCheia.innerHTML = `<i class="fa fa-expand text-primary"></i> <span class="ml-1 text-xs font-medium">Tela Cheia</span>`;
        modoCheio = false;
        setTimeout(() => mapa.invalidateSize({ animate: false }), 50);
    }
}

btnTelaCheia.addEventListener("click", alternarTelaCheia);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modoCheio) alternarTelaCheia();
});

// ==============================================
// 🚀 INICIALIZAÇÃO
// ==============================================
window.onload = () => {
    carregarDesvios();

    document.getElementById('btn-carregar-rota').onclick = () => carregarRota(false);
    document.getElementById('btn-atualizar-rota').onclick = () => carregarRota(true);
    document.getElementById('btn-salvar-desvio').onclick = salvarDesvio;
    window.removerDesvio = removerDesvio;

    document.getElementById('motivo-lista').addEventListener('change', e => {
        document.getElementById('motivo-desvio').value = e.target.value;
    });

    document.querySelectorAll('input[name="filtro-tipo"]').forEach(radio => {
        radio.addEventListener('change', () => {
            filtroAtual.tipo = document.querySelector('input[name="filtro-tipo"]:checked').value;
            aplicarFiltros();
        });
    });

    document.getElementById('filtro-motivo').addEventListener('change', e => {
        filtroAtual.motivo = e.target.value;
        aplicarFiltros();
    });

    document.getElementById('btn-aplicar-filtro').onclick = () => {
        filtroAtual.linha = document.getElementById('filtro-linha').value.trim();
        aplicarFiltros();
    };

    document.getElementById('btn-limpar-filtro').onclick = () => {
        filtroAtual = { tipo: 'todos', motivo: '', linha: '' };
        document.getElementById('filtro-linha').value = '';
        document.querySelector('input[name="filtro-tipo"][value="todos"]').checked = true;
        document.getElementById('filtro-motivo').value = '';
        aplicarFiltros();
    };
};

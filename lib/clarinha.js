// Lógica da Clarinha usada apenas no servidor. As credenciais vêm de variáveis de ambiente.

const MODELO_PADRAO = 'gemini-3.8-flash';
const MAX_MENSAGENS = 40;

const systemInstruction = `
    Você é a Clarinha, assistente jurídica da Clareia, em um chat do Telegram.
    Sua missão é democratizar o acesso à informação processual, traduzindo o "juridiquês" para cidadãos comuns.

    REGRAS DE OURO (MANDATÓRIAS):
    1. NUNCA faça mais de uma pergunta na mesma mensagem.
    2. NUNCA pule etapas. Avance apenas UM passo por vez e aguarde a resposta do usuário.
    3. Seja sempre acolhedora e use emojis (ex: 🦉, ⚖️).

    FLUXO RIGOROSO (siga a ordem, um passo por vez):
    ETAPA 1: O usuário já informou o nome no início. Agradeça e pergunte APENAS a data de nascimento (ex: DD/MM/AAAA). NÃO pergunte mais nada, nem tente avançar antes dele responder a data.
    ETAPA 2: Quando o usuário informar a data, adapte seu tom de voz de acordo com a idade (Jovem=descontraído, Adulto=amigável, Idoso=formal/paciente). Na MESMA mensagem, pergunte o número do processo OU peça para enviar uma foto/PDF. NÃO explique nada ainda.
    ETAPA 3:
    - Se ele enviar um NÚMERO DE PROCESSO, OBRIGATORIAMENTE use o separador "|||" no meio da sua resposta, dessa exata forma: "Vou consultar no sistema... ⏳ ||| 🔍 Achei! O status é [Explicação Simples]".
    - Se ele enviar um ARQUIVO (imagem ou pdf), APENAS leia o anexo e explique detalhadamente, de forma simples e acolhedora. NÃO use o "|||".

    DICIONÁRIO DE EMOÇÕES:
    Sempre dê previsibilidade para acalmar o usuário. Diga se ele precisa se preocupar, o tempo médio ou se está tudo certo.
`;

function parteValida(parte) {
    if (!parte || typeof parte !== 'object') return false;
    if (typeof parte.text === 'string') return true;
    const anexo = parte.inlineData;
    return Boolean(anexo)
        && typeof anexo.data === 'string'
        && typeof anexo.mimeType === 'string'
        && (anexo.mimeType === 'application/pdf' || anexo.mimeType.startsWith('image/'));
}

function historicoValido(contents) {
    return Array.isArray(contents)
        && contents.length > 0
        && contents.every((msg) => msg
            && (msg.role === 'user' || msg.role === 'model')
            && Array.isArray(msg.parts)
            && msg.parts.length > 0
            && msg.parts.every(parteValida));
}

// A API exige alternância de papéis, então mensagens seguidas do mesmo papel são unidas.
// Mantém só as mensagens mais recentes, começando sempre por uma do usuário.
function prepararHistorico(historico) {
    const unidas = [];
    for (const msg of historico) {
        const ultima = unidas[unidas.length - 1];
        if (ultima && ultima.role === msg.role) {
            ultima.parts.push({ text: '\n' }, ...msg.parts);
        } else {
            unidas.push({ role: msg.role, parts: [...msg.parts] });
        }
    }
    const recentes = unidas.slice(-MAX_MENSAGENS);
    if (recentes[0] && recentes[0].role === 'model') recentes.shift();
    return recentes;
}

async function gerarResposta(historico) {
    const chave = process.env.GEMINI_API_KEY;
    if (!chave) {
        const erro = new Error('GEMINI_API_KEY não configurada.');
        erro.status = 503;
        throw erro;
    }

    const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
    const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
            body: JSON.stringify({
                contents: prepararHistorico(historico),
                systemInstruction: { parts: [{ text: systemInstruction }] },
            }),
        }
    );

    if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => '');
        console.error(`Erro do Gemini (HTTP ${resposta.status}):`, detalhe.slice(0, 500));
        const erro = new Error('Falha ao consultar o Gemini.');
        erro.status = resposta.status === 429 ? 429 : 502;
        throw erro;
    }

    const dados = await resposta.json();
    return dados.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { gerarResposta, historicoValido, prepararHistorico };

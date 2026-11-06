// POST /api/chat: recebe o histórico do chat web e devolve a resposta da Clarinha.
// O navegador nunca recebe a chave do Gemini.
const { gerarResposta, historicoValido } = require('../lib/clarinha');

// Limite simples por instância, para dificultar o uso abusivo da cota. Não é uma proteção completa.
const LIMITE_POR_MINUTO = 30;
const acessos = new Map();

function excedeuLimite(ip) {
    const agora = Date.now();
    const registro = acessos.get(ip);
    if (!registro || agora - registro.inicio > 60000) {
        if (acessos.size > 5000) acessos.clear();
        acessos.set(ip, { inicio: agora, total: 1 });
        return false;
    }
    registro.total += 1;
    return registro.total > LIMITE_POR_MINUTO;
}

module.exports = async function chat(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'desconhecido').split(',')[0].trim();
    if (excedeuLimite(ip)) {
        return res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' });
    }

    const contents = req.body?.contents;
    if (!historicoValido(contents)) {
        return res.status(400).json({ error: 'Conversa inválida.' });
    }

    try {
        return res.status(200).json({ text: await gerarResposta(contents) });
    } catch (erro) {
        console.error('Erro em /api/chat:', erro.message);
        return res.status(erro.status || 500).json({ error: 'Não foi possível gerar a resposta.' });
    }
};

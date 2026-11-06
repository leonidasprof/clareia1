// POST /api/telegram: webhook do bot. Só aceita chamadas com o segredo combinado com o Telegram.
// Configure com scripts/configurar-telegram.js.
const { gerarResposta } = require('../lib/clarinha');

const MAX_CONVERSAS = 200;
const MAX_MENSAGENS = 40;
const ESPERA_ENTRE_PARTES_MS = 2000;

// Não há banco de dados: o histórico fica na memória da instância e se perde quando ela é reiniciada.
const sessoes = new Map();
const atualizacoesProcessadas = new Set();

function chamarTelegram(metodo, corpo) {
    return fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    });
}

const enviarMensagem = (chatId, text) => chamarTelegram('sendMessage', { chat_id: chatId, text });
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function obterSessao(chatId) {
    if (!sessoes.has(chatId)) {
        if (sessoes.size >= MAX_CONVERSAS) sessoes.delete(sessoes.keys().next().value);
        sessoes.set(chatId, []);
    }
    return sessoes.get(chatId);
}

async function responderTexto(chatId, texto) {
    if (texto === '/start') {
        const saudacao = 'Olá! 🦉 Eu sou a Clarinha, a assistente jurídica da Clareia.\n\nPara começarmos de forma personalizada, como você prefere que eu te chame?';
        obterSessao(chatId);
        sessoes.set(chatId, [
            { role: 'user', parts: [{ text: 'Oi' }] },
            { role: 'model', parts: [{ text: saudacao }] },
        ]);
        await enviarMensagem(chatId, saudacao);
        return;
    }

    const sessao = obterSessao(chatId);
    sessao.push({ role: 'user', parts: [{ text: texto }] });
    if (sessao.length > MAX_MENSAGENS) sessao.splice(0, sessao.length - MAX_MENSAGENS);
    await chamarTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });

    const resposta = await gerarResposta(sessao) || 'Desculpe, não consegui responder agora. Pode tentar de novo? 🦉';
    sessao.push({ role: 'model', parts: [{ text: resposta.replace('|||', '') }] });

    const [aviso, ...resto] = resposta.split('|||');
    const resultado = resto.join('|||').trim();
    if (aviso.trim()) await enviarMensagem(chatId, aviso.trim());
    if (resultado) {
        await chamarTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });
        await esperar(ESPERA_ENTRE_PARTES_MS);
        await enviarMensagem(chatId, resultado);
    }
}

module.exports = async function telegram(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!segredo || !process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(503).json({ error: 'Bot não configurado.' });
    }
    if (req.headers['x-telegram-bot-api-secret-token'] !== segredo) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const atualizacao = req.body;
    const mensagem = atualizacao?.message;
    if (!mensagem || atualizacoesProcessadas.has(atualizacao.update_id)) {
        return res.status(200).json({ ok: true });
    }
    if (atualizacoesProcessadas.size > 1000) atualizacoesProcessadas.clear();
    atualizacoesProcessadas.add(atualizacao.update_id);

    const chatId = mensagem.chat.id;
    try {
        if (mensagem.text) {
            await responderTexto(chatId, mensagem.text);
        } else if (mensagem.document || mensagem.photo) {
            await enviarMensagem(chatId, '🦉 Recebi seu arquivo! Por aqui ainda não consigo ler documentos, mas no chat da nossa página funciona super bem!');
        }
    } catch (erro) {
        console.error('Erro em /api/telegram:', erro.message);
        await enviarMensagem(chatId, 'Desculpe, meu cérebro deu um pequeno tilt na conexão. Pode tentar falar de novo? 🦉').catch(() => {});
    }

    // Sempre 200, para o Telegram não repetir a mesma mensagem.
    return res.status(200).json({ ok: true });
};

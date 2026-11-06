// Liga o bot ao webhook publicado, ou remove o webhook para usar o modo local.
//
// Ligar:   node --env-file=.env scripts/configurar-telegram.js https://seu-site.vercel.app
// Remover: node --env-file=.env scripts/configurar-telegram.js --remover

const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
const argumento = process.argv[2];
const remover = argumento === '--remover';

async function principal() {
    if (!TELEGRAM_BOT_TOKEN) throw new Error('Defina TELEGRAM_BOT_TOKEN no arquivo .env.');
    if (!remover && !TELEGRAM_WEBHOOK_SECRET) throw new Error('Defina TELEGRAM_WEBHOOK_SECRET no arquivo .env.');
    if (!remover && !/^https:\/\//.test(argumento || '')) {
        throw new Error('Informe o endereço https do site. Exemplo: https://seu-site.vercel.app');
    }

    const metodo = remover ? 'deleteWebhook' : 'setWebhook';
    const corpo = remover
        ? { drop_pending_updates: true }
        : {
            url: `${argumento.replace(/\/+$/, '')}/api/telegram`,
            secret_token: TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ['message'],
            drop_pending_updates: true,
        };

    const resposta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!dados.ok) throw new Error(`O Telegram recusou o pedido: ${dados.description}`);
    console.log(remover ? 'Webhook removido.' : `Webhook configurado em ${corpo.url}`);
}

principal().catch((erro) => {
    console.error(erro.message);
    process.exit(1);
});

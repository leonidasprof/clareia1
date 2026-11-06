const http = require('http');
const path = require('path');

// Carrega o .env local, quando existir (Node.js 20.12 ou superior)
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
    // Sem .env: as variáveis precisam estar definidas no ambiente
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.error('Defina TELEGRAM_BOT_TOKEN e GEMINI_API_KEY no arquivo .env.');
    process.exit(1);
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

const tgSessions = {};
let tgOffset = 0;
let tgPollingActive = false;

const systemInstruction = `Você é a Clarinha, assistente jurídica da Clareia. 
Protocolo estrito: 
- Passo 1: Pergunte o nome do usuário. Aguarde. 
- Passo 2: Agradeça o nome, pergunte a data de nascimento. Aguarde. 
- Passo 3: Pergunte o número do processo ou pedido de documento. 
NÃO repita perguntas. Se o usuário já respondeu, siga para o próximo passo. Seja direta, acolhedora e jurídica simples.`;

async function handleTelegramMessage(chatId, text) {
    if (text === '/start') {
        tgSessions[chatId] = { step: 0, history: [] };
        const msg = "Olá! 🦉 Eu sou a Clarinha, da Clareia. Como gostaria de ser chamado?";
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: chatId, text: msg})});
        return;
    }

    if (!tgSessions[chatId]) tgSessions[chatId] = { step: 0, history: [] };
    
    // Incrementa o passo apenas se houver interação
    tgSessions[chatId].step++;

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY},
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: text }] }],
                systemInstruction: { parts: [{ text: systemInstruction + ` (Estado atual do usuário: Passo ${tgSessions[chatId].step})` }] } 
            })
        });
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Poderia repetir?";
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: chatId, text: reply})});
    } catch (e) {
        console.error("Erro IA:", e);
    }
}

async function pollTelegram() {
    if (!tgPollingActive) return;
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${tgOffset}`);
        const data = await res.json();
        if (data.ok && data.result) {
            for (const u of data.result) {
                tgOffset = u.update_id + 1;
                if (u.message?.text) await handleTelegramMessage(u.message.chat.id, u.message.text);
            }
        }
    } catch (e) {}
    setTimeout(pollTelegram, 2000);
}

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(`
        <!DOCTYPE html>
        <html class="h-full bg-gray-100">
        <head>
            <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="h-full flex items-center justify-center">
            <div id="root"></div>
            <script type="text/babel">
                const App = () => {
                    const [active, setActive] = React.useState(false);
                    const toggle = () => {
                        fetch('/api/toggle', {method:'POST'}).then(r => r.json()).then(d => setActive(d.active));
                    };
                    return (
                        <div className="bg-white p-8 rounded-3xl shadow-2xl w-96 text-center border-t-4 border-[#0a3b8c]">
                            <img src="https://clareia1.vercel.app/logo_clareia_icone.png" className="w-20 mx-auto mb-6"/>
                            <h1 className="text-2xl font-bold text-[#0a3b8c] mb-2">Painel Clareia</h1>
                            <p className="text-gray-500 mb-8">Servidor Local da Clarinha</p>
                            <button onClick={toggle} className={"w-full py-4 rounded-xl font-bold text-white transition-all " + (active ? "bg-red-500 hover:bg-red-600" : "bg-[#179cde] hover:bg-blue-600")}>
                                {active ? "DESLIGAR SISTEMA" : "LIGAR SERVIDOR"}
                            </button>
                        </div>
                    );
                };
                ReactDOM.createRoot(document.getElementById('root')).render(<App />);
            </script>
        </body>
        </html>`);
    } else if (req.url === '/api/toggle' && req.method === 'POST') {
        tgPollingActive = !tgPollingActive;
        if (tgPollingActive) pollTelegram();
        res.writeHead(200);
        res.end(JSON.stringify({active: tgPollingActive}));
    }
});

server.listen(3001, () => console.log("Servidor ativo: http://localhost:3001"));
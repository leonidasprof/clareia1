const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Cria a pasta "uploads" caso ela não exista
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configuração do Multer (responsável por receber os arquivos do upload)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir) // Salva na pasta uploads
    },
    filename: function (req, file, cb) {
        // Mantém o nome original do arquivo (substituindo espaços por underlines)
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage: storage });

// Serve os arquivos estáticos (seu index.html e as imagens padrão)
app.use(express.static(__dirname)); 
// Torna a pasta "uploads" acessível pela URL /uploads/...
app.use('/uploads', express.static(uploadDir)); 

// Rota 1: Lista todas as imagens que estão na pasta "uploads"
app.get('/api/images', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao ler diretório.' });
        // Filtra para garantir que está pegando apenas arquivos de imagem comuns
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
        res.json(imageFiles);
    });
});

// Rota 2: Recebe o upload do arquivo do front-end
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    // Retorna o sucesso e o novo caminho da imagem
    res.json({ 
        filename: req.file.filename, 
        url: `/uploads/${req.file.filename}` 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando! Acesse a galeria em: http://localhost:${PORT}`);
});
// Importa os módulos necessários
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Cria a aplicação Express
const app = express();
// Cria um servidor HTTP utilizando a aplicação Express
const server = http.createServer(app);
// Cria uma instância do Socket.IO vinculada ao servidor HTTP
const io = socketIo(server);

// Variáveis globais para armazenar usuários e agentes conectados e conversas ativas
let connectedUsers = {};
let connectedAgents = {};
let activeConversations = {};

// Configura a pasta de arquivos estáticos para servir o CSS
// Essa linha é para o CSS funcionar
app.use(express.static('./estilo'));

// Rota para a página do agente
app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, './pages/agent.html'));
});

// Rota para a página do usuário
app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, './pages/user.html'));
});

// Rota para a página inicial
app.get('/', (req, res) => {
    res.send("Servidor sendo executado...")
});

// Evento de conexão do Socket.IO
io.on('connection', (socket) => {
    console.log('New user connected - ' + socket.id);

    // Evento de login do usuário
    socket.on('user login', (user) => {
        connectedUsers[socket.id] = { name: user, inConversation: false };
        io.emit('update users', Object.values(connectedUsers));
        activeConversations[user] = null;
        io.emit('update active conversations', Object.keys(activeConversations));
        console.log('Active conversations updated:', Object.keys(activeConversations));
    });

    // Evento de login do agente
    socket.on('agent login', (agent) => {
        connectedAgents[socket.id] = agent;
        io.emit('update agents', Object.values(connectedAgents));
        console.log('Agent connected:', agent);
    });

    // Evento de seleção de conversa pelo agente
    socket.on('agent select conversation', (user) => {
        if (activeConversations[user] === null) {
            activeConversations[user] = connectedAgents[socket.id];
            const userSocketId = Object.keys(connectedUsers).find(key => connectedUsers[key].name === user);
            if (userSocketId) {
                connectedUsers[userSocketId].inConversation = true;
                io.emit('update active conversations', Object.keys(activeConversations));
                io.emit('update users', Object.values(connectedUsers));
                io.to(userSocketId).emit('agent identified', connectedAgents[socket.id]);
                socket.emit('agent conversation selected', user);
            }
        } else {
            socket.emit('conversation already in progress', user);
        }
    });

    // Evento de desconexão do socket
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (connectedUsers[socket.id]) {
            const userObj = connectedUsers[socket.id];
            const agentSocketId = Object.keys(connectedAgents).find(id => connectedAgents[id] === activeConversations[userObj.name]);
            if (agentSocketId) {
                activeConversations[userObj.name] = null;
                userObj.inConversation = false;
                io.to(agentSocketId).emit('user disconnect', userObj.name);
                io.emit('update active conversations', Object.keys(activeConversations));
            }
            delete connectedUsers[socket.id];
            io.emit('update users', Object.values(connectedUsers));
        }
        if (connectedAgents[socket.id]) {
            const agent = connectedAgents[socket.id];
            Object.keys(activeConversations).forEach(user => {
                if (activeConversations[user] === agent) {
                    const userSocketId = Object.keys(connectedUsers).find(key => connectedUsers[key].name === user);
                    if (userSocketId) {
                        io.to(userSocketId).emit('user disconnect');
                        connectedUsers[userSocketId].inConversation = false;
                    }
                    activeConversations[user] = null;
                }
            });
            delete connectedAgents[socket.id];
            io.emit('update agents', Object.values(connectedAgents));
            io.emit('update active conversations', Object.keys(activeConversations));
        }
    });

    // Evento de mensagem enviada pelo agente
    socket.on('agent message', (data) => {
        const userSocketId = Object.keys(connectedUsers).find(id => connectedUsers[id].name === data.user);
        console.log("1: " + data.agent);
        if (userSocketId) {
            io.to(userSocketId).emit('message received', { user: data.agent, message: data.message });
        }
    });

    // Evento de mensagem enviada pelo usuário
    socket.on('user message', (data) => {
        const agentSocketId = Object.keys(connectedAgents).find(id => connectedAgents[id] === activeConversations[data.user]);
        
        console.log("2: " + data.user);
        if (agentSocketId) {
            io.to(agentSocketId).emit('message received', { user: data.user, message: data.message });
        }
    });

    // Evento de desconexão do agente
    socket.on('agent disconnect', (user) => {
        const userSocketId = Object.keys(connectedUsers).find(id => connectedUsers[id].name === user);
        if (userSocketId) {
            io.to(userSocketId).emit('user disconnect');
            connectedUsers[userSocketId].attended = true;
            io.emit('update users', Object.values(connectedUsers));
            socket.emit('user attended', user);
        }
        activeConversations[user] = null;
        const userObj = connectedUsers[Object.keys(connectedUsers).find(key => connectedUsers[key].name === user)];
        if (userObj) {
            userObj.inConversation = false;
        }
        io.emit('update active conversations', Object.keys(activeConversations));
        io.emit('update users', Object.values(connectedUsers));
    });

    // Evento de desconexão do usuário
    socket.on('user disconnect', () => {
        const userObj = connectedUsers[socket.id];
        if (userObj) {
            const agentSocketId = Object.keys(connectedAgents).find(id => connectedAgents[id] === activeConversations[userObj.name]);
            if (agentSocketId) {
                activeConversations[userObj.name] = null;
                userObj.inConversation = false;
                io.emit('update active conversations', Object.keys(activeConversations));
                io.emit('update users', Object.values(connectedUsers));
            }
        }
    });
});

// Inicia o servidor na porta 3000
server.listen(3000, () => {
    console.log('Server listening on port 3000');
});


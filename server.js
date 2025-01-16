const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Разрешить все источники (для тестирования)
        methods: ['GET', 'POST'],
    },
});

const users = new Set(); // Хранение подключенных пользователей

// Обработка подключения нового пользователя
const handleConnection = (socket) => {
    console.log(`User connected: ${socket.id}`);
    users.add(socket.id);

    // Уведомляем всех о новом подключении
    io.emit('user-connected', socket.id);

    // Обработка сигналов WebRTC
    socket.on('signal', (data) => {
        const { to, signal } = data;
        if (users.has(to)) {
            io.to(to).emit('signal', { from: socket.id, signal });
        } else {
            socket.emit('error', { message: 'Партнер отключился' });
        }
    });

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });

    // Поиск пары для чата
    socket.on('find-partner', () => {
        findPartner(socket);
    });

    // Остановка чата
    socket.on('stop-chat', () => {
        stopChat(socket);
    });
};

// Обработка отключения пользователя
const handleDisconnect = (socket) => {
    console.log(`User disconnected: ${socket.id}`);
    users.delete(socket.id);
    io.emit('user-disconnected', socket.id);
};

// Поиск пары для чата
const findPartner = (socket) => {
    if (users.size >= 2) {
        const [user1, user2] = Array.from(users).slice(-2); // Берем последних двух пользователей
        io.to(user1).emit('partner-found', { partnerId: user2 });
        io.to(user2).emit('partner-found', { partnerId: user1 });
    } else {
        socket.emit('error', { message: 'Ожидайте подключения партнера' });
    }
};

// Остановка чата
const stopChat = (socket) => {
    io.emit('chat-stopped', { userId: socket.id });
};

// Инициализация подключения
io.on('connection', handleConnection);

const PORT = 10000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

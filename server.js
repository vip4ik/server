const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*', // Разрешить все источники (для тестирования)
        methods: ['GET', 'POST'],
    },
});

const users = new Set(); // Хранение подключенных пользователей

// Обработка подключений
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    users.add(socket.id);

    // Уведомляем всех о новом подключении
    io.emit('user-connected', socket.id);

    // Обработка сигналов WebRTC
    socket.on('signal', (data) => {
        const { to, signal } = data;
        if (!to || !users.has(to)) {
            socket.emit('error', { message: 'Партнер отключился или не найден' });
            return;
        }
        io.to(to).emit('signal', { from: socket.id, signal });
    });

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (users.has(socket.id)) {
            users.delete(socket.id);
            io.emit('user-disconnected', socket.id);
        }
    });

    // Поиск пары для чата
    socket.on('find-partner', () => {
        if (users.size < 2) {
            socket.emit('error', { message: 'Ожидайте подключения партнера' });
            return;
        }
        const [user1, user2] = Array.from(users).slice(-2); // Берем последних двух пользователей
        io.to(user1).emit('partner-found', { partnerId: user2 });
        io.to(user2).emit('partner-found', { partnerId: user1 });
    });

    // Остановка чата
    socket.on('stop-chat', () => {
        io.emit('chat-stopped', { userId: socket.id });
    });

    // Обработка ошибок
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Используем порт из переменной окружения или 10000 по умолчанию
const PORT = process.env.PORT || 10000;

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

// Обработка завершения работы
process.on('SIGTERM', () => {
    console.log('Server is shutting down...');
    server.close(() => {
        console.log('Server has been terminated.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Server is shutting down...');
    server.close(() => {
        console.log('Server has been terminated.');
        process.exit(0);
    });
});

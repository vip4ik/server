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
const waitingUsers = []; // Очередь пользователей, ожидающих партнера

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

            // Удаляем пользователя из очереди ожидания
            const index = waitingUsers.indexOf(socket.id);
            if (index !== -1) {
                waitingUsers.splice(index, 1);
            }
        }
    });

    // Поиск пары для чата
    socket.on('find-partner', () => {
        if (waitingUsers.length >= 1) {
            // Если есть пользователь в очереди, соединяем их
            const partnerId = waitingUsers.shift(); // Берем первого пользователя из очереди
            io.to(socket.id).emit('partner-found', { partnerId });
            io.to(partnerId).emit('partner-found', { partnerId: socket.id });
        } else {
            // Если нет пользователей в очереди, добавляем текущего пользователя
            waitingUsers.push(socket.id);
            socket.emit('status', { message: 'Ожидайте подключения партнера' });
        }
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

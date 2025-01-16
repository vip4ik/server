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

// Добавьте ваш код сюда
const users = new Set(); // Хранение подключенных пользователей
const waitingUsers = []; // Очередь пользователей, ожидающих партнера

// Обработка подключений
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    users.add(socket.id);

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

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        users.delete(socket.id);

        // Удаляем пользователя из очереди ожидания
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
        }
    });
});

// Используем порт из переменной окружения или 10000 по умолчанию
const PORT = process.env.PORT || 10000;

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Конфигурация
const PORT = process.env.PORT || 10000;

// Хранилище данных
const users = new Map(); // ID пользователя -> данные
const waitingPool = {
    any: [],
    male: [],
    female: []
};

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Обработка WebSocket соединений
wss.on('connection', (ws) => {
    console.log('Новое соединение установлено');
    
    let currentUserId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Получено сообщение:', data.type);
            
            switch (data.type) {
                case 'register':
                    handleRegister(ws, data);
                    break;
                case 'offer':
                    handleOffer(data);
                    break;
                case 'answer':
                    handleAnswer(data);
                    break;
                case 'iceCandidate':
                    handleIceCandidate(data);
                    break;
                case 'disconnect':
                    handleDisconnect(data);
                    break;
                case 'nextPartner':
                    handleNextPartner(data);
                    break;
                default:
                    console.log('Неизвестный тип сообщения:', data.type);
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        console.log('Соединение закрыто:', currentUserId);
        if (currentUserId) {
            handleDisconnect({ userId: currentUserId });
        }
    });

    // Обработка регистрации пользователя
    function handleRegister(ws, data) {
        const { userId, gender, searchPreference } = data;
        currentUserId = userId;
        
        const userData = {
            ws,
            userId,
            gender,
            searchPreference,
            partnerId: null
        };
        
        users.set(userId, userData);
        console.log(`Пользователь зарегистрирован: ${userId} (${gender}, ищет: ${searchPreference})`);
        
        // Добавляем пользователя в пул ожидания
        addToWaitingPool(userData);
    }
    
    // Обработка предложения (offer)
    function handleOffer(data) {
        const { targetUserId, offer } = data;
        const targetUser = users.get(targetUserId);
        
        if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
                type: 'offer',
                offer,
                senderUserId: targetUser.partnerId
            }));
        }
    }
    
    // Обработка ответа (answer)
    function handleAnswer(data) {
        const { targetUserId, answer } = data;
        const targetUser = users.get(targetUserId);
        
        if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
                type: 'answer',
                answer,
                senderUserId: targetUser.partnerId
            }));
        }
    }
    
    // Обработка ICE кандидата
    function handleIceCandidate(data) {
        const { targetUserId, candidate } = data;
        const targetUser = users.get(targetUserId);
        
        if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
                type: 'iceCandidate',
                candidate,
                senderUserId: targetUser.partnerId
            }));
        }
    }
    
    // Обработка отключения
    function handleDisconnect(data) {
        const { userId } = data;
        const user = users.get(userId);
        
        if (user) {
            // Уведомляем партнера об отключении
            if (user.partnerId) {
                const partner = users.get(user.partnerId);
                if (partner && partner.ws.readyState === WebSocket.OPEN) {
                    partner.ws.send(JSON.stringify({
                        type: 'partnerDisconnected'
                    }));
                    
                    // Возвращаем партнера в пул ожидания
                    partner.partnerId = null;
                    addToWaitingPool(partner);
                }
            }
            
            // Удаляем пользователя из пула ожидания
            removeFromWaitingPool(user);
            
            // Удаляем пользователя из хранилища
            users.delete(userId);
            console.log(`Пользователь отключен: ${userId}`);
        }
    }
    
    // Обработка запроса на нового собеседника
    function handleNextPartner(data) {
        const { userId } = data;
        const user = users.get(userId);
        
        if (user) {
            // Уведомляем текущего партнера
            if (user.partnerId) {
                const partner = users.get(user.partnerId);
                if (partner && partner.ws.readyState === WebSocket.OPEN) {
                    partner.ws.send(JSON.stringify({
                        type: 'partnerDisconnected'
                    }));
                    
                    // Возвращаем партнера в пул ожидания
                    partner.partnerId = null;
                    addToWaitingPool(partner);
                }
                
                user.partnerId = null;
            }
            
            // Возвращаем пользователя в пул ожидания
            addToWaitingPool(user);
        }
    }
});

// Добавление пользователя в пул ожидания
function addToWaitingPool(user) {
    // Если у пользователя уже есть партнер, сначала удаляем его
    removeFromWaitingPool(user);
    
    // Определяем, в какой пул добавлять пользователя
    let pool;
    if (user.searchPreference === 'opposite') {
        pool = user.gender === 'male' ? waitingPool.female : waitingPool.male;
    } else {
        pool = waitingPool.any;
    }
    
    // Добавляем пользователя в пул
    pool.push(user.userId);
    console.log(`Пользователь ${user.userId} добавлен в пул ожидания`);
    
    // Пытаемся найти пару
    tryMatchUsers();
}

// Удаление пользователя из пула ожидания
function removeFromWaitingPool(user) {
    // Удаляем из всех пулов на всякий случай
    waitingPool.any = waitingPool.any.filter(id => id !== user.userId);
    waitingPool.male = waitingPool.male.filter(id => id !== user.userId);
    waitingPool.female = waitingPool.female.filter(id => id !== user.userId);
}

// Поиск пар для пользователей
function tryMatchUsers() {
    // Сначала пытаемся найти пары для тех, кто ищет противоположный пол
    matchOppositeGender();
    
    // Затем для тех, кто ищет любого
    matchAnyGender();
}

// Поиск пар для противоположного пола
function matchOppositeGender() {
    while (waitingPool.male.length > 0 && waitingPool.female.length > 0) {
        const maleId = waitingPool.male.shift();
        const femaleId = waitingPool.female.shift();
        
        const maleUser = users.get(maleId);
        const femaleUser = users.get(femaleId);
        
        if (maleUser && femaleUser) {
            createPair(maleUser, femaleUser);
        }
    }
}

// Поиск пар для любого пола
function matchAnyGender() {
    while (waitingPool.any.length >= 2) {
        const user1Id = waitingPool.any.shift();
        const user2Id = waitingPool.any.shift();
        
        const user1 = users.get(user1Id);
        const user2 = users.get(user2Id);
        
        if (user1 && user2) {
            createPair(user1, user2);
        }
    }
}

// Создание пары пользователей
function createPair(user1, user2) {
    user1.partnerId = user2.userId;
    user2.partnerId = user1.userId;
    
    // Отправляем уведомления обоим пользователям
    if (user1.ws.readyState === WebSocket.OPEN) {
        user1.ws.send(JSON.stringify({
            type: 'partnerFound',
            partnerId: user2.userId,
            partnerGender: user2.gender,
            initiator: true
        }));
    }
    
    if (user2.ws.readyState === WebSocket.OPEN) {
        user2.ws.send(JSON.stringify({
            type: 'partnerFound',
            partnerId: user1.userId,
            partnerGender: user1.gender,
            initiator: false
        }));
    }
    
    console.log(`Создана пара: ${user1.userId} (${user1.gender}) и ${user2.userId} (${user2.gender})`);
}

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

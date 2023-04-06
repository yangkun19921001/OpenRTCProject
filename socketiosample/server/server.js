// 导入需要的库
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
// 创建 Express 应用和 HTTP 服务器
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

// 定义监听的端口
const PORT =  3001;

// 当有新的客户端连接时触发 'connection' 事件
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 当客户端发送 'joinRoom' 事件时加入指定房间
  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(socket.id, '已加入房间:', room);

    const clientsInRoom = io.sockets.adapter.rooms.get(room);
    const clientsCount = clientsInRoom ? clientsInRoom.size : 0;
    console.log(`There are ${clientsCount} clients in room ${room}`);
    if(clientsCount > 1){
     //向 room 中所有客户端发送消息
    // io.in(room).emit('joined', { sender:socket.id, receiver: room });
     socket.broadcast.to(room).emit('joined', { sender:socket.id, receiver: room });

     clientsInRoom.forEach((clientId) => {
        if (clientId !== socket.id) {
           console.log(`Other client ID in room ${room}: ${socket.id} > ${clientId}  `);
           socket.emit('joined', { sender:clientId, receiver: room });
        }
      });
    }
  });

  // 当客户端发送 'broadcast' 事件时，向除自己之外的所有客户端广播消息
socket.on('broadcast', (msg) => {
    const sender = socket.id;
    socket.broadcast.emit('message', { sender, receiver: 'all', msg });
  });
  
// 向指定的房间和 socket.id 发送消息
socket.on('sendTo', ({ room, id, msg }) => {
    const sender = socket.id;
    // 检查目标客户端是否在指定的房间内
    const clientsInRoom = io.sockets.adapter.rooms.get(room);
    if (clientsInRoom) {
      if (clientsInRoom.has(id)) {
        socket.to(id).emit('message', { sender, receiver: id, msg });
      } else {
        console.log(`Socket ID ${id} is not in room ${room}`);
      }
    } else {
      console.log(`Room ${room} does not exist`);
    }
  });
  
  
  // 当客户端发送 'group' 事件时，向指定房间内的所有其他客户端发送消息
  socket.on('group', ({ room, msg }) => {
    const sender = socket.id;
    
    socket.broadcast.to(room).emit('message', { sender, receiver: room, msg });
  });
  

  // 当客户端断开连接时触发 'disconnect' 事件
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
  });
});

// 启动 HTTP 服务器并监听指定端口
server.listen(PORT, () => {
  console.log(`服务器已启动，监听端口：${PORT}`);
});

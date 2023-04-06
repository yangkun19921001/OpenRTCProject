var log4js = require('log4js');
var http = require('http');
var https = require('https');
var fs = require('fs');
var socketIo = require('socket.io');

var express = require('express');
var serveIndex = require('serve-index');

var USERCOUNT = 3;

log4js.configure({
    appenders: {
        file: {
            type: 'file',
            filename: 'app.log',
            layout: {
                type: 'pattern',
                pattern: '%r %p - %m',
            }
        }
    },
    categories: {
        default: {
            appenders: ['file'],
            level: 'debug'
        }
    }
});

var logger = log4js.getLogger();

var app = express();
app.use(serveIndex('./client'));
app.use(express.static('./client'));



//http server
var http_server = http.createServer(app);
http_server.listen(80, '0.0.0.0');

var options = {
        key : fs.readFileSync('./cert/rtcmedia.top.key'),
        cert: fs.readFileSync('./cert/rtcmedia.top_bundle.pem')
}

//https server
var https_server = https.createServer(options, app);
var io = socketIo.listen(https_server);


io.sockets.on('connection', (socket)=> {

    socket.on('message', (room, data)=>{
            const sender = socket.id;
            const receiver = data.to;
            data.from = sender;
            // 检查目标客户端是否在指定的房间内
            const clientsInRoom = io.sockets.adapter.rooms.get(room);
            if (clientsInRoom) {
              if (clientsInRoom.has(receiver)) {
                socket.to(receiver).emit('message', data);
              } else {
                console.log(`Socket ID ${receiver} is not in room ${room}`);
              }
            } else {
              console.log(`Room ${room} does not exist`);
            }
    });

    socket.on('join', (room)=>{
            socket.join(room);
            var myRoom = io.sockets.adapter.rooms[room];
            var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
            logger.debug('the user number of room is: ' + users);

            if(users < USERCOUNT){
                    //socket.emit('joined', room, socket.id, users > 1); //发给除自己之外的房间内的所有人

                    const clientsInRoom = io.sockets.adapter.rooms.get(room);
                    const clientsCount = clientsInRoom ? clientsInRoom.size : 0;
                    console.log(`There are ${clientsCount} clients in room ${room}`);
                    if(clientsCount > 1){
                      //向 room 中除自己外的客户端发送消息
                      socket.broadcast.to(room).emit('joined', { sender:socket.id, receiver: room });
                
                      clientsInRoom.forEach((clientId) => {
                        if (clientId !== socket.id) {
                           console.log(`Other client ID in room ${room}: ${socket.id} > ${clientId}  `);
                           socket.emit('joined', { sender:clientId, receiver: room });
                        }
                      });
                     }

            }else{
                    socket.leave(room);
                    socket.emit('full', room, socket.id);
            }

    });
    socket.on('leave', (room)=>{
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
        logger.debug('the user number of room is: ' + (users-1));
        //socket.emit('leaved', room, socket.id);
        //socket.broadcast.emit('leaved', room, socket.id);
        socket.to(room).emit('bye', room, socket.id);
        socket.emit('leaved', room, socket.id);
        //io.in(room).emit('leaved', room, socket.id);
});

});

https_server.listen(443, '0.0.0.0');
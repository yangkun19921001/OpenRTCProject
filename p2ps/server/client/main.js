const serverUrl = document.getElementById('serverUrl');
const roomInput = document.getElementById('room');
const startButton = document.getElementById('start');
const leaveButton = document.getElementById('leave');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');

let socket;
let localStream;
let peers = {};
leaveButton.disabled = true;
leaveButton.addEventListener('click', async () => {
    leave();
  });

function leave(){
    const room = document.getElementById('room').value;
    socket.emit('leave', room);
    for (let remoteId in peers) {
      peers[remoteId].close();
      delete peers[remoteId];
      let remoteVideo = document.getElementById(`remoteVideo-${remoteId}`);
      if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.remove();
      }
    }
    startButton.disabled = false;
    leaveButton.disabled = true;
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
 
  // 获取本地音视频流
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  // 连接信令服务器
  socket = io.connect(serverUrl.value);

  // 处理加入房间事件
  socket.on('joined', (room, id, otherClientIds) => {

    leaveButton.disabled = false;

    if (id === socket.id) {
        // 为每个其他客户端创建一个 RTCPeerConnection 实例（不需要创建 Offer）
        otherClientIds.forEach(otherClientId => {
          createPeerConnection(room, socket.id, otherClientId, false);
        });
      } else {
        // 为远程客户端创建一个 RTCPeerConnection 实例并创建 Offer
        createPeerConnection(room, socket.id, id, true);
      }
  });

  // 处理消息事件
  socket.on('message', (sender, receiver, msg) => {
    const message = msg;
    const peer = peers[sender];

    if (message.type == 'offer') {
        peer.setRemoteDescription(new RTCSessionDescription({type:message.type,sdp:message.sdp}))
        .then(() => {
            peer.createAnswer()
              .then(answer => peer.setLocalDescription(answer))
              .then(() => {
                socket.emit('message', roomInput.value, sender, { type:'answer',sdp: peer.localDescription.sdp });
              });
        });
    }else if(message.type == 'answer'){
        peer.setRemoteDescription(new RTCSessionDescription({type:message.type,sdp:message.sdp}))
        .then(() => {

        });
    }else if(message.type == 'candidate')
    {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        peer.addIceCandidate(candidate)
            .then(()=>{
                console.log('Successed to add ice candidate');	
            })
            .catch(err=>{
                console.error(err);	
            });
    }
  });

  // 处理离开房间事件
  socket.on('leaved', (room, id) => {
    const videoElement = document.getElementById(`remoteVideo-${id}`);
    if (videoElement) {
      videoElement.remove();
    }

    if (peers[id]) {
      peers[id].close();
      delete peers[id];
    }
  });

  // 加入房间
  socket.emit('join', roomInput.value);
});

function createPeerConnection(room, localId, remoteId,createOffer) {
    const peer = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:rtcmedia.top:3478',
            username: 'devyk',
            credential: 'devyk'
          }
        ]
      });
  
    // 将本地流添加到 RTCPeerConnection 实例
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  
    // 处理 ICE 候选
    peer.onicecandidate = event => {
      if (event.candidate) {
        //socket.emit('message', room, remoteId, JSON.stringify({ candidate: event.candidate }));
        socket.emit('message', room, remoteId, {
            type: 'candidate',
            label:event.candidate.sdpMLineIndex, 
            id:event.candidate.sdpMid, 
            candidate: event.candidate.candidate
        });
      }
    };
  
    // 处理远程媒体流
// 处理远程媒体流
    peer.ontrack = event => {
        let remoteVideo = document.getElementById(`remoteVideo-${remoteId}`);
        if (!remoteVideo) {
        remoteVideo = document.createElement('video');
        remoteVideo.id = `remoteVideo-${remoteId}`;
        remoteVideo.autoplay = true;
        remoteVideo.playsinline = true;
        remoteVideo.classList.add('remote-video'); // Add the 'remote-video' class
        remoteVideos.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };
  
  
    // 创建并发送 Offer
    if (createOffer) {
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
            var data = { type:'offer',sdp: peer.localDescription.sdp };
            console.log('send local sdp to：'+remoteId +' data:'+JSON.stringify(data))
          socket.emit('message', room, remoteId, data);
        });
    }
  
    // 将创建的 RTCPeerConnection 实例添加到 peers 对象
    peers[remoteId] = peer;
  }

  // 监听浏览器关闭或刷新事件
window.addEventListener('beforeunload', (event) => {
    leave();
  });
  
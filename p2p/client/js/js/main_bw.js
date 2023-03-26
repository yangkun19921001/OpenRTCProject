'use strict'

var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');

var btnConn =  document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var optBw = document.querySelector('select#bandwidth');

var chat = document.querySelector('textarea#chat');
var send_txt = document.querySelector('textarea#sendtxt');
var btnSend = document.querySelector('button#send');

var bitrateGraph;
var bitrateSeries;

var packetGraph;
var packetSeries;

var lastResult;

var pcConfig = {
  'iceServers': [{
    'urls': 'turn:stun.al.learningrtc.cn:3478',
    'credential': "mypasswd",
    'username': "garrylea"
  }]
};

var localStream = null;
var remoteStream = null;

var pc = null;
var dc = null;

var roomid;
var socket = null;

var offerdesc = null;
var state = 'init';



function sendMessage(roomid, data){

	console.log('send message to other end', roomid, data);
	if(!socket){
		console.log('socket is null');
	}
	socket.emit('message', roomid, data);
}

function dataChannelStateChange() {
  var readyState = dc.readyState;
  console.log('Send channel state is: ' + readyState);
  if (readyState === 'open') {
    send_txt.disabled = false;
    send.disabled = false;
  } else {
    send_txt.disabled = true;
    send.disabled = true;
  }
}

function conn(){

	socket = io.connect();

	socket.on('joined', (roomid, id) => {
		console.log('receive joined message!', roomid, id);
		state = 'joined'

		//如果是多人的话，第一个人不该在这里创建peerConnection
		//都等到收到一个otherjoin时再创建
		//所以，在这个消息里应该带当前房间的用户数
		//
		//create conn and bind media track
		createPeerConnection();
		bindTracks();

		btnConn.disabled = true;
		btnLeave.disabled = false;

		console.log('receive joined message, state=', state);
	});

	socket.on('otherjoin', (roomid) => {
		console.log('receive joined message:', roomid, state);

		//如果是多人的话，每上来一个人都要创建一个新的 peerConnection
		//
		if(state === 'joined_unbind'){
			createPeerConnection();
			bindTracks();
		}

		//create data channel for transporting non-audio/video data
		dc = pc.createDataChannel('chatchannel');
		dc.onmessage = receivemsg;
		dc.onopen = dataChannelStateChange;
		dc.onclose = dataChannelStateChange;

		state = 'joined_conn';
		call();

		console.log('receive other_join message, state=', state);
	});

	socket.on('full', (roomid, id) => {
		console.log('receive full message', roomid, id);
		socket.disconnect();
		hangup();
		closeLocalMedia();
		state = 'leaved';
		console.log('receive full message, state=', state);
		alert('the room is full!');
	});

	socket.on('leaved', (roomid, id) => {
		console.log('receive leaved message', roomid, id);
		state='leaved'
		socket.disconnect();
		console.log('receive leaved message, state=', state);

		btnConn.disabled = false;
		btnLeave.disabled = true;
		optBw.disabled = true;
	});

	socket.on('bye', (room, id) => {
		console.log('receive bye message', roomid, id);
		//state = 'created';
		//当是多人通话时，应该带上当前房间的用户数
		//如果当前房间用户不小于 2, 则不用修改状态
		//并且，关闭的应该是对应用户的peerconnection
		//在客户端应该维护一张peerconnection表，它是
		//一个key:value的格式，key=userid, value=peerconnection
		state = 'joined_unbind';
		hangup();
		console.log('receive bye message, state=', state);
	});

	socket.on('disconnect', (socket) => {
		console.log('receive disconnect message!', roomid);
		if(!(state === 'leaved')){
			hangup();
			closeLocalMedia();

		}
		state = 'leaved';

		btnConn.disabled = false;
		btnLeave.disabled = true;
		optBw.disabled = true;
	
	});

	socket.on('message', (roomid, data) => {
		console.log('receive message!', roomid, data);

		if(data === null || data === undefined){
			console.error('the message is invalid!');
			return;	
		}

		if(data.hasOwnProperty('type') && data.type === 'offer') {
			
			pc.setRemoteDescription(new RTCSessionDescription(data));
			//create answer
			pc.createAnswer()
				.then(getAnswer)
				.catch(handleAnswerError);

		}else if(data.hasOwnProperty('type') && data.type === 'answer'){
			optBw.disabled = false
			pc.setRemoteDescription(new RTCSessionDescription(data));
		
		}else if (data.hasOwnProperty('type') && data.type === 'candidate'){
			var candidate = new RTCIceCandidate({
				sdpMLineIndex: data.label,
				candidate: data.candidate
			});
			pc.addIceCandidate(candidate)
				.then(()=>{
					console.log('Successed to add ice candidate');	
				})
				.catch(err=>{
					console.error(err);	
				});
		
		}else{
			console.log('the message is invalid!', data);
		
		}
	
	});


	roomid = '111111'; 
	socket.emit('join', roomid);

	return true;
}

function connSignalServer(){
	
	//开启本地视频
	start();

	return true;
}

function getMediaStream(stream){

	localStream = stream;	
	localVideo.srcObject = localStream;

	//这个函数的位置特别重要，
	//一定要放到getMediaStream之后再调用
	//否则就会出现绑定失败的情况
	
	//setup connection
	conn();

	bitrateSeries = new TimelineDataSeries();
	bitrateGraph = new TimelineGraphView('bitrateGraph', 'bitrateCanvas');
	bitrateGraph.updateEndDate();

	packetSeries = new TimelineDataSeries();
	packetGraph = new TimelineGraphView('packetGraph', 'packetCanvas');
	packetGraph.updateEndDate();
}

function getDeskStream(stream){
	localStream = stream;
}

function handleError(err){
	console.error('Failed to get Media Stream!', err);
}

function shareDesk(){

	if(IsPC()){
		navigator.mediaDevices.getDisplayMedia({video: true})
			.then(getDeskStream)
			.catch(handleError);

		return true;
	}

	return false;

}

function start(){

	if(!navigator.mediaDevices ||
		!navigator.mediaDevices.getUserMedia){
		console.error('the getUserMedia is not supported!');
		return;
	}else {

		var constraints = {
			video: true,
			audio: false 
		}

		navigator.mediaDevices.getUserMedia(constraints)
					.then(getMediaStream)
					.catch(handleError);
	}

}

function getRemoteStream(e){
	remoteStream = e.streams[0];
	remoteVideo.srcObject = e.streams[0];
}

function handleOfferError(err){
	console.error('Failed to create offer:', err);
}

function handleAnswerError(err){
	console.error('Failed to create answer:', err);
}

function getAnswer(desc){
	pc.setLocalDescription(desc);

	optBw.disabled = false;
	//send answer sdp
	sendMessage(roomid, desc);
}

function getOffer(desc){
	pc.setLocalDescription(desc);
	offerdesc = desc;

	//send offer sdp
	sendMessage(roomid, offerdesc);	

}

function receivemsg(e){
	var msg = e.data;
	if(msg){
		console.log(msg);
		chat.value += "->" + msg + "\r\n";
	}else{
		console.error('received msg is null');
	}
}

function createPeerConnection(){

	//如果是多人的话，在这里要创建一个新的连接.
	//新创建好的要放到一个map表中。
	//key=userid, value=peerconnection
	console.log('create RTCPeerConnection!');
	if(!pc){
		pc = new RTCPeerConnection(pcConfig);

		pc.onicecandidate = (e)=>{

			if(e.candidate) {
				sendMessage(roomid, {
					type: 'candidate',
					label:event.candidate.sdpMLineIndex, 
					id:event.candidate.sdpMid, 
					candidate: event.candidate.candidate
				});
			}else{
				console.log('this is the end candidate');
			}
		}

		pc.ondatachannel = e=> {
			if(!dc){
				dc = e.channel;
				dc.onmessage = receivemsg; 
				dc.onopen = dataChannelStateChange;
				dc.onclose = dataChannelStateChange;
			}

		}

		pc.ontrack = getRemoteStream;
	}else {
		console.log('the pc have be created!');
	}

	return;	
}

//绑定永远与 peerconnection在一起，
//所以没必要再单独做成一个函数
function bindTracks(){

	console.log('bind tracks into RTCPeerConnection!');

	if( pc === null && localStream === undefined) {
		console.error('pc is null or undefined!');
		return;
	}

	if(localStream === null && localStream === undefined) {
		console.error('localstream is null or undefined!');
		return;
	}

	//add all track into peer connection
	localStream.getTracks().forEach((track)=>{
		pc.addTrack(track, localStream);	
	});

}

function call(){
	
	if(state === 'joined_conn'){

		var offerOptions = {
			offerToRecieveAudio: 1,
			offerToRecieveVideo: 1
		}

		pc.createOffer(offerOptions)
			.then(getOffer)
			.catch(handleOfferError);
	}
}

function hangup(){

	if(!pc) {
		return;
	}

	offerdesc = null;
	
	pc.close();
	pc = null;

}

function closeLocalMedia(){

	if(!(localStream === null || localStream === undefined)){
		localStream.getTracks().forEach((track)=>{
			track.stop();
		});
	}
	localStream = null;
}

function leave() {

	socket.emit('leave', roomid); //notify server

	dc.close();
	dc = null;

	hangup();
	closeLocalMedia();

	btnConn.disabled = false;
	btnLeave.disabled = true;
	optBw.disabled = true;

	send_txt.disabled = true;
	send.disabled = true;
}

function chang_bw()
{
	optBw.disabled = true;
	var bw = optBw.options[optBw.selectedIndex].value;

	var vsender = null;
	var senders = pc.getSenders();

	senders.forEach( sender => {
		if(sender && sender.track.kind === 'video'){
			vsender = sender;	
		}	
	});

	var parameters = vsender.getParameters();
	if(!parameters.encodings){
		return;	
	}

	if(bw === 'unlimited'){
		return;	
	}

	parameters.encodings[0].maxBitrate = bw * 1000;

	vsender.setParameters(parameters)
		.then(()=>{
			optBw.disabled = false;
			console.log('Successed to set parameters!');
		})
		.catch(err => {
			console.error(err);
		})
}

// query getStats every second
window.setInterval(() => {
  if (!pc) {
    return;
  }
  const sender = pc.getSenders()[0];
  if (!sender) {
    return;
  }
  sender.getStats().then(res => {
    res.forEach(report => {
      let bytes;
      let packets;
      if (report.type === 'outbound-rtp') {
        if (report.isRemote) {
          return;
        }
        const now = report.timestamp;
        bytes = report.bytesSent;
        packets = report.packetsSent;
        if (lastResult && lastResult.has(report.id)) {
          // calculate bitrate
          const bitrate = 8 * (bytes - lastResult.get(report.id).bytesSent) /
            (now - lastResult.get(report.id).timestamp);

          // append to chart
          bitrateSeries.addPoint(now, bitrate);
          bitrateGraph.setDataSeries([bitrateSeries]);
          bitrateGraph.updateEndDate();

          // calculate number of packets and append to chart
          packetSeries.addPoint(now, packets -
            lastResult.get(report.id).packetsSent);
          packetGraph.setDataSeries([packetSeries]);
          packetGraph.updateEndDate();
        }
      }
    });
    lastResult = res;
  });
}, 1000);

function sendText(){
	var data = send_txt.value;
	if(data != null){
		dc.send(data);
	}

	//更好的展示
	send_txt.value = "";
	chat.value += '<- ' + data + '\r\n';
}

btnConn.onclick = connSignalServer
btnLeave.onclick = leave;
optBw.onchange = chang_bw;

btnSend.onclick = sendText;

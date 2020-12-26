const getJSON = function(url, callback) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', `${url}?_=${new Date().getTime()}`, true);
    xhr.responseType = 'json';
    xhr.onload = function() {
        let status = xhr.status;
        if (status === 200) {
            callback(null, xhr.response);
            return;
        }
        callback(status, xhr.response);
    };
    xhr.send();
};

let canvas = document.getElementById("audio_visual");
const ipRange = '192.168.0';
let channels;

getJSON('./channels.json',
function(err, data) {
    if (err !== null) {
        console.error('Something went wrong: ' + err);
        return;
    }

    channels = data;

    const analyserSize = 2048;
    const audioElement = document.getElementById("source");
    const audioCtx = new AudioContext();


    const source = audioCtx.createMediaElementSource(audioElement);
    const ctx = canvas.getContext("2d");
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = analyserSize;


    source.connect(analyser);
    //this connects our music back to the default output, such as your //speakers 
    source.connect(audioCtx.destination);


    let audioData = new Uint8Array(analyser.frequencyBinCount);
    let throttleTimeout = [];
    function throttle(func, limit, channel, turnOn) {
        if (throttleTimeout[channel]) {
            return;
        }
        func(channel, turnOn);
        throttleTimeout[channel] = setTimeout(function() {
            throttleTimeout[channel] = undefined;
        }, limit);
    }

    let lastStatus = [];
    function lights(channel, turnOn) {
        console.log(channels[channel].name, turnOn, lastStatus[channel]);
        if (channel === undefined || (false === turnOn && turnOn === lastStatus[channel])) {
            return;
        }
        lastStatus[channel] = turnOn;
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.addEventListener("readystatechange", function() {
            if(this.readyState === 4) {
                console.log(this.responseText);
            }
        });

        let turn = turnOn ? 'on': 'off';
        let timer = turnOn ? '&timer=1' : '';

        xhr.open("GET", `http://${ipRange}.${channels[channel].ip}/relay/0?turn=${turn}${timer}&auth_key=ZjRhdWlk2460697F95C6C70D2F34CF144610EBD71BD3E99BDDE18280252F9C21DD70717CCAE995E16CFBB15F`);
        xhr.setRequestHeader('Access-Control-Allow-Headers', '*');
        xhr.setRequestHeader('Content-type', 'application/ecmascript');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
        xhr.send();
    }


    function loopingFunction(){
        requestAnimationFrame(loopingFunction);
        analyser.getByteFrequencyData(audioData);
        // analyser.getByteTimeDomainData(audioData);
        draw(audioData);
    }

    let maxChannel = -1;
    const percentFaktor = 100 / channels.length;
    function calculateChannel(i) {
        const percent = Math.floor((i / (analyserSize / 2)) * 100);
        let channel = Math.floor((percent / percentFaktor) * channels.length);

        return channel >= channels.length ? channels.length - 1 : channel;
    }
    let maxValue = 0;
    function draw(audioData) {
        audioData = [...audioData]
        ctx.clearRect(0,0,canvas.width,canvas.height);
        let space = (canvas.width / audioData.length) + 6;
        
        audioData.forEach((value,i) => {
            let channel = calculateChannel(i);
            
            throttle(lights, 50, channel, (value >= channels[channel].thershold));

            ctx.beginPath();
            ctx.moveTo(space*i,canvas.height); //x,y
            ctx.lineTo(space*i,canvas.height-value); //x,y
            ctx.lineWidth = 5;
            ctx.strokeStyle = channels[channel].color;
            ctx.stroke();
        });
    }

    audioElement.onplay = () => {
        audioCtx.resume();
    }

    requestAnimationFrame(loopingFunction);
});
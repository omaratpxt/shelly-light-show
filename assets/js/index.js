const canvas = document.getElementById("audio-visual");
const debug = true;
const threshold = 0; // max 256 / 2
const analyserSize = 2048;
const numberOflastTurnOns = 5;
const audioElement = document.getElementById("source");
const songsSelectorElement = document.getElementById('list-of-songs');
const AudioContext = window.AudioContext || window.webkitAudioContext;
const shellyEndPoints = {
    relay: {
        endpoint: 'relay',
        aliases: ['shelly1', 'shelly1pm']
    },
    light: {
        endpoint: 'light',
        aliases: ['dimmer1', 'dimmer2', 'shelly1l']
    }
};
const dimmerables = ['dimmer1', 'dimmer2', 'shelly1l'];

let shellyEndPointsMap = {};
for (item in shellyEndPoints) {
    shellyEndPointsMap[item] = item;
    for (alias in shellyEndPoints[item].aliases) {
        shellyEndPointsMap[shellyEndPoints[item].aliases[alias]] = item;
    }
}
/**
 * Alias keys for shelly end points
 */
function shellyEndPoint(item) {
    return shellyEndPoints[shellyEndPointsMap[item]].endpoint;
}

fetch('./songs.json')
.then(response => response.json())
.then(songs => {
    songs.forEach((song, index) => {
        let option = document.createElement("option");
        option.value = song.src;
        option.text = song.name;

        songsSelectorElement.add(option);
    });

    songsSelectorElement.addEventListener('change', event => {
        if (event.target === undefined) {
            return;
        }

        audioElement.src = event.target.value;
    });
    
    if (songs.length === 0) {
        return;
    }

    audioElement.src = songs[0].src;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audioElement);
    const canvasContext = canvas.getContext("2d");
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = analyserSize;
    source.connect(analyser);
    // this connects our music back to the default output, such as your //speakers 
    source.connect(audioContext.destination);
    let audioData = new Uint8Array(analyser.frequencyBinCount);
    let throttleTimeout = [];
    let lastStatus = [];
    let statusHistory = [];
    let debugDivElements = [];
    let maxAudioFrequency, ipRangePrefix, channels, channelValuesSum, channelValuesCount, 
        lastCalculatedChannel, percentFactor,
        debugDivElementsContainer;
    

    fetch('./config.json')
    .then(response => response.json())
    .then(config => {
        maxAudioFrequency = config.maxAudioFrequency || 280;

        channels = config.channels;
        ipRangePrefix = config.ipRangePrefix;
        percentFactor = 100 / channels.length;
        createDebugElements();
        fitToContainer(canvas);

        function createDebugElements() {
            if (debug !== true) {
                return;
            }
            debugDivElementsContainer = document.createElement('div');
            debugDivElementsContainer.setAttribute('id', 'debugDivElement');
            document.getElementById('main-container').appendChild(debugDivElementsContainer);

            channels.forEach((channel, index) => {
                const channelNode = document.createElement('div');
                
                channelNode.setAttribute('id', `channel-${index}`);
                channelNode.setAttribute('data-name', channel.name);
                // channelNode.style.width = `${percentFactor}%`;

                debugDivElements.push(channelNode);
                debugDivElementsContainer.appendChild(channelNode);
            });
        }

        function fillHTMLDebugData(channel, value) {
            if (debug !== true) {
                return;
            }
            debugDivElements[channel].textContent = value;
        }

        function throttle(callable, delay, channel, ...args) {
            if (throttleTimeout[channel]) {
                return;
            }
            callable(channel, ...args);
            throttleTimeout[channel] = setTimeout(function() {
                throttleTimeout[channel] = undefined;
            }, delay);
        }

        function lights(channelId, turnOn, calculatedBrightness) {
            if (channelId === undefined) {
                return;
            }
            statusHistory[channelId].push(turnOn);
            
            if (false === turnOn && turnOn === lastStatus[channelId]) {
                return;
            }
            lastStatus[channelId] = turnOn;
            let channel = channels[channelId];
            let turn = turnOn ? 'on': 'off';
            let timer = turnOn ? '&timer=1' : '';
            let requestOptions = {
                method: 'GET',
                redirect: 'follow',
                mode: 'no-cors'
            };

            if (channel.devices === undefined) {
                return;
            }

            channel.devices.forEach(async device => {
                let brightness = '';
                if (dimmerables.indexOf(channel.type)) {
                    brightness = `&brightness=${calculatedBrightness}`;
                }
                
                fetch(`http://${ipRangePrefix}.${device.ip}/${shellyEndPoint(device.type)}/0?turn=${turn}${timer}${brightness}`, requestOptions)
                    .then(response => response.text())
                    // .then(result => console.log(result))
                    .catch(error => console.log('error', error));
            });
        }


        function loopingFunction() {
            requestAnimationFrame(loopingFunction);
            analyser.getByteFrequencyData(audioData);
            
            // analyser.getByteTimeDomainData(audioData);
            audioData.slice(maxAudioFrequency);

            draw(audioData);
        }

        function calculateChannel(bar) {
            const percent = Math.floor((bar / (maxAudioFrequency)) * 100);
            let channel = Math.ceil(percent / percentFactor) - 1;

            if (channel < 0) {
                channel = 0
            } else if (channel >= channels.length) {
                channel = channels.length - 1;
            }

            return channel;
        }

        function drawLightShow(channel, audioValue, bar) {
            if (document.getElementById('activate-lights-show').checked !== true) {
                return;
            }
            if (channel > lastCalculatedChannel || bar === maxAudioFrequency) {
                if (bar === maxAudioFrequency) {
                    lastCalculatedChannel = channel;
                }

                if (statusHistory[lastCalculatedChannel] === undefined) {
                    statusHistory[lastCalculatedChannel] = [];
                }
                let channelThreshold = channels[lastCalculatedChannel].threshold || threshold;
                const lastFiveHistoricalStatus = statusHistory[lastCalculatedChannel].slice(-numberOflastTurnOns);
                const throttleDelay = channels[lastCalculatedChannel].delay || config.defaultDelay || 500;

                if (lastFiveHistoricalStatus.length > 0) {
                    const lastTurnOns = lastFiveHistoricalStatus.reduce((accumulator, currentValue) => accumulator + currentValue) || 0;
                    const turnOnsFactor = lastTurnOns / numberOflastTurnOns;
                    if (turnOnsFactor >= 1) {
                        channelThreshold = channelThreshold * 1.5;
                    } else if (turnOnsFactor <= 0.3) {
                        channelThreshold = channelThreshold * 0.8;
                    }
                }
                
                let calculatedValue = Math.floor(channelValuesSum / channelValuesCount);
                let turnOn = (calculatedValue >= channelThreshold);
                let calculatedBrightness = Math.ceil((calculatedValue / 256) * 100);

                fillHTMLDebugData(lastCalculatedChannel, `${Math.floor(channelValuesSum / channelValuesCount)} - ${channelThreshold}`);
                throttle(lights, throttleDelay, lastCalculatedChannel, turnOn, calculatedBrightness);
                channelValuesCount = 1;
                channelValuesSum = 0;
            }
            channelValuesCount++;
            channelValuesSum = channelValuesSum + audioValue;
            lastCalculatedChannel = channel;
        }

        function fitToContainer(canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        function draw(audioData) {
            audioData = [...audioData]
            canvasContext.clearRect(0,0,canvas.width, canvas.height);
            let space = (canvas.width / maxAudioFrequency);
            
            channelValuesSum = 0;
            channelValuesCount = 1;
            lastCalculatedChannel = 0;
            audioData.forEach((audioValue, bar) => {
                let channel = calculateChannel(bar);
                canvasContext.beginPath();
                canvasContext.moveTo(space * bar, canvas.height - (canvas.height / 3)); //x,y
                canvasContext.lineTo(space * bar, canvas.height - (audioValue * 1.2)); //x,y
                canvasContext.lineWidth = space / 2;
                canvasContext.strokeStyle = channels[channel].color;
                canvasContext.stroke();
                drawLightShow(channel, audioValue, bar);
            });
        }

        audioElement.onplay = () => {
            audioContext.resume();
        }

        audioElement.onended = () => {
            if (songsSelectorElement.selectedIndex >= (songs.length - 1)) {
                if (!document.getElementById('replay-songs-list').checked) {
                    return;
                }

                songsSelectorElement.selectedIndex = -1;
            }

            songsSelectorElement.selectedIndex++;
            // Dispatch the event.
            songsSelectorElement.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                audioElement.play();
            }, 1000);
        }

        requestAnimationFrame(loopingFunction);
    }).catch(error => {
        console.error('Error:', error);
    });
}).catch(error => {
    console.error('Error:', error);
});

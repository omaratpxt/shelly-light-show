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
        aliases: ['shelly1', 'shelly1pm', 'shellyplus1', 'shellyplus1pm']
    },
    light: {
        endpoint: 'light',
        aliases: ['dimmer1', 'dimmer2', 'shelly1l']
    },
    color: {
        endpoint: 'color',
        aliases: ['rgbw2']
    }
};
const dimmerables = ['dimmer1', 'dimmer2', 'shelly1l','rgbw2'];
const colorful = ['rgbw2'];
let playingStatus = false;
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

/**
 * Returns hex string to rgb
 * @param hex string
 * @return {{r: number, b: number, g: number}|null}
 */
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        red: parseInt(result[1], 16),
        green: parseInt(result[2], 16),
        blue: parseInt(result[3], 16)
    } : null;
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
    const cloudConfig = document.getElementById('cloudConfig');
    analyser.fftSize = analyserSize;
    source.connect(analyser);
    // this connects our music back to the default output, such as your //speakers 
    source.connect(audioContext.destination);
    let audioData = new Uint8Array(analyser.frequencyBinCount);
    let throttleTimer = [];
    let lastStatus = [];
    let statusHistory = [];
    let debugDivElements = [];
    let maxAudioFrequency, ipRangePrefix, channels, channelValuesSum, channelValuesCount, 
        lastCalculatedChannel, percentFactor, defaultDelay,
        debugDivElementsContainer;
    let deviceColors = {};
    let lastColors = {};
    let requestOptions = {
        method: 'GET',
        redirect: 'follow',
        mode: 'no-cors'
    };
    

    fetch('./config.json')
    .then(response => response.json())
    .then(config => {
        defaultDelay = isNaN(config.defaultDelay) === false && config.defaultDelay >= 100 ? config.defaultDelay : 500;
        maxAudioFrequency = config.maxAudioFrequency || 280;

        channels = config.channels;
        ipRangePrefix = config.ipRangePrefix;
        percentFactor = 100 / channels.length;
        createDebugElements();
        fitToContainer(canvas);

        function changeCloudSetting(cloudConfig, channels) {
            if (Array.isArray(channels) !== true) {
                return;
            }

            let isCloudEnabledNumeric = cloudConfig ? '1' : '0';
            let isCloudEnabled = cloudConfig ? 'true' : 'false';
            let path;

            channels.forEach((channel) => {
                if (channel.devices === undefined) {
                    return;
                }

                channel.devices.forEach((device) => {
                    if (device.cloud !== undefined) {
                        device.cloud = cloudConfig;
                    }

                    if (device.type.includes('plus') !== true) {
                        path = `/settings/cloud?enabled=${isCloudEnabledNumeric}`
                    } else {
                        path = `/rpc/Cloud.SetConfig?config={"enable":${isCloudEnabled}}`
                    }

                    fetch(`http://${ipRangePrefix}.${device.ip}${path}`, requestOptions)
                    .then(response => response.text())
                    .catch(error => console.log('error', error));
                });
            });
        }

        
        cloudConfig.addEventListener('change', (event) => {
            if (playingStatus === true && event.currentTarget.checked === true) {
                event.currentTarget.checked = false;
                return;
            }
            changeCloudSetting(event.currentTarget.checked, channels);
        });
        
        function initColors(channel) {
            if (channel.devices === undefined) {
                return;
            }

            channel.devices.forEach((device, deviceId) => {
                if (colorful.indexOf(device.type) === -1 || device.colors === undefined) {
                    return;
                }
                let colorId = `${channel.name}.${deviceId}`;
                if (Array.isArray(deviceColors[colorId]) !== true) {
                    deviceColors[colorId] = [];
                }

                device.colors.forEach((color) => {
                    let rgbColor = hexToRgb(color);

                    if (rgbColor === null) {
                        return;
                    }

                    deviceColors[colorId].push(rgbColor);
                });
            });
        }

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

                initColors(channel);
            });
        }

        function fillHTMLDebugData(channel, value) {
            if (debug !== true) {
                return;
            }
            debugDivElements[channel].textContent = value;
        }

        function throttle(callable, delay, timerId, ...args) {
            if (throttleTimer[timerId]) {
                return;
            }
            callable(timerId, ...args);
            throttleTimer[timerId] = setTimeout(function() {
                throttleTimer[timerId] = undefined;
            }, delay);
        }

        function getColors(channelId, deviceId) {
            let colorId = `${channelId}.${deviceId}`;
            if (deviceColors === undefined || deviceColors[colorId] === undefined || deviceColors[colorId].length === 0) {
                return false
            }

            throttle(function (colorId) {
                lastColors[colorId] = lastColors[colorId] === undefined ? -1 : parseInt(lastColors[colorId]);

                if (lastColors[colorId] >= deviceColors[colorId].length - 1) {
                    lastColors[colorId] = -1;
                }
                lastColors[colorId]++;
            }, 1500, colorId);

            return deviceColors[colorId][lastColors[colorId]] || false;
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

            if (channel.devices === undefined) {
                return;
            }

            channel.devices.forEach(async (device, deviceId) => {
                let brightness = '';
                let color = '';
                if (dimmerables.indexOf(device.type) !== -1) {
                    brightness = `&brightness=${calculatedBrightness}`;
                }

                if (colorful.indexOf(device.type) !== -1) {
                    let colors = getColors(channel.name, deviceId);

                    color = colors !== false ? `&red=${colors.red}&green=${colors.green}&blue=${colors.blue}&white=0` : '';
                }
                
                fetch(`http://${ipRangePrefix}.${device.ip}/${shellyEndPoint(device.type)}/0?turn=${turn}${timer}${brightness}${color}`, requestOptions)
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
                const throttleDelay = channels[lastCalculatedChannel].delay || defaultDelay || 500;

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
                let calculatedBrightness = Math.ceil((calculatedValue / 256) * 100) || 1;

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
            playingStatus = true;
            changeCloudSetting(!playingStatus, channels);
            cloudConfig.checked = !playingStatus;
            audioContext.resume();
        }

        audioElement.onpause = () => {
            playingStatus = false;
            changeCloudSetting(!playingStatus, channels);
            cloudConfig.checked = !playingStatus;
        }

        audioElement.onended = () => {
            playingStatus = false;
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
    }).then().catch(error => {
        console.error('Error:', error);
    });
}).catch(error => {
    console.error('Error:', error);
});

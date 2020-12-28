# shelly-light-show

Shelly music visualisier. The visualisation done with the help of Web AudioContext which triggers a REST API of the iOT device "shelly". the trigger can be easily switched to a different API or using MQTT with a little Know How.

Please feel free to check the source code and use it for your light show.

[![Watch the video](https://img.youtube.com/vi/H3WEFPAYLvI/maxresdefault.jpg)](https://youtu.be/H3WEFPAYLvI)

## Info
If any bugs found just let me know

## How to configure?
### Define channels
Create a config.json from config.json.example. Currently only shelly1, shell1pm and shelly dimmer2 are supported and tested.

### Define songs
Creae a songs.json from songs.json.example.

## How to use?

### With docker

``docker-compose up``

Then just navigate to [localhost](http://127.0.0.1/) using the brwoser.

### HTTP Server
Copy the root folder to your HTTP Server and open it.

## Improvements
If anybody is interested in further developing to make a fully backend NodeJS script, i'll be happy to hear your ideas what to use as alternative to Web AudioContext.
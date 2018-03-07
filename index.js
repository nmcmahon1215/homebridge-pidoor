const request = require('request');
const url = require('url');
const http = require('http');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("garage-pi-plugin", "PiDoor", garageDoor);
};

function garageDoor(log, config) {
  this.log = log;
  var urlString = config.piUrl;
  var port = config.listen_port;
  if (!port) {
    port = 8080;
  }
  if (!urlString.endsWith("/")){
    urlString += "/";
  }
  this.piUrlString = urlString;
  this.port = port;
  this.values = {
    "Current Position": 0,
    "Target Position": 0
  };
}

garageDoor.prototype = {
  getServices: function () {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Genie")
      .setCharacteristic(Characteristic.Model, "1042")
      .setCharacteristic(Characteristic.SerialNumber, "Unknown");

    let doorService = new Service.GarageDoorOpener("Garage Door");
    doorService.getCharacteristic(Characteristic.TargetDoorState)
      .on('get', this.getTargetDoorState.bind(this))
      .on('set', this.setTargetDoorState.bind(this));
    
    doorService.getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', this.getObstructions.bind(this))
      .on('set', this.setObstructions.bind(this));
    
    doorService.getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', this.getCurrentDoorState.bind(this))
      .on('set', this.setCurrentDoorState.bind(this));

    this.informationService = informationService;
    this.doorService = doorService;
    this.startServer();
    return [informationService, doorService];
  },
  getCurrentDoorState: function(next) {
    this.sendRequest(next, "status?field=currentState", "currentState");
  },
  setCurrentDoorState: function(state, next) {
    this.sendRequest(next, "control?currentState=" + state);
  },
  getObstructions: function(next) {
    next(null, false);
  },
  setObstructions: function(obstruction, next) {
    next(null);
  },
  getTargetDoorState: function(next) {
    this.sendRequest(next, "status?field=targetState", "targetState");
  },
  setTargetDoorState: function (targetPos, next) {
    this.sendRequest(next, "control?targetState=" + targetPos);
  },
  sendRequest: function(callback, path, field) {
    var urlString = this.piUrlString + path;
    var requestUrl = url.parse(urlString);

    if (!field){
      this.log("Sending command: " + urlString);
    }

    request({
        url: requestUrl,
        method: "GET",
    }, 
    function (error, response, body) {
      if (error) {
        this.log(error.message);
        return callback(error);
      }
      if (body && body.length > 0){
        var newValue = JSON.parse(body)[field];
        this.log("Fetched Garage Door Status [" + field + "]: " + newValue);
        return callback(null, newValue);
      } else {
        return callback(null);
      }
    }.bind(this));
  },
  startServer: function() {
    this.log("Listening for changes on port " + this.port);
    var server = http.createServer(function (request, response) {
      var body = "";

      request.on('data', function (chunk) {
        body += chunk;
      });
     
     
      request.on('end', function () {
        var queryData = JSON.parse(body);
        this.tryUpdateValue(Characteristic.TargetDoorState, queryData.targetState);
        this.tryUpdateValue(Characteristic.CurrentDoorState, queryData.currentState);
        this.tryUpdateValue(Characteristic.ObstructionDetected, queryData.obstructionDetected);
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('ok');
      }.bind(this));
    }.bind(this)).listen(this.port);
  },
  tryUpdateValue: function(field, value) {
    if (value != null && value != undefined) {
      var characteristic = this.doorService.getCharacteristic(field);
      this.log("Received \"" + characteristic.displayName + "\" with value \"" + value + "\"");
      this.values[characteristic.displayName] = value;
      characteristic.updateValue(value);
    }
  }
};
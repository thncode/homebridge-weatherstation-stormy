var Service, Characteristic, HomebridgeAPI, FakeGatoHistoryService;
var inherits = require('util').inherits;
var os = require("os");
var hostname = os.hostname();
const fs = require('fs');

var intervalID;

const readFile = "/home/pi/WeatherStation/data.txt";

var maxWind;
var avgWind;
var battery;

var alertLevel;

var glog;
var ctime;

var lastActivation, lastReset, lastChange, timesOpened, timeOpen, timeClose;

module.exports = function (homebridge) {
	
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory("homebridge-weatherstation-stormy", "WeatherStationStormy", WeatherStationStormy);
};


function read() {
	var data = fs.readFileSync(readFile, "utf-8");
	var lastSync = Date.parse(data.substring(0, 19));
	maxWind = parseFloat(data.substring(34));
	avgWind = parseFloat(data.substring(40));
	battery = parseFloat(data.substring(57));
}


function WeatherStationStormy(log, config) {
    var that = this;
    this.log = glog = log;
    this.name = config.name;
    this.displayName = this.name;
    this.deviceId = config.deviceId;
    this.interval = Math.min(Math.max(config.interval, 1), 60);

    this.config = config;

    this.storedData = {};

	this.alertLevel = config['alertLevel'];

    this.setUpServices();
    
    read();

	intervalID = setInterval(function() {
		
		var stats = fs.statSync(readFile);
		
		var doit = false;
		if (ctime) {
			if (ctime.getTime() != stats.mtime.getTime()) {
				ctime = stats.mtime;
				doit = true;
			}
		}
		else {
			ctime = stats.mtime;
			doit = true;
		}
			
		if (doit) {
			read();
			glog("Stormy Data: ", maxWind, avgWind, battery);

			that.fakeGatoHistoryService.addEntry({
				time: new Date().getTime() / 1000,
				status: maxWind > alertLevel || avgWind > alertLevel ? 1 : 0
				});
		}
	}, 2000);
};


WeatherStationStormy.prototype.getFirmwareRevision = function (callback) {
    callback(null, '1.0.0');
};

WeatherStationStormy.prototype.getBatteryLevel = function (callback) {
	var perc = (battery - 0.8) * 100;
    callback(null,perc);
};

WeatherStationStormy.prototype.getStatusActive = function (callback) {
    callback(null, true);
};

WeatherStationStormy.prototype.getStatusLowBattery = function (callback) {
	if (battery >= 0.8)
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    else
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
};

WeatherStationStormy.prototype.getStatusMaxWind = function (callback) {	
        callback(null, maxWind > alertLevel || avgWind > alertLevel ? 
        			Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
};


WeatherStationStormy.prototype.setUpServices = function () {
    // info service
    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "THN Systems")
        .setCharacteristic(Characteristic.Model, "WeatherStationStormy")
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
    this.informationService.getCharacteristic(Characteristic.FirmwareRevision)
        .on('get', this.getFirmwareRevision.bind(this));
        
    this.batteryService = new Service.BatteryService(this.name);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));
    this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));

    this.maxWindAlertService = new Service.ContactSensor("stürmisch", "maxWind");
    this.maxWindAlertService.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', this.getStatusMaxWind.bind(this));
    this.maxWindAlertService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.maxWindAlertService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    this.fakeGatoHistoryService = new FakeGatoHistoryService("door", this, { storage: 'fs' });
    
    if (this.fakeGatoHistoryService.getExtraPersistedData() == undefined) {
    	this.lastActivation = 0;
    	this.lastReset = moment().unix() - moment('2001-01-01T00:00:00Z').unix();
    	this.lastChange = moment().unix();
    	this.timeOpened = 0;
    	this.timeOpen = 0;
    	this.timeClose = 0;
           
        this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, "lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);

        } else {
            this.lastActivation = this.loggingService.getExtraPersistedData()[0].lastActivation;
            this.lastReset = this.loggingService.getExtraPersistedData()[0].lastReset;
            this.lastChange = this.loggingService.getExtraPersistedData()[0].lastChange;
            this.timesOpened = this.loggingService.getExtraPersistedData()[0].timesOpened;
            this.timeOpen = this.loggingService.getExtraPersistedData()[0].timeOpen;
            this.timeClose = this.loggingService.getExtraPersistedData()[0].timeClose;
        }
        
    var CustomCharacteristic = {};
    
};


WeatherStationStormy.prototype.getServices = function () {
    var services = [this.informationService, this.batteryService, this.fakeGatoHistoryService, this.maxWindAlertService];

    return services;
};

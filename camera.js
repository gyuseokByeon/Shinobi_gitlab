//
// Shinobi
// Copyright (C) 2016 Moe Alam, moeiscool
//
//
// # Donate
//
// If you like what I am doing here and want me to continue please consider donating :)
// PayPal : paypal@m03.ca
//
var io = new (require('socket.io'))()
//process handlers
var s = require('./libs/process.js')(process,__dirname)
//load extender functions
require('./libs/extenders.js')(s)
//configuration loader
var config = require('./libs/config.js')(s)
//basic functions
require('./libs/basic.js')(s,config)
//language loader
var lang = require('./libs/language.js')(s,config)
//working directories : videos, streams, fileBin..
require('./libs/folders.js')(s,config,lang)
//code test module
require('./libs/codeTester.js')(s,config,lang)
//get version
require('./libs/version.js')(s,config,lang)
//video processing engine
require('./libs/ffmpeg.js')(s,config,lang,function(ffmpeg){
    //ffmpeg coProcessor
    require('./libs/ffmpegCoProcessor.js')(s,config,lang,ffmpeg)
    //database connection : mysql, sqlite3..
    require('./libs/sql.js')(s,config)
    //authenticator functions : API, dashboard login..
    require('./libs/auth.js')(s,config,lang)
    //express web server with ejs
    var app = require('./libs/webServer.js')(s,config,lang,io)
    //web server routes : page handling..
    require('./libs/webServerPaths.js')(s,config,lang,app,io)
    //web server routes for streams : streams..
    require('./libs/webServerStreamPaths.js')(s,config,lang,app,io)
    //web server admin routes : create sub accounts, share monitors, share videos
    require('./libs/webServerAdminPaths.js')(s,config,lang,app,io)
    //web server superuser routes : create admin accounts and manage system functions
    require('./libs/webServerSuperPaths.js')(s,config,lang,app,io)
    //websocket connection handlers : login and streams..
    require('./libs/socketio.js')(s,config,lang,io)
    //user and group functions
    require('./libs/user.js')(s,config,lang)
    //timelapse functions
    require('./libs/timelapse.js')(s,config,lang,app,io)
    //fileBin functions
    require('./libs/fileBin.js')(s,config,lang,app,io)
    //monitor/camera handlers
    require('./libs/monitor.js')(s,config,lang)
    //event functions : motion, object matrix handler
    require('./libs/events.js')(s,config,lang)
    //recording functions
    require('./libs/videos.js')(s,config,lang)
    //branding functions and config defaults
    require('./libs/videoDropInServer.js')(s,config,lang,app,io)
    //plugins : websocket connected services..
    require('./libs/plugins.js')(s,config,lang,io)
    //health : cpu and ram trackers..
    require('./libs/health.js')(s,config,lang,io)
    //cluster module
    require('./libs/childNode.js')(s,config,lang,app,io)
    //cloud uploaders : amazon s3, webdav, backblaze b2..
    require('./libs/uploaders.js')(s,config,lang,app,io)
    //notifiers : discord..
    require('./libs/notification.js')(s,config,lang)
    //notifiers : discord..
    require('./libs/rtmpserver.js')(s,config,lang)
    //dropInEvents server (file manipulation to create event trigger)
    require('./libs/dropInEvents.js')(s,config,lang,app,io)
    //form fields to drive the internals
    require('./libs/definitions.js')(s,config,lang,app,io)
    //branding functions and config defaults
    require('./libs/branding.js')(s,config,lang,app,io)
    //custom module loader
    require('./libs/customAutoLoad.js')(s,config,lang,app,io)
    //scheduling engine
    require('./libs/shinobiHub.js')(s,config,lang,app,io)
    //onvif, ptz engine
    require('./libs/control.js')(s,config,lang,app,io)
    //ffprobe, onvif engine
    require('./libs/scanners.js')(s,config,lang,app,io)
    //scheduling engine
    require('./libs/scheduler.js')(s,config,lang,app,io)
    //on-start actions, daemon(s) starter
    require('./libs/startup.js')(s,config,lang)
})

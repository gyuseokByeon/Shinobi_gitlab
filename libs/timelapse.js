var fs = require('fs')
var moment = require('moment')
var express = require('express')
module.exports = function(s,config,lang,app,io){
    s.getTimelapseFrameDirectory = function(e){
        if(e.mid&&!e.id){e.id=e.mid}
        s.checkDetails(e)
        if(e.details&&e.details.dir&&e.details.dir!==''){
            return s.checkCorrectPathEnding(e.details.dir)+e.ke+'/'+e.id+'_timelapse/'
        }else{
            return s.dir.videos+e.ke+'/'+e.id+'_timelapse/';
        }
    }
    s.createTimelapseFrameAndInsert = function(e,location,filename){
        //e = monitor object
        //location = file location
        var filePath = location + filename
        var fileStats = fs.statSync(filePath)
        var details = {}
        if(e.details && e.details.dir && e.details.dir !== ''){
            details.dir = e.details.dir
        }
        var timeNow = new Date()
        var queryInfo = {
            ke: e.ke,
            mid: e.id,
            details: s.s(details),
            filename: filename,
            size: fileStats.size,
            time: timeNow
        }
        if(config.childNodes.enabled === true && config.childNodes.mode === 'child' && config.childNodes.host){
            var currentDate = s.formattedTime(queryInfo.time,'YYYY-MM-DD')
            s.cx({
                f: 'open_timelapse_file_transfer',
                ke: e.ke,
                mid: e.id,
                d: s.group[e.ke].rawMonitorConfigurations[e.id],
                filename: filename,
                currentDate: currentDate,
                queryInfo: queryInfo
            })
            var formattedTime = s.timeObject(timeNow).format()
            fs.createReadStream(filePath,{ highWaterMark: 500 })
            .on('data',function(data){
                s.cx({
                    f: 'created_timelapse_file_chunk',
                    ke: e.ke,
                    mid: e.id,
                    time: formattedTime,
                    filesize: e.filesize,
                    chunk: data,
                    d: s.group[e.ke].rawMonitorConfigurations[e.id],
                    filename: filename,
                    currentDate: currentDate,
                    queryInfo: queryInfo
                })
            })
            .on('close',function(){
                s.cx({
                    f: 'created_timelapse_file',
                    ke: e.ke,
                    mid: e.id,
                    time: formattedTime,
                    filesize: e.filesize,
                    d: s.group[e.ke].rawMonitorConfigurations[e.id],
                    filename: filename,
                    currentDate: currentDate,
                    queryInfo: queryInfo
                })
            })
        }else{
            s.insertTimelapseFrameDatabaseRow(e,queryInfo,filePath)
        }
    }
    s.insertTimelapseFrameDatabaseRow = function(e,queryInfo,filePath){
        s.knexQuery({
            action: "insert",
            table: "Timelapse Frames",
            insert: queryInfo
        })
        s.setDiskUsedForGroup(e,queryInfo.size / 1048576,'timelapeFrames')
        s.purgeDiskForGroup(e)
        s.onInsertTimelapseFrameExtensions.forEach(function(extender){
            extender(e,queryInfo,filePath)
        })
    }
    s.onDeleteTimelapseFrameFromCloudExtensions = {}
    s.onDeleteTimelapseFrameFromCloudExtensionsRunner = function(e,storageType,video){
        // e = user
        if(!storageType){
            var videoDetails = JSON.parse(r.details)
            videoDetails.type = videoDetails.type || 's3'
        }
        if(s.onDeleteTimelapseFrameFromCloudExtensions[storageType]){
            s.onDeleteTimelapseFrameFromCloudExtensions[storageType](e,video,function(){
                s.tx({
                    f: 'timelapse_frame_delete_cloud',
                    mid: e.mid,
                    ke: e.ke,
                    time: e.time,
                    end: e.end
                },'GRP_'+e.ke);
            })
        }
    }
    s.deleteTimelapseFrameFromCloud = function(e){
        // e = video object
        s.checkDetails(e)
        var frameSelector = [
            ['ke','=',e.ke],
            ['mid','=',e.id],
            ['time','=',new Date(e.time)],
        ]
        s.knexQuery({
            action: "select",
            columns: "*",
            table: "Cloud Timelapse Frames",
            where: frameSelector,
            limit: 1
        },function(err,r){
            if(r && r[0]){
                r = r[0]
                s.knexQuery({
                    action: "delete",
                    table: "Cloud Timelapse Frames",
                    where: frameSelector,
                    limit: 1
                },function(){
                    s.onDeleteTimelapseFrameFromCloudExtensionsRunner(e,r)
                })
            }else{
//                    console.log('Delete Failed',e)
//                    console.error(err)
            }
        })
    }
    // Web Paths
    // // // // //
    /**
    * API : Get Timelapse images
     */
    app.get([
        config.webPaths.apiPrefix+':auth/timelapse/:ke',
        config.webPaths.apiPrefix+':auth/timelapse/:ke/:id',
        config.webPaths.apiPrefix+':auth/timelapse/:ke/:id/:date',
    ], function (req,res){
        res.setHeader('Content-Type', 'application/json');
        s.auth(req.params,function(user){
            var hasRestrictions = user.details.sub && user.details.allmonitors !== '1'
            if(
                user.permissions.watch_videos==="0" ||
                hasRestrictions &&
                (
                    !user.details.video_view ||
                    user.details.video_view.indexOf(req.params.id) === -1
                )
            ){
                s.closeJsonResponse(res,[])
                return
            }
            const monitorRestrictions = s.getMonitorRestrictions(user.details,req.params.id)
            s.getDatabaseRows({
                monitorRestrictions: monitorRestrictions,
                table: 'Timelapse Frames',
                groupKey: req.params.ke,
                date: req.query.date,
                startDate: req.query.start,
                endDate: req.query.end,
                startOperator: req.query.startOperator,
                endOperator: req.query.endOperator,
                limit: req.query.limit,
                archived: req.query.archived,
                rowType: 'frames',
                endIsStartTo: true
            },(response) => {
                var isMp4Call = !!(req.query.mp4 || (req.params.date && typeof req.params.date === 'string' && req.params.date.indexOf('.') > -1))
                if(isMp4Call && response.frames[0]){
                    s.createVideoFromTimelapse(response.frames,req.query.fps,function(response){
                        if(response.fileExists){
                            if(req.query.download){
                                res.setHeader('Content-Type', 'video/mp4')
                                s.streamMp4FileOverHttp(response.fileLocation,req,res)
                            }else{
                                s.closeJsonResponse(res,{
                                    ok : response.ok,
                                    fileExists : response.fileExists,
                                    msg : response.msg,
                                })
                            }
                        }else{
                            s.closeJsonResponse(res,{
                                ok : response.ok,
                                fileExists : response.fileExists,
                                msg : response.msg,
                            })
                        }
                    })
                }else{
                    s.closeJsonResponse(res,response.frames)
                }
            })
        },res,req);
    });
    /**
    * API : Get Timelapse images
     */
    app.get([
        config.webPaths.apiPrefix+':auth/timelapse/:ke/:id/:date/:filename',
    ], function (req,res){
        res.setHeader('Content-Type', 'application/json');
        s.auth(req.params,function(user){
            var hasRestrictions = user.details.sub && user.details.allmonitors !== '1'
            if(
                user.permissions.watch_videos==="0" ||
                hasRestrictions && (!user.details.video_view || user.details.video_view.indexOf(req.params.id)===-1)
            ){
                res.end(s.prettyPrint([]))
                return
            }
            const monitorRestrictions = s.getMonitorRestrictions(user.details,req.params.id)
            getFrameRows({
                monitorRestrictions: monitorRestrictions,
                groupKey: req.params.ke,
                archived: req.query.archived,
                filename: req.params.filename,
            },(response) => {
                var frame = response.frames[0]
                if(frame){
                    var fileLocation
                    if(frame.details.dir){
                        fileLocation = `${s.checkCorrectPathEnding(frame.details.dir)}`
                    }else{
                        fileLocation = `${s.dir.videos}`
                    }
                    var selectedDate = req.params.date
                    if(selectedDate.indexOf('-') === -1){
                        selectedDate = req.params.filename.split('T')[0]
                    }
                    fileLocation = `${fileLocation}${frame.ke}/${frame.mid}_timelapse/${selectedDate}/${req.params.filename}`
                    fs.stat(fileLocation,function(err,stats){
                        if(!err){
                            res.contentType('image/jpeg')
                            res.on('finish',function(){res.end()})
                            fs.createReadStream(fileLocation).pipe(res)
                        }else{
                            s.closeJsonResponse(res,{ok: false, msg: lang[`Nothing exists`]})
                        }
                    })
                }else{
                    s.closeJsonResponse(res,{ok: false, msg: lang[`Nothing exists`]})
                }
            })
        },res,req);
    });
    /**
    * Page : Get Timelapse Page (Not Modal)
     */
    app.get(config.webPaths.apiPrefix+':auth/timelapsePage/:ke', function (req,res){
        req.params.protocol=req.protocol;
        s.auth(req.params,function(user){
            // if(user.permissions.watch_stream==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitors.indexOf(req.params.id)===-1){
            //     res.end(user.lang['Not Permitted'])
            //     return
            // }
            req.params.uid = user.uid
            s.renderPage(req,res,config.renderPaths.timelapse,{
                $user: user,
                data: req.params,
                config: s.getConfigWithBranding(req.hostname),
                lang: user.lang,
                originalURL: s.getOriginalUrl(req)
            })
        },res,req);
    });
    var buildTimelapseVideos = function(){
        var dateNow = new Date()
        var hoursNow = dateNow.getHours()
        if(hoursNow === 1){
            var dateNowMoment = moment(dateNow).utc().format('YYYY-MM-DDTHH:mm:ss')
            var dateMinusOneDay = moment(dateNow).utc().subtract(1, 'days').format('YYYY-MM-DDTHH:mm:ss')
            s.knexQuery({
                action: "select",
                columns: "*",
                table: "Timelapse Frames",
                where: [
                    ['time','=>',dateMinusOneDay],
                    ['time','=<',dateNowMoment],
                ]
            },function(err,frames) {
                console.log(frames.length)
                var groups = {}
                frames.forEach(function(frame){
                    if(groups[frame.ke])groups[frame.ke] = {}
                    if(groups[frame.ke][frame.mid])groups[frame.ke][frame.mid] = []
                    groups[frame.ke][frame.mid].push(frame)
                })
                Object.keys(groups).forEach(function(groupKey){
                    Object.keys(groups[groupKey]).forEach(function(monitorId){
                        var frameSet = groups[groupKey][monitorId]
                        s.createVideoFromTimelapse(frameSet,30,function(response){
                            if(response.ok){

                            }
                            console.log(response.fileLocation)
                        })
                    })
                })
            })
        }
    }
    // Auto Build Timelapse Videos
    if(config.autoBuildTimelapseVideosDaily === true){
        setInterval(buildTimelapseVideos,1000 * 60 * 60 * 0.75)//every 45 minutes
        buildTimelapseVideos()
    }
}

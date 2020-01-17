"use strict"

const fs = require('fs');
const request = require("superagent")
const cheerio = require("cheerio");
const levenshtein = require("./levenshtein.js");

const CACHE_FILE = "parkhaus-cache.json"
const HOSTNAME = "http://www.parkhaus.hk";
const TIMEOUT = 30 * 1000;
const getUrl = path => HOSTNAME + path;
const loadHtml = htmlText => cheerio.load(htmlText, { decodeEntities: false });
const loadJson = jsonText => JSON.parse(jsonText);
const saveJson = json => JSON.stringify(json);

// copied from stackoverflow
// https://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula
function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lon2-lon1); 
    var a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2)
        ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d;
}

// copied from stackoverflow
// https://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula
function deg2rad(deg) {
    return deg * (Math.PI/180)
}

function Parkhaus(){
    var CACHE = null;

    const reset = () => new Promise((resolve, reject) => {
        CACHE = null;
        if (fs.existsSync(CACHE_FILE))
            fs.unlinkSync(CACHE_FILE);
        resolve();
    });

    const loadFromCache = () => {
        if (fs.existsSync(CACHE_FILE))
            CACHE = loadJson(fs.readFileSync(CACHE_FILE));
        else
            CACHE = [];
    };

    const saveToCache = () => {
        if (fs.existsSync(CACHE_FILE))
            fs.unlinkSync(CACHE_FILE);
        fs.writeFileSync(CACHE_FILE, saveJson(CACHE));
    };

    const getCarParksInRange = (latitude, longitude, distanceInKm, maxCount, cacheTimeOnly) => new Promise((resolve, reject) => {
        latitude = latitude ? latitude : 22.28552;
        longitude = longitude ? longitude : 114.15769;
        distanceInKm = distanceInKm ? distanceInKm : 100;
        maxCount = maxCount ? maxCount : 30;
        cacheTimeOnly = cacheTimeOnly || false;

        getAllCarParkLocations()
            .then(carparks => {
                var list = [];

                carparks.forEach(carpark => {
                    try {
                        const dist = getDistanceFromLatLonInKm(
                            latitude, longitude,
                            carpark.location.latitude, carpark.location.longitude);

                        if (dist <= distanceInKm){
                            const obj = {
                                area: carpark.area,
                                district: carpark.district,
                                name: carpark.name,
                                cacheTime: carpark.cacheTime
                            };

                            if (!cacheTimeOnly){
                                obj["type"] =  carpark.type;
                                obj["location"] = carpark.location;
                                obj["urlInGoogleMap"] = carpark.urlInGoogleMap || "";
                                obj["distance"] = dist;
                            }

                            list.push(obj);
                        }
                    }
                    catch (err)
                    {
                        console.log(err);
                    }
                });

                list.sort((c1, c2) => c1.distance - c2.distance);

                if (maxCount < list.length){
                    list = list.slice(0, maxCount);
                }

                resolve(list);
            })
            .catch(err => {
                reject("failed to get carpark locations");
            });
    });

    const getAllCarParkLocations = () => new Promise((resolve, reject) => {
        if (CACHE == null){
            loadFromCache();
        }

        if (CACHE != null){
            resolve(CACHE);
        }
        else {
            reject("cache is not ready");
        }
    });

    const getCarParkDetailFromUrl = urlOfCarParkPage => new Promise((resolve, reject) => {
        request.get(urlOfCarParkPage)
            .timeout(TIMEOUT)
            .then(res => {
                const $ = loadHtml(res.text);

                const obj = {
                    url: urlOfCarParkPage,
                    name: $(".breadcrumb_last").text().trim(),
                    updateTime: $(".post-meta").text().replace("最後更新時間:", "").trim(),
                    content: {},
                };

                $("script").remove();   // remove all scripts

                const containerDiv = $(".responsive-tabs");
                const entryContentDiv = $(".entry-content");

                if (containerDiv && containerDiv.length > 0){
                    // new format
                    const headers = containerDiv.find("h2.tabtitle");
                    const contents = containerDiv.find(".tabcontent");

                    headers.each((i, e) => {
                        const title = $(e).text().trim();
                        obj.content[(i + 1) + ". " + title] = "<div>" + $(contents[i]).html().trim() + "</div>";
                    });
                }
                else if (entryContentDiv && entryContentDiv.length > 0){
                    // orignal format
                    const tables = entryContentDiv.find("table");
                    tables.each((i, e) => {
                        obj.content[i] = "<table>" + $(e).html().trim() + "</table>";
                    });
                }
                else
                    return reject("unknown format of car park page " + urlOfCarParkPage);

                // remove all script tags
                for (var key in obj.content){
                    var html = obj.content[key];
                    var dom = $(html);
                    dom.find("script").remove();
                    obj.content[key] = dom.html().trim();
                }

                resolve(obj);
            })
            .catch(err => {
                reject("failed in " + urlOfCarParkPage);
            });
    });

    const getCarParkDetail = carParkName => new Promise((resolve, reject) => {
        const detail = lookupCarparkDetail(carParkName);
        if (!detail){
            return reject(carParkName + " is not found");
        }

        resolve([ detail ]);
    });

    const lookupCarparkDetail = name => {
        if (CACHE == null){
            loadFromCache();
        }

        CACHE = CACHE || [];

        for (var i = 0; i < CACHE.length; i++){
            const cache = CACHE[i];
            if (cache["name"] == name){
                return cache;
            }
        }

        return null;
    };

    const setCarParkDetail = detail => new Promise((resolve, reject) => {
        const name = detail["name"];
        if (!name){
            return reject("name is missing");
        }

        const url = detail["url"];
        if (!url){
            return reject("url is missing");
        }

        const location = detail["location"]
        if (!location || !location["latitude"] || !location["longitude"]){
            return reject("location is missing");
        }

        const contents = detail["contents"] || [];
        const saveContent = {};
        contents.forEach(content => {
            saveContent[content["title"]] = content["html"];
        });

        const lastUpdate = detail["lastUpdate"] || "N/A";

        var saveDetail = lookupCarparkDetail(name)
        if (!saveDetail){
            saveDetail = {
                "name": name
            }
            CACHE.push(saveDetail)
        }

        saveDetail["type"] = "停車場";  // for compatibility
        saveDetail["area"] = detail["area"];
        saveDetail["district"] = detail["district"];
        saveDetail["url"] = url;
        saveDetail["location"] = location;
        saveDetail["content"] = saveContent;
        saveDetail["updateTime"] = lastUpdate;
        saveDetail["cacheTime"] = new Date().getTime();

        saveToCache()

        resolve(saveDetail);
    });

    const deleteCarParkDetail = carParkName => new Promise((resolve, reject) => {
        if (CACHE){
            for (var i = 0; i < CACHE.length; i++){
                const cache = CACHE[i];
                if (cache["name"] == carParkName){
                    CACHE.splice(i, 1);
                    saveToCache();
                    break;
                }
            }
        }
        resolve(true);
    });

    return {
        reset: reset,
        getCarParksInRange: getCarParksInRange,
        getCarParkDetail: getCarParkDetail,
        setCarParkDetail: setCarParkDetail,
        deleteCarParkDetail: deleteCarParkDetail
    };
}

module.exports = Parkhaus;

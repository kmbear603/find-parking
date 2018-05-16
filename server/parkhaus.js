"use strict"

const fs = require('fs');
const request = require("superagent")
const cheerio = require("cheerio");

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
            CACHE = null;
    };

    const saveToCache = () => {
        if (fs.existsSync(CACHE_FILE))
            fs.unlinkSync(CACHE_FILE);
        fs.writeFileSync(CACHE_FILE, saveJson(CACHE));
    };

    const getCarParksInRange = (latitude, longitude, distanceInKm) => new Promise((resolve, reject) => {
        latitude = latitude ? latitude : 22.28552;
        longitude = longitude ? longitude : 114.15769;
        distanceInKm = distanceInKm ? distanceInKm : 100;

        getAllCarParkLocations()
            .then(carparks => {
                const list = [];

                carparks.forEach(carpark => {
                    try {
                        const dist = getDistanceFromLatLonInKm(
                            latitude, longitude,
                            carpark.location.latitude, carpark.location.longitude);

                        if (dist <= distanceInKm){
                            list.push({
                                type: carpark.type,
                                name: carpark.name,
                                location: carpark.location,
                                urlInGoogleMap: carpark.urlInGoogleMap,
                                distance: dist
                            });
                        }
                    }
                    catch (err)
                    {
                        console.log(err);
                    }
                });

                list.sort((c1, c2) => c1.distance - c2.distance);

                resolve(list);
            })
            .catch(err => {
                reject("failed to get carpark locations");
            });
    });

    const getAllCarParkLocations = () => new Promise((resolve, reject) => {
        if (CACHE == null)
            loadFromCache();

        if (CACHE != null)
            return resolve(CACHE);

        const buffer = [];

        const fetchOneLayer = layer => new Promise((fetchResolve, _) => {
            //console.log("fetching layer " + layer);

            const url = getUrl("/maps/geojson/layer/" + layer);
            request.get(url)
                .timeout(TIMEOUT)
                .then(res => {
                    const json = loadJson(res.text);
                    const features = json["features"];

                    const fetchBuffer = [];

                    if (features && features.length > 0){
                        for (var i = 0; i < features.length; i++){
                            const feature = features[i];
                            const properties = feature["properties"];
    
                            var type;
                            if (properties["icon"] === "parking.png")
                                type = "停車場";
                            else if (properties["icon"] === "mall.png")
                                type = "商場";
                            else if (properties["icon"] === "hospital-2.png")
                                type = "酒店";
                            else if (properties["icon"] === "flowers.png")
                                type = "公園";
                            else
                                continue;   // not a car park

                            const name = properties["markername"];

                            const carpark = {
                                type: type,
                                name: name.replace("停車場", ""),
                                location: {
                                    latitude: feature["geometry"]["coordinates"][1],
                                    longitude: feature["geometry"]["coordinates"][0]
                                },
                                urlInGoogleMap: properties["dlink"],
                                layer: layer
                            };
    
                            fetchBuffer.push(carpark);
                        }
                    }

                    //console.log("found " + fetchBuffer.length + " car parks for layer " + layer);
                    fetchResolve(fetchBuffer);
                })
                .catch(err => {
                    reject("failed to fetch layer " + layer);
                })
        });

        const batchFetchLayers = (startLayer, endLayer, batchCount) => {
            const promises = [];
            for (var layer = startLayer; layer < startLayer + batchCount; layer++)
                promises.push(fetchOneLayer(layer));
            
            Promise.all(promises)
                .then(rawBuffers => {
                    for (var i = 0; i < rawBuffers.length; i++){
                        for (var j = 0; j < rawBuffers[i].length; j++){
                            if (buffer.findIndex(b => b.name == rawBuffers[i][j].name) == -1)
                                buffer.push(rawBuffers[i][j]);
                        }
                    }
                    
                    if (startLayer + batchCount >= endLayer){
                        CACHE = buffer;
                        saveToCache();
                        return resolve(buffer);
                    }
                    else
                        batchFetchLayers(startLayer + batchCount, endLayer, batchCount);
                })
                .catch(err => {
                    // should not enter here
                    reject("failed");
                })
        }

        batchFetchLayers(1, 100, 10);
    });

    const getUrlOfCarParkPage = carParkName => new Promise((resolve, reject) => {
        const url = getUrl("/wp-admin/admin-ajax.php");
        request.post(url)
            .timeout(TIMEOUT)
            .send({
                action: "ajaxsearchlite_search",
                aslp: carParkName,
                asid: 1,
                options: "qtranslate_lang=0&set_intitle=None&set_incontent=None&set_inexcerpt=None&set_inposts=None&set_inpages=None)"
            })
            .type("form")
            .then(res => {
                const html = res.text.replace("!!ASLSTART!!", "").replace("!!ASLEND!!", "");
                const $ = loadHtml(html);
                if ($(".asl_nores").length > 0)
                    return reject("car park " + carParkName + " is not found");

                var pageUrl = [];
                $("a").each((i, e) => {
                    pageUrl.push($(e).attr("href"));
                });

                if (pageUrl.length == 0)
                    return reject("cant find detail url for " + carParkName);

                resolve(pageUrl);
            })
            .catch(err => {
                reject("failed in /wp-admin/admin-ajax.php");
            })
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

                resolve(obj);
            })
            .catch(err => {
                reject("failed in " + urlOfCarParkPage);
            });
    });

    const getCarParkDetail = carParkName => new Promise((resolve, reject) => {
        getUrlOfCarParkPage(carParkName)
            .then(urls => {
                const allDetail = [];

                var getDetail = i => {
                    if (i >= urls.length)
                        return resolve(allDetail);

                    getCarParkDetailFromUrl(urls[i])
                        .then(detail => {
                            allDetail.push(detail);
                            //getDetail(i + 1);
                            resolve(allDetail); // only the first one
                        })
                        .catch(err => {
                            reject("failed to get detail of " + carParkName);
                        });
                };

                getDetail(0);
            })
            .catch(err => {
                reject("failed to get url of car park " + carParkName);
            })
    });

    return {
        reset: reset,
        getCarParksInRange: getCarParksInRange,
        getCarParkDetail: getCarParkDetail
    };
}

module.exports = Parkhaus;

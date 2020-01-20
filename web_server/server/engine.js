const ParkHaus = require("./parkhaus.js")
const CarparkDB = require("./carparkDB.js");

function createCarparkDB(){
    var carparkDB = new CarparkDB();
    var serviceAccountKeyJson = null;
    if (process.env.SERVICE_ACCOUNT_KEY){
        // the content of ServiceAccountKey.json
        // it is set as a config var on heroku
        serviceAccountKeyJson = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
    }
    else {
        // read from file
        var fs = require("fs");
        serviceAccountKeyJson = JSON.parse(fs.readFileSync("./ServiceAccountKey.json", "utf8"));
    }
    carparkDB.init(serviceAccountKeyJson);
    return carparkDB;
}

const carparkDB = createCarparkDB();
const parkhaus = new ParkHaus(carparkDB);

function getCarParksInRange(latitude, longitude, distance, count, cacheTimeOnly){
    return parkhaus.getCarParksInRange(latitude, longitude, distance, count, cacheTimeOnly);
}

function getCarParkDetail(carParkName){
    return parkhaus.getCarParkDetail(carParkName);
}

function setCarParkDetail(data){
    return parkhaus.setCarParkDetail(data);
}

function deleteCarParkDetail(carParkName){
    return parkhaus.deleteCarParkDetail(carParkName);
}

function reset(){
    return parkhaus.reset();
}

function test(){
    return new Promise((resolve, reject) => {
        parkhaus.getCarParksInRange(null, null, 0.5)
            .then(carparks => {
                var index = 0;

                const work = i => {
                    if (i >= carparks.length)
                        return resolve(carparks);

                    parkhaus.getCarParkDetail(carparks[i].name)
                        .then(detail => {
                            carparks[i].detail = detail;
                            work(i + 1);
                        })
                        .catch(err => {
                            reject();
                        });
                };

                work(0);
            })
            .catch(err => {
                reject();
            });
    });
}

module.exports = {
    test: test,
    reset: reset,
    getCarParkDetail: getCarParkDetail,
    setCarParkDetail: setCarParkDetail,
    deleteCarParkDetail: deleteCarParkDetail,
    getCarParksInRange: getCarParksInRange
}

const ParkHaus = require("./parkhaus.js")

const parkhaus = new ParkHaus();

function getCarParksInRange(latitude, longitude, distance){
    return parkhaus.getCarParksInRange(latitude, longitude, distance);
}

function getCarParkDetail(carParkName){
    return parkhaus.getCarParkDetail(carParkName);
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
    getCarParksInRange: getCarParksInRange
}

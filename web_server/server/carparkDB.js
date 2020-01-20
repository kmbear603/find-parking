const admin = require('firebase-admin');

let serviceAccount = require('../ServiceAccountKey.json');

function CarparkDB(){
    var DB = null;
    const COLLECTION = "carparks";

    const init = () => {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        DB = admin.firestore();
    };

    const getAll = () => new Promise((resolve, reject) => {
        DB.collection(COLLECTION)
            .get()
            .then(snapshot => {
                const ret = [];

                snapshot.forEach(doc => {
                    ret.push(doc.data());
                });

                resolve(ret);
            })
            .catch(err => {
                reject(err);
            });
    });

    const get = name => new Promise((resolve, reject) => {
        try {
            DB.collection(COLLECTION).doc(name)
                .get()
                .then(data => {
                    resolve(data.data());
                })
                .catch(err => {
                    reject(err);
                });
        }
        catch (err){
            reject(err);
        }
    });

    const update = detail => new Promise((resolve, reject) => {
        try {
            const name = detail["name"];
            if (!name){
                throw "name is not defined in the detail";
            }

            // set the cache time
            detail["cacheTime"] = new Date().getTime();

            const docRef = DB.collection(COLLECTION).doc(name);
            docRef.set(detail)
                .then(() => {
                    resolve(detail);
                })
                .catch(err => reject(err));
        }
        catch (err){
            reject(err);
        }
    });

    const remove = name => new Promise((resolve, reject) => {
        try {
            DB.collection(COLLECTION).doc(name)
                .delete()
                .then(() => resolve())
                .catch(err => reject(err));
        }
        catch (err){
            reject(err);
        }
    });
    
    return {
        init: init,
        getAll: getAll,
        get: get,
        update: update,
        remove: remove
    };
}

module.exports = CarparkDB;


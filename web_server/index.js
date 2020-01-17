const fs = require("fs")
const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const Engine = require("./server/engine.js")

app.use(bodyParser.json());

app.get("/test", (req, res) => {
    Engine.test()
        .then(data => {
            res.json(data);
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.get('/api/carparks', (req, res) => {
    const latitude = req.query.lat ? parseFloat(req.query.lat) : null;
    const longitude = req.query.lon ? parseFloat(req.query.lon) : null;
    const distance = req.query.dist ? parseFloat(req.query.dist) : null;
    const maxCount = req.query.count ? parseFloat(req.query.count) : null;
    const cacheTimeOnly = req.query.cacheTimeOnly || false;
    Engine.getCarParksInRange(latitude, longitude, distance, maxCount, cacheTimeOnly)
        .then(data => {
            res.json(data)
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.delete("/api/carpark/:name", (req, res) => {
    Engine.deleteCarParkDetail(req.params.name)
        .then(data => {
            res.status(200).send("OK");
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.get("/api/carpark/:name", (req, res) => {
    Engine.getCarParkDetail(req.params.name)
        .then(data => {
            res.json(data);
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.post("/api/carpark/", (req, res) => {
    Engine.setCarParkDetail(req.body)
        .then(data => {
            res.json(data);
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.get("/api/reset", (req, res) => {
    Engine.reset()
        .then(()=>{
            res.send("done!");
        })
        .catch(err => {
            res.status(500).send(err);
        });
});

app.get("/", (req, res) => {
    res.send(fs.readFileSync("static/index.html", "utf-8"));
});

app.get('*', (req, res) => res.status(404).send('Who are you?'))

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on port ' + PORT + '!'));

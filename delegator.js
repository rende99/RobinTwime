var server = require('./server');
var seller = require('./seller');
var http = require('http');
const fs = require('fs')
var express = require('express');
const bodyParser = require('body-parser');


var app = express();
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json());
var server_http = http.createServer(app);
const port = process.env.PORT || 5000;
server_http.listen(port, () => console.log(`Listening on port ${port}`));

setInterval(function(){ 
    var nextDate = new Date();
    console.log(`Starting run at ${nextDate.getHours()}:${nextDate.getMinutes()}`)
    // This should only run on the 31st minute of each hour.
    if(nextDate.getMinutes() != 31){return;}
    //check time of day
    var minSoFarToday = nextDate.getHours() * 60 + nextDate.getMinutes();
    var dayOfWeek = nextDate.getDay()
    if(minSoFarToday >= 570 && minSoFarToday < 1080 && dayOfWeek >= 1 && dayOfWeek <= 5){
        // Robinhood is OPEN for trading (9:30AM - 6PM, M-F)
        console.log(`Performing BUY Runthrough at ${nextDate.getHours()}:${nextDate.getMinutes()}`);
        server.performRunthrough();

    }else if(minSoFarToday >= 540 && minSoFarToday < 570 && dayOfWeek >= 1 && dayOfWeek <= 5){
        // Robinhood is in PRE-MARKET, sell what we need to!
        console.log(`Performing SELL Runthrough at ${nextDate.getHours()}:${nextDate.getMinutes()}`);
        seller.performRunthrough();
    }else{
        //Market is CLOSED.

    }
}, 1000 * 60);





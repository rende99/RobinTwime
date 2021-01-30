require('dotenv').config()
const axios = require('axios');
var express = require('express');
var Sentiment = require('sentiment');
var sentiment = new Sentiment();
const csv = require('csv-parser');
const fs = require('fs')
const tickerArray = [];
var tagsToInvest = [];
var transactionsCompleted;
var budgetLeft = 0.0;

const bodyParser = require('body-parser');
const { text } = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json());

async function performRunthrough(){

    loadPositions();

    var credentials = {
        token: process.env.RH_TOKEN
    };
    var Robinhood = require('robinhood')(credentials, async function(){
        for (var pos of transactionsCompleted){
            await doRHStuff(Robinhood, pos);
        }
    });

}

async function doRHStuff(Robinhood, pos){
    console.log(transactionsCompleted)
    console.log(`currently working on: ${pos.ticker}`)
    
    Robinhood.instruments(pos.ticker, async function(err, response, instBody){
        if(err){
            console.error(err);
        }else{
            console.log(instBody)
            Robinhood.quote_data(pos.ticker, async function(err, response, quoteBody){
                if(err){
                    console.error(err);
                }else{
                    var bPrice = quoteBody.results[0].ask_price;

                    var options = {
                        type: 'limit',
                        quantity: pos.quantity,
                        bid_price: bPrice,
                        instrument: {
                            url: instBody.results[0].url,
                            symbol: pos.ticker
                        }
                    }
                    console.log(`${pos.quantity} ${pos.ticker} stock sell order placed with limit $${bPrice}`)
                    
                    Robinhood.place_sell_order(options, function(error, response, body){
                        if(error){
                            console.error(error);
                        }else{
                            //order complete!
                            console.log(`${pos.quantity} ${pos.ticker} stock sell order placed with limit $${bPrice}`)
                            // lastly, save the updated positions to a .json file!

                            var jsonString = JSON.stringify([]);
                            fs.writeFile("activeStocks.txt", jsonString, function(err) {
                                if (err) {
                                    console.log(err);
                                }
                            });
                        }
                    })                    
                    
                }
            })
        }
    })
}


async function loadPositions(){
    fs.readFile( __dirname + '/activeStocks.txt', function (err, data) {
        if (err) {
          throw err; 
        }
        //console.log(JSON.parse(data.toString()))
        transactionsCompleted = JSON.parse(data.toString())
    });
}

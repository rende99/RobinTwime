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
var metaData = [];
var budgetLeft = 0.0;

const bodyParser = require('body-parser');
const { text } = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json());

performRunthrough();

function performRunthrough(){
    var credentials = {
        token: process.env.RH_TOKEN
    };
    var Robinhood = require('robinhood')(credentials, function(){
     
        //Robinhood is connected and you may begin sending commands to the api.
        Robinhood.accounts(function(err, response, body){
            if(err){
                console.error(err);
            }else{
                //console.log("accounts");
                //console.log(body);
                budgetLeft = parseFloat(body.results[0].buying_power);
            }
        })
        
        axios.get('https://api.twitter.com/1.1/trends/place.json?id=23424977',{
            headers: {
              Authorization: `Bearer ${process.env.TWI_BEARER}`
            }
        }).then(res => {
            var trendArray = res.data[0].trends
            //console.log(trendArray)
            checkMatches(tickerArray, trendArray)
        });
     
    });

    loadTickers();
    loadPositions();
    loadMetaData();
}



function loadPositions(){
    fs.readFile( __dirname + '/activeStocks.txt', function (err, data) {
        if (err) {
          throw err; 
        }
        console.log(JSON.parse(data.toString()))
        transactionsCompleted = JSON.parse(data.toString())
    });
}



async function checkMatches(tickers, trends){
    console.log("starting to check matches...")
    var metaData = [];
    // check if any keywords appear in trends. If they do, add them to our "tagsToInvest" array
    for(const stock of tickers){
        // for each stock
        for(const trend of trends){
            var keywords = stock.Keywords.toLowerCase().split(";");
            var alreadyFoundMatch = false;
            for(const keyword of keywords){
                if(trend.name.toLowerCase().includes(keyword) && !alreadyFoundMatch){
                    tagsToInvest.push({
                        ticker: stock.Ticker,
                        query: trend.query,
                        tweet_volume: trend.tweet_volume,
                        score: 100,
                        sentiment: 0
                    })
                    //print trends we found as matches!
                    alreadyFoundMatch = true;
                    console.log(trend)
                    break;
                }
            }
            if(alreadyFoundMatch){break;}
        }
        //console.log(max_volume);
    }
    //console.log(tagsToInvest);
    var max_volume = Math.max(...tagsToInvest.map(t => t.tweet_volume))


    for(var t of tagsToInvest){
        // change score based on % of max volume of tweets
        //t.score = t.score * (t.tweet_volume / max_volume)

        // now we must perform sentiment analysis on a sample of top tweets
        // Gather a bunch of text from tweets
        var textToAnalyze = await gatherTweetText(t)
        var sentimentResult = sentiment.analyze(textToAnalyze)
        t.sentiment = sentimentResult.comparative

        t.score = t.score + 50 * (t.sentiment + t.sentiment < 0 ? -1 : 1)

        // now perform transaction
        Robinhood.instruments(t.ticker,function(err, response, instBody){
            if(err){
                console.error(err);
            }else{
                console.log(instBody)
                Robinhood.quote_data(t.ticker, function(err, response, quoteBody){
                    if(err){
                        console.error(err);
                    }else{
                        var bPrice = quoteBody.results[0].ask_price;

                        // METADATA STUFF
                        metaData.push({
                            ticker: t.ticker,
                            timestamp: Date.now(),
                            tweet_volume: t.tweet_volume,
                            sentiment: t.sentiment,
                            score: t.score,
                            ask_price: bPrice,
                            wantToBuy: t.score > 150 ? 'YES' : 'NO'
                        })
                        metaData = ConvertToCSV(metaData)
                        fs.writeFile("meta.csv", metaData, function(err) {
                            if (err) {
                                console.log(err);
                            }
                        });
                        
                        if(bPrice < budgetLeft && t.score > 150){
                            // If score is high enough and we have enough money, perform a buy order.
                            var options = {
                                type: 'limit',
                                quantity: 1,
                                bid_price: bPrice,
                                instrument: {
                                    url: instBody.results[0].url,
                                    symbol: t.ticker
                                }
                            }
                            
                            Robinhood.place_buy_order(options, function(error, response, body){
                                if(error){
                                    console.error(error);
                                }else{
                                    console.log(body);
                                    //order complete!
                                    console.log(`${1} ${t.ticker} stock buy order placed with limit $${bPrice}`)
                                    if(transactionsCompleted.some(el => el.ticker === t.ticker)){
                                        // already exists, update quantity
                                        transactionsCompleted[transactionsCompleted.findIndex(el => el.ticker === t.ticker)].quantity++;
                                    }else{
                                        // new stock bought! push a new object to the array
                                        transactionsCompleted.push({
                                            ticker: t.ticker,
                                            quantity: 1
                                        });
                                    }
                                    // lastly, save the updated positions to a .json file!

                                    var jsonString = JSON.stringify(transactionsCompleted);
                                    fs.writeFile("activeStocks.txt", jsonString, function(err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                    });
                                }
                            })
                        }
                    }
                })
            }
        })
        
    }
    //console.log(tagsToInvest)
}

async function gatherTweetText(t){
    return await axios.get(`https://api.twitter.com/1.1/search/tweets.json?q=${t.query}&result_type=popular&lang=en&count=100`,{
        headers: {
          Authorization: `Bearer ${process.env.TWI_BEARER}`
        }
    }).then(res => {
        var blob = ""
        var tweetsToAnalyze = res.data.statuses
        for(const tweet of tweetsToAnalyze){
            blob = blob.concat(tweet.text)
        }
        console.log(blob)
        return blob;

    });
}

function loadTickers(){
    fs.createReadStream('tickers.csv')
        .pipe(csv())
        .on('data', (data) => tickerArray.push(data))
        .on('end', () => {
            console.log(tickerArray);
    });
}

function loadMetaData(){
    fs.createReadStream('meta.csv')
        .pipe(csv())
        .on('data', (data) => metaData.push(data))
        .on('end', () => {
            console.log(metaData);
    });
}


function ConvertToCSV(objArray) {
    var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    var str = '';

    for (var i = 0; i < array.length; i++) {
        var line = '';
        for (var index in array[i]) {
            if (line != '') line += ','

            line += array[i][index];
        }

        str += line + '\r\n';
    }

    return str;
}

/*
// MFA LOGIN
var Robinhood = require('robinhood')({
    username : process.env.RH_USER,
    password : process.env.RH_PASS
}, (data) => {
    if (data && data.mfa_required) {
        var mfa_code = '798741'; // set mfa_code here

        Robinhood.set_mfa_code(mfa_code, () => {
            console.log(Robinhood.auth_token());
        });
    }
    else {
        console.log(Robinhood.auth_token());
    }
})

*/


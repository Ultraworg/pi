#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const dns = require('dns');
const CONFIG = require('./config.json');
const updateIP = true;

// Set the path to the pihole custom list file
const pathToCustomListFile = CONFIG.Path;
//set the authentucation key from the pihole API
var akey = CONFIG.authkey;
//set the ip or domain of your pi
var piIp = CONFIG.IP;
// Found by running nslookup on one of the xx.googlevideo.com domains
var youtubeIp = '173.194.187.72';
var youtubeIp6 = '2a00:1450:4001:62::8';
// Get current unix time in seconds
const currentTime = Date.now()/1000;
// Get unix time eleven minutes ago
const tenMinutesAgo = currentTime - 660;
// Create an url to query the pihole API and get all queries from the last 11 minutes
const url = `http://${piIp}/admin/api.php?getAllQueries&from=${tenMinutesAgo}&until=${currentTime}&auth=${akey}`;
// Create a regex pattern to match all ad googlevideo urls
const domainRegex = /.+---.+-.+\.googlevideo\.com/g;

function getlines(){
  return new Promise(function(resolve, reject){
    let bothArrays = [];
    let nonYouTubeDomains = [];
    let youtubeDomainsStrings = [];
    let ip = [];
    const lineReader = require('readline').createInterface({
      input: require('fs').createReadStream(pathToCustomListFile)
    });
    // Read each line in the current pihole custom list file
    lineReader.on('line', function (line) {
    // Check whether the url from the list matches the url regex
     if (line.match(domainRegex)) {
        // Add the url to the existing array from the API call
        if (line.includes(':')) {
          ip[0]=line.substr(0, line.indexOf(' '));
          youtubeDomainsStrings.push(line.substr(ip[0].length+1));
        } else {
          ip[1]=line.substr(0, line.indexOf(' '));
          youtubeDomainsStrings.push(line.substr(ip[1].length+1));
        }

    } else {
        // Save all other domains with their respective IP adresses
        nonYouTubeDomains.push(line);
      }
    });

    lineReader.on('close', function() {
      bothArrays.push(nonYouTubeDomains);
      bothArrays.push(youtubeDomainsStrings);
      bothArrays.push(ip);
      resolve(bothArrays);
        })
  })};

function getPiholeQuery(){
  return new Promise(function (resolve,reject){
    http.get (url, (resp)=> {
      let data = '';

      resp.on('data', (chunk) => {
        data += chunk;
        });

      // Continue once all data has beeen received from the API
      resp.on('end', () => {
        let parsedData = JSON.parse(data);
        // Remove all domains from the received domain list which do not match the
        // regex pattern
        let youtubeDomains = parsedData.data.filter(function(dnsRequest) {
          return dnsRequest[2].match(domainRegex);
        })
        // Get just the url from the pihole result array
        let youtubeDomainsStrings = [];
        for (var i=0;i<youtubeDomains.length;i++) {
           youtubeDomainsStrings.push(youtubeDomains[i][2]);
        }
        let youtubeDomainsStringsUnique = [...new Set(youtubeDomainsStrings)];
        resolve(youtubeDomainsStringsUnique);
      });
    });
  });
};

function getIP(host){
  return new Promise(function (resolve,reject){
    let ip = [];
    dns.resolve(host, 'AAAA', (err, result) => {
      if(err) {
        console.error(`error: ${err}`);
      }else {
        ip.push(result[0]);
      }
    });
    dns.resolve(host, 'A', (err, result) => {
      if(err) {
        console.error(`error: ${err}`)
      }else {
        ip.push(result[0]);
        resolve(ip);
      }
    })
  })
}


getPiholeQuery().then((response) => {
  getlines().then( (txtResponse) => {
    let newDomainsString = '';
    let uniqueYoutubeStrings = [...new Set([...response, ...txtResponse[1]])];
    let ipv4 = txtResponse[2][1];
    let ipv6 = txtResponse[2][0];
      if (response.length > 0) {
        getIP(response[response.length-1]).then((IpResponse) => {
          if(updateIP && IpResponse.length >= 2){
            ipv4 = IpResponse[1];
            ipv6 = IpResponse[0];
          }
          //write new lines to the file
          for (var i=0;i<uniqueYoutubeStrings.length;i++) {
            newDomainsString += ipv4 + ' ' + uniqueYoutubeStrings[i] + '\n';
            newDomainsString += ipv6 + ' ' + uniqueYoutubeStrings[i] + '\n';
          }
          for (var i=0;i<txtResponse[0].length;i++) {
            newDomainsString += txtResponse[0][i] + '\n';
          }
          fs.writeFileSync(pathToCustomListFile, newDomainsString);
          console.debug('DONE');
        })
      } else {
        // is executed if there was no Youtube Query in the last 10 tenMinutes
        // still gets a new IP for the old entries
        let oldDomain = uniqueYoutubeStrings[uniqueYoutubeStrings.length-1];
        //console.log(oldDomain);
        getIP(oldDomain).then((IpResponse) => {
          if(updateIP && IpResponse.length >= 2){
            ipv4 = IpResponse[1];
            ipv6 = IpResponse[0];
          }
          //write new lines to the file
          for (var i=0;i<uniqueYoutubeStrings.length;i++) {
            newDomainsString += ipv4 + ' ' + uniqueYoutubeStrings[i] + '\n';
            newDomainsString += ipv6 + ' ' + uniqueYoutubeStrings[i] + '\n';
          }
          for (var i=0;i<txtResponse[0].length;i++) {
            newDomainsString += txtResponse[0][i] + '\n';
          }
          fs.writeFileSync(pathToCustomListFile, newDomainsString);
          console.debug('DONE');
        })
      }

    })
}, function(error) {
  console.error("Failed!", error);
});

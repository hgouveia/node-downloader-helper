/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { DownloaderHelper } = require('../dist');
const { byteHelper, pauseResumeTimer } = require('./helpers');
const url = 'http://ipv4.download.thinkbroadband.com/1GB.zip';
const pkg = require('../package.json');

// these are the default options
const options = {
    method: 'GET', // Request Method Verb
    // Custom HTTP Header ex: Authorization, User-Agent
    headers: {
        'user-agent': pkg.name + '@' + pkg.version
    },
    fileName: '', // Custom filename when saved
    override: false, // if true it will override the file, otherwise will append '(number)' to the end of file
    forceResume: false, // If the server does not return the "accept-ranges" header, can be force if it does support it
    httpRequestOptions: {}, // Override the http request options  
    httpsRequestOptions: {} // Override the https request options, ex: to add SSL Certs
};

let startTime = new Date();
const dl = new DownloaderHelper(url, __dirname, options);

dl
    .on('end', () => console.log('Download Completed'))
    .on('error', err => console.error('Something happend', err))
    .on('stateChanged', state => console.log('State: ', state))
    .once('download', () => pauseResumeTimer(dl, 5000))
    .on('progress', stats => {
        const progress = stats.progress.toFixed(1);
        const speed = byteHelper(stats.speed);
        const downloaded = byteHelper(stats.downloaded);
        const total = byteHelper(stats.total);

        // print every one second
        const currentTime = new Date();
        const elaspsedTime = currentTime - startTime;
        if (elaspsedTime > 1000) {
            startTime = currentTime;
            console.log(`${speed}/s - ${progress}% [${downloaded}/${total}]`);
        }
    });

console.log('Downloading: ', url);
dl.start();
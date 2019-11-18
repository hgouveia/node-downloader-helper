/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { DownloaderHelper } = require('../dist');
const { byteHelper, pauseResumeTimer } = require('./helpers');
const url = 'http://www.ovh.net/files/1Gio.dat'; // http://www.ovh.net/files/
const pkg = require('../package.json');

// these are the default options
const options = {
    method: 'GET', // Request Method Verb
    // Custom HTTP Header ex: Authorization, User-Agent
    headers: {
        'user-agent': pkg.name + '@' + pkg.version
    },
    retry: { maxRetries: 3, delay: 3000 }, // { maxRetries: number, delay: number in ms } or false to disable (default)
    fileName: '', // Custom filename when saved
    override: false, // if true it will override the file, otherwise will append '(number)' to the end of file
    forceResume: false, // If the server does not return the "accept-ranges" header, can be force if it does support it
    httpRequestOptions: {}, // Override the http request options  
    httpsRequestOptions: {} // Override the https request options, ex: to add SSL Certs
};

let startTime = new Date();
const dl = new DownloaderHelper(url, __dirname, options);

dl
    .once('download', () => pauseResumeTimer(dl, 5000))
    .on('download', downloadInfo => console.log('Download Begins: ', downloadInfo))
    .on('end', downloadInfo => console.log('Download Completed: ', downloadInfo))
    .on('error', err => console.error('Something happend', err))
    .on('retry', (attempt, opts) => {
        console.log(
            'Retry Attempt:', attempt + '/' + opts.maxRetries,
            'Starts on:', opts.delay / 1000, 'secs'
        );
    })
    .on('stateChanged', state => console.log('State: ', state))
    .on('renamed', filePaths => console.log('File Renamed to: ', filePaths.fileName))
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
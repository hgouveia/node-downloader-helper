/*eslint no-console: ["error", { allow: ["log", "warn", "error"] }] */
const { DownloaderHelper } = require('../dist');
const { byteHelper, pauseTimer } = require('./helpers');
const url = 'http://ipv4.download.thinkbroadband.com/1GB.zip';
// Options are optional
// these are the default options
const options = {
    headers : {}, // http headers ex: 'Authorization'
    fileName: '', // custom filename when saved
    override: false, //if true it will override the file, otherwise will append '(number)' to the end of file
};
const dl = new DownloaderHelper(url, __dirname, options);

dl
    .on('end', () => console.log('Download Completed'))
    .on('error', err => console.error('Something happend', err))
    .on('stateChanged', state => console.log('State: ', state))
    .once('download', () => pauseTimer(dl, 5000))
    .on('progress', stats => {
        const progress = stats.progress.toFixed(1);
        const speed = byteHelper(stats.speed);
        const downloaded = byteHelper(stats.downloaded);
        const total = byteHelper(stats.total);
        console.log(`${speed}/s - ${progress}% [${downloaded}/${total}]`);
    });

console.log('Downloading: ', url);
dl.start();